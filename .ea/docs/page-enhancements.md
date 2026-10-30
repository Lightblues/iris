# Page Enhancements

Stable **entry points**. Maintain only. They exist to open the Agent or capture into Knowledge — not as a third product, and not as the place site patches live.

Site patches and host jumps are scripts: [scripts.md](scripts.md). Slash commands live with the Agent: [agent.md](agent.md). Chat export lives with Knowledge: [knowledge.md](knowledge.md).

## FAB

In-page button, bottom-right. It opens the side panel. It is compiled into the content script. Userscripts do not own it, do not show it, and do not add menu rows.

- Click → toggle native side panel (content → background → `sidePanel.open`)
- Hover → Chat, plus chat export on origins that have an adapter
- Close → hide for this page session
- `Cmd+Shift+O` (the toolbar action) opens the side panel without the FAB

Visibility is an allowlist, not "this URL has a script". Default origins: arXiv and the paper hosts, GitHub, DeepWiki, ChatGPT, DeepSeek, Gemini. `fabSitePatterns` is a glob **blocklist** checked after the allowlist. A matching userscript neither shows nor hides the button.

Key files: `content/floatingSidebar.ts`, `lib/fabSites.ts`, `content/floatingSidebar.css`.

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

Key files: `content/commandMenu.ts`, `content/commandMenu.css`.

## Context menu

Registered in the service worker:

- Copy page / selection as Markdown
- Save page / selection to Knowledge

## Markdown conversion

Readability → Turndown + GFM → clipboard or Knowledge snapshot.

Key file: `lib/markdown.ts`.
