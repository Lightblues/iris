import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface BundledCommand {
  namespace: string
  name: string
  content: string
}

const COMMANDS_DIR = path.resolve(__dirname, '../commands')
const OUTPUT_FILE = path.resolve(__dirname, '../src/lib/builtinCommands.json')

function scanCommandsDir(dir: string, namespace: string = ''): BundledCommand[] {
  const commands: BundledCommand[] = []
  if (!fs.existsSync(dir)) return commands
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Directory name becomes namespace
      commands.push(...scanCommandsDir(fullPath, entry.name))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const name = entry.name.replace(/\.md$/, '')
      const content = fs.readFileSync(fullPath, 'utf-8')
      commands.push({ namespace: namespace || 'iris', name, content })
    }
  }
  return commands
}

function main() {
  console.log('[bundle-commands] Scanning commands directory...')
  const commands = scanCommandsDir(COMMANDS_DIR)
  console.log(`[bundle-commands] Found ${commands.length} commands:`)
  commands.forEach(cmd => console.log(`  - ${cmd.namespace}:${cmd.name}`))
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(commands, null, 2))
  console.log(`[bundle-commands] Written to ${OUTPUT_FILE}`)
}

main()
