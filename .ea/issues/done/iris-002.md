---
schema_version: 1
id: iris-002
title: Auto-load model list from /v1/models endpoint
status: done
priority: high
estimate: M
---

## Objective
Replace the manual model configuration in Settings with automatic fetching from
provider's `/v1/models` API. Users should be able to favourite models for quick access,
and the Agent page model selector should support fuzzy search.

## Context
- `src/sidepanel/components/SettingsPage.tsx` — current manual model config UI
- `src/lib/sidepanelSettings.ts` — settings storage
- `src/sidepanel/components/ModelCombobox.tsx` — (to be created) searchable selector
- Providers expose `/v1/models` (OpenRouter, local gateway at localhost:33001)
- Current UX pain: too many models to manually maintain; new models require manual entry

## Tasks
- [x] Add fetcher for `/v1/models` endpoint (with provider base URL from settings)
- [x] Replace manual model list with auto-fetched list in Settings
- [x] Add favourite toggle (star) per model — favourites persist in storage
- [x] Create ModelCombobox with fuzzy text matching for Agent page
- [x] Sort: favourites first, then alphabetical

## Acceptance
- [x] Models auto-load from configured provider endpoint on Settings page open
- [x] User can star/unstar models; favourites persist across sessions
- [x] Agent page model selector supports typing to filter (fuzzy match)
- [x] Favourited models appear at top of the selector

## Boundaries
- Always: Use existing `sidepanelSettings` storage mechanism
- Never: Don't hardcode any model list — must be fully dynamic from API
