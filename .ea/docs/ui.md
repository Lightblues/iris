# UI layout

The side panel as it is now. Layout changes are agreed as ASCII here (or in a `log/` proposal) before code; update this page in the same commit as the change.

## Side panel

```
┌──────────────────────────────────────────┐
│ Agent  History  Skills  Scripts  More ▾ ⚙│  TabSwitcher (src/sidepanel/components/TabSwitcher.tsx)
├──────────────────────────────────────────┤  More ▾ = Tabs, Bookmarks, Reading, Notes, Reports
│ [chat title]          [model ▾] [+ new]  │  per-chat model combobox, favourites pinned
│                                          │
│  page card: <title> <url>                │  announced when a tab joins the session
│  user / assistant messages, tool calls   │
│                                          │
├──────────────────────────────────────────┤
│ [img] [page] [selection]                 │  ChatInput: inject image, full page, selection
│ ┌──────────────────────────────┐ [send]  │
│ │ Ask about this page…         │         │
│ └──────────────────────────────┘         │
└──────────────────────────────────────────┘
```

Entry points into it: toolbar icon or `Cmd+Shift+O`, the FAB on allowlisted sites, the command palette (`Cmd+Shift+P`).

## Page outline

On the page, not in the side panel (`content/pageToc.ts`, [page-enhancements.md](page-enhancements.md)); D011.

```
 page text …                                    ─
 page text …                                    ──   collapsed rail: one tick per heading,
 page text …                                    ━━   current section darker
                                                ──
                                                 ◎   FAB (allowlisted sites only)

 hover the rail, or Cmd+Shift+K:
                                   ┌ Outline · 12 ─── 📌 ┐
 page text …                       │ ▸ Introduction      │  floating card, 260 px, max 70% height
 page text …                       │ ▾ Method            │  h4+ folded under their parent
 page text …                       │ ▌   Data            │  current section
                                   │     Training        │
                                   │ [Filter…]           │  only above 40 entries
                                   └─────────────────────┘
```

On ChatGPT, DeepSeek and Gemini the card is titled Prompts and lists the user's prompts.

## Settings

One scrolling page (`src/sidepanel/components/SettingsPage.tsx`, one component per block in `components/settings/`), laid out per [log/2026-10-29-settings-layout.md](../log/2026-10-29-settings-layout.md) (D005):

```
┌ Settings ────────────────────────────────┐
│ ● Connected to <host> as <device> (read) │  StatusStrip: server, sync time or error,
│   Synced 12:04            v0.6.2  [⟳]    │  extension version, reconnect (polls 5s)
├ Model ───────────────────────────────────┤
│   Base URL   [https://…]  [fetch]        │
│   API Key    [••••••••]                  │
│   Default model [model ▾]                │
│   Models     [filter / add] ☆ list       │
│   ▸ Advanced: temperature, max output    │  <details>, collapsed
│     tokens, max steps                    │
├ Tools ───────────────────────────────────┤
│   Web search (Exa)  API Key [ ]          │
├ This browser ───────────── not synced ───┤
│   [x] Connect to my Iris server          │
│   Server URL [ ]  Token [ ]              │
│   Device name [ ]   device <id>          │
│   Agents may ( ) Nothing, sync only      │
│              (•) Read pages              │
│              ( ) Control this browser    │
│   [x] Share open tabs with my browsers   │  default on; incognito never
├ Pages ───────────────────────────────────┤
│   Floating button: hide on [patterns]    │
│   Page outline: hide on [patterns]       │
│   Chat export directory [choose] [⟳] [x] │
├ ▸ Developer ─────────────────────────────┤  <details>, collapsed
│   Phoenix endpoint                       │
│   Localhost relay (ea-tools)  not synced │  port, token, status, check
│   MCP endpoint                not synced │  unused for now
│   Import / export settings JSON          │
└──────────────────────────────────────────┘
```

Synced across browsers: everything except the fields marked "not synced" (This browser, the localhost relay, the MCP endpoint), which describe one machine (`DEVICE_SETTINGS` in `lib/sync.ts`, [server.md](server.md)).

## Tabs

More ▾ → Tabs (`components/TabsTab.tsx`). Other devices (`components/OtherDevicesTabs.tsx`) lists the snapshots other browsers share (D010, [server.md](server.md)); clicking a tab opens its URL here in a new tab. Groups are not recreated (Chrome syncs saved groups itself); a group shows as a colored label.

```
┌──────────────────────────────────────────┐
│ [Tabs (24)] [Other devices (2)] [Trash]  │
├──────────────────────────────────────────┤
│ work                     updated 2m ago  │  device name, else the id's first 8
│ Window 1 · 12 tabs · focused             │
│ [ic] arXiv 2410.01234 …       [Papers]   │  favicon or initial; group label in its color
│      arxiv.org                           │
│ [ic] Hacker News                         │
│ Window 2 · 3 tabs                        │
│ home                     updated 1d ago  │
│ …                                        │
└──────────────────────────────────────────┘
```
