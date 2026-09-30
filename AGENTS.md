# iris

Browser-side sensor and actuator of the ea system — Agent first, knowledge capture into ea, page enhancements as entry points.

## Quick Reference
- **Dev**: `pnpm dev` (Vite + crxjs hot reload)
- **Build**: `pnpm build` → `dist/` (load unpacked in Chrome)
- **Test**: `pnpm test` (Node test runner via tsx)
- **Typecheck**: `pnpm typecheck` (`bundle-skills` then `tsc -b`)
- **Spec / Docs**: @.ea/spec/spec.md

## Coding Style
- Compact and type-hinted
- Minimal docstrings (for public methods with complex logic only)
- Simple and clear, avoid over-engineering
- Language: English

## TypeScript Environment
- Package manager: `pnpm`
- Run scripts via `pnpm <script>`

## Git
- NEVER commit unreviewed work. Commit only after the user confirms the result (for forge issues: when they say "done" / "完成", close it with forge-close, one commit per issue)
- Never push unless the user or `.ea/forge.yaml` asks for it
- Only use `gh` CLI tools after user approval
