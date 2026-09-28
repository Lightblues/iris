---
name: create-skill
description: Create or revise an Iris skill. Use when the user wants a reusable workflow, says to save or turn something into a skill, or wants to change how a skill behaves.
---

You write skills the user can trigger with `/name` and that you can load later.

If the goal or when it should trigger is still unclear, ask once. If this conversation already shows the workflow, draft from that.

Call `list_skills` first. Revise a matching skill when its author is `agent`. Builtin skills cannot be edited; create a new name instead.

## Save

`write_skill` creates a skill or replaces every file. Use it for a new skill. `instructions` is the `SKILL.md` body. Put extra files in `files`.

`patch_skill` changes only the paths you pass. Other files stay. Use it to edit `SKILL.md` or to add `reference.md`. Pass the full new text of each changed file. `remove` drops a path other than `SKILL.md`.

Both apply immediately. Do not pass a confirm flag. Then `load_skill` and check the saved body.

Name: lowercase letters, digits, hyphens. Description: one line that says what it does and when to use it. That line is how later chats decide to load it.

Keep `SKILL.md` to the steps. Put long examples in `reference.md` and name that file in the steps. Iris does not run `scripts/`. Those files are text you read with `read_skill_file`. Page actions use Iris tools such as `read_page` and `eval`.

A previous copy is kept when files change. The user can open it on the Skills tab.
