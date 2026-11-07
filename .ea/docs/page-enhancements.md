# Page Enhancements

Stable **entry points**. Maintain only. They exist to open the Agent or capture into Knowledge — not as a third product, and not as the place site patches live. One reading aid is allowed beside them, the page outline, because it shares the agent's page reading (D011).

Site patches and host jumps are scripts: [scripts.md](scripts.md). Slash commands live with the Agent: [agent.md](agent.md). Chat export lives with Knowledge: [knowledge.md](knowledge.md).

## FAB

In-page button, bottom-right. It opens the side panel. It is compiled into the content script. Userscripts do not own it, do not show it, and do not add menu rows.

- Click → toggle native side panel (content → background → `sidePanel.open`)
- Hover → Chat, plus chat export on origins that have an adapter
- Close → hide for this page session
- `Cmd+Shift+O` (the toolbar action) opens the side panel without the FAB

Visibility is an allowlist, not "this URL has a script". Default origins: arXiv and the paper hosts, GitHub, DeepWiki, ChatGPT, DeepSeek, Gemini. `fabSitePatterns` is a glob **blocklist** checked after the allowlist. A matching userscript neither shows nor hides the button.

Key files: `content/floatingSidebar.ts`, `lib/fabSites.ts`, `content/floatingSidebar.css`.

## Page outline (`Cmd+Shift+K`)

A table of contents of the page being read, to jump within it. Accepted design: [log/2026-11-07-page-toc.md](../log/2026-11-07-page-toc.md); layout in [ui.md](ui.md).

- **Source** (`lib/outline.ts`, also used by `read_page`'s card): `h1`-`h6` and `[role=heading]`, visible, inside `main` / `[role=main]` / `article` when that holds at least 3 headings, else the body minus its `header`; never inside `nav`, `aside`, `footer`. Empty and repeated entries dropped, a leading h1 that repeats the title dropped, levels compressed to 1..n. On ChatGPT, DeepSeek and Gemini the entries are the user's prompts (`[data-message-author-role=user]`, `.ds-message` without `.ds-markdown`, `user-query`), falling back to headings when none match. Top frame only; Chrome's PDF viewer is not covered.
- **When the rail shows**: at least 3 headings and a page (or the headings' scroll container) at least 2.5 viewports tall; on chat sites at least 2 prompts. Not on URLs matching `tocSitePatterns` (Settings → Pages → Page outline, synced). The shortcut and the palette row open the card anywhere there is an entry.
- **Rail**: one tick per entry at the right edge, width by level, the current section darker. Hover (150 ms) or click opens the card.
- **Card**: floating, 260 px wide, max 70% of the viewport; h4 and deeper folded under their parent unless expanded or holding the current section; a filter box above 40 entries; 📌 keeps it open for this page. Closes 300 ms after the mouse leaves, on a click outside, or on Esc.
- **Jump**: scrolls the entry just below any fixed or sticky top bar, smooth under 3 viewports away and instant beyond or with reduced motion, then fades a highlight on it. URL and history are untouched.
- **Current section**: the last entry above the top third of the viewport, recomputed per animation frame on scroll (any scroll container).
- **Keyboard**: `Cmd/Ctrl+Shift+K` (extension command `toggle-page-toc`, rebindable) or the palette's Toggle Outline opens the card focused; ↑ / ↓ move, Enter jumps, Esc closes and returns focus. Keys typed in the card do not reach the page.
- **Updates**: rebuilt at most every 500 ms on DOM changes and on SPA URL changes; the view only re-renders when the list changed.

Key files: `content/pageToc.ts` (shadow root `#iris-page-toc`), `lib/outline.ts`.

## Command menu (`Cmd+Shift+P`)

Content-script palette, keyboard-navigable.

| Command | Description |
|---------|-------------|
| Add Bookmark | Bookmark current page |
| Add to Reading List | Chrome reading list |
| Copy Page as Markdown | Full page → clipboard |
| Copy Selection as Markdown | Selection → clipboard |
| Save Page as Note | Knowledge `page-snapshot` |
| Save Selection as Highlight | Knowledge `highlight` |
| Toggle Outline | The page outline card |

Key files: `content/commandMenu.ts`, `content/commandMenu.css`.

## Context menu

Registered in the service worker:

- Copy page / selection as Markdown
- Save page / selection to Knowledge

## Markdown conversion

Readability → Turndown + GFM → clipboard or Knowledge snapshot.

Key file: `lib/markdown.ts`.
