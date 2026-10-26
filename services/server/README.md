# iris server

Sync, relay, and export for Iris. Browsers connect out over `WSS /extension`; sonar calls the HTTP side.

Spec (records, sync protocol, levels, HTTP, deploy): [`.ea/docs/server.md`](../../.ea/docs/server.md).

```bash
pnpm install --ignore-workspace
pnpm test        # in-memory PGlite
IRIS_DEVICE_TOKEN=… IRIS_READ_KEY=… IRIS_DATABASE_URL=postgres://… pnpm start
```

Listens on `127.0.0.1:33030` unless `IRIS_HOST` / `IRIS_PORT` say otherwise. Put TLS in front.
