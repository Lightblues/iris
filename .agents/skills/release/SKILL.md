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
3. Draft the release notes from commits since the previous tag (`git log <tag>..HEAD --pretty=format:%s`, or the whole history if there is no tag). Write 3–8 bullets of what changed for someone using Iris. Group related commits. Leave out the version-bump commit itself. If the user already stated the highlights, use those.
4. Run `pnpm version <target> -m` with a subject of `%s` (npm replaces that with the version) and the notes as the body:

   ```bash
   pnpm version <target> -m "$(cat <<'EOF'
   %s

   - Search history and open a conversation by id
   - Drop the unused agent mode
   EOF
   )"
   ```

   `%s` must stay literal in the message so npm can substitute the version. Do not put `%s` in the bullets; npm replaces every occurrence. This will:
   - Bump `package.json`.
   - Invoke the `version` lifecycle script to sync `manifest.json` and `git add` it.
   - Create a commit whose subject is the version and whose body is the notes.
   - Create an annotated tag `v<new-version>`.
5. Push the commit and tag to origin: `git push origin main --follow-tags`.
6. Report the new version, the tag name, the notes, and the CI workflow run URL. Use `gh run list -w release.yml -L 1` to find the triggered run (may need a few seconds — if it's not there yet, just report the workflow page URL `gh browse --no-browser --repo <repo> -- actions/workflows/release.yml` or just point the user at the Actions tab).

## Where the notes live

The version commit body is the source. The release workflow copies that body onto the GitHub Release, which is the page people read. Do not add a `CHANGELOG.md`. A version-only subject is not enough: `--generate-notes` would then list every commit since the last tag.
