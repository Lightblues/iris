---
name: scripts
description: Write and maintain Iris page scripts — userscripts that patch a site, and AgentScripts that register WebMCP tools on it. Use when the user wants a fix or a tool that persists on a site across visits, or when an installed script needs changing or debugging.
---

A script is the right answer when the behaviour must survive the side panel closing, run on every visit, or run before the page paints. For a one-off action on the page in front of you, use `eval` instead — do not install a script for it.

Two formats share one store:

- **UserScript** (`// ==UserScript== … // ==/UserScript==`) patches the page for the human. Standard Tampermonkey / Violentmonkey header.
- **AgentScript** (`// ==AgentScript== … // ==/AgentScript==`) registers WebMCP tools for you to call. It is deliberately not a userscript, so other managers ignore it.

## Workflow

1. `list_scripts` to see what is installed. It returns the **full source of every script**, so call it once per conversation and work from that.
2. Write or revise the source. `write_script` takes the whole file text; there is no partial edit.
3. `write_script` registers it immediately, but an already-open tab still runs the old copy. `reload_tab`, then check the result with `read_page` or `eval`.
4. Debug with `GM_log` in the script and `read_console` for that tab.

`write_script` upserts by `@name`. **Changing `@name` creates a second script instead of renaming one** — keep the name stable when revising, and tell the user to delete the stray copy from the Scripts tab if you slip. Bump `@version` when you change behaviour: each save keeps up to 8 previous copies, labelled by version, that the user can open on the Scripts tab.

There is no delete tool. `toggle_script` disables a script by id or `@name`; deleting, importing, and exporting are the user's job on the Scripts tab.

## Header rules

`@name` and at least one valid `@match` (`scheme://host/path`) are required — `write_script` throws without them. Unknown `@` lines are preserved, so a ScriptCat-only field survives a round trip.

| Directive | Effect |
|-----------|--------|
| `@match` / `@exclude` | Chrome match patterns. An `@exclude` that is not a valid pattern is dropped |
| `@run-at` | `document-start` / `document-end` / `document-idle` (default) |
| `@inject-into page` | MAIN world. Without it a userscript runs in the isolated `USER_SCRIPT` world. AgentScripts are always MAIN |
| `@grant` | Enables a `GM_*` API. `none` means DOM only |
| `@connect` | Hosts `GM_xmlhttpRequest` may reach. Without it the call fails |
| `@require` | Fetched in order and prepended. A failed URL is reported and skipped |

Implemented grants: `GM_getValue`, `GM_setValue`, `GM_deleteValue`, `GM_listValues` (plus the `GM.*` promise forms), `GM_addStyle`, `GM_info`, `GM_setClipboard`, `GM_openInTab`, `GM_xmlhttpRequest`, `unsafeWindow`. `GM_log` is always injected, with or without `@grant`.

Not implemented: `GM_download`, `GM_cookie`, `GM_registerMenuCommand`, `GM_notification`, `@resource`, and the Customaise `CM_*` calls. A script naming one still installs and is flagged `unsupported` by `list_scripts`, but calling the function throws. Do not write a script that depends on them.

**Value reads are async.** `GM_getValue` returns a promise because the bridge is a message to the content script; `await GM_getValue('k')` works, the synchronous Tampermonkey form does not. `unsafeWindow` is the page window only in MAIN world.

## AgentScripts

Every tool needs a grant line in the header, or `registerTool` throws:

```
// @webmcp gh_pr_files allow
```

`allow` runs on call. `prompt` returns `needs_confirmation` until the same call repeats with `confirmed: true` — use it for anything that writes or navigates. `deny` skips registration.

Tool names are global on the tab and share the namespace with tools the site registers itself, so prefix them (`gh_`, `zh_`). Page WebMCP tools are not in the side-panel schema. An external agent lists and calls them with `iris.tools.list` and `iris.tools.call` when `tabId` is set. Keep `inputSchema` flat and `execute` returning JSON-serializable data. `await` at the top of an AgentScript is fine.

To check whether registration worked, reload the tab and `read_console` (a thrown `registerTool` is logged). `document.modelContext.getTools()` returns a **promise**, so `Object.keys` on it reads `{}`. `await document.modelContext.getTools()` via `eval` is the readable form.

`reference.md` has a complete userscript, a complete AgentScript, and a checklist for a script that does not run. Read it before writing your first script in a conversation.
