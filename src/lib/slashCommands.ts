import type { SlashCommand, SlashCommandContextVar, SlashCommandFrontmatter } from './types'
import { getPageContext, getSelectionContext } from './context'

// Parse YAML frontmatter from markdown content
function parseFrontmatter(content: string): { frontmatter: SlashCommandFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return { frontmatter: {}, body: content }
  }
  const [, yamlContent, body] = match
  const frontmatter: SlashCommandFrontmatter = {}
  yamlContent.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) return
    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()
    if (key === 'description') frontmatter.description = value
    if (key === 'icon') frontmatter.icon = value
  })
  return { frontmatter, body: body.trim() }
}

// Detect context variables in template using !`variable` syntax
export function detectContextVariables(template: string): SlashCommandContextVar[] {
  const vars: SlashCommandContextVar[] = []
  const backtickPattern = /!`(pageContent|selection|url|title)`/g
  let match
  while ((match = backtickPattern.exec(template)) !== null) {
    const varName = match[1] as SlashCommandContextVar
    if (!vars.includes(varName)) vars.push(varName)
  }
  // Also check for $ARGUMENTS
  if (template.includes('$ARGUMENTS') && !vars.includes('ARGUMENTS')) {
    vars.push('ARGUMENTS')
  }
  return vars
}

// Parse a command markdown file into SlashCommand
export function parseCommandFile(
  content: string,
  namespace: string,
  name: string,
  source: 'builtin' | 'user' = 'builtin'
): SlashCommand {
  const { frontmatter, body } = parseFrontmatter(content)
  return {
    id: `${namespace}:${name}`,
    namespace,
    name,
    description: frontmatter.description || `Run ${name} command`,
    icon: frontmatter.icon || '⚡',
    template: body,
    contextVariables: detectContextVariables(body),
    source,
  }
}

// Filter commands by query (supports namespace:name format)
export function filterCommands(query: string, commands: SlashCommand[]): SlashCommand[] {
  if (!query) return commands
  const lowerQuery = query.toLowerCase()
  // Check if query includes namespace prefix
  if (lowerQuery.includes(':')) {
    const [ns, name] = lowerQuery.split(':')
    return commands.filter(cmd =>
      cmd.namespace.toLowerCase().startsWith(ns) &&
      cmd.name.toLowerCase().startsWith(name || '')
    )
  }
  // Match by name only, prioritize exact matches
  return commands.filter(cmd =>
    cmd.name.toLowerCase().startsWith(lowerQuery) ||
    cmd.id.toLowerCase().includes(lowerQuery)
  )
}

// Parse slash input: "/namespace:name args" or "/name args"
export function parseSlashInput(input: string): { namespace?: string; name: string; args: string } | null {
  if (!input.startsWith('/')) return null
  const withoutSlash = input.slice(1).trim()
  if (!withoutSlash) return null
  // Split by first space to get command and args
  const spaceIndex = withoutSlash.indexOf(' ')
  const commandPart = spaceIndex === -1 ? withoutSlash : withoutSlash.slice(0, spaceIndex)
  const args = spaceIndex === -1 ? '' : withoutSlash.slice(spaceIndex + 1).trim()
  // Parse namespace:name
  if (commandPart.includes(':')) {
    const [namespace, name] = commandPart.split(':')
    return { namespace, name, args }
  }
  return { name: commandPart, args }
}

// Find command by name (with optional namespace)
export function findCommand(
  commands: SlashCommand[],
  name: string,
  namespace?: string
): SlashCommand | undefined {
  if (namespace) {
    return commands.find(cmd => cmd.namespace === namespace && cmd.name === name)
  }
  // Without namespace: user commands take priority, then builtin
  const userMatch = commands.find(cmd => cmd.name === name && cmd.source === 'user')
  if (userMatch) return userMatch
  return commands.find(cmd => cmd.name === name)
}

// Context fetcher interface
export interface ContextFetcher {
  pageContent: () => Promise<string | null>
  selection: () => Promise<string | null>
  url: () => Promise<string>
  title: () => Promise<string>
}

export function createDefaultContextFetcher(tabId?: number): ContextFetcher {
  const getTab = async () => {
    try {
      if (tabId != null) return await chrome.tabs.get(tabId)
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      return tab ?? null
    } catch {
      return null
    }
  }
  return {
    pageContent: () => getPageContext(tabId),
    selection: () => getSelectionContext(tabId),
    url: async () => (await getTab())?.url || '',
    title: async () => (await getTab())?.title || '',
  }
}

// Expand command template with context values
export async function expandCommand(
  command: SlashCommand,
  args: string,
  fetcher: ContextFetcher
): Promise<string> {
  let result = command.template
  // Fetch and replace each context variable
  for (const varName of command.contextVariables) {
    let value = ''
    switch (varName) {
      case 'pageContent':
        value = (await fetcher.pageContent()) || '[Page content unavailable]'
        break
      case 'selection':
        value = (await fetcher.selection()) || '[No text selected]'
        break
      case 'url':
        value = await fetcher.url()
        break
      case 'title':
        value = await fetcher.title()
        break
      case 'ARGUMENTS':
        value = args || '[No arguments provided]'
        break
    }
    // Replace !`variable` syntax
    if (varName !== 'ARGUMENTS') {
      result = result.replace(new RegExp(`!\`${varName}\``, 'g'), value)
    }
  }
  // Replace $ARGUMENTS
  result = result.replace(/\$ARGUMENTS/g, args)
  return result
}

// Get display name for command (with namespace if not iris)
export function getCommandDisplayName(command: SlashCommand): string {
  if (command.namespace === 'iris') {
    return `/${command.name}`
  }
  return `/${command.id}`
}
