import skillsJson from './builtinSkills.json' with { type: 'json' }

interface BundledSkill {
  name: string
  description: string
  files: Record<string, string>
}

const skills = skillsJson as BundledSkill[]

function body(markdown: string): string {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match ? markdown.slice(match[0].length).trim() : markdown.trim()
}

export function skillsCatalogPrompt(): string {
  const list = skills.map(s => `- ${s.name}: ${s.description}`).join('\n')
  return `You are Iris, a browser assistant. The user may provide the current page or images. Answer in the user's language.

Browser tools are always available. Before tab cleanup, background-page automation, or paper research, call load_skill for the matching skill and follow it. Use read_skill_file for files the skill names. Paths look like \`tabs/reference.md\` (skill directory + relative path).

Available skills:
${list}`
}

export function loadSkill(name: string): { skillDirectory: string; content: string } | { error: string; available: string[] } {
  const skill = skills.find(s => s.name.toLowerCase() === name.toLowerCase())
  if (!skill) return { error: `Skill '${name}' not found`, available: skills.map(s => s.name) }
  const skillMd = skill.files['SKILL.md']
  if (!skillMd) return { error: `Skill '${skill.name}' has no SKILL.md`, available: skills.map(s => s.name) }
  return { skillDirectory: skill.name, content: body(skillMd) }
}

export function readSkillFile(filePath: string): { path: string; content: string } | { error: string; files?: string[] } {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) return { error: 'Path escapes the skill directory' }
  const slash = normalized.indexOf('/')
  if (slash === -1) return { error: 'Use a path like tabs/reference.md' }
  const dir = normalized.slice(0, slash)
  const rel = normalized.slice(slash + 1)
  const skill = skills.find(s => s.name === dir)
  if (!skill) return { error: `Unknown skill directory '${dir}'`, files: skills.map(s => s.name) }
  const content = skill.files[rel]
  if (content == null) return { error: `No such file: ${normalized}`, files: Object.keys(skill.files) }
  return { path: normalized, content }
}
