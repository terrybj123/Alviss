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
//! The stream runs on its own thread and the command returns once it started: a
//! model may think for half a minute, and a blocking command would freeze the
//! window for exactly that long.

use std::collections::HashSet;
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// What a running stream reports. Kept free of Tauri types so the streaming
/// core can be exercised against a real local server in a test.
#[derive(Debug, PartialEq, Eq)]
pub enum Event {
    Chunk(String),
    Done { cancelled: bool },
    Error {
        status: Option<u16>,
        message: String,
        detail: Option<String>,
    },
}

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

fn clear(hub: &LlmHub, request_id: &str) {
    if let Ok(mut set) = hub.cancelled.lock() {
        set.remove(request_id);
    }
}

/// Sends one request and reports it to `report`. Blocking; runs on its own
/// thread. `key` is the already-resolved secret, or `None` for a server that
/// takes none.
pub fn stream_request(
    hub: &LlmHub,
    request_id: &str,
    url: &str,
    headers: &[(String, String)],
    body: String,
    key: Option<String>,
    report: &mut dyn FnMut(Event),
) {
    let client = match reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        // A model may think for a while; this is the ceiling for ONE answer,
        // not a per-read deadline (the blocking client has no read timeout).
        .timeout(Duration::from_secs(600))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            clear(hub, request_id);
            report(Event::Error {
                status: None,
                message: "The HTTP client could not start.".to_string(),
                detail: Some(error.to_string()),
            });
            return;
        }
    };

    let mut request = client.post(url);
    for (name, value) in headers {
        request = request.header(name.as_str(), value.as_str());
    }
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }

    let response = match request.body(body).send() {
        Ok(response) => response,
        Err(error) => {
            clear(hub, request_id);
            report(Event::Error {
                status: None,
                message: "The provider could not be reached.".to_string(),
                detail: Some(error.to_string()),
            });
            return;
        }
    };

    let status = response.status();
    if !status.is_success() {
        let detail = response.text().unwrap_or_default();
        clear(hub, request_id);
        report(Event::Error {
            status: Some(status.as_u16()),
            message: format!("The provider answered with HTTP {}.", status.as_u16()),
            detail: Some(detail.chars().take(2_000).collect()),
        });
        return;
    }

    // A network chunk can split a multi-byte character; hold the tail until the
    // next read completes it.
    let mut reader = response;
    let mut buffer = [0u8; 8_192];
    let mut pending: Vec<u8> = Vec::new();
    loop {
        if stopped(hub, request_id) {
            break;
        }
        let read = match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => n,
            Err(error) => {
                clear(hub, request_id);
                report(Event::Error {
                    status: None,
                    message: "The connection to the provider broke.".to_string(),
                    detail: Some(error.to_string()),
                });
                return;
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
            report(Event::Chunk(text));
        }
    }

    let cancelled = stopped(hub, request_id);
    clear(hub, request_id);
    report(Event::Done { cancelled });
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
    std::thread::spawn(move || {
        let id = request_id.clone();
        let mut report = |event: Event| match event {
            Event::Chunk(text) => {
                let _ = app.emit(
                    "llm-chunk",
                    ChunkPayload {
                        request_id: id.clone(),
                        text,
                    },
                );
            }
            Event::Done { cancelled } => {
                let _ = app.emit(
                    "llm-done",
                    DonePayload {
                        request_id: id.clone(),
                        cancelled,
                    },
                );
            }
            Event::Error {
                status,
                message,
                detail,
            } => {
                let _ = app.emit(
                    "llm-error",
                    ErrorPayload {
                        request_id: id.clone(),
                        status,
                        message,
                        detail,
                    },
                );
            }
        };
        stream_request(&hub, &id, &url, &headers, body, key, &mut report);
    });
    Ok(())
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
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

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

    /// A one-shot server: answers with `status` and the given body, chunked.
    fn serve_once(status: &'static str, body: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            if let Ok((stream, _)) = listener.accept() {
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                // Read the request head; the body is a single small JSON line.
                let mut content_length = 0usize;
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 {
                        break;
                    }
                    if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                        content_length = value.trim().parse().unwrap_or(0);
                    }
                    if line == "\r\n" {
                        break;
                    }
                }
                let mut body_buf = vec![0u8; content_length];
                let _ = reader.read_exact(&mut body_buf);

                let mut out = stream;
                let head = format!(
                    "{status}\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n"
                );
                out.write_all(head.as_bytes()).unwrap();
                for piece in body.as_bytes().chunks(16) {
                    out.write_all(format!("{:x}\r\n", piece.len()).as_bytes()).unwrap();
                    out.write_all(piece).unwrap();
                    out.write_all(b"\r\n").unwrap();
                    out.flush().unwrap();
                }
                out.write_all(b"0\r\n\r\n").unwrap();
                let _ = out.flush();
            }
        });
        format!("http://127.0.0.1:{port}/v1/chat/completions")
    }

    fn collect(url: &str, headers: &[(String, String)]) -> Vec<Event> {
        let hub = LlmHub::default();
        let mut events = Vec::new();
        stream_request(
            &hub,
            "r1",
            url,
            headers,
            "{}".to_string(),
            Some("sk-test".to_string()),
            &mut |event| events.push(event),
        );
        events
    }

    #[test]
    fn streams_a_server_sent_event_answer() {
        let url = serve_once("HTTP/1.1 200 OK", "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\n");
        let events = collect(&url, &[("content-type".to_string(), "application/json".to_string())]);
        let text: String = events
            .iter()
            .filter_map(|event| match event {
                Event::Chunk(text) => Some(text.as_str()),
                _ => None,
            })
            .collect();
        assert!(text.contains("data:"), "streamed body reached the caller: {text:?}");
        assert!(matches!(events.last(), Some(Event::Done { cancelled: false })));
    }

    #[test]
    fn reports_a_provider_error_with_its_status() {
        let url = serve_once("HTTP/1.1 401 Unauthorized", "{\"error\":{\"message\":\"bad key\"}}");
        let events = collect(&url, &[]);
        match events.last() {
            Some(Event::Error { status, detail, .. }) => {
                assert_eq!(*status, Some(401));
                assert!(detail.as_deref().unwrap_or("").contains("bad key"));
            }
            other => panic!("expected an error, got {other:?}"),
        }
    }
}
