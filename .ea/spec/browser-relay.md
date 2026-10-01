# Browser Relay

Iris is the **browser-side half** of the ea-tools relay. External agents fetch pages through this browser, and call `iris.*` methods for chat export and data that lives in the extension.

This is request-response, not an autonomous browser-use loop. No LLM runs in the service worker. The relay server and MCP tools stay in ea-tools; Iris only owns the extension client.

## Why it lives in Iris

The standalone `EA Browser Relay` extension is deprecated. Same permissions (`tabs`, `scripting`, `alarms`, `<all_urls>`) were already here, and Iris is already the ea system's browser sensor/actuator. A second unpacked extension was extra install/config with no extra capability.

`debugger` is still out of scope. Phase-1 extraction uses `chrome.scripting` only.

## Architecture

```
Agent ──MCP iris_call / browser_*──► ea-tools
                  │ HTTP  :33007/call  or  /fetch, /tabs, ...
                  ▼
            Relay Server (ea-tools)
                  │ WS  ← Iris SW connects here
                  ▼
            Iris service worker
                  │ method table
                  ▼
            browser.*  tabs / page extract
            iris.*     chat export, notes, conversations, tracing, settings
```

Chrome service workers cannot listen on a TCP/WS port. Both Iris and the MCP tool are clients of the localhost relay. One socket carries every method. A new capability is a new method name, not a new port or a new socket.

A second, optional socket dials out to a relay you host, for history sync and tool calls from another network. This localhost server stays the ea-tools path. See [remote-relay.md](remote-relay.md).

## Protocol

Request from the server, response from the extension. `v` defaults to 1.

```json
{ "v": 1, "id": 12, "method": "iris.chat.export", "params": { "platform": "chatgpt", "id": "abc" } }
```

```json
{ "v": 1, "id": 12, "result": {} }
```

```json
{ "v": 1, "id": 12, "error": { "code": "method_not_found", "message": "iris.chat.export" } }
```

`ping` / `pong` stay unnumbered. On connect the extension sends `{ "v": 1, "method": "hello", "params": { "methods": ["..."] } }`. The server records that list on `GET /status` and ignores unknown messages that have no `id`.

Legacy browser actions (`fetch`, `list_tabs`, `get_tab_content`, `close_tab`, `activate_tab`) still use `{ "id", "action", "params" }` and reply `{ "id", "result" }` or `{ "id", "error": "string" }`. The same functions are also registered as `browser.*` and then use the versioned envelope.

Long calls may emit several frames with the same `id`:

```json
{ "v": 1, "id": 12, "event": "chunk", "result": {} }
{ "v": 1, "id": 12, "event": "end", "result": { "count": 3 } }
```

`POST /call` folds those into `{ "chunks": [], "result": {} }`. A unary method returns `result` directly. An error after chunks is terminal: the HTTP call fails and chunks already received are dropped with the request.

Error codes: `method_not_found`, `invalid_params`, `not_logged_in`, `platform_unavailable`, `internal`.

`invalid_params` and other failures of a known method include `error.schema` for that method. `method_not_found` includes `error.methods`.

## Methods

Each method is registered with a description and parameter list. `iris.capabilities` returns that list. A failed call for a known method includes `error.schema`. `method_not_found` includes `error.methods`, the same list.

`platform` is `chatgpt`, `deepseek`, or `gemini`. Chat methods run the existing content-script adapters inside a tab on that origin, so the site's own cookies apply. An already-open tab is reused. Otherwise Iris opens a background tab and leaves it open. The relay returns JSON. It does not write the user's export directory. The on-page FAB export still does.

Page extract modes: `text` (`innerText`), `html` (`outerHTML`), `markdown` (DOM walk). `browser.fetch` opens a foreground tab, waits until `innerText` is stable, then closes it. Those tabs are excluded from tracing.

`iris.navigate` takes `path`. `iris://history` opens the history list. `iris://history/<conversation id>` selects that stored transcript when the side panel is open. The path waits in `chrome.storage.session` if the panel is closed.

`iris.tools.list` and `iris.tools.call` expose the same page, script, skill, report, tab, search, automation, and screenshot tools the side panel agent runs. One implementation lives in `src/lib/agentToolCatalog.ts`. The side panel wraps it as model tools; the relay calls it directly in the service worker. Pass `tabId` for page tools. `iris.tools.list` with `tabId` also returns WebMCP tools registered on that tab, and `iris.tools.call` runs them. `prompt` tools return `needs_confirmation` until `params.confirmed` is true. Skill writes apply immediately. MCP tools are not on the relay: an external agent already has its own model loop and MCP servers. Skill records stay in extension storage.

## Adding a method

1. `registerRelayMethod("iris.example", handler, { description, params })` from the feature's module. Import that module from `src/background/browserRelay.ts` so it registers before connect.
2. The name shows up in `hello` and `iris.capabilities`.
3. Call it with `iris_call`. ea-tools does not need a new route or a new MCP tool.

Handlers live in `src/background/relayIris.ts` (Iris data and chat) and `src/background/browserRelay.ts` (page and tabs). The table is `src/background/relayRegistry.ts`. Chat reads go through `content/chatExport/relayApi.ts`.

Server side, in ea-tools: `POST /call` with `{ "method", "params", "timeout?" }` forwards one versioned request. MCP tool `iris_call` is that endpoint. Named `browser_*` tools keep their old HTTP routes.

## MV3 survival

Chrome kills idle service workers (~30s). `setTimeout` does not count as an event.

- Enabled: hold a persistent `chrome.runtime.connect({ name: "iris-relay-keepalive" })` so the SW does not die and drop the relay socket. Extra ref during in-flight fetch.
- Connect immediately on SW start with default port/token; do not wait for `loadSettings` (storage.sync migration can hang).
- Reconnect via `chrome.alarms`, not `setTimeout` (timers do not keep or survive the SW).
- Idle alarm every 30s: reconnect if the socket is down, or ping/pong and force-reconnect after 60s silence (sleep/wake)

`browser.fetch` needs a foreground tab: background tabs are JS-throttled and SPAs never finish rendering. Content readiness is polled every 500ms until `innerText.length` is stable for 1.5s (budget `max(wait, 3s) + 10s`).

## Settings

Settings → **Browser Relay**. Defaults match ea-tools (`port` 33007, token `ea-browser-relay-local`).

| Field | Default | Notes |
|-------|---------|-------|
| Enabled | on | Off → disconnect and stay down |
| Port | `33007` | `browser_relay.port` in `~/.ea/tools/config.yaml` |
| Token | `ea-browser-relay-local` | Must match `browser_relay.auth_token` |

Status check is `GET http://127.0.0.1:{port}/status`. Changing port/token/enabled reconnects the SW via `chrome.storage.onChanged`.

## Setup

```bash
ea-tools browser-relay serve
# Iris Settings → Browser Relay → Check Connection
ea-tools browser-relay status
```

Unload the old `EA Browser Relay` unpacked extension if it is still installed — two clients will fight over the single WS slot.

## Out of scope

- `chrome.debugger` / CDP / Playwright (ea-tools spec Phase 2)
- An Iris-side agent loop that drives the browser in the background
- Replacing crawl4ai / Jina / WebFetch for anonymous pages
