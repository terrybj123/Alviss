import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildChatRequest,
  buildModelsRequest,
  llmErrorForStatus,
  LlmStreamDecoder,
  normalizeBaseUrl,
  parseModels,
  redactForDiagnostics,
  type LlmEndpoint,
  type LlmErrorCode,
  type LlmMessage,
} from "@plainva/core";
import { ArrowLeft, Plus, Send, Settings2, Square, Trash2 } from "lucide-react";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { SelectField, TextInput } from "../components/ui/Field";
import { ICON } from "../lib/iconSizes";
import { markdownToHtml } from "../lib/markdownToHtml";
import { getPlatformServices } from "../platform/services";
import {
  EMPTY_LLM_CONFIG,
  LLM_PRESETS,
  endpointFromPreset,
  nextCustomId,
  readLlmConfig,
  type LlmConfig,
} from "./presets";
import type { LlmTransport } from "./transport";

/**
 * The chat surface (plan §5.1). One panel, two views: the conversation and the
 * provider list. The provider list lives here rather than in the settings
 * catalog because it is only ever needed from this panel, and because the
 * settings catalog is a shared, parity-tested surface.
 */
const CONFIG_KEY = "alviss.llm";

const SYSTEM_PROMPT =
  "You are the assistant inside Alviss, a plain-Markdown notes editor. " +
  "Answer the question from the note the user attached when there is one; say plainly when the note does not contain the answer. " +
  "Be concise. Use Markdown. Never claim to have changed a file.";

export interface ChatContext {
  title: string;
  text: string;
}

export interface ChatPanelProps {
  transport: LlmTransport;
  /** The note the user is reading, when the shell has one. */
  context?: ChatContext | null;
  /** Where the conversation is remembered: one scope per vault. */
  scope?: string;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
}

interface Draft {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  protocol: LlmEndpoint["protocol"];
  key: string;
  isNew: boolean;
}

