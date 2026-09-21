---
name: release
description: Tag a release and trigger CI by bumping package.json (and manifest.json) with pnpm version, committing, tagging v<version>, and pushing to origin. Use when the user asks to release, ship, tag a version, bump patch/minor/major, run /release, or publish iris.
---

# Release

Tag a release and trigger the GitHub Actions build.

Arguments: `[version|patch|minor|major]` (empty → `patch`).

This workflow is allowed to create the version commit, annotated tag, and `git push` — that is the point of invoking it.

## Context

Run these in the repo root and show them before bumping:

```bash
node -p "require('./package.json').version"
node -p "require('./manifest.json').version"
git status --short
git log --oneline -5
git describe --tags --abbrev=0 2>/dev/null || echo "(none)"
```

## Steps

1. If git is not clean (there are uncommitted changes), show the context above and ask the user whether to commit first before proceeding with the release. If yes, create a commit with an appropriate message. `pnpm version` will refuse to run with a dirty tree, so this is mandatory.
2. Resolve the target version from the user's argument:
   - If empty → default to `patch`.
   - If `patch` / `minor` / `major` → pass through to `pnpm version`.
   - If an explicit semver like `0.4.0` → pass through to `pnpm version` (it accepts explicit versions).
3. Run `pnpm version <target>`. This will automatically:
   - Bump `package.json`.
   - Invoke the `version` lifecycle script to sync `manifest.json` and `git add` it.
   - Create a commit (default message is the new version number).
   - Create an annotated tag `v<new-version>`.
4. Push the commit and tag to origin: `git push origin main --follow-tags`.
5. Report the new version, the tag name, and the CI workflow run URL. Use `gh run list -w release.yml -L 1` to find the triggered run (may need a few seconds — if it's not there yet, just report the workflow page URL `gh browse --no-browser --repo <repo> -- actions/workflows/release.yml` or just point the user at the Actions tab).
