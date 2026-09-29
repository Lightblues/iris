# Remote Relay

Optional server you run. Iris dials out to it. The server stores conversation history and forwards `iris.*` / `browser.*` calls to a connected browser. Traffic is plaintext on the server: HTTPS protects the network, and the bearer token is the only access check. End-to-end encryption and a cloud-side Iris agent are out of scope.

`chrome.storage.sync` cannot do this. Its quota is about 100KB total and 8KB per item, and Iris already moved settings off it because cold-start reads can hang. Conversations live in `chrome.storage.local` and can carry image data URLs.

The localhost ea-tools relay (`ws://127.0.0.1:33007`) is unchanged. Remote relay is a second socket, off until Settings → Remote Relay is enabled.

```
Home Chrome  --WSS /extension-->  iris-relay (your VPS)  <--HTTPS /call or /mcp--  Cursor / Claude
Work Chrome  --WSS /extension-->           |
                                           +-- SQLite conversations
```

Service code: `services/relay`. It is not part of the extension bundle.

## Run

Requires Node 22 or newer (`node:sqlite` and TypeScript strip types). Listen on localhost and put Caddy in front.

```bash
cd services/relay
pnpm install --ignore-workspace
IRIS_RELAY_TOKEN="$(openssl rand -hex 32)" \
IRIS_RELAY_DATA=/var/lib/iris-relay \
IRIS_RELAY_HOST=127.0.0.1 \
IRIS_RELAY_PORT=8787 \
pnpm start
```

| Env | Default | Notes |
|-----|---------|--|
| `IRIS_RELAY_TOKEN` | required | Bearer token. Not the localhost `ea-browser-relay-local` value |
| `IRIS_RELAY_HOST` | `127.0.0.1` | Bind address |
| `IRIS_RELAY_PORT` | `8787` | Also accepts `PORT` |
| `IRIS_RELAY_DATA` | `./data` | SQLite directory |

Caddy terminates TLS and proxies WebSocket upgrades:

```
iris.example {
	reverse_proxy 127.0.0.1:8787
}
```

systemd:

```
[Service]
Environment=IRIS_RELAY_TOKEN=replace-me
Environment=IRIS_RELAY_DATA=/var/lib/iris-relay
Environment=IRIS_RELAY_HOST=127.0.0.1
Environment=IRIS_RELAY_PORT=8787
WorkingDirectory=/opt/iris-relay
ExecStart=/usr/bin/node src/index.ts
Restart=on-failure
```

Copy `services/relay` to `/opt/iris-relay` and run `pnpm install --ignore-workspace` there (the flag matters when this directory sits inside the Iris repo, because the parent workspace would otherwise skip it). In Iris, set the URL to `wss://iris.example`, the same token, and a device name (`home`, `company`). The extension appends `/extension` when the path is empty. The device id is generated once and stored in `chrome.storage.local` (`iris_remote_device_id`). It is not part of the synced history.

Logs include method names, device ids, and sync counts. They do not include params or conversation bodies.

HTTP without `Authorization: Bearer <token>` returns 401. More than 600 requests per minute from one IP returns 429. Request bodies are capped at 32MB.

## WebSocket

`WSS /extension`. The first message must be auth. The token is not placed in the URL.

```json
{ "v": 1, "method": "auth", "params": { "token": "...", "deviceId": "...", "label": "home" } }
```

```json
{ "v": 1, "method": "auth", "result": { "ok": true } }
```

A bad token closes the socket with code 4001. After auth the extension sends the same `hello` as the localhost relay. A new connection with the same `deviceId` replaces the old socket.

The server calls the browser with a positive `id`. The browser's own sync requests use a negative `id`, so the two directions do not collide. Ping and pong stay unnumbered. Tool responses use the localhost envelope, including `event: "chunk"` / `event: "end"`.

## HTTP

`POST /call` with `{ "method", "params", "timeout?", "device?" }`. `timeout` is seconds (default 120, max 300), the same unit as the localhost ea-tools relay. When `device` is omitted, the call goes to the browser that most recently connected or pushed history. `device` may be an id, or a label when exactly one connected browser uses it. The response header `X-Iris-Device` is the id of the browser that answered.

A unary method returns the method result as the body. A streamed method returns `{ "chunks", "result" }`. A method error is HTTP 400 for `invalid_params` and `method_not_found`, otherwise 502, with `{ "error": { "code", "message", "schema?" } }`. Chunks already received are dropped. No connected browser is 503 `{ "error": "extension not connected" }`. Timeout is 504 `{ "error": "timeout waiting for extension response" }`.

`GET /devices` and `GET /status` return `{ "extension_connected", "pending_requests", "methods", "devices" }`. `methods` belongs to the browser a call would reach when `device` is omitted. `devices` is `[{ "id", "label", "lastSeen", "methods" }]`.

## History sync

SQLite tables `conversations` (`id`, `last_updated`, `body`) and `tombstones` (`id`, `deleted_at`). The body is the conversation JSON.

Rules:

- The greater `lastUpdated` wins. An equal timestamp does not replace the stored body.
- A tombstone `{ "id", "deletedAt" }` deletes the conversation only when `deletedAt` is greater than `lastUpdated`. A newer body drops the tombstone.
- Deletes and "clear all" write tombstones. Without them, the other browser would push the conversation back.
- `activeConversationId` and `chrome.storage.session` tab sessions are not synced. Two browsers editing one conversation at the same time: the later `lastUpdated` wins.
- The side panel debounces pushes by about 2 seconds. On connect, and about every 30 seconds, the browser sends `sync.reconcile` with `{ id, lastUpdated }` and its tombstones. The server replies with bodies the browser is missing, tombstones to apply, and ids the browser should upload.
- One record over 8MB is rejected (`too_large`) and reported as a sync error in Settings. Images are not stripped.
- Both sides keep at most 100 conversations. Past that, the oldest become tombstones.

`POST /sync/conversations` with `{ "conversations", "tombstones" }` and `GET /sync/conversations?since=` are the same store, for a manual client. The extension uses the socket.

## MCP

`POST /mcp` is a stateless JSON-RPC endpoint with one tool, `iris_call`. Arguments are `method`, `params`, `device`, and `timeout` (seconds). The tool text is the same JSON body as `POST /call`. Point Cursor or Claude at `https://iris.example/mcp` and send the bearer token. This does not run an Iris model loop. The external agent calls browser methods; the paired Chrome executes them.

## Out of scope

- End-to-end encryption
- Syncing skills, scripts, or settings
- An Iris agent loop on the VPS
- Replacing the localhost ea-tools relay
