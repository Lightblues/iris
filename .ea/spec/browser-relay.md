# Browser Relay

Iris is the **browser-side half** of ea-tools `browser_*` tools. External agents fetch anti-scraping pages (WeChat, Xiaohongshu, Twitter) through this real browser — cookies and login state included.

This is request-response, not an autonomous browser-use loop. No LLM runs in the service worker. The relay server and MCP tools stay in ea-tools; Iris only owns the extension client.

## Why it lives in Iris

The standalone `EA Browser Relay` extension is deprecated. Same permissions (`tabs`, `scripting`, `alarms`, `<all_urls>`) were already here, and Iris is already the ea system's browser sensor/actuator. A second unpacked extension was extra install/config with no extra capability.

`debugger` is still out of scope. Phase-1 extraction uses `chrome.scripting` only.

## Architecture

```
Agent ──MCP──► ea-tools browser_fetch
                  │ HTTP POST :33007/fetch
                  ▼
            Relay Server (ea-tools)
                  │ WS  ← Iris SW connects here
                  ▼
            Iris service worker
                  │ tabs.create (foreground) → poll innerText → extract → tabs.remove
                  ▼
            { title, url, content }
```

Chrome service workers cannot listen on a TCP/WS port. Both Iris and the MCP tool are clients of the localhost relay.

## What Iris implements

`src/background/browserRelay.ts`, started from the service worker.

| WS action | MCP tool | Behavior |
|-----------|----------|----------|
| `fetch` | `browser_fetch` | Open URL in a **foreground** tab, wait for stable `innerText`, extract, close, restore previous tab |
| `list_tabs` | `browser_list_tabs` | All open tabs |
| `get_tab_content` | `browser_get_tab_content` | Extract an already-open tab |
| `close_tab` / `activate_tab` | matching tools | Tab control |

Extract modes: `text` (`innerText`), `html` (`outerHTML`), `markdown` (DOM walk). Relay-created tabs are excluded from tracing.

## MV3 survival

Chrome kills idle service workers (~30s). `setTimeout` does not count as an event.

- Enabled: hold a persistent `chrome.runtime.connect({ name: "iris-relay-keepalive" })` so the SW does not die and drop the relay socket. Extra ref during in-flight fetch.
- Connect immediately on SW start with default port/token; do not wait for `loadSettings` (storage.sync migration can hang).
- Reconnect via `chrome.alarms`, not `setTimeout` (timers do not keep or survive the SW).
- Idle alarm every 30s: reconnect if the socket is down, or ping/pong and force-reconnect after 60s silence (sleep/wake)

Foreground tabs are required: background tabs are JS-throttled and SPAs never finish rendering. Content readiness is polled every 500ms until `innerText.length` is stable for 1.5s (budget `max(wait, 3s) + 10s`).

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
