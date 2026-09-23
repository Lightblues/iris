import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skillsDir = path.join(root, 'skills')
const outFile = path.join(root, 'src/agent/builtinSkills.json')

function descriptionOf(markdown: string, name: string): string {
  const fm = markdown.match(/^---\n([\s\S]*?)\n---/)
  const line = fm?.[1].split('\n').find(l => l.startsWith('description:'))
  return line?.slice('description:'.length).trim() || name
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
      return { name: d.name, description: descriptionOf(files['SKILL.md'], d.name), files }
    })
    .filter((s): s is NonNullable<typeof s> => s != null)

  fs.writeFileSync(outFile, JSON.stringify(skills, null, 2) + '\n')
  console.log(`[bundle-skills] ${skills.map(s => s.name).join(', ')} → ${path.relative(root, outFile)}`)
}

main()
