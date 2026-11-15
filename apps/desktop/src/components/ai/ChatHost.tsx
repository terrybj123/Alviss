import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { ChatPanel, ICON, IconButton, type ChatContext } from "@plainva/ui";
import { useVault } from "../../contexts/VaultContext";
import { desktopLlmTransport } from "../../services/llmTransport";

/**
 * The chat, docked beside the editor (plan §5.2, revised 2026-11-15).
 *
 * It used to be a modal: it covered the note it was talking about, and the
 * reader had to close it to check a sentence. As a column it sits next to the
 * text, keeps its width while the note scrolls, and the divider drags.
 *
 * The note the user is reading is read here, once, when the panel opens: the
 * shared panel never touches a vault itself, so it stays usable from any shell.
 * A note is capped before it is offered as context — a 2 MB note would blow any
 * model's window and say nothing useful.
 */
const MAX_CONTEXT_CHARS = 24_000;

export interface ChatHostProps {
  activePath: string | null;
  onClose(): void;
}

export function ChatHost({ activePath, onClose }: ChatHostProps) {
  const { t } = useTranslation();
  const { vaultAdapter, vaultPath } = useVault();
  const [context, setContext] = useState<ChatContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!activePath || !vaultAdapter) {
      setContext(null);
      return;
    }
    void (async () => {
      try {
        const text = await vaultAdapter.readTextFile(activePath);
        if (cancelled) return;
        const name = activePath.split("/").pop() ?? activePath;
        setContext({ title: name.replace(/\.md$/i, ""), text: text.slice(0, MAX_CONTEXT_CHARS) });
      } catch {
        if (!cancelled) setContext(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activePath, vaultAdapter]);

  const transport = useMemo(() => desktopLlmTransport, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-2) var(--space-3)", borderBottom: "1px solid var(--border-color-light)", flexShrink: 0 }}>
        <strong style={{ fontSize: "var(--text-md)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t("ai.title")}
        </strong>
        <span style={{ marginInlineStart: "auto", flexShrink: 0 }}>
          <IconButton label={t("common.close")} onClick={onClose}>
            <X size={ICON.ui} />
          </IconButton>
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: "var(--space-3)", overflow: "hidden" }}>
        <ChatPanel transport={transport} context={context} scope={vaultPath ?? "default"} />
      </div>
    </div>
  );
}
