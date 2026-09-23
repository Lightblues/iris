# Knowledge

The **sensor**: Iris keeps its own highlights, notes, page snapshots, and browsing traces in `chrome.storage`. Third-party AI chats are a separate browser capability: the extension can read them because it runs inside the logged-in page, then write the raw JSON to a user-picked directory.

This layer is **maintain**. Keep local capture and chat export working. A later zip export or sync service for Iris's own data is out of scope until asked.

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

Reads third-party chats (ChatGPT, DeepSeek, Gemini) from the logged-in page. Content-script adapters use the page's cookies, fetch the platform's raw API JSON, and the service worker writes it to a user-linked directory.

```
<user dir>/<platform>/<id>.json     raw payload
<user dir>/<platform>/index.jsonl   upserted listing
```

FAB on a matched origin offers export current / export all. Incremental export-all skips unchanged ids via `index.jsonl` and `updatedAt`.

Directory is chosen in Settings → Chat Export (File System Access). After an extension reload Chrome may drop the grant; reconnect from Settings. The service worker keep-alive port exists so a long export does not lose the handle mid-run.

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
- Stays in the browser
- Toggle: `tracingEnabled` in Settings

Key files: `lib/tracing.ts`, `background/index.ts`.
