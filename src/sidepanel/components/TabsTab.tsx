import { useState, useEffect } from 'react'
import { Layers as TabIcon, RefreshCw, Trash2, Loader2, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { ScrollArea } from '../../components/ui/scroll-area'
import { Badge } from '../../components/ui/badge'
import type { TabAgentMessage, TabAgentResponse } from '../../lib/types'

interface TabSummary {
  id: number
  title: string
  url: string
  domain: string
  groupName: string | null
  groupColor?: string
  pinned: boolean
  audible: boolean
  active: boolean
  lastAccessed?: number
}

interface TrashItem {
  id: string
  title: string
  url: string
  groupName: string | null
  closedAt: number
}

export function TabsTab() {
  const [tabs, setTabs] = useState<TabSummary[]>([])
  const [trash, setTrash] = useState<TrashItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'tabs' | 'trash'>('tabs')

  useEffect(() => {
    loadTabs()
    loadTrash()
  }, [])

  const callTabAgent = async (action: string, params: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      console.log('[TabsTab] Calling tab agent:', action, params)
      const message: TabAgentMessage = { type: 'tab_agent_action', action, params }
      chrome.runtime.sendMessage(message, (response: TabAgentResponse) => {
        console.log('[TabsTab] Response:', response)
        if (chrome.runtime.lastError) {
          console.error('[TabsTab] Runtime error:', chrome.runtime.lastError)
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (response?.success) {
          resolve(response.data)
        } else {
          reject(new Error(response?.error || 'Action failed'))
        }
      })
    })
  }

  const loadTabs = async () => {
    setLoading(true)
    try {
      const result = await callTabAgent('query_tabs', {
        limit: 100,
        sort: 'recent'
      })
      setTabs(result.tabs || [])
    } catch (error) {
      console.error('[TabsTab] Failed to load tabs:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTrash = async () => {
    try {
      const result = await callTabAgent('list_closed_tabs', { limit: 50 })
      setTrash(result.items || [])
    } catch (error) {
      console.error('[TabsTab] Failed to load trash:', error)
    }
  }

  const handleSwitchToTab = async (tabId: number) => {
    try {
      await chrome.tabs.update(tabId, { active: true })
    } catch (error) {
      console.error('[TabsTab] Failed to switch to tab:', error)
    }
  }

  const handleCloseTab = async (tabId: number) => {
    try {
      await callTabAgent('remove_tabs', { tabIds: [tabId], safe: true })
      await loadTabs()
      await loadTrash()
    } catch (error) {
      console.error('[TabsTab] Failed to close tab:', error)
    }
  }

  const handleRestoreTab = async (itemId: string) => {
    try {
      await callTabAgent('restore_tab', { trashItemId: itemId })
      await loadTabs()
      await loadTrash()
    } catch (error) {
      console.error('[TabsTab] Failed to restore tab:', error)
    }
  }

  const filteredTabs = tabs.filter(tab =>
    tab.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tab.domain.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatTimeAgo = (timestamp?: number) => {
    if (!timestamp) return 'Unknown'
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant={view === 'tabs' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('tabs')}
            >
              <TabIcon className="w-4 h-4 mr-1" />
              Tabs ({tabs.length})
            </Button>
            <Button
              variant={view === 'trash' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('trash')}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Trash ({trash.length})
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            💡 Switch to Chat tab and select "Tab Agent" to manage tabs with AI
          </div>
        </div>

        {view === 'tabs' && (
          <div className="flex gap-2">
            <Input
              placeholder="Search tabs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={loadTabs}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {view === 'tabs' && (
          <div className="p-4 space-y-2">
            {loading && tabs.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : filteredTabs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {searchQuery ? 'No tabs match your search' : 'No tabs open'}
              </div>
            ) : (
              filteredTabs.map(tab => (
                <div
                  key={tab.id}
                  className="p-3 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => handleSwitchToTab(tab.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate text-sm" title={tab.title}>
                          {tab.title}
                        </span>
                        {tab.pinned && <span title="Pinned">📌</span>}
                        {tab.audible && <span title="Playing audio">🔊</span>}
                        {tab.active && <span title="Active">⭐</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mb-1">
                        {tab.domain}
                      </div>
                      <div className="flex items-center gap-2">
                        {tab.groupName && (
                          <Badge variant="outline" className="text-xs">
                            {tab.groupName}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(tab.lastAccessed)}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCloseTab(tab.id)
                      }}
                      title="Close tab (saved to trash)"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {view === 'trash' && (
          <div className="p-4 space-y-2">
            {trash.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No recently closed tabs
              </div>
            ) : (
              trash.map(item => (
                <div
                  key={item.id}
                  className="p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm" title={item.title}>
                        {item.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {new URL(item.url).hostname}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Closed {formatTimeAgo(item.closedAt)}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestoreTab(item.id)}
                    >
                      Restore
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
