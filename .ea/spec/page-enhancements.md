# Page Enhancements

Stable **entry points and site patches**. Maintain only. They exist to open the Agent, capture into Knowledge, or fix a specific site — not as a third product.

Slash commands live with the Agent: [agent.md](agent.md). Chat export lives with Knowledge: [knowledge.md](knowledge.md).

## FAB

In-page button, bottom-right. Hidden by default; shown on adapted pages (paper sites, GitHub/DeepWiki, chat-export origins). `fabSitePatterns` is an extra glob **blocklist**.

- Click → toggle native side panel (content → background → `sidePanel.open`)
- Hover → Chat, site actions, chat export
- Close → hide for this page session
- `Cmd+Shift+Y` opens the side panel without the FAB

Key files: `content/floatingSidebar.ts`, `content/floatingSidebar.css`.

## Site enhancements

URL match → actions in the FAB menu. `EnhancementRegistry` in `content/enhancements/`.

| Pattern | Actions |
|---------|---------|
| arXiv / alphaXiv / HuggingFace Papers / papers.cool | Jump between paper hosts |
| GitHub | Open DeepWiki |
| DeepWiki | Open GitHub |

## Site patches

Always-on fixes, not FAB actions.

| Site | Behavior |
|------|----------|
| Zhihu | Strip notification prefixes from the tab title |
| Zhihu | Unwrap `link.zhihu.com/?target=` so external links open directly |

Key files: `lib/zhihu.ts`, `content/zhihu.ts`, `content/zhihuRedirect.ts`.

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
| Open Settings | Side panel settings |

Key files: `content/commandMenu.ts`, `content/commandMenu.css`.

## Context menu

Registered in the service worker:

- Copy page / selection as Markdown
- Save page / selection to Knowledge

## Markdown conversion

Readability → Turndown + GFM → clipboard or Knowledge snapshot.

Key file: `lib/markdown.ts`.
