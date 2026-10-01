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

Implemented grants: `GM_getValue`, `GM_setValue`, `GM_deleteValue`, `GM_listValues` (and `GM.*` promise methods), `GM_addStyle`, `GM_info`, `GM_setClipboard`, `GM_openInTab`, `GM_xmlhttpRequest`, `unsafeWindow`. `GM_log` is always injected.

`GM_getValue` / `GM.getValue` return promises. The bridge is a `window` message to the content script, so the synchronous Tampermonkey form does not work. `await GM_getValue` does.

`unsafeWindow` is the page `window` only in MAIN world. In the isolated world it is the isolated window.

`@resource`, `GM_download`, `GM_cookie`, `GM_registerMenuCommand`, `GM_notification`, and Customaise `CM_*` are not implemented. If a `@grant` names one, the script still installs and is marked unsupported. Calling the missing function throws.

`GM_log` is kept in a per-tab ring buffer. `read_console` returns it.

Values are stored per script id under `iris_gm_values`.

## AgentScript

`// ==AgentScript==` is not a userscript. Managers that only look for `==UserScript==` will not install it. That is intentional: these files register tools, they do not patch the page for the human.

They are injected in the MAIN world. A polyfill defines `document.modelContext` when Chrome has not, and points `navigator.modelContext` at the same object. No `#enable-webmcp-testing` flag.

Each registered script is wrapped in its own function. MAIN-world scripts share the page global scope, so a top-level `const` in the wrapper would collide and the next AgentScript would never run. The AgentScript body is an async function, so top-level `await` parses. A thrown error is passed to `GM_log` and shows up in `read_console`. `GM_log` is always injected.

The body runs inside a wrapper that shadows `document` and `navigator` with proxies, so `registerTool` can be checked against the `@webmcp` grants. The shadows are **function parameters**: declaring them as `const` in the scope that also reads the real globals puts those reads in the temporal dead zone, and the script throws before its first line. The traps read through the real target and bind methods to it, because forwarding a DOM getter or method with the proxy as receiver fails the brand check.

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

Page WebMCP tools are not in the side-panel schema. `listPageWebmcp` reads `getTools()` on a tab for the relay. The bridge copies only JSON fields (`name`, `description`, `inputSchema`). Native tool objects include an `execute` function; returning that object from `executeScript` fails structured clone, and the failure used to surface as an empty list. The list includes AgentScript tools and tools the site registered itself. Names are global on the tab, so scripts use a short prefix (`gh_`, `zh_`).

AgentScripts may use the same `GM_*` grants as userscripts.

## Agent tools

| Tool | Role |
|------|------|
| `list_scripts` | Id, name, kind, matches, enabled, unsupported grants, source |
| `write_script` | Save source and register |
| `toggle_script` | Enable or disable by id or name |
| `reload_tab` | Reload so scripts inject again |
| `read_console` | `GM_log` buffer for a tab |

The `scripts` skill carries the authoring rules: when a script beats `eval`, the `@name` upsert, grant support, `@webmcp`, and a checklist for a script that does not run. Its `reference.md` holds a full userscript and AgentScript. Deleting, importing, and exporting have no tool — they stay on the Scripts tab.

The same script tools, and page WebMCP tools when `tabId` is set, are callable from an external agent through `iris.tools.list` and `iris.tools.call`. See [browser-relay.md](browser-relay.md). Skill tools are on the relay; they are specified in [agent.md](agent.md).

The Scripts tab lists them, with scripts that match the current URL first. Each row has an enable switch. Opening a script shows a read-only source preview and earlier saved versions. Import, export, and delete stay on that tab. There is no editor.

## What does not belong here

- FAB menu rows. Scripts do not add them. `GM_registerMenuCommand` is not wired to the FAB.
- The browser relay method table (`iris_call`). That is [browser-relay.md](browser-relay.md).
- `chrome.debugger`. Page JS and DOM go through `eval` and these scripts.
