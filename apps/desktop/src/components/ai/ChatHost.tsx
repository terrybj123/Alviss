import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatPanel, Modal, type ChatContext } from "@plainva/ui";
import { useVault } from "../../contexts/VaultContext";
import { desktopLlmTransport } from "../../services/llmTransport";

/**
 * The chat, mounted in the desktop shell (plan §5.2).
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
    <Modal title={t("ai.title")} onClose={onClose} size="md">
      <ChatPanel transport={transport} context={context} scope={vaultPath ?? "default"} />
    </Modal>
  );
}
