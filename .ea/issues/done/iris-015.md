---
schema_version: 1
id: iris-015
title: Search history and open a conversation by id
status: done
priority: medium
estimate: M
labels: [backfill, history]
isolation: local
---

## Objective
Past chats were hard to find and could not be referenced from outside. Record page URLs and skills
per conversation, make History searchable, and open a conversation from an `iris://history/<id>` link.

## Context
- `src/agent/history.ts` — conversation records, `urls` / `skills` rebuild.
- `src/lib/irisRoute.ts` — `iris://` route parsing.
- `src/background/relayIris.ts` — `iris.navigate` writes `iris_pending_route`.
- `src/sidepanel/SidePanelApp.tsx` — applies the pending route.
- `src/sidepanel/components/AgentHistoryTab.tsx`, `src/sidepanel/components/ChatHeader.tsx`.
- `.ea/spec/agent.md` — "Persistence".

## Tasks
- [x] Store `urls` and `skills` on each conversation; backfill older transcripts on load.
- [x] Search History over title, message text, urls, and skills; list the current page first.
- [x] Show the conversation id in rows and the chat header; copy as `iris://history/<id>`.
- [x] Route `iris://history/<id>` (and `iris.navigate`) to that conversation.

## Acceptance
- [x] Searching a skill name finds conversations that loaded it.
- [x] `iris.navigate` with `iris://history/<id>` opens that transcript in an open panel.

## Outcome
Status: done, shipped in 0.4.1. Commits `ede59b8`, `4b33ca3`.
