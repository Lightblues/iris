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
| `IRIS_DEVICE_TOKEN` | empty | User `me`'s browser token: what each browser sends in the auth frame (Settings → Remote Relay → Token) |
| `IRIS_READ_KEY` | empty | User `me`'s bearer for read-level calls, `/status`, and `/export/*` |
| `IRIS_CONTROL_KEY` | empty | User `me`'s bearer for every method. Empty turns `me`'s control calls off |
| `IRIS_DATABASE_URL` | required | Postgres. The schema is created on start |
| `IRIS_HOST` / `IRIS_PORT` | `127.0.0.1` / `33030` | Put TLS in front |

The three credentials are separate on purpose: a browser token cannot call browsers, and the read key cannot drive one. The env ones belong to user `me` (see Users); other users' credentials are created with the CLI. `--ignore-workspace` matters inside this repo, where the parent workspace would otherwise skip the directory.

Logs include method names, device ids, and record counts, never params or bodies. More than 600 requests per minute from one IP is 429. Bodies and WebSocket frames are capped at 32MB.

## Users and credentials

Schema only (D004): no sign-up, no login. `users (id, name, created_at)` and `credentials (id, user_id, kind, hash, label, created_at, revoked_at)`, where `kind` is `device`, `read`, or `control` and `hash` is the SHA-256 of the token; tokens are never stored.

- On start the server creates user `me` and imports the three env credentials for it with label `env`. A changed or removed env value revokes the old one, so the env stays the source of truth for `me`.
- Every token resolves to its user. Sync, relay calls, `/devices`, `/status`, and export only see that user's records and browsers; `sync.changed` only wakes that user's browsers. Device ids are unique per user.
- Rows written before users existed have `user_id = 'me'`; the migration only adds tables.

CLI, in `services/server` (reads `.env` for `IRIS_DATABASE_URL`). `pnpm token` is a pnpm builtin, so both use `pnpm run`:

```bash
pnpm run user add <id> [name]                          # id: a-z 0-9 _ -, at most 32
pnpm run user list
pnpm run token add <user> <device|read|control> [label] # prints the token once
pnpm run token list [user]
pnpm run token revoke <credential id>
```

A second user's browser puts its device token in Settings → Remote Relay → Token; its sonar uses that user's read and control keys.

## Records

One table, `records (user_id, kind, id, rev, updated_at, deleted, body jsonb)`. `rev` comes from one sequence and only grows; every write takes the next one. Writes for a user are serialized, so revs commit in order and a reader that has passed rev N never misses a lower one. `user_id` is the owner (see Users).

| Kind | Id | Body | Conflict rule |
|---|---|---|---|
| `conversation` | conversation id | the stored conversation | messages merged by id |
| `skill` | name | stored skill; builtin skills are not synced | newer `updatedAt` |
| `script` | script id | stored userscript | newer `updatedAt` |
| `report` | report id | stored report | newer `updatedAt` |
| `setting` | settings field | `{ value }` | later edit time, always (no fast-forward) |

A setting's `updatedAt` is when the field was last edited by a person, not when it was pushed. The browser keeps these times in `sidepanel_settings_edited` (field → ms): a settings edit stamps the fields whose value changed, and applying a pulled setting stores the record's `updatedAt`. A field never edited on that browser (defaults, or values from before 0.7) has 0, so it loses to any real edit. Settings are pushed with `baseRev` 0, so the server always compares times: a stale copy written back by an old panel cannot win just because its base matches.

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

## Liveness

A socket can die without a close (a sleeping laptop, a dropped tunnel), and calls to it would wait for their timeout. Both ends watch for silence:

- The server sends a WebSocket ping to each browser every 30 seconds. Any frame from the browser (a message or the protocol pong) counts as alive and sets `lastSeen`. A socket with no frame for 90 seconds is terminated, so a dead browser leaves `/devices` within two minutes; calls pending on it fail with 502 `disconnected` and later calls go to another browser or get 503 `no_device`.
- The browser sends `{ action: "ping" }` every 30 seconds and reconnects when it has had no pong for 60 seconds.
- When a browser reconnects with the same device id, the old socket is terminated and its pending calls fail at once.

## HTTP

Every route except `GET /health` needs `Authorization: Bearer <read or control key>`, and answers for that key's user only.

- `POST /call { method, params, timeout?, device? }`. `timeout` is in seconds (default 120, max 300).
  - Without `device`, the call goes to the most recently active browser whose level allows the method. `device` is an id, or a label when exactly one connected browser uses it.
  - `X-Iris-Device` names the browser that answered. A unary method returns its result; a streamed one returns `{ chunks, result }`.
  - Errors carry `{ error: { code, message, schema? } }`:
    - 400: `invalid_params` or `method_not_found`;
    - 403: the browser's level or the key does not allow the method;
    - 503: no browser connected that accepts it;
    - 504: timeout;
    - 502: anything else.
- `GET /status`, `GET /devices` → `{ extension_connected, pending_requests, devices: [{ id, label, level, lastSeen, methods, version }] }`. `version` is the extension's manifest version from `hello`. `lastSeen` is the last frame of any kind (ms); routing without `device` prefers the browser that last said `hello` or pushed.
- `GET /export/kinds` → `{ app: "iris", kinds: [{ kind, description }] }`. Only `conversation` is exported; settings never are.
- `GET /export/changes?since=<cursor>&kinds=&limit=` → `{ items: [{ kind, id, updatedAt, deleted, data }], cursor, more }`. The cursor is opaque (a rev today). Inline `data:` URLs over 256 characters become `[inline data omitted]`.

## Deploy (this setup)

`iris.service` on `devcloud_cpu`, from this repo, with `services/server/.env` (not committed). Postgres is the shared `deploy-postgres-1` container, database and role `iris`. A reverse tunnel publishes `127.0.0.1:33030` on tx04, where nginx serves `iris.easonsi.site` with TLS and WebSocket upgrade. The unit files are in `services/server/deploy/`.

## Out of scope

- End-to-end encryption
- An Iris agent loop on the server
- Sign-up and login (users and per-user credentials exist; an invite-only Google sign-in may come later)
- Replacing the localhost ea-tools relay
