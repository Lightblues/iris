import type { SlashCommand } from './types'
import { parseCommandFile } from './slashCommands'

const USER_COMMANDS_KEY = 'iris_user_commands'

interface BundledCommand {
  namespace: string
  name: string
  content: string
}

// Load builtin commands from bundled JSON
export async function loadBuiltinCommands(): Promise<SlashCommand[]> {
  try {
    // Dynamic import of bundled commands
    const bundled = await import('./builtinCommands.json')
    const commands: BundledCommand[] = bundled.default || bundled
    return commands.map(cmd => parseCommandFile(cmd.content, cmd.namespace, cmd.name, 'builtin'))
  } catch (err) {
    console.warn('[Iris Commands] Failed to load builtin commands:', err)
    return []
  }
}

// Load user commands from Chrome storage
export async function loadUserCommands(): Promise<SlashCommand[]> {
  try {
    const result = await chrome.storage.local.get(USER_COMMANDS_KEY)
    const stored = result[USER_COMMANDS_KEY] as SlashCommand[] | undefined
    return stored || []
  } catch (err) {
    console.warn('[Iris Commands] Failed to load user commands:', err)
    return []
  }
}

// Save user commands to Chrome storage
export async function saveUserCommands(commands: SlashCommand[]): Promise<void> {
  await chrome.storage.local.set({ [USER_COMMANDS_KEY]: commands })
}

// Load all commands (builtin + user)
export async function loadAllCommands(): Promise<SlashCommand[]> {
  const [builtin, user] = await Promise.all([loadBuiltinCommands(), loadUserCommands()])
  // User commands come first (higher priority)
  return [...user, ...builtin]
}

// Add a user command
export async function addUserCommand(command: SlashCommand): Promise<void> {
  const commands = await loadUserCommands()
  // Remove existing command with same id if present
  const filtered = commands.filter(c => c.id !== command.id)
  filtered.push(command)
  await saveUserCommands(filtered)
}

// Remove a user command
export async function removeUserCommand(commandId: string): Promise<void> {
  const commands = await loadUserCommands()
  const filtered = commands.filter(c => c.id !== commandId)
  await saveUserCommands(filtered)
}
