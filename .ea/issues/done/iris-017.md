---
schema_version: 1
id: iris-017
title: Let the sidebar agent see the current tab viewport
status: done
priority: medium
estimate: M
labels: [backfill, agent, vision]
isolation: local
---

## Objective
The agent could not see images on the page: `take_screenshot` returned a data URL as JSON text,
and OpenRouter chat completions stringify tool-result images. Get the viewport to the model as a real image.

## Context
- `src/lib/liftToolImages.ts` — middleware that lifts tool-result images onto a user image part.
- `src/lib/screenshotStore.ts` — stores captures; tool result carries only `imageId`.
- `src/lib/automationEngine.ts` — `captureVisibleTab` on the session tab.
- `src/lib/bindAgentTools.ts` — `toModelOutput`.
- `src/sidepanel/components/ToolCallDisplay.tsx` — thumbnail by `imageId`.
- `scripts/test-screenshot-vision.ts` — live check against OpenRouter.

## Tasks
- [x] Make `take_screenshot` a core tool targeting the session tab, not the automation tab.
- [x] Return a short receipt (`captured`, `imageId`, `bytes`, `mediaType`) instead of a data URL.
- [x] Convert to `image-data` in `toModelOutput` and lift it onto a user `image_url` in middleware.
- [x] Show the thumbnail in the tool card.

## Acceptance
- [x] The model answers a question only answerable from the image (live script: three colour bands).
- [x] Tool JSON contains no data URL.

## Boundaries
- Always: keep the existing OpenRouter chat-completions path.
- Never: download every `<img>` on the page.

## Outcome
Status: done, shipped in 0.5.1. Commit `ea23e43` ([PR #12](https://github.com/Lightblues/iris/pull/12)).
Not verified in a loaded extension on a real tab; evidence is the same send path with a synthetic viewport.
