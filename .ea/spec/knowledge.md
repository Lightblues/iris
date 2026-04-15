# Knowledge System

Knowledge accumulation is Iris's role as the **input layer** for the ea system. It captures information from browsing and agent interactions, stores it locally, and optionally syncs to Vesta for downstream analysis. This area is exploratory and evolving.

## Capture

Four types of knowledge entries, all stored as `KnowledgeEntry` in `chrome.storage.local`:

| Type | Source | Description |
|------|--------|-------------|
| `highlight` | Page text selection | Selected text with position anchor for revisit restoration |
| `note` | User annotation | User's own writing about a page |
| `chat-save` | Assistant message "Save" button | Saved AI response linked to conversation |
| `page-snapshot` | "Save Page" command | Full page content via Readability → Markdown |

### Entry points

- Page selection → Context Menu / `Cmd+Shift+H` / FAB → `highlight`
- Command Menu → "Save Page as Note" → `page-snapshot`
- Chat message → "Save" button → `highlight` | `page-snapshot` | `chat-save`

### Page highlights

Capture: `window.getSelection()` → Range → XPath + textContent + offset → `HighlightAnchor`

Restore on page load: query entries by URL → TreeWalker text match → `<mark>` wrap. Falls back gracefully if DOM changed.

### Knowledge Tab (Notes)

`NotesTab.tsx` in sidepanel: search, type/tag filter, list cards, detail view, edit, export/import. Stored under `iris_knowledge` key, max 500 entries.

Key files: `lib/knowledge.ts`, `lib/highlights.ts`, `content/highlights.ts`

## Browsing Tracing

Passive event recording of browsing activity and agent interactions. Events are enriched with full content at emission time, stored locally by day.

### Event types

| Category | Events | Trigger |
|----------|--------|---------|
| Browsing | `page_visit`, `page_leave`, `search_query` | chrome.tabs events, URL pattern matching |
| Knowledge | `highlight_created`, `note_created` | knowledge.ts CRUD |
| Chat | `chat_message`, `chat_tool_call` | Agent chat streaming |

### Storage

- Key pattern: `iris_events_YYYY-MM-DD` in chrome.storage.local
- Retention: 30 days (daily cleanup alarm)
- Privacy: all local, nothing leaves browser unless Vesta sync enabled
- Toggle: `tracingEnabled` in Settings

Key files: `lib/tracing.ts`, `background/index.ts`

## Vesta Sync

One-way export from Iris to Vesta (`~/.ea/vesta/`) knowledge garden. Uses File System Access API.

```
Iris chrome.storage.local
├── TracingEvents (iris_events_*)     → ~/.ea/vesta/memory/events/iris/{date}.jsonl
├── KnowledgeEntries (iris_knowledge) → ~/.ea/vesta/inbox/iris/{date}-{id}.md + index.jsonl
└── Conversations (agent store)       → ~/.ea/vesta/memory/conversations/iris/{date}-{id}.jsonl + index.jsonl
```

### Design principles

- **One-way**: Iris writes to Vesta, never reads. Vesta agents process independently.
- **Inbox pattern**: Knowledge entries land in `inbox/iris/` for Vesta to triage.
- **No dependency**: Iris works fully without Vesta. Sync is optional.
- **Idempotent**: events overwrite daily JSONL, entries dedup by ID.
- **Self-contained**: enriched events embed full content so daily JSONL needs no cross-referencing.

### Trigger

- Manual: Settings → "Sync Now"
- Automatic: daily alarm

Key files: `lib/vestaSync.ts`, `lib/fileSystemAccess.ts`
