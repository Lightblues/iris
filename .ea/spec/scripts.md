# Scripts

Persisted page scripts the agent can read and write. They run while the side panel is closed. Two existing formats, one store. Iris does not invent a header or a `GM_*` replacement.

FAB visibility is not derived from these scripts. See [page-enhancements.md](page-enhancements.md).

## Store

`chrome.storage.local` key `iris_scripts`: `{ id, source, enabled }[]`. Replacing a script keeps up to eight previous copies under `iris_script_history`, keyed by script id.

The source is the file text. `write_script` upserts by `@name`. Import and export are that text (`.user.js` or `.agent.js`). Unknown `@` lines are kept, so a ScriptCat-only field survives a round trip.

On first run Iris inserts three seed userscripts (Zhihu unwrap, arXiv host links, GitHub ↔ DeepWiki) and sets `iris_scripts_seeded`. Deleting a seed does not bring it back.

The service worker registers enabled scripts with `chrome.userScripts` on startup and after every write. Registration failure (Allow user scripts is off, or the extension was not reloaded after turning it on) is stored and shown on the Scripts tab. The scripts stay saved.

## UserScript

`// ==UserScript==` … `// ==/UserScript==`. Same block Tampermonkey, Violentmonkey, ScriptCat, and Greasy Fork parse.

| Directive | Behavior |
|-----------|----------|
| `@match` | Chrome match pattern. Required to register |
| `@exclude` | `excludeMatches` when it is a valid match pattern |
| `@run-at` | `document-start` / `document-end` / `document-idle` (default idle) |
| `@inject-into page` | MAIN world. Otherwise `USER_SCRIPT` (isolated), matching the userscript sandbox |
| `@grant` | Enables the APIs below. `none` is DOM only |
| `@connect` | Hosts `GM_xmlhttpRequest` may call. Missing grant → the call fails |
| `@require` | Fetched in order and prepended. A failed fetch is reported and that URL is skipped |

Implemented grants: `GM_getValue`, `GM_setValue`, `GM_deleteValue`, `GM_listValues` (and `GM.*` promise methods), `GM_addStyle`, `GM_info`, `GM_log`, `GM_setClipboard`, `GM_openInTab`, `GM_xmlhttpRequest`, `unsafeWindow`.

`GM_getValue` / `GM.getValue` return promises. The bridge is a `window` message to the content script, so the synchronous Tampermonkey form does not work. `await GM_getValue` does.

`unsafeWindow` is the page `window` only in MAIN world. In the isolated world it is the isolated window.

`@resource`, `GM_download`, `GM_cookie`, `GM_registerMenuCommand`, `GM_notification`, and Customaise `CM_*` are not implemented. If a `@grant` names one, the script still installs and is marked unsupported. Calling the missing function throws.

`GM_log` is kept in a per-tab ring buffer. `read_console` returns it.

Values are stored per script id under `iris_gm_values`.

## AgentScript

`// ==AgentScript==` is not a userscript. Managers that only look for `==UserScript==` will not install it. That is intentional: these files register tools, they do not patch the page for the human.

They are injected in the MAIN world. A polyfill defines `document.modelContext` when Chrome has not, and points `navigator.modelContext` at the same object. No `#enable-webmcp-testing` flag.

```javascript
document.modelContext.registerTool({
  name, description, inputSchema, annotations, execute,
})
```

`// @webmcp <name> <allow|prompt|deny>` is the grant, same line Customaise uses.

| Permission | Behavior |
|------------|----------|
| `allow` | The agent calls `execute` directly |
| `prompt` | The tool returns `needs_confirmation` until it is called again with `confirmed: true` |
| `deny` | Not registered |
| undeclared | `registerTool` from that script throws. A page's own tools still pass through |

`load_tools({ groups: ["site"] })` calls `getTools()` on the session tab and adds those schemas to the agent on the next step. The list includes AgentScript tools and tools the site registered itself. Names are global on the tab, so scripts use a short prefix (`gh_`, `zh_`).

AgentScripts may use the same `GM_*` grants as userscripts.

## Agent tools

| Tool | Role |
|------|------|
| `list_scripts` | Id, name, kind, matches, enabled, unsupported grants, source |
| `write_script` | Save source and register |
| `toggle_script` | Enable or disable by id or name |
| `reload_tab` | Reload so scripts inject again |
| `read_console` | `GM_log` buffer for a tab |

The same tools are callable from an external agent through `iris.tools.list` and `iris.tools.call`. See [browser-relay.md](browser-relay.md). `load_tools` stays on the side panel. Skill tools are on the relay; they are specified in [agent.md](agent.md).

The Scripts tab lists them, with scripts that match the current URL first. Each row has an enable switch. Opening a script shows a read-only source preview and earlier saved versions. Import, export, and delete stay on that tab. There is no editor.

## What does not belong here

- FAB menu rows. Scripts do not add them. `GM_registerMenuCommand` is not wired to the FAB.
- The browser relay method table (`iris_call`). That is [browser-relay.md](browser-relay.md).
- `chrome.debugger`. Page JS and DOM go through `eval` and these scripts.
