---
name: create-skill
description: Create or revise an Iris skill. Use when the user wants a reusable workflow, says to save or turn something into a skill, or wants to change how a skill behaves.
---

You write skills the user can trigger with `/name` and that you can load later.

If the goal or when it should trigger is still unclear, ask once. If this conversation already shows the workflow, draft from that.

Call `list_skills` first. Revise a matching skill when its author is `agent`. Builtin skills cannot be edited; create a new name instead.

## SKILL.md format

Every `SKILL.md` starts with YAML frontmatter, then the instructions:

```
---
name: <same as the skill name>
description: <one line: what it does and when to use it>
---

<instructions>
```

`name`: 1-64 characters, lowercase letters, digits, and single hyphens; no leading, trailing, or doubled hyphen. `description`: one line, up to 1024 characters. That line is how later chats decide to load the skill, so say both what it does and when to use it. A save that drops the frontmatter or changes `name` is rejected.

## Save

`write_skill` creates a skill or replaces every file. Use it for a new skill. `instructions` is the `SKILL.md` body — the frontmatter is generated for you. Put extra files in `files`.

`patch_skill` edits an existing skill:

- `edits` — targeted replacement: `path`, `old_string`, `new_string`, optional `replace_all`. Prefer this for any file that already exists. Copy `old_string` from the text you just read, whitespace included; it must match exactly once unless `replace_all` is set.
- `files` — writes a whole file. Use it only to add a new file or to deliberately rewrite one end to end. It overwrites everything at that path.
- `remove` — drops a path other than `SKILL.md`.

Edits apply immediately. Do not pass a confirm flag. Then `load_skill` and check the saved body.

## Recover an earlier version

Every save snapshots the files it replaced; a burst of edits within a few minutes keeps the state from before the burst. `read_skill_history({ name })` lists the snapshots. `read_skill_history({ name, revision, path })` returns that old file. To roll back, read the old text and write it back with `patch_skill`. The user can also open snapshots on the Skills tab.

## Writing the body

Keep `SKILL.md` to the steps. Put long examples in `reference.md` and name that file in the steps. Iris does not run `scripts/`. Those files are text you read with `read_skill_file`. Page actions use Iris tools such as `read_page` and `eval`.
