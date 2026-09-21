# Knowledge

The **sensor**: Iris captures browsing and agent work locally, then optionally writes it into ea. Iris is not a second knowledge base. Vesta (and ea-tools chat-export) own downstream processing.

This layer is **maintain**. Keep the pipe working; do not grow a notes product.

## Capture

Four entry types, all `KnowledgeEntry` in `chrome.storage.local` (`iris_knowledge`, max 500):

| Type | Source | What is stored |
|------|--------|----------------|
| `highlight` | Selection | Text + XPath/offset anchor for restore |
| `note` | User annotation | Free text about a page |
| `chat-save` | Agent message “Save” | Assistant output linked to a conversation |
| `page-snapshot` | “Save Page” | Readability → Markdown of the full page |

Entry points:

- Selection → context menu / `Cmd+Shift+H` / FAB → `highlight`
- Command menu → “Save Page as Note” → `page-snapshot`
- Agent message → “Save” → `highlight` | `page-snapshot` | `chat-save`

### Highlights

Capture: `getSelection()` → Range → XPath + text + offset → `HighlightAnchor`.

Restore on load: entries by URL → TreeWalker text match → `<mark>`. Misses the DOM if the page changed; that is acceptable.

Notes UI: `NotesTab.tsx` — search, type/tag filter, edit, import/export. Maintain-only.

Key files: `lib/knowledge.ts`, `lib/highlights.ts`, `content/highlights.ts`.

## Chat export

Sensor for **third-party** chats (not Iris agent history). Content-script adapters on the platform origin use first-party cookies, fetch raw API JSON, write to a user-linked directory.

```
~/.ea/tools/chat-exports/<platform>/<id>.json     raw payload
~/.ea/tools/chat-exports/<platform>/index.jsonl   upserted listing
```

| Platform | Adapter |
|----------|---------|
| ChatGPT | `content/chatExport/chatgpt.ts` |
| DeepSeek | `content/chatExport/deepseek.ts` |
| Gemini | `content/chatExport/gemini.ts` |

FAB on a matched origin offers export current / export all. Incremental export-all skips unchanged ids via `index.jsonl` + `updatedAt`.

Directory is chosen in Settings → Chat Export (File System Access). After an extension reload Chrome may drop the grant; reconnect from Settings. The service worker keep-alive port exists so a long export does not lose the handle mid-run.

This path is **not** Vesta inbox. Files land under `~/.ea/tools/chat-exports/` for other ea tools to consume.

Key files: `content/chatExport/`, `lib/chatExportStore.ts`, `lib/fileSystemAccess.ts`.

## Browsing tracing

Passive local log of browsing and agent activity. Events are enriched with content at emit time, stored per day.

| Category | Events | Trigger |
|----------|--------|---------|
| Browsing | `page_visit`, `page_leave`, `search_query` | `chrome.tabs`, URL patterns |
| Knowledge | `highlight_created`, `note_created` | knowledge CRUD |
| Chat | `chat_message`, `chat_tool_call` | Agent stream |

- Keys: `iris_events_YYYY-MM-DD`
- Retention: 30 days (daily alarm)
- Stays in the browser unless Vesta sync is on
- Toggle: `tracingEnabled` in Settings

Key files: `lib/tracing.ts`, `background/index.ts`.

## Vesta sync

One-way export to `~/.ea/vesta/` via File System Access.

```
iris_events_*              → memory/events/iris/{date}.jsonl
iris_knowledge             → inbox/iris/{date}-{id}.md + index.jsonl
agent conversations        → memory/conversations/iris/{date}-{id}.jsonl + index.jsonl
```

- Iris writes, never reads. Vesta agents triage independently.
- Knowledge lands in `inbox/iris/` for later filing.
- Iris runs fully without Vesta.
- Events overwrite the daily JSONL; entries dedup by id.
- Events embed full content so a day’s file is self-contained.

Trigger: Settings → Sync Now, or a daily alarm.

Key files: `lib/vestaSync.ts`, `lib/fileSystemAccess.ts`.

## Notion

Settings still accept a Notion token/database; `NotesTab` can push entries. Vesta is the intended ea downstream. Do not add a third sync target.
