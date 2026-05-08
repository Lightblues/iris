---
id: iris-005
title: Configure GitHub Actions release workflow
status: done
priority: low
estimate: S
---

## Objective
Set up a GitHub Actions workflow that builds the extension and publishes a zip artifact
on version tag push, so friends can download and install without cloning the repo.

## Context
- Build command: `pnpm build` → outputs to `dist/`
- Distribution: unpacked Chrome extension (not Chrome Web Store)
- Users install via chrome://extensions → "Load unpacked"
- Triggered on: git tag `v*` push

## Tasks
- [x] Create `.github/workflows/release.yml`
- [x] Workflow steps: checkout → pnpm install → build → zip dist/ → create GitHub Release
- [x] Attach `iris-vX.Y.Z.zip` as release asset
- [x] Add `/release` CC command for convenience

## Acceptance
- [x] Pushing a `v*` tag triggers the workflow
- [x] Release page has downloadable zip
- [x] Zip contents load correctly as unpacked extension in Chrome

## Boundaries
- Never: Don't publish to Chrome Web Store (decision: GitHub Release is sufficient for personal/friends use)
