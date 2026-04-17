import { cn } from '@/lib/utils'

export type TabType = 'agent' | 'agent-history' | 'tabs' | 'bookmarks' | 'reading-list' | 'notes' | 'settings'

interface TabSwitcherProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
}

const TABS: { id: TabType; label: string }[] = [
  { id: 'agent', label: 'Agent' },
  { id: 'agent-history', label: 'History' },
  { id: 'tabs', label: 'Tabs' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'reading-list', label: 'Reading' },
  { id: 'notes', label: 'Notes' },
]

export function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
  return (
    <div className="flex bg-muted rounded-md p-0.5">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded transition-colors',
            activeTab === tab.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
