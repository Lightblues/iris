---
description: Tag a release and trigger CI build
allowed-tools: Bash(pnpm *) Bash(git *) Bash(gh *) Bash(node *)
argument-hint: "[version|patch|minor|major]"
---

Context:
- Current version: `!node -p "require('./package.json').version"`
- Manifest version: `!node -p "require('./manifest.json').version"`
- Git status: `!git status --short`
- Recent commits: `!git log --oneline -5`
- Latest tag: `!git describe --tags --abbrev=0 2>/dev/null || echo "(none)"`

Instructions:
1. If git is not clean (there are uncommitted changes), show the context above and ask the user whether to commit first before proceeding with the release. If yes, create a commit with an appropriate message. `pnpm version` will refuse to run with a dirty tree, so this is mandatory.
2. Resolve the target version from `$ARGUMENTS`:
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
