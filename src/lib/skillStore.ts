import skillsJson from '@/agent/builtinSkills.json' with { type: 'json' }

export type SkillAuthor = 'builtin' | 'user' | 'agent'

export interface StoredSkill {
  name: string
  description: string
  enabled: boolean
  author: SkillAuthor
  files: Record<string, string>
  updatedAt: number
}

export interface SkillRevision {
  savedAt: number
  files: Record<string, string>
}

interface BundledSkill {
  name: string
  description: string
  files: Record<string, string>
}

const KEY = 'iris_skills'
const HISTORY_KEY = 'iris_skill_history'
const HISTORY_CAP = 16
/** Edits landing within this window keep the pre-burst snapshot instead of pushing a new revision. */
const HISTORY_COALESCE_MS = 5 * 60 * 1000
export const SKILL_BODY_MAX = 8 * 1024
export const SKILL_NAME_MAX = 64
export const SKILL_DESCRIPTION_MAX = 1024
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export interface SkillFrontmatter {
  name: string
  description: string
  fields: Record<string, string>
  body: string
}

/**
 * Minimal frontmatter reader: top-level `key: value` lines only. Indented lines belong to a
 * nested field (`metadata:`) and are skipped rather than parsed.
 */
export function parseFrontmatter(markdown: string): SkillFrontmatter | null {
  const match = markdown.match(FRONTMATTER_RE)
  if (!match) return null
  const fields: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const entry = line.match(/^([A-Za-z][\w-]*):[ \t]*(.*)$/)
    if (!entry) continue
    fields[entry[1]] = unquote(entry[2].trim())
  }
  return {
    name: fields.name ?? '',
    description: fields.description ?? '',
    fields,
    body: markdown.slice(match[0].length).trim(),
  }
}

function unquote(value: string): string {
  if (value.length > 1 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/''/g, "'")
  }
  return value
}

