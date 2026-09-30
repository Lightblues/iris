# Issues

Work orders for coding agents, managed by [forge](https://github.com/Lightblues/forge). One Markdown file per issue.
This README is ignored by forge; regenerate it with `forge init --force`.

## Layout

```
.ea/issues/<status>/<id>.md      status: todo | in_progress | review | blocked | done
```

- id: `iris-<NNN>`, equal to the file name; next number = highest existing + 1 (`forge ls`).
- The directory and the `status` field always agree. Change both with `forge mv <id> <status>`, not a plain `mv`.
- `review`: finished by an agent, waiting for a person. Used when `review: true`; otherwise agents finish into `done`.
- Repository defaults (`prefix`, `delivery`, `review`, `provider`, `mode`, `host`) live in `.ea/forge.yaml`; issue fields override them.

## File

Frontmatter (YAML), schema v1:

| Field | Required | Meaning |
|---|---|---|
| `schema_version` | yes | `1`. Tools refuse other values |
| `id`, `title`, `status` | yes | Title is imperative, under 80 characters |
| `priority`, `estimate` | no | `low`..`urgent`; `S` (<15 min), `M` (15-60 min), `L` (1-4 h) |
| `labels`, `blocked_by` | no | Free-form list; issue ids |
| `host`, `cwd`, `provider`, `mode` | no | Where and how to run (`host` is a forge alias, default `local`) |
| `delivery`, `review` | no | `none` or `commit` (agent commits on the current branch); `true` finishes into `review/` |
| `workspace_id`, `agent_id`, `dispatched_at` | no | Written by `forge run`; do not edit |

Unknown fields are preserved. Body sections: `## Objective`, `## Context` (verified paths), `## Tasks`
(`- [ ]`, one change each), `## Acceptance` (observable checks), `## Boundaries` (`Always:` / `Never:` / `Ask:`),
and `## Outcome`, appended by the agent that executed it. Build and test commands live in CLAUDE.md / AGENTS.md.

## Workflow

```
forge ls                         list issues
forge check <id>                 validate one file
forge run <id> [--host <alias>]  dispatch to an agent; moves it to in_progress/
forge status <id>                agent state and latest output
```

The executing agent appends `## Outcome` and moves the file to `done/` (`review/` when review is on),
or back to `todo/` if it stopped early. To continue with that agent, open its workspace in Paseo or run `forge send <id> "..."`.
