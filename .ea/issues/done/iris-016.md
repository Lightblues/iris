---
schema_version: 1
id: iris-016
title: Add an optional remote relay for history sync and public tool calls
status: done
priority: high
estimate: L
labels: [backfill, relay, remote]
isolation: local
---

## Objective
Conversations were stuck in one browser, and external agents could reach it only through a localhost
relay. Add an opt-in server that browsers dial out to, for cross-device history sync and HTTPS/MCP tool calls.

## Context
- `services/relay/src/` — `index.ts` (HTTP), `hub.ts` (device routing), `store.ts`, `mcp.ts` (`iris_call`).
- `services/relay/src/server.test.ts`, `services/relay/src/merge.test.ts`.
- `src/background/remoteRelay.ts` — extension client.
- `src/agent/conversationSync.ts`, `src/agent/history.ts` — reconcile and merge.
- `src/lib/remoteRelayUrl.ts` — URL normalisation.
- `.ea/spec/remote-relay.md`.

## Tasks
- [x] Build the relay service: device registry, `POST /call`, `POST /mcp` with one `iris_call` tool.
- [x] Sync conversations: debounced push, periodic `sync.reconcile`, last-writer-wins by `lastUpdated`, tombstones.
- [x] Add the extension client and Settings (off by default: URL, token, device name).
- [x] Align `/call` timeout unit and response shape with the local ea-tools relay; name the device in `X-Iris-Device`.

## Acceptance
- [x] Two browsers on one relay see each other's conversations.
- [x] An external MCP client can call a browser method through `/mcp` with the bearer token.
- [x] A client can target either relay with the same request body.

## Boundaries
- Never: sync `activeConversationId` or tab sessions; never run an LLM loop on the server.
- Always: off by default.

## Outcome
Status: done, shipped in 0.5.0. Commits `67bfe88`, `15bed16`.
