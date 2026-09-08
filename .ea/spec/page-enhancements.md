# Page Enhancements

Traditional tools that enhance the browsing experience. These are stable, standalone features injected via content scripts.

## Floating Action Button (FAB)

Unified entry point injected into pages (bottom-right corner).

- **Click**: toggle sidebar
- **Hover**: show menu (Chat, Highlight selection, page enhancements)
- **Close button**: hide FAB (persisted, resettable via Settings)
- **Keyboard**: `Cmd+Shift+Y` restores hidden FAB and opens sidebar
- **Instant loading**: FAB DOM created synchronously; storage loaded in parallel
- **Site filtering**: `fabSitePatterns` glob patterns control per-site visibility

Key files: `content/floatingSidebar.ts`, `content/floatingSidebar.css`

## Site Enhancements

URL-based cross-navigation actions, displayed via the FAB enhancement menu.

| Site Pattern | Actions |
|-------------|---------|
| arXiv / alphaXiv / HuggingFace Papers / papers.cool | Cross-navigate between paper platforms |
| GitHub | Jump to DeepWiki |
| DeepWiki | Jump to GitHub |

Architecture: `EnhancementRegistry` matches current URL → returns available actions. Handlers defined in `content/enhancements/` (arxiv.ts, github.ts).

## Site Patches

Automatic page fixes for specific sites (not FAB actions).

| Site | Behavior |
|------|----------|
| Zhihu | Strip notification prefixes from the tab title (`（99+ 封私信/80 条消息）…`) |
| Zhihu | Unwrap `link.zhihu.com/?target=` so external links open directly |

Key files: `lib/zhihu.ts`, `content/zhihu.ts`, `content/zhihuRedirect.ts`

## Command Menu (`Cmd+Shift+P`)

Keyboard-navigable command palette with search filtering, injected as a content script overlay.

| Command | Description |
|---------|-------------|
| Add Bookmark | Bookmark current page |
| Add to Reading List | Add to Chrome reading list |
| Copy Page as Markdown | Full page → Markdown → clipboard |
| Copy Selection as Markdown | Selection → Markdown → clipboard |
| Save Page as Note | Save full page to Knowledge |
| Save Selection as Highlight | Save selection to Knowledge |
| Open Settings | Open settings panel |

Key files: `content/commandMenu.ts`, `content/commandMenu.css`

## Context Menu (Right-click)

Chrome native context menu entries registered in background service worker:
- Copy Page / Selection as Markdown
- Save Page / Selection to Knowledge

Key file: `background/index.ts`

## Slash Commands

Claude Code-inspired command system. Type `/` in chat input to trigger.

- **Usage**: `/` → filter → arrow keys → Tab/Enter select → append args → Cmd+Enter send
- **Built-in**: `/summarize`, `/translate`, `/explain`, `/extract`
- **Custom**: Link local folder via Settings → Slash Commands → Link Folder
- **Context variables**: `` !`pageContent` ``, `` !`selection` ``, `` !`url` ``, `` !`title` ``, `$ARGUMENTS`

Key files: `lib/slashCommands.ts`, `lib/commandStorage.ts`, `commands/iris/`

## Markdown Conversion

Readability (extract article) → Turndown + GFM plugin (HTML → Markdown) → clipboard.

Used by "Copy as Markdown" commands and page snapshot knowledge entries.

Key file: `lib/markdown.ts`
