# The AI assistant

Alviss has a chat inside the editor. It answers from the note you are reading,
streams the answer as it is written, and talks straight to the model provider
you configure. Alviss runs no AI service of its own and never proxies your
requests.

## Opening the chat

Press **⌘⇧K**, or open the command palette (**⌘K**) and choose **Open the chat**.
The chat docks to the right of the note, so you can read and ask at the same
time. Drag the divider to change its width; the width is remembered per window.
Close it with the **×** in its header, or **⌘⇧K** again.

The first time, it opens on the provider list, because there is nothing to talk
to yet.

## Choosing a provider

Alviss brings no model of its own. You point it at one:

| Provider | Where it runs | Key |
|---|---|---|
| OpenAI | cloud | yes |
| Anthropic | cloud | yes |
| DeepSeek | cloud | yes |
| Ollama | on this Mac | no |
| LM Studio | on this Mac | no |
| Own server | anywhere | depends |

**Own server** is the general case: any endpoint that speaks the OpenAI chat
protocol. Give it a name, its address (for example `https://your-server/v1`) and,
if it wants one, a token. A server on this machine may use plain `http`; every
other address must be `https`.

**Test connection** asks the provider for its model list and offers it under the
model field, so you do not have to type a model id from memory.

A provider you added stays editable: its name, address, model and key can be changed
later, and **Remove** deletes it together with its key.

## Your key

The key is stored in the macOS keychain and read by the application's native
process when a request is made. It is never shown again — not in the panel, not
in the settings, not in a log — and it is never written into your vault. Two
different providers can hold different keys.

*Remove* deletes the key from the keychain as well.

## What is sent

Whatever the question needs:

1. A short instruction describing the assistant's role.
2. The note you are reading, when **Current note** is on. Switch it to **No note** to send the question alone.
3. The conversation so far.

A long note is cut at a fixed limit before it is sent. Nothing else leaves the
machine: no vault listing, no file names, no settings.

## Answers

The answer appears as it is written and stays in the conversation when it
finishes. **Stop** ends an answer mid-sentence and keeps what arrived.

Answers are rendered as Markdown, with everything escaped: a model that writes
HTML produces text, not a page.

**New conversation** clears the panel. The last conversation is remembered per
vault and comes back when you reopen the chat.

## When something fails

The message names the fix, not just the fault:

| Message | What to do |
|---|---|
| The provider rejected the key | open **Providers**, enter a new key |
| The provider does not know this model | check the model id; use **Test connection** to list them |
| The provider is rate limiting this key | wait a moment |
| The note and the question do not fit | switch the context off, or choose a model with a larger window |
| The provider could not be reached | check the address and your connection |

## What the assistant does not do

It does not write to your vault. It has no tools, no internet access of its own,
and it cannot change a file. A direct edit stays yours to make.