/** Quote a single-line scalar when plain YAML would misread it. */
function yamlScalar(value: string): string {
  if (/^[\w(][^:#]*$/.test(value) && !/:\s/.test(value)) return value
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function skillBody(markdown: string): string {
  return parseFrontmatter(markdown)?.body ?? markdown.trim()
}

export function assertSkillName(name: string): string {
  const trimmed = name.trim().toLowerCase()
  if (!NAME_RE.test(trimmed) || trimmed.length > SKILL_NAME_MAX) {
    throw new Error(
      `Invalid skill name '${name}'. Use 1-${SKILL_NAME_MAX} lowercase letters, digits, and single hyphens; no leading, trailing, or doubled hyphen.`,
    )
  }
  return trimmed
}

export function assertSkillDescription(description: string): string {
  const trimmed = description.trim()
  if (!trimmed) throw new Error('description is required')
  if (/[\r\n]/.test(trimmed)) throw new Error('description must be a single line')
  if (trimmed.length > SKILL_DESCRIPTION_MAX) {
    throw new Error(`description exceeds ${SKILL_DESCRIPTION_MAX} characters`)
  }
  return trimmed
}

function assertRelPath(path: string): void {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid skill path: ${path}`)
  }
}

/** Agent Skills spec: SKILL.md must open with YAML frontmatter carrying name and description. */
export function assertSkillMarkdown(markdown: string, name: string): SkillFrontmatter {
  const fm = parseFrontmatter(markdown)
  if (!fm) {
    throw new Error(
      `SKILL.md must start with YAML frontmatter:\n---\nname: ${name}\ndescription: <what it does and when to use it>\n---\n\n<instructions>`,
    )
  }
  if (!fm.name) throw new Error('SKILL.md frontmatter is missing a name field')
  if (fm.name !== name) {
    throw new Error(`SKILL.md frontmatter name '${fm.name}' must match the skill name '${name}'`)
  }
  assertSkillDescription(fm.description)
  if (!fm.body) throw new Error('SKILL.md has no instructions after the frontmatter')
  if (fm.body.length > SKILL_BODY_MAX) {
    throw new Error(`SKILL.md body exceeds ${SKILL_BODY_MAX} characters`)
  }
  return fm
}

export function assertSkillFiles(files: Record<string, string>, name: string): SkillFrontmatter {
  const skillMd = files['SKILL.md']
  if (!skillMd) throw new Error('SKILL.md is required')
  for (const path of Object.keys(files)) assertRelPath(path)
  return assertSkillMarkdown(skillMd, name)
}

export function buildSkillMarkdown(name: string, description: string, instructions: string): string {
  return `---\nname: ${name}\ndescription: ${yamlScalar(description)}\n---\n\n${instructions.trim()}\n`
}

export function skillBodyOf(markdown: string): string {
  return skillBody(markdown)
}

function filesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every(key => a[key] === b[key])
}

async function readSkills(): Promise<StoredSkill[]> {
  const bag = await chrome.storage.local.get(KEY)
  return (bag[KEY] as StoredSkill[] | undefined) ?? []
}

async function writeSkills(skills: StoredSkill[]): Promise<void> {
  await chrome.storage.local.set({ [KEY]: skills })
}

function descriptionFromMarkdown(markdown: string, fallback: string): string {
  return parseFrontmatter(markdown)?.description || fallback
}

/** Add bundled skills that are missing, and refresh files of skills that are still builtin. */
export async function ensureSeedSkills(): Promise<void> {
  const existing = await readSkills()
  const bundled = skillsJson as BundledSkill[]
  const known = new Set(existing.map(skill => skill.name))
  const now = Date.now()
  let changed = false
  const next = existing.map(skill => {
    const source = bundled.find(item => item.name === skill.name)
    if (!source || skill.author !== 'builtin') return skill
    if (skill.description === source.description && filesEqual(skill.files, source.files)) return skill
    changed = true
    return { ...skill, description: source.description, files: source.files, updatedAt: now }
  })
  for (const source of bundled) {
    if (known.has(source.name)) continue
    changed = true
    next.push({
      name: source.name,
      description: source.description,
      enabled: true,
      author: 'builtin',
      files: source.files,
      updatedAt: now,
    })
  }
  if (changed) await writeSkills(next)
}

export async function listSkills(): Promise<StoredSkill[]> {
  await ensureSeedSkills()
  return readSkills()
}

export async function getSkill(name: string): Promise<StoredSkill | undefined> {
  const skills = await listSkills()
  return skills.find(skill => skill.name === name.toLowerCase())
}

async function readHistory(): Promise<Record<string, SkillRevision[]>> {
  const bag = await chrome.storage.local.get(HISTORY_KEY)
  return (bag[HISTORY_KEY] as Record<string, SkillRevision[]> | undefined) ?? {}
}

export async function listSkillHistory(name: string): Promise<SkillRevision[]> {
  const all = await readHistory()
  return all[name] ?? []
}

/**
 * Store the state a write is about to replace. Consecutive edits inside HISTORY_COALESCE_MS are
 * one burst: the snapshot from before the burst is kept and no new revision is pushed.
 */
async function rememberPrior(name: string, files: Record<string, string>): Promise<void> {
  const all = await readHistory()
  const list = all[name] ?? []
  if (list[0] && Date.now() - list[0].savedAt < HISTORY_COALESCE_MS) return
  all[name] = [{ savedAt: Date.now(), files }, ...list].slice(0, HISTORY_CAP)
  await chrome.storage.local.set({ [HISTORY_KEY]: all })
}

async function dropHistory(name: string): Promise<void> {
  const all = await readHistory()
  if (!all[name]) return
  delete all[name]
  await chrome.storage.local.set({ [HISTORY_KEY]: all })
}

export async function writeSkill(input: {
  name: string
  description: string
  instructions: string
  extraFiles?: { path: string; content: string }[]
}): Promise<StoredSkill> {
  const name = assertSkillName(input.name)
  const description = assertSkillDescription(input.description)
  if (!input.instructions.trim()) throw new Error('instructions are required')
  const skills = await listSkills()
  const prior = skills.find(skill => skill.name === name)
  if (prior?.author === 'builtin') throw new Error(`Builtin skill '${name}' cannot be overwritten`)
  const files: Record<string, string> = {
    'SKILL.md': buildSkillMarkdown(name, description, input.instructions),
  }
  for (const file of input.extraFiles ?? []) {
    if (file.path === 'SKILL.md') continue
    if (typeof file.path !== 'string' || typeof file.content !== 'string') continue
    files[file.path] = file.content
  }
  assertSkillFiles(files, name)
  if (prior && !filesEqual(prior.files, files)) await rememberPrior(name, prior.files)
  const next: StoredSkill = {
    name,
    description,
    enabled: prior?.enabled ?? true,
    author: 'agent',
    files,
    updatedAt: Date.now(),
  }
  await writeSkills([...skills.filter(skill => skill.name !== name), next])
  return next
}

export interface SkillStringEdit {
  path: string
  oldString: string
  newString: string
  replaceAll?: boolean
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return count
    count += 1
    from = at + needle.length
  }
}

/** Exact string replacement. old_string must match once unless replaceAll is set. */
export function applyStringEdit(content: string, edit: SkillStringEdit): string {
  if (!edit.oldString) throw new Error(`old_string is required for ${edit.path}`)
  if (edit.oldString === edit.newString) throw new Error(`old_string and new_string are identical for ${edit.path}`)
  const hits = countOccurrences(content, edit.oldString)
  if (hits === 0) {
    throw new Error(`old_string not found in ${edit.path}. Read the file first and copy the exact text, whitespace included.`)
  }
  if (hits > 1 && !edit.replaceAll) {
    throw new Error(`old_string matches ${hits} times in ${edit.path}. Include surrounding context to make it unique, or set replace_all.`)
  }
  if (edit.replaceAll) return content.split(edit.oldString).join(edit.newString)
  return content.replace(edit.oldString, () => edit.newString)
}

export async function patchSkill(input: {
  name: string
  files?: { path: string; content: string }[]
  edits?: SkillStringEdit[]
  remove?: string[]
}): Promise<StoredSkill> {
  const name = assertSkillName(input.name)
  const writes = input.files ?? []
  const edits = input.edits ?? []
  const remove = input.remove ?? []
  if (writes.length === 0 && edits.length === 0 && remove.length === 0) {
    throw new Error('files, edits, or remove is required')
  }
  const skills = await listSkills()
  const prior = skills.find(skill => skill.name === name)
  if (!prior) throw new Error(`Skill not found: ${name}. Use write_skill to create it.`)
  if (prior.author === 'builtin') throw new Error(`Builtin skill '${name}' cannot be edited`)
  const files = { ...prior.files }
  for (const file of writes) {
    assertRelPath(file.path)
    files[file.path] = file.content
  }
  for (const edit of edits) {
    assertRelPath(edit.path)
    const current = files[edit.path]
    if (current == null) {
      throw new Error(`No such file: ${name}/${edit.path}. Pass it in files to create it. Existing: ${Object.keys(files).join(', ')}`)
    }
    files[edit.path] = applyStringEdit(current, edit)
  }
  for (const path of remove) {
    if (path === 'SKILL.md') throw new Error('SKILL.md cannot be removed')
    assertRelPath(path)
    delete files[path]
  }
  assertSkillFiles(files, name)
  if (!filesEqual(prior.files, files)) await rememberPrior(name, prior.files)
  const next: StoredSkill = {
    ...prior,
    description: descriptionFromMarkdown(files['SKILL.md'], prior.description),
    author: 'agent',
    files,
    updatedAt: Date.now(),
  }
  await writeSkills([...skills.filter(skill => skill.name !== name), next])
  return next
}

export async function deleteSkill(name: string): Promise<void> {
  const id = assertSkillName(name)
  const skills = await listSkills()
  const skill = skills.find(item => item.name === id)
  if (!skill) throw new Error(`Skill not found: ${id}`)
  if (skill.author === 'builtin') throw new Error(`Builtin skill '${id}' cannot be deleted`)
  await writeSkills(skills.filter(item => item.name !== id))
  await dropHistory(id)
}

export async function setSkillEnabled(name: string, enabled: boolean): Promise<StoredSkill> {
  const id = assertSkillName(name)
  const skills = await listSkills()
  const skill = skills.find(item => item.name === id)
  if (!skill) throw new Error(`Skill not found: ${id}`)
  skill.enabled = enabled
  skill.updatedAt = Date.now()
  await writeSkills(skills)
  return skill
}

export function readSkillFile(skill: StoredSkill, path: string): string {
  assertRelPath(path)
  const content = skill.files[path]
  if (content == null) throw new Error(`No such file: ${skill.name}/${path}`)
  return content
}

export function matchSkillSlash(text: string, skills: { name: string }[]): { name: string; rest: string } | null {
  const match = text.match(/^\/(\S+)(?:\s+([\s\S]*))?$/)
  if (!match) return null
  const name = match[1].toLowerCase()
  const skill = skills.find(item => item.name === name)
  if (!skill) return null
  return { name: skill.name, rest: (match[2] ?? '').trim() }
}

export function expandSkillSlash(match: { name: string; rest: string }): string {
  const base = `Use the "${match.name}" skill by calling load_skill with that name, then follow its instructions.`
  return match.rest ? `${base} Additional input from the user: ${match.rest}` : base
}
