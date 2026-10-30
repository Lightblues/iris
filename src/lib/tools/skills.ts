import {
  deleteSkill,
  getSkill,
  listSkillHistory,
  listSkills,
  patchSkill,
  readSkillFile,
  setSkillEnabled as setStoredSkillEnabled,
  skillBodyOf,
  writeSkill,
  type SkillStringEdit,
} from '../skillStore'
import { bool, num, schema, str, type ToolDef } from './shared'

function skillFileEdits(value: unknown): { path: string; content: string }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(file => {
    if (!file || typeof file !== 'object') return []
    const row = file as { path?: unknown; content?: unknown }
    if (typeof row.path !== 'string' || typeof row.content !== 'string') return []
    return [{ path: row.path, content: row.content }]
  })
}

const skillFileSchema = {
  type: 'array',
  description: 'Files to write whole. Each item replaces that path entirely. Use for new files.',
  items: {
    type: 'object',
    properties: { path: str('Relative path, such as SKILL.md or reference.md'), content: str('Full new text of that file') },
    required: ['path', 'content'],
  },
}

function skillStringEdits(value: unknown): SkillStringEdit[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const row = item as { path?: unknown; old_string?: unknown; new_string?: unknown; replace_all?: unknown }
    if (typeof row.path !== 'string' || typeof row.old_string !== 'string' || typeof row.new_string !== 'string') return []
    return [{ path: row.path, oldString: row.old_string, newString: row.new_string, replaceAll: row.replace_all === true }]
  })
}

const skillEditSchema = {
  type: 'array',
  description: 'Targeted replacements inside existing files. Preferred over files for editing a file that already exists.',
  items: {
    type: 'object',
    properties: {
      path: str('Relative path inside the skill, such as SKILL.md'),
      old_string: str('Exact text to replace, copied from the file including whitespace. Must be unique unless replace_all is true.'),
      new_string: str('Replacement text'),
      replace_all: bool('Replace every occurrence instead of requiring a unique match'),
    },
    required: ['path', 'old_string', 'new_string'],
  },
}

