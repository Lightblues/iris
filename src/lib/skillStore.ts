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
const HISTORY_CAP = 8
export const SKILL_BODY_MAX = 8 * 1024
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/

function skillBody(markdown: string): string {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match ? markdown.slice(match[0].length).trim() : markdown.trim()
}

export function assertSkillName(name: string): string {
  const trimmed = name.trim().toLowerCase()
  if (!NAME_RE.test(trimmed)) {
    throw new Error(`Invalid skill name '${name}'. Use lowercase letters, digits, and hyphens.`)
  }
  return trimmed
}

function assertRelPath(path: string): void {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid skill path: ${path}`)
  }
}

export function assertSkillFiles(files: Record<string, string>): void {
  const skillMd = files['SKILL.md']
  if (!skillMd) throw new Error('SKILL.md is required')
  if (skillBody(skillMd).length > SKILL_BODY_MAX) {
    throw new Error(`SKILL.md body exceeds ${SKILL_BODY_MAX} characters`)
  }
  for (const path of Object.keys(files)) assertRelPath(path)
}

export function buildSkillMarkdown(name: string, description: string, instructions: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${instructions.trim()}\n`
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
  const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const line = fm?.[1].split('\n').find(item => item.startsWith('description:'))
  const value = line?.slice('description:'.length).trim()
  return value || fallback
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

async function rememberPrior(name: string, files: Record<string, string>): Promise<void> {
  const all = await readHistory()
  all[name] = [{ savedAt: Date.now(), files }, ...(all[name] ?? [])].slice(0, HISTORY_CAP)
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
  const description = input.description.trim()
  if (!description || description.includes('\n') || description.includes('---')) {
    throw new Error('description must be a single line')
  }
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
  assertSkillFiles(files)
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

export async function patchSkill(input: {
  name: string
  files?: { path: string; content: string }[]
  remove?: string[]
}): Promise<StoredSkill> {
  const name = assertSkillName(input.name)
  const edits = input.files ?? []
  const remove = input.remove ?? []
  if (edits.length === 0 && remove.length === 0) throw new Error('files or remove is required')
  const skills = await listSkills()
  const prior = skills.find(skill => skill.name === name)
  if (!prior) throw new Error(`Skill not found: ${name}. Use write_skill to create it.`)
  if (prior.author === 'builtin') throw new Error(`Builtin skill '${name}' cannot be edited`)
  const files = { ...prior.files }
  for (const path of remove) {
    if (path === 'SKILL.md') throw new Error('SKILL.md cannot be removed')
    assertRelPath(path)
    delete files[path]
  }
  for (const file of edits) {
    assertRelPath(file.path)
    files[file.path] = file.content
  }
  assertSkillFiles(files)
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