export function ChatPanel({ transport, context, scope = "default" }: ChatPanelProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<"chat" | "config">("chat");
  const [config, setConfig] = useState<LlmConfig>(EMPTY_LLM_CONFIG);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ input?: number; output?: number } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const [testNote, setTestNote] = useState<string | null>(null);
  const [attachNote, setAttachNote] = useState(true);
  const requestRef = useRef<string | null>(null);
  const decoderRef = useRef<LlmStreamDecoder | null>(null);
  const streamBuffer = useRef("");
  const [hydrated, setHydrated] = useState(false);
  const chatKey = `alviss.llm.chat.${scope}`;

  const active = useMemo(
    () => config.endpoints.find((e) => e.id === config.activeId) ?? config.endpoints[0] ?? null,
    [config],
  );

  // ---- persistence -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const store = await getPlatformServices().loadSettings();
      const stored = readLlmConfig(await store.get(CONFIG_KEY));
      if (cancelled) return;
      setConfig(stored);
      const presence: Record<string, boolean> = {};
      for (const endpoint of stored.endpoints) {
        presence[endpoint.id] = await transport.hasKey(endpoint.keyRef).catch(() => false);
      }
      if (!cancelled) setKeys(presence);
    })();
    return () => {
      cancelled = true;
    };
  }, [transport]);

  // The conversation outlives the panel: it is device-local and per vault, so
  // reopening the chat continues where the reader left off. A conversation is
  // plain text in the settings store for now; the vault-file form of the plan
  // (§5.3) arrives with the conversation list.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const store = await getPlatformServices().loadSettings();
      const stored = (await store.get<{ turns?: Turn[] }>(chatKey)) ?? null;
      if (cancelled) return;
      if (stored?.turns?.length) setTurns(stored.turns);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [chatKey]);

  useEffect(() => {
    if (!hydrated) return;
    void (async () => {
      const store = await getPlatformServices().loadSettings();
      await store.set(chatKey, { turns });
    })();
  }, [chatKey, hydrated, turns]);

  const persist = useCallback(async (next: LlmConfig) => {
    setConfig(next);
    const store = await getPlatformServices().loadSettings();
    await store.set(CONFIG_KEY, next);
  }, []);

  // ---- streaming ---------------------------------------------------------
  const finishStream = useCallback(() => {
    const text = streamBuffer.current;
    requestRef.current = null;
    decoderRef.current = null;
    streamBuffer.current = "";
    setStreaming(null);
    if (text.trim()) setTurns((prev) => [...prev, { role: "assistant", text }]);
  }, []);

  useEffect(
    () =>
      transport.onEvent((event) => {
        if (!requestRef.current || event.requestId !== requestRef.current) return;
        if (event.type === "chunk") {
          const decoder = decoderRef.current;
          if (!decoder || !event.text) return;
          for (const decoded of decoder.push(event.text)) {
            if (decoded.type === "text") {
              streamBuffer.current += decoded.text;
              setStreaming(streamBuffer.current);
            } else if (decoded.type === "usage") {
              setUsage((prev) => ({
                input: decoded.inputTokens ?? prev?.input,
                output: decoded.outputTokens ?? prev?.output,
              }));
            } else if (decoded.type === "error") {
              setError(decoded.message);
            }
          }
          return;
        }
        if (event.type === "error") {
          const status = event.status;
          const code: LlmErrorCode | null = status ? llmErrorForStatus(status).code : "network";
          const label = t(labelKeyForCode(code));
          const detail = event.detail ? providerDetail(event.detail) : null;
          setError(detail ? `${label} ${detail}` : label);
          finishStream();
          return;
        }
        // done
        finishStream();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transport],
  );

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || streaming !== null) return;
    if (!active) {
      setView("config");
      return;
    }
    if (!active.model) {
      setError(t("ai.noModel"));
      return;
    }
    setError(null);
    setUsage(null);
    setInput("");
    const nextTurns: Turn[] = [...turns, { role: "user", text: question }];
    setTurns(nextTurns);

    const system =
      attachNote && context
        ? `${SYSTEM_PROMPT}\n\n---\nThe note "${context.title}":\n\n${context.text}`
        : SYSTEM_PROMPT;
    const messages: LlmMessage[] = [
      { role: "system", text: system },
      ...nextTurns.map((turn) => ({ role: turn.role, text: turn.text })),
    ];

    const requestId = crypto.randomUUID();
    requestRef.current = requestId;
    decoderRef.current = new LlmStreamDecoder(active.protocol);
    streamBuffer.current = "";
    setStreaming("");
    try {
      await transport.start(requestId, buildChatRequest({ endpoint: active, messages, maxOutputTokens: 1_024 }), active.keyRef);
    } catch (cause) {
      requestRef.current = null;
      decoderRef.current = null;
      streamBuffer.current = "";
      setStreaming(null);
      setError(redactForDiagnostics(String(cause)));
    }
  }, [active, attachNote, context, input, streaming, t, transport, turns]);

  const stop = useCallback(() => {
    const id = requestRef.current;
    if (id) void transport.cancel(id);
  }, [transport]);

  // ---- provider editing --------------------------------------------------
  const openDraft = (endpoint: LlmEndpoint) => {
    setTestNote(null);
    setDraft({
      id: endpoint.id,
      label: endpoint.label,
      baseUrl: endpoint.baseUrl,
      model: endpoint.model,
      protocol: endpoint.protocol,
      key: "",
      isNew: false,
    });
  };

  const addPreset = async (presetId: string) => {
    const preset = LLM_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const endpoint = endpointFromPreset(preset);
    setTestNote(null);
    setDraft({ id: endpoint.id, label: endpoint.label, baseUrl: endpoint.baseUrl, model: endpoint.model, protocol: endpoint.protocol, key: "", isNew: true });
  };

  const addCustom = () => {
    setTestNote(null);
    setDraft({
      id: nextCustomId(config.endpoints),
      label: "",
      baseUrl: "",
      model: "",
      protocol: "openai-chat",
      key: "",
      isNew: true,
    });
  };

  const saveDraft = async () => {
    if (!draft) return;
    const normalized = normalizeBaseUrl(draft.baseUrl);
    if (!normalized) {
      setTestNote(t("ai.address"));
      return;
    }
    const endpoint: LlmEndpoint = {
      id: draft.id,
      label: draft.label.trim() || new URL(normalized.baseUrl).host,
      protocol: draft.protocol,
      baseUrl: normalized.baseUrl,
      model: draft.model.trim(),
      keyRef: `llm.${draft.id}`,
    };
    const others = config.endpoints.filter((e) => e.id !== endpoint.id);
    await persist({ endpoints: [...others, endpoint], activeId: endpoint.id });
    if (draft.key.trim()) {
      await transport.setKey(endpoint.keyRef, draft.key.trim());
      setKeys((prev) => ({ ...prev, [endpoint.id]: true }));
    }
    setDraft(null);
    setView("chat");
  };

  const removeEndpoint = async (endpoint: LlmEndpoint) => {
    await transport.clearKey(endpoint.keyRef).catch(() => undefined);
    const endpoints = config.endpoints.filter((e) => e.id !== endpoint.id);
    await persist({ endpoints, ...(endpoints[0] ? { activeId: endpoints[0].id } : {}) });
    setKeys((prev) => ({ ...prev, [endpoint.id]: false }));
  };

  const testConnection = async () => {
    if (!draft) return;
    const normalized = normalizeBaseUrl(draft.baseUrl);
    if (!normalized) {
      setTestNote(t("ai.address"));
      return;
    }
    setTestNote(t("ai.testing"));
    const endpoint: LlmEndpoint = {
      id: draft.id,
      label: draft.label,
      protocol: draft.protocol,
      baseUrl: normalized.baseUrl,
      model: draft.model,
      keyRef: `llm.${draft.id}`,
    };
    try {
      if (draft.key.trim()) {
        await transport.setKey(endpoint.keyRef, draft.key.trim());
        setKeys((prev) => ({ ...prev, [draft.id]: true }));
      }
      const body = await transport.models(buildModelsRequest(endpoint), endpoint.keyRef);
      const ids = parseModels(JSON.parse(body));
      setTestNote(ids.length ? t("ai.testOk", { n: ids.length }) : t("ai.testEmpty"));
    } catch (cause) {
      setTestNote(redactForDiagnostics(String(cause)));
    }
  };

  // ---- view --------------------------------------------------------------
  if (view === "config") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Button size="sm" variant="ghost" icon={<ArrowLeft size={ICON.ui} />} onClick={() => setView("chat")}>
            {t("ai.back")}
          </Button>
          <span style={{ marginInlineStart: "auto" }}>
            <Button size="sm" variant="secondary" icon={<Plus size={ICON.ui} />} onClick={addCustom} data-testid="llm-add-custom">
              {t("ai.addCustom")}
            </Button>
          </span>
        </div>

        {config.endpoints.length === 0 && <Banner kind="info">{t("ai.noProviders")}</Banner>}

        {config.endpoints.map((endpoint) => (
          <div key={endpoint.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-2)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              <strong>{endpoint.label}</strong>
              <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
                {endpoint.model || t("ai.noModel")} · {keys[endpoint.id] ? t("ai.keyStored") : t("ai.keyNotStored")}
              </span>
            </div>
            <span style={{ marginInlineStart: "auto", display: "flex", gap: "var(--space-2)" }}>
              <Button size="sm" variant="secondary" onClick={() => openDraft(endpoint)}>
                {t("ai.providers")}
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 size={ICON.ui} />} onClick={() => void removeEndpoint(endpoint)} aria-label={t("ai.remove")} />
            </span>
          </div>
        ))}

        {!draft && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {LLM_PRESETS.map((preset) => (
              <Button key={preset.id} size="sm" variant="tonal" onClick={() => void addPreset(preset.id)}>
                {preset.label}
              </Button>
            ))}
          </div>
        )}

        {draft && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", padding: "var(--space-3)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)" }}>
            <TextInput aria-label={t("ai.name")} placeholder={t("ai.name")} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} purpose="name" />
            <TextInput aria-label={t("ai.address")} placeholder={t("ai.address")} value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} purpose="address" />
            <TextInput aria-label={t("ai.model")} placeholder={t("ai.model")} value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} purpose="code" />
            <TextInput aria-label={t("ai.key")} placeholder={t("ai.key")} type="password" value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} purpose="secret" autoComplete="off" />
            <SelectField
              aria-label={t("ai.providers")}
              value={draft.protocol}
              onChange={(e) => setDraft({ ...draft, protocol: e.target.value as LlmEndpoint["protocol"] })}
            >
              <option value="openai-chat">OpenAI-compatible</option>
              <option value="anthropic-messages">Anthropic</option>
            </SelectField>
            <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>{t("ai.keyHint")}</span>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Button size="sm" variant="primary" onClick={() => void saveDraft()}>
                {t("ai.save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setTestNote(null); }}>
                {t("ai.cancel")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void testConnection()}>
                {t("ai.test")}
              </Button>
            </div>
            {testNote && <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }} data-testid="llm-test-note">{testNote}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        {active ? (
          <SelectField
            aria-label={t("ai.providers")}
            value={active.id}
            onChange={(e) => void persist({ ...config, activeId: e.target.value })}
            compact
          >
            {config.endpoints.map((endpoint) => (
              <option key={endpoint.id} value={endpoint.id}>
                {endpoint.label} · {endpoint.model || "—"}
              </option>
            ))}
          </SelectField>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>{t("ai.noProviders")}</span>
        )}
        {context && (
          <span style={{ marginInlineStart: "auto" }}>
            <Button size="sm" variant="ghost" onClick={() => setAttachNote((on) => !on)} data-testid="llm-attach-note">
              {attachNote ? t("ai.contextNote") : t("ai.contextNone")}
            </Button>
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 size={ICON.ui} />}
          onClick={() => setTurns([])}
          aria-label={t("ai.newChat")}
          data-testid="llm-new-chat"
        />
        <Button size="sm" variant="ghost" icon={<Settings2 size={ICON.ui} />} onClick={() => setView("config")} aria-label={t("ai.providers")} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", minHeight: "min(46vh, 380px)", maxHeight: "min(46vh, 380px)", overflowY: "auto" }}>
        {turns.length === 0 && streaming === null && <EmptyState title={t("ai.title")}>{t("ai.emptyChat")}</EmptyState>}
        {turns.map((turn, index) => (
          <div key={index} style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", alignItems: turn.role === "user" ? "flex-end" : "flex-start" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>{turn.role === "user" ? "You" : active?.label ?? "AI"}</span>
            <div
              data-testid={turn.role === "assistant" ? "llm-answer" : "llm-question"}
              style={{ whiteSpace: turn.role === "user" ? "pre-wrap" : undefined, padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-md)", background: turn.role === "user" ? "var(--accent-color)" : "var(--bg-secondary)", color: turn.role === "user" ? "var(--on-accent-color)" : "var(--text-main)" }}
              // The renderer escapes every text fragment, so the answer cannot
              // inject markup; it is the same rule the reading view uses.
              {...(turn.role === "assistant" ? { dangerouslySetInnerHTML: { __html: markdownToHtml(turn.text) } } : { children: turn.text })}
            />
          </div>
        ))}
        {streaming !== null && (
          <div style={{ whiteSpace: "pre-wrap", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)" }}>
            {streaming || t("ai.sending")}
          </div>
        )}
      </div>

      {error && <Banner kind="error">{error}</Banner>}
      {usage && (usage.input || usage.output) && (
        <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>{t("ai.usage", { input: usage.input ?? 0, output: usage.output ?? 0 })}</span>
      )}

      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <TextInput
          aria-label={t("ai.placeholder")}
          placeholder={t("ai.placeholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          purpose="prose"
          autoFocus
        />
        {streaming === null ? (
          <Button variant="primary" icon={<Send size={ICON.ui} />} onClick={() => void send()} disabled={!input.trim()}>
            {t("ai.send")}
          </Button>
        ) : (
          <Button variant="secondary" icon={<Square size={ICON.ui} />} onClick={stop}>
            {t("ai.stop")}
          </Button>
        )}
      </div>
    </div>
  );
}

function labelKeyForCode(code: LlmErrorCode | null): string {
  switch (code) {
    case "invalid_key":
      return "ai.errorKey";
    case "unknown_model":
      return "ai.errorModel";
    case "rate_limited":
      return "ai.errorRate";
    case "context_overflow":
      return "ai.errorContext";
    case "server":
      return "ai.errorServer";
    default:
      return "ai.errorNetwork";
  }
}

/** The provider's own sentence out of an error body, when it has one. */
function providerDetail(detail: string): string | null {
  try {
    const body = JSON.parse(detail) as { error?: { message?: unknown } };
    if (typeof body.error?.message === "string" && body.error.message.trim()) {
      return redactForDiagnostics(body.error.message.trim()).slice(0, 300);
    }
  } catch {
    // Not JSON: say nothing beyond the label.
  }
  return null;
}
