//! The native egress for the AI chat (plan §5.2).
//!
//! Why the request is built in TypeScript but SENT here: the provider key lives
//! in the OS keychain and must never enter the WebView. The renderer therefore
//! sends a request SPECIFICATION (url, headers, JSON body) plus the key slot's
//! name; this module reads the key, attaches it, streams the answer back as
//! events and never returns it.
//!
//! The address is checked here rather than trusted: `https` only, except for a
//! server on this machine. A renderer that has been talked into posting a note
//! to an attacker's host cannot do it through this command.
//!
//! The stream runs on its own thread and the command returns once it started:
//! a model may think for half a minute, and a blocking command would freeze the
//! window for exactly that long.

use std::collections::HashSet;
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// Requests the renderer asked to stop, by id. Shared with the streaming
/// threads, so a stop reaches a request already in flight.
#[derive(Clone, Default)]
pub struct LlmHub {
    cancelled: Arc<Mutex<HashSet<String>>>,
}

#[derive(Clone, Serialize)]
struct ChunkPayload {
    #[serde(rename = "requestId")]
    request_id: String,
    text: String,
}

#[derive(Clone, Serialize)]
struct ErrorPayload {
    #[serde(rename = "requestId")]
    request_id: String,
    status: Option<u16>,
    message: String,
    /// The provider's own words, already truncated; never the request.
    detail: Option<String>,
}

#[derive(Clone, Serialize)]
struct DonePayload {
    #[serde(rename = "requestId")]
    request_id: String,
    cancelled: bool,
}

/// Where a request may go: https anywhere, plain http only to this machine.
fn address_allowed(raw: &str) -> bool {
    let Ok(url) = url::Url::parse(raw) else {
        return false;
    };
    match url.scheme() {
        "https" => true,
        "http" => matches!(
            url.host_str(),
            Some("localhost") | Some("127.0.0.1") | Some("::1") | Some("[::1]")
        ) || url.host_str().is_some_and(|h| h.ends_with(".local")),
        _ => false,
    }
}

fn read_key(app: &AppHandle, key_ref: &str) -> Result<String, String> {
    match crate::secure_store::read_secret(app, key_ref)? {
        Some(key) if !key.trim().is_empty() => Ok(key),
        _ => Err("no_key".to_string()),
    }
}

fn stopped(hub: &LlmHub, request_id: &str) -> bool {
    hub.cancelled
        .lock()
        .map(|set| set.contains(request_id))
        .unwrap_or(false)
}

/// Streams one answer. Returns `Ok` as soon as the stream is running; the
/// outcome arrives as `llm-chunk` / `llm-done` / `llm-error` events.
#[tauri::command]
pub fn llm_stream(
    app: AppHandle,
    hub: State<'_, LlmHub>,
    request_id: String,
    url: String,
    headers: Vec<(String, String)>,
    body: String,
    key_ref: Option<String>,
) -> Result<(), String> {
    if !address_allowed(&url) {
        let _ = app.emit(
            "llm-error",
            ErrorPayload {
                request_id,
                status: None,
                message: "This server address is not allowed.".to_string(),
                detail: Some(url),
            },
        );
        return Ok(());
    }

    let key = match key_ref.as_deref() {
        Some(reference) => match read_key(&app, reference) {
            Ok(key) => Some(key),
            Err(_) => {
                let _ = app.emit(
                    "llm-error",
                    ErrorPayload {
                        request_id,
                        status: None,
                        message: "No key is stored for this provider.".to_string(),
                        detail: None,
                    },
                );
                return Ok(());
            }
        },
        None => None,
    };

    let hub = hub.inner().clone();
    std::thread::spawn(move || stream_blocking(app, hub, request_id, url, headers, body, key));
    Ok(())
}

