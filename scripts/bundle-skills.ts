import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skillsDir = path.join(root, 'skills')
const outFile = path.join(root, 'src/agent/builtinSkills.json')

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Same rules the extension enforces at write time, so a malformed builtin fails the build. */
function frontmatterOf(markdown: string, dir: string): { name: string; description: string } {
  const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!fm) throw new Error(`${dir}/SKILL.md must start with YAML frontmatter (name, description)`)
  const field = (key: string) => {
    const line = fm[1].split('\n').find(l => l.startsWith(`${key}:`))
    const value = line?.slice(key.length + 1).trim() ?? ''
    return value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
  }
  const name = field('name')
  const description = field('description')
  if (name !== dir) throw new Error(`${dir}/SKILL.md frontmatter name '${name}' must match the directory name`)
  if (!NAME_RE.test(name) || name.length > 64) throw new Error(`${dir}: invalid skill name`)
  if (!description) throw new Error(`${dir}/SKILL.md frontmatter is missing a description`)
  if (description.length > 1024) throw new Error(`${dir}: description exceeds 1024 characters`)
  if (!markdown.slice(fm[0].length).trim()) throw new Error(`${dir}/SKILL.md has no instructions`)
  return { name, description }
}

function collectFiles(dir: string, prefix = ''): Record<string, string> {
  const files: Record<string, string> = {}
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) Object.assign(files, collectFiles(full, rel))
    else if (entry.isFile()) files[rel] = fs.readFileSync(full, 'utf-8')
  }
  return files
}

function main() {
  const skills = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const dir = path.join(skillsDir, d.name)
      const files = collectFiles(dir)
      if (!files['SKILL.md']) return null
      const { description } = frontmatterOf(files['SKILL.md'], d.name)
      return { name: d.name, description, files }
    })
    .filter((s): s is NonNullable<typeof s> => s != null)

  fs.writeFileSync(outFile, JSON.stringify(skills, null, 2) + '\n')
  console.log(`[bundle-skills] ${skills.map(s => s.name).join(', ')} → ${path.relative(root, outFile)}`)
}

main()