export const skillsToolDefs: ToolDef[] = [
  {
    name: 'list_skills',
    group: 'skills',
    needsTab: false,
    description: 'List skills by name, description, author, and enabled flag. Does not return file contents.',
    inputSchema: schema({}),
    async run() {
      const skills = await listSkills()
      return skills.map(skill => ({
        name: skill.name,
        description: skill.description,
        author: skill.author,
        enabled: skill.enabled,
        files: Object.keys(skill.files),
      }))
    },
  },
  {
    name: 'load_skill',
    group: 'skills',
    needsTab: false,
    description: 'Load an enabled skill\'s SKILL.md body. Full instructions stay out of context until this is called.',
    inputSchema: schema({ name: str('Skill name from the available-skills list') }, ['name']),
    async run(params) {
      if (typeof params.name !== 'string') throw new Error('name is required')
      const skill = await getSkill(params.name)
      if (!skill) return { error: `Skill '${params.name}' not found` }
      if (!skill.enabled) return { error: `Skill '${skill.name}' is disabled` }
      const skillMd = skill.files['SKILL.md']
      if (!skillMd) return { error: `Skill '${skill.name}' has no SKILL.md` }
      const refs = Object.keys(skill.files).filter(path => path !== 'SKILL.md')
      return {
        skillDirectory: skill.name,
        content: skillBodyOf(skillMd),
        ...(refs.length ? { files: refs } : {}),
      }
    },
  },
  {
    name: 'read_skill_file',
    group: 'skills',
    needsTab: false,
    description: 'Read a file inside a skill, such as references/foo.md.',
    inputSchema: schema({
      name: str('Skill name'),
      path: str('Relative path inside the skill, e.g. reference.md'),
    }, ['name', 'path']),
    async run(params) {
      if (typeof params.name !== 'string' || typeof params.path !== 'string') throw new Error('name and path are required')
      const skill = await getSkill(params.name)
      if (!skill) return { error: `Skill '${params.name}' not found` }
      try {
        return { path: `${skill.name}/${params.path}`, content: readSkillFile(skill, params.path) }
      } catch (err) {
        return { error: (err as Error).message, files: Object.keys(skill.files) }
      }
    },
  },
  {
    name: 'write_skill',
    group: 'skills',
    needsTab: false,
    description: 'Create a skill, or replace its entire file set. Applies immediately. For a one-file edit use patch_skill. Builtin names are rejected. author is recorded as agent.',
    inputSchema: schema({
      name: str('Skill name: lowercase letters, digits, and hyphens'),
      description: str('When to use this skill. Single line.'),
      instructions: str('SKILL.md body. Max 8KB.'),
      files: skillFileSchema,
    }, ['name', 'description', 'instructions']),
    async run(params) {
      if (typeof params.name !== 'string' || typeof params.description !== 'string' || typeof params.instructions !== 'string') {
        throw new Error('name, description, and instructions are required')
      }
      const existing = await getSkill(params.name)
      if (existing?.author === 'builtin') throw new Error(`Builtin skill '${existing.name}' cannot be overwritten`)
      const skill = await writeSkill({
        name: params.name,
        description: params.description,
        instructions: params.instructions,
        extraFiles: skillFileEdits(params.files),
      })
      return { name: skill.name, author: skill.author, enabled: skill.enabled, files: Object.keys(skill.files) }
    },
  },
  {
    name: 'patch_skill',
    group: 'skills',
    needsTab: false,
    description: 'Edit an existing skill without touching its other files. Use edits for a targeted string replacement in a file that already exists; use files only to create a file or deliberately rewrite one whole. Applies immediately and snapshots the previous files. Builtin skills are rejected.',
    inputSchema: schema({
      name: str('Skill name'),
      edits: skillEditSchema,
      files: skillFileSchema,
      remove: { type: 'array', items: { type: 'string' }, description: 'Paths to delete. SKILL.md cannot be removed.' },
    }, ['name']),
    async run(params) {
      if (typeof params.name !== 'string') throw new Error('name is required')
      const skill = await patchSkill({
        name: params.name,
        files: skillFileEdits(params.files),
        edits: skillStringEdits(params.edits),
        remove: Array.isArray(params.remove) ? params.remove.filter((path): path is string => typeof path === 'string') : [],
      })
      return { name: skill.name, author: skill.author, enabled: skill.enabled, files: Object.keys(skill.files) }
    },
  },
  {
    name: 'read_skill_history',
    group: 'skills',
    needsTab: false,
    description: 'Inspect snapshots taken before earlier edits to a skill. Without revision it lists them; with revision and path it returns that old file. To roll back, read the old text and write it back with patch_skill.',
    inputSchema: schema({
      name: str('Skill name'),
      revision: num('Revision index from the listing. 0 is the most recent snapshot.'),
      path: str('File to read from that revision, such as SKILL.md'),
    }, ['name']),
    async run(params) {
      if (typeof params.name !== 'string') throw new Error('name is required')
      const revisions = await listSkillHistory(params.name.toLowerCase())
      if (revisions.length === 0) return { name: params.name, revisions: [], note: 'No earlier versions recorded.' }
      if (typeof params.revision !== 'number') {
        return {
          name: params.name,
          revisions: revisions.map((rev, index) => ({
            revision: index,
            savedAt: new Date(rev.savedAt).toISOString(),
            files: Object.entries(rev.files).map(([path, content]) => ({ path, bytes: content.length })),
          })),
        }
      }
      const revision = revisions[params.revision]
      if (!revision) return { error: `No revision ${params.revision}. Available: 0-${revisions.length - 1}` }
      const files = Object.keys(revision.files)
      if (typeof params.path !== 'string') return { revision: params.revision, savedAt: new Date(revision.savedAt).toISOString(), files }
      const content = revision.files[params.path]
      if (content == null) return { error: `No such file in revision ${params.revision}: ${params.path}`, files }
      return { revision: params.revision, savedAt: new Date(revision.savedAt).toISOString(), path: params.path, content }
    },
  },
  {
    name: 'delete_skill',
    group: 'skills',
    needsTab: false,
    description: 'Delete a skill the agent created. Applies immediately. Builtin skills are rejected.',
    inputSchema: schema({ name: str('Skill name') }, ['name']),
    async run(params) {
      if (typeof params.name !== 'string') throw new Error('name is required')
      const existing = await getSkill(params.name)
      if (!existing) throw new Error(`Skill not found: ${params.name}`)
      if (existing.author === 'builtin') throw new Error(`Builtin skill '${existing.name}' cannot be deleted`)
      await deleteSkill(params.name)
      return { name: existing.name, deleted: true }
    },
  },
  {
    name: 'toggle_skill',
    group: 'skills',
    needsTab: false,
    description: 'Enable or disable a skill by name, including builtins.',
    inputSchema: schema({
      name: str('Skill name'),
      enabled: bool('Whether the skill is offered to the agent and the slash list'),
    }, ['name', 'enabled']),
    async run(params) {
      if (typeof params.name !== 'string' || typeof params.enabled !== 'boolean') throw new Error('name and enabled are required')
      const skill = await setStoredSkillEnabled(params.name, params.enabled)
      return { name: skill.name, enabled: skill.enabled }
    },
  },
]
