import type { SlashCommand } from '@/lib/types'
import { getCommandDisplayName } from '@/lib/slashCommands'

interface SlashCommandDropdownProps {
  commands: SlashCommand[]
  selectedIndex: number
  onSelect: (command: SlashCommand) => void
  visible: boolean
}

export function SlashCommandDropdown({
  commands,
  selectedIndex,
  onSelect,
  visible,
}: SlashCommandDropdownProps) {
  if (!visible || commands.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 max-h-64 overflow-y-auto">
      {commands.map((command, index) => (
        <div
          key={command.id}
          className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
            index === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-muted'
          }`}
          onClick={() => onSelect(command)}
          onMouseEnter={(e) => {
            // Visual feedback on hover
            const items = e.currentTarget.parentElement?.children
            if (items) {
              Array.from(items).forEach((item, i) => {
                if (i === index) {
                  item.classList.add('bg-accent', 'text-accent-foreground')
                  item.classList.remove('hover:bg-muted')
                } else {
                  item.classList.remove('bg-accent', 'text-accent-foreground')
                  item.classList.add('hover:bg-muted')
                }
              })
            }
          }}
        >
          <span className="text-lg w-6 text-center shrink-0">{command.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {getCommandDisplayName(command)}
              </span>
              {command.source === 'user' && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                  user
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {command.description}
            </p>
          </div>
        </div>
      ))}
      <div className="px-3 py-1.5 border-t border-border bg-muted/50">
        <p className="text-xs text-muted-foreground">
          <kbd className="px-1 py-0.5 rounded bg-muted text-xs">↑↓</kbd> navigate
          <span className="mx-2">·</span>
          <kbd className="px-1 py-0.5 rounded bg-muted text-xs">Tab</kbd> select
          <span className="mx-2">·</span>
          <kbd className="px-1 py-0.5 rounded bg-muted text-xs">Esc</kbd> close
        </p>
      </div>
    </div>
  )
}
