# Iris server

Optional server you run; Iris dials out to it over one WebSocket. It does three things:

1. **Sync.** Conversations, agent-written skills, scripts, reports, and settings (API keys included) are the same on every browser.
2. **Relay.** Outside agents call methods on a connected browser. What each browser accepts is its own level setting.
3. **Export.** Other apps read conversations through a change feed (the protocol in sonar's `.ea/docs/export.md`).

Agents do not call this server directly. They use sonar's tools (`browser_read`, `browser_call`, `ai_chat_*`, `export_*`), and sonar holds the keys. The server has no MCP endpoint and Iris has no CLI.

```
MBP Chrome  (level read) ─┐                       ┌─ sonar ── read key ──── browser_read, ai_chat_*, export_*
                          ├─ WSS /extension ── iris server ── control key ── browser_call
Mac mini    (level control)┘        (device token)  │
                                                    └─ Postgres (db iris): records
```

Traffic is plaintext on the server: HTTPS protects the network, and the stored records include API keys. End-to-end encryption and an Iris agent loop on the server are out of scope.

Code: `services/server`, not part of the extension bundle. The localhost ea-tools relay (`ws://127.0.0.1:33007`) is separate and unchanged.

## Run

Node 22.18 or newer (TypeScript strip types) and Postgres.

```bash
cd services/server
pnpm install --ignore-workspace
IRIS_DEVICE_TOKEN=… IRIS_READ_KEY=… IRIS_CONTROL_KEY=… \
IRIS_DATABASE_URL=postgres://iris:…@127.0.0.1:5432/iris pnpm start
```

| Env | Default | Notes |
|-----|---------|--|
| `IRIS_DEVICE_TOKEN` | required | What each browser sends in the auth frame (Settings → Remote Relay → Token) |
| `IRIS_READ_KEY` | required | Bearer for read-level calls, `/status`, and `/export/*` |
| `IRIS_CONTROL_KEY` | empty | Bearer for every method. Empty turns control calls off |
| `IRIS_DATABASE_URL` | required | Postgres. The schema is created on start |
| `IRIS_HOST` / `IRIS_PORT` | `127.0.0.1` / `33030` | Put TLS in front |

The three credentials are separate on purpose: a browser token cannot call browsers, and the read key cannot drive one. `--ignore-workspace` matters inside this repo, where the parent workspace would otherwise skip the directory.

Logs include method names, device ids, and record counts, never params or bodies. More than 600 requests per minute from one IP is 429. Bodies and WebSocket frames are capped at 32MB.

## Records

One table, `records (user_id, kind, id, rev, updated_at, deleted, body jsonb)`. `rev` comes from one sequence and only grows; every write takes the next one. Writes for a user are serialized, so revs commit in order and a reader that has passed rev N never misses a lower one. `user_id` is `me` until accounts exist.

| Kind | Id | Body | Conflict rule |
|---|---|---|---|
| `conversation` | conversation id | the stored conversation | messages merged by id |
| `skill` | name | stored skill; builtin skills are not synced | newer `updatedAt` |
| `script` | script id | stored userscript | newer `updatedAt` |
| `report` | report id | stored report | newer `updatedAt` |
| `setting` | settings field | `{ value }` | newer `updatedAt` |

Settings that describe one machine stay local: the remote relay fields (enabled, URL, token, device name, level), the localhost relay fields, and `mcpEndpoint`. A record over 8MB is rejected (`too_large`) and shown as a sync error.

### Sync protocol

The browser's requests use negative ids on the socket; the server's relay calls use positive ids.

- `sync.pull { since, limit? }` → `{ records: [{ kind, id, rev, updatedAt, deleted, body }], cursor, more }`, oldest rev first.
- `sync.push { records: [{ kind, id, baseRev, updatedAt, deleted?, body? }] }` → `{ results: [{ kind, id, rev?, error?, record? }] }`.
  - `baseRev` is the rev this edit started from (0 if the browser never saw one).
  - If it equals the stored rev, or nothing is stored, the push replaces the record.
  - Otherwise someone else wrote in between and the server resolves by the table above. `record` is returned whenever the stored result differs from what was sent, and the browser writes it into its storage.
- After a push that wrote anything, the server sends `{ method: "sync.changed" }` to the other browsers, which pull a few seconds later. Each browser also syncs on connect and about every 30 seconds.

The browser keeps `iris_sync_state`: the server URL, its cursor, and for each record the rev it last saw and a version of the body it last sent or applied. A local body whose version differs is an unsent edit. A pull does not overwrite it; the next push sends it with the old base and the server merges. A different server URL starts the state over.

- **First contact.** When a record exists both locally and on the server with no sync state, the server's copy wins, so a new browser does not overwrite shared settings with its defaults. A conversation is the exception: it is pushed and merged by message.
- **Deletes.** A skill, script, or report missing from storage is pushed as deleted. A conversation is pushed as deleted only when it has a tombstone (delete, clear all). A conversation dropped by the local cap of 100 stays on the server and in export.
- **Message merge.** The result keeps the incoming order, places each message only the server has after its predecessor, and takes the newer copy's title and metadata. Two browsers that continue one chat at the same time keep both sides' messages.

## Relay levels

Each browser sets Settings → Remote Relay → Remote calls, sent in the auth frame and `hello`:

| Level | Accepts | Meant for |
|---|---|---|
| `off` | nothing; sync only | a browser that should never act for others |
| `read` (default) | `browser.fetch`, `iris.capabilities`, `iris.chat.platforms`, `iris.chat.list`, `iris.chat.export`, `iris.chat.export_all` | a personal browser: reading pages and AI chats behind its logins |
| `control` | every relay method (tabs, page tools, Iris data and settings) | a browser set aside for agents, e.g. the Mac mini |

The server and the extension both enforce it (`READ_METHODS` in `services/server/src/hub.ts` and `src/lib/relayLevel.ts` must match). A control-level method also needs the control key.

## HTTP

Every route except `GET /health` needs `Authorization: Bearer <read or control key>`.

- `POST /call { method, params, timeout?, device? }`. `timeout` is in seconds (default 120, max 300).
  - Without `device`, the call goes to the most recently active browser whose level allows the method. `device` is an id, or a label when exactly one connected browser uses it.
  - `X-Iris-Device` names the browser that answered. A unary method returns its result; a streamed one returns `{ chunks, result }`.
  - Errors carry `{ error: { code, message, schema? } }`:
    - 400: `invalid_params` or `method_not_found`;
    - 403: the browser's level or the key does not allow the method;
    - 503: no browser connected that accepts it;
    - 504: timeout;
    - 502: anything else.
- `GET /status`, `GET /devices` → `{ extension_connected, pending_requests, devices: [{ id, label, level, lastSeen, methods, version }] }`. `version` is the extension's manifest version from `hello`.
- `GET /export/kinds` → `{ app: "iris", kinds: [{ kind, description }] }`. Only `conversation` is exported; settings never are.
- `GET /export/changes?since=<cursor>&kinds=&limit=` → `{ items: [{ kind, id, updatedAt, deleted, data }], cursor, more }`. The cursor is opaque (a rev today). Inline `data:` URLs over 256 characters become `[inline data omitted]`.

## Deploy (this setup)

`iris.service` on `devcloud_cpu`, from this repo, with `services/server/.env` (not committed). Postgres is the shared `deploy-postgres-1` container, database and role `iris`. A reverse tunnel publishes `127.0.0.1:33030` on tx04, where nginx serves `iris.easonsi.site` with TLS and WebSocket upgrade. The unit files are in `services/server/deploy/`.

## Out of scope

- End-to-end encryption
- An Iris agent loop on the server
- Accounts and login (planned: `user_id` is in place; per-device tokens and a sign-in come later)
- Replacing the localhost ea-tools relay
