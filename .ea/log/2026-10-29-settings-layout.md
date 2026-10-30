# Settings layout proposal

Status: accepted (2026-10-30, D005)

The current page (see `.ea/docs/ui.md`) is one long scroll in implementation order: model tuning sits next to the tracing endpoint, two relays with similar names sit apart, and machine-only fields are mixed with synced ones without saying so. Proposal: group by what the user is doing, put the daily things first, and mark which fields stay on this machine.

```
┌ Settings ────────────────────────────────┐
│ ● Connected to iris.easonsi.site  v0.7.0 │  status strip: server, sync, version
├──────────────────────────────────────────┤
│ Model                                    │  synced
│   Provider  Base URL [https://…]         │
│             API Key  [••••••••] [test]   │
│   Default   [model ▾]                    │
│   Favourites ☆ (search, from /v1/models) │
│   ▸ Advanced: temperature, max output    │
│     tokens, max steps                    │
├──────────────────────────────────────────┤
│ Tools                                    │  synced
│   Web search (Exa)  API Key [ ]          │
├──────────────────────────────────────────┤
│ This browser                  (not synced)│
│   Iris server  [x] URL [ ]  Token [ ]    │
│   Device name [ ]                        │
│   Agents may   ( ) nothing, sync only    │
│                (•) read pages            │
│                ( ) control this browser  │
├──────────────────────────────────────────┤
│ Pages                                    │  synced
│   Floating button: hide on [patterns]    │
│   Chat export directory [link]           │
├──────────────────────────────────────────┤
│ ▸ Developer                              │  collapsed
│   Phoenix tracing endpoint               │
│   Localhost relay (ea-tools)             │  unused for now
│   MCP endpoint                           │  unused for now
│   Import / Export settings JSON          │
└──────────────────────────────────────────┘
```

Changes against today:

- Status strip at the top replaces the per-section status lines.
- "Remote Relay" becomes "This browser": the server connection and what agents may do here, said in plain words.
- Model tuning (temperature, tokens, steps) folds under Advanced.
- Phoenix, the localhost relay, the MCP endpoint, and import/export move to a collapsed Developer section. The localhost relay and MCP endpoint are kept but unused until a need appears.

Open: whether the API key gets a "test" button that calls `/v1/models`.
