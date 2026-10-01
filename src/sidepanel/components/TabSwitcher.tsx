import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TabType = 'agent' | 'agent-history' | 'tabs' | 'bookmarks' | 'reading-list' | 'notes' | 'reports' | 'scripts' | 'skills' | 'settings'

interface TabSwitcherProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
}

const PRIMARY: { id: TabType; label: string }[] = [
  { id: 'agent', label: 'Agent' },
  { id: 'agent-history', label: 'History' },
  { id: 'skills', label: 'Skills' },
  { id: 'scripts', label: 'Scripts' },
]

const MORE: { id: TabType; label: string }[] = [
  { id: 'tabs', label: 'Tabs' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'reading-list', label: 'Reading' },
  { id: 'notes', label: 'Notes' },
  { id: 'reports', label: 'Reports' },
]

export function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const moreActive = MORE.some(tab => tab.id === activeTab)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="flex bg-muted rounded-md p-0.5 min-w-0">
      {PRIMARY.map((tab) => (
        <button
          key={tab.id}
          onClick={() => { setOpen(false); onTabChange(tab.id) }}
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded transition-colors shrink-0',
            activeTab === tab.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.label}
        </button>
      ))}
      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          title="More"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          className={cn(
            'px-1.5 py-1 rounded transition-colors',
            moreActive || open
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <MoreHorizontal className="h-3.5 w-4" />
        </button>
        {open && (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-32 rounded-md border bg-popover p-1 shadow-md">
            {MORE.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setOpen(false); onTabChange(tab.id) }}
                className={cn(
                  'block w-full rounded px-2 py-1.5 text-left text-xs',
                  activeTab === tab.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
