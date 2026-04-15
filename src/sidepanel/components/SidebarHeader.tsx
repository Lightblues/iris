import { Button } from '@/components/ui/button'
import { Settings, X, ArrowLeft } from 'lucide-react'
import { TabSwitcher, type TabType } from './TabSwitcher'

interface SidebarHeaderProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  onToggleSettings: () => void
  onSettingsBack?: () => void
  isFloatingMode?: boolean
  onClose?: () => void
}

export function SidebarHeader({
  activeTab,
  onTabChange,
  onToggleSettings,
  onSettingsBack,
  isFloatingMode,
  onClose,
}: SidebarHeaderProps) {
  const isSettings = activeTab === 'settings'

  return (
    <div className="flex items-center justify-between p-2 border-b bg-background">
      {isSettings ? (
        <button
          onClick={onSettingsBack}
          className="flex items-center gap-1.5 text-sm font-medium hover:text-muted-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Settings
        </button>
      ) : (
        <TabSwitcher activeTab={activeTab} onTabChange={onTabChange} />
      )}

      <div className="flex items-center gap-1">
        {!isSettings && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSettings}
            title="Settings"
            className="h-7 w-7"
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
        {isFloatingMode && onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            title="Close sidebar"
            className="h-7 w-7"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
