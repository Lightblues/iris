---
schema_version: 1
id: iris-011
title: Keep attached chat images through send and rerun
status: done
priority: medium
estimate: S
labels: [backfill, agent, bug]
isolation: local
---

## Objective
Attached images were dropped: the SDK tried to fetch their data URLs as remote assets, and rerun
resent only the text. Keep image parts on the user message through send, history, and rerun.

## Context
- `src/agent/downloadAssets.ts` — `experimental_download` that skips `data:` URLs.
- `src/agent/createAgent.ts` — wires the download hook.
- `src/sidepanel/components/AgentPanel.tsx` — rerun path.

## Tasks
- [x] Skip `data:` URLs in the download hook so the SDK decodes them locally.
- [x] Resend both text and file parts on rerun.

## Acceptance
- [x] A pasted image reaches the model on first send.
- [x] Rerun of that message still includes the image.

## Outcome
Status: done, shipped in 0.4.0. Commit `2e5d809`.
