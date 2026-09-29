# iris-relay

Small server for Iris history sync and public tool calls. The browser connects out; this process does not open a port on your laptop.

Protocol, device routing, and the Caddy / systemd example: [`.ea/spec/remote-relay.md`](../../.ea/spec/remote-relay.md).

```bash
pnpm install --ignore-workspace
IRIS_RELAY_TOKEN="$(openssl rand -hex 32)" pnpm start
```

`--ignore-workspace` is required inside this repo. A copied directory on the VPS can use plain `pnpm install`.

Listens on `127.0.0.1:8787` unless `IRIS_RELAY_HOST` / `IRIS_RELAY_PORT` say otherwise. Put TLS in front. `IRIS_RELAY_TOKEN` is required.