fn stream_blocking(
    app: AppHandle,
    hub: LlmHub,
    request_id: String,
    url: String,
    headers: Vec<(String, String)>,
    body: String,
    key: Option<String>,
) {
    let mut request = match reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        // A model may think for a while; this is the ceiling for ONE answer,
        // not a per-read deadline (the blocking client has no read timeout).
        .timeout(Duration::from_secs(600))
        .build()
    {
        Ok(client) => client.post(&url),
        Err(error) => return fail(&app, &hub, request_id, None, "The HTTP client could not start.", Some(error.to_string())),
    };

    for (name, value) in &headers {
        request = request.header(name.as_str(), value.as_str());
    }
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }

    let response = match request.body(body).send() {
        Ok(response) => response,
        Err(error) => {
            return fail(
                &app,
                &hub,
                request_id,
                None,
                "The provider could not be reached.",
                Some(error.to_string()),
            )
        }
    };

    let status = response.status();
    if !status.is_success() {
        let detail = response.text().unwrap_or_default();
        return fail(
            &app,
            &hub,
            request_id,
            Some(status.as_u16()),
            &format!("The provider answered with HTTP {}.", status.as_u16()),
            Some(detail.chars().take(2_000).collect()),
        );
    }

    // A network chunk can split a multi-byte character; hold the tail until the
    // next read completes it.
    let mut reader = response;
    let mut buffer = [0u8; 8_192];
    let mut pending: Vec<u8> = Vec::new();
    loop {
        if stopped(&hub, &request_id) {
            break;
        }
        let read = match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => n,
            Err(error) => {
                return fail(
                    &app,
                    &hub,
                    request_id,
                    None,
                    "The connection to the provider broke.",
                    Some(error.to_string()),
                )
            }
        };
        pending.extend_from_slice(&buffer[..read]);
        let valid_len = match std::str::from_utf8(&pending) {
            Ok(_) => pending.len(),
            Err(error) => error.valid_up_to(),
        };
        let text = String::from_utf8_lossy(&pending[..valid_len]).to_string();
        pending.drain(..valid_len);
        if !text.is_empty() {
            let _ = app.emit(
                "llm-chunk",
                ChunkPayload {
                    request_id: request_id.clone(),
                    text,
                },
            );
        }
    }

    let was_stopped = stopped(&hub, &request_id);
    if let Ok(mut set) = hub.cancelled.lock() {
        set.remove(&request_id);
    }
    let _ = app.emit(
        "llm-done",
        DonePayload {
            request_id,
            cancelled: was_stopped,
        },
    );
}

/// Reports a failure, clears the request from the cancelled set and stops.
fn fail(
    app: &AppHandle,
    hub: &LlmHub,
    request_id: String,
    status: Option<u16>,
    message: &str,
    detail: Option<String>,
) {
    if let Ok(mut set) = hub.cancelled.lock() {
        set.remove(&request_id);
    }
    let _ = app.emit(
        "llm-error",
        ErrorPayload {
            request_id,
            status,
            message: message.to_string(),
            detail,
        },
    );
}

/// Stops a running answer. Safe to call for an id that already finished.
#[tauri::command]
pub fn llm_cancel(hub: State<'_, LlmHub>, request_id: String) {
    if let Ok(mut set) = hub.cancelled.lock() {
        set.insert(request_id);
    }
}

/// Stores a provider key in the OS keychain. The value is never returned.
#[tauri::command]
pub fn llm_set_key(app: AppHandle, key_ref: String, key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("empty_key".to_string());
    }
    crate::secure_store::write_secret(&app, &key_ref, Some(key.trim()))
}

/// Removes a provider key.
#[tauri::command]
pub fn llm_clear_key(app: AppHandle, key_ref: String) -> Result<(), String> {
    crate::secure_store::write_secret(&app, &key_ref, None)
}

/// The provider's model list, for "Test connection". Returns the JSON body; the
/// renderer decides which ids it shows.
#[tauri::command]
pub fn llm_models(
    app: AppHandle,
    url: String,
    headers: Vec<(String, String)>,
    key_ref: Option<String>,
) -> Result<String, String> {
    if !address_allowed(&url) {
        return Err("address_not_allowed".to_string());
    }
    let mut request = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?
        .get(&url);
    for (name, value) in &headers {
        request = request.header(name.as_str(), value.as_str());
    }
    if let Some(reference) = key_ref.as_deref() {
        request = request.bearer_auth(read_key(&app, reference)?);
    }
    let response = request.send().map_err(|e| e.to_string())?;
    let status = response.status();
    let text = response.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!(
            "http:{}:{}",
            status.as_u16(),
            text.chars().take(2_000).collect::<String>()
        ));
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn https_is_allowed_anywhere() {
        assert!(address_allowed("https://api.openai.com/v1/chat/completions"));
        assert!(address_allowed("https://example.org/v1/messages"));
    }

    #[test]
    fn plain_http_only_on_this_machine() {
        assert!(address_allowed("http://localhost:11434/v1/chat/completions"));
        assert!(address_allowed("http://127.0.0.1:1234/v1/chat/completions"));
        assert!(!address_allowed("http://example.com/v1/chat/completions"));
    }

    #[test]
    fn other_schemes_are_refused() {
        assert!(!address_allowed("file:///etc/passwd"));
        assert!(!address_allowed("ftp://example.com/x"));
        assert!(!address_allowed("not a url"));
    }
}
