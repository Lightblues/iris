import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { SidebarHeader } from './components/SidebarHeader'
import { type TabType } from './components/TabSwitcher'
import { loadSettings, saveSettings, type SidePanelSettings, type ModelConfig, DEFAULT_SETTINGS } from '@/lib/sidepanelSettings'
import {
  loadAllConversations as loadAgentConversations,
  setActiveConversation as setAgentActiveConversation,
} from '@/agent/history'
import type { SlashCommand } from '@/lib/types'
import type { Conversation as AgentConversation } from '@/agent/types'
import { loadAllCommands } from '@/lib/commandStorage'
import { fetchModels } from '@/lib/modelRegistry'
import { cn } from '@/lib/utils'
import { useAgentSessions } from './useAgentSessions'

const SettingsPage = lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })))
const BookmarksTab = lazy(() => import('./components/BookmarksTab').then(m => ({ default: m.BookmarksTab })))
const ReadingListTab = lazy(() => import('./components/ReadingListTab').then(m => ({ default: m.ReadingListTab })))
const TabsTab = lazy(() => import('./components/TabsTab').then(m => ({ default: m.TabsTab })))
const NotesTab = lazy(() => import('./components/NotesTab').then(m => ({ default: m.NotesTab })))
const AgentHistoryTab = lazy(() => import('./components/AgentHistoryTab').then(m => ({ default: m.AgentHistoryTab })))
const AgentPanel = lazy(() => import('./components/AgentPanel').then(m => ({ default: m.AgentPanel })))

async function initTelemetryIfNeeded(endpoint: string | undefined) {
  if (!endpoint) return
  const { initTelemetry } = await import('@/lib/telemetry')
  initTelemetry(endpoint)
}
async function shutdownTelemetryIfLoaded() {
  try {
    const { shutdownTelemetry } = await import('@/lib/telemetry')
    shutdownTelemetry()
  } catch {}
}

function TabFallback() {
  return (
    <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
      Loading…
    </div>
  )
}

const TAB_STORAGE_KEY = 'sidepanel_active_tab'

export default function SidePanelApp() {
  const [activeTab, setActiveTab] = useState<TabType>('agent')
  const [settings, setSettings] = useState<SidePanelSettings>(DEFAULT_SETTINGS)
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([])
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([])
  const previousTabRef = useRef<TabType>('agent')

  const { currentTabId, sessions, patchSession, remountSession, unlinkToNewChat } = useAgentSessions()
  const currentSession = currentTabId != null
    ? Object.values(sessions).find(s => s.tabIds.includes(currentTabId))
    : undefined

  useEffect(() => {
    console.log('[Iris] Initializing...')
    loadSettings().then((s) => {
      console.log('[Iris] Settings loaded')
      setSettings(s)
      const idle = (cb: () => void) =>
        (window as any).requestIdleCallback?.(cb, { timeout: 1500 }) ?? setTimeout(cb, 200)
      idle(() => {
        if (s.phoenixEndpoint) initTelemetryIfNeeded(s.phoenixEndpoint)
        if (s.baseUrl) {
          fetchModels(s.baseUrl, s.apiKey)
            .then(models => { setAvailableModels(models); console.log('[Iris] Fetched', models.length, 'models') })
            .catch(err => console.warn('[Iris] Failed to fetch models:', err.message))
        }
      })
    })
    loadAllCommands().then((cmds) => {
      console.log('[Iris] Loaded', cmds.length, 'slash commands')
      setSlashCommands(cmds)
    })
    chrome.storage.local.get(TAB_STORAGE_KEY).then((result) => {
      if (result[TAB_STORAGE_KEY]) setActiveTab(result[TAB_STORAGE_KEY] as TabType)
    })

    return () => {
      shutdownTelemetryIfLoaded()
    }
  }, [])

  const handleTabChange = (tab: TabType) => {
    if (tab !== 'settings') previousTabRef.current = tab
    setActiveTab(tab)
    if (tab !== 'settings') chrome.storage.local.set({ [TAB_STORAGE_KEY]: tab })
  }

  const handleOpenSettings = () => {
    if (activeTab !== 'settings') previousTabRef.current = activeTab
    setActiveTab('settings')
  }

  const handleSettingsBack = () => {
    setActiveTab(previousTabRef.current)
  }

  const handleAgentSelectConversation = async (id: string) => {
    if (currentTabId == null) return
    const store = await loadAgentConversations()
    const conv = store.conversations.find((c) => c.id === id)
    if (!conv) return
    remountSession(currentTabId, {
      conversation: conv,
      agentMode: conv.agentMode || 'general',
    })
    await setAgentActiveConversation(id)
    setActiveTab('agent')
  }

  const handleAgentNewChat = useCallback(async (tabId: number) => {
    unlinkToNewChat(tabId)
    setActiveTab('agent')
    await setAgentActiveConversation(null)
  }, [unlinkToNewChat])

  const handleAgentConversationCreated = useCallback((tabId: number, conv: AgentConversation) => {
    patchSession(tabId, { conversation: conv })
    setAgentActiveConversation(conv.id).catch(() => {})
  }, [patchSession])

  const handleSettingsChange = async (newSettings: Partial<SidePanelSettings>) => {
    const updated = { ...settings, ...newSettings }
    setSettings(updated)
    await saveSettings(updated)
    if ('phoenixEndpoint' in newSettings) {
      await shutdownTelemetryIfLoaded()
      if (updated.phoenixEndpoint) await initTelemetryIfNeeded(updated.phoenixEndpoint)
    }
  }

  const handleCommandsChanged = useCallback(() => {
    loadAllCommands().then((cmds) => {
      console.log('[Iris] Commands reloaded:', cmds.length)
      setSlashCommands(cmds)
    })
  }, [])

  const sessionList = Object.values(sessions)

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <SidebarHeader
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onToggleSettings={handleOpenSettings}
        onSettingsBack={handleSettingsBack}
      />

      {/* Keep enabled-tab AgentPanels mounted so History/Settings views do not remount the chat. */}
      <div className={cn('flex-1 min-h-0 flex flex-col', activeTab !== 'agent' && 'hidden')}>
        <Suspense fallback={<TabFallback />}>
          {sessionList.length === 0 ? (
            <TabFallback />
          ) : (
            sessionList.map((s) => (
              <div
                key={s.id}
                className={cn(
                  'flex-1 min-h-0 flex flex-col',
                  (currentTabId == null || !s.tabIds.includes(currentTabId)) && 'hidden',
                )}
              >
                <AgentPanel
                  key={`${s.id}-${s.sessionKey}`}
                  tabId={currentTabId != null && s.tabIds.includes(currentTabId) ? currentTabId : s.tabIds[0]}
                  memberTabIds={s.tabIds}
                  autoFocus={activeTab === 'agent' && currentTabId != null && s.tabIds.includes(currentTabId)}
                  agentMode={s.agentMode}
                  settings={settings}
                  availableModels={availableModels}
                  chatModel={s.chatModel}
                  onChatModelChange={(model) => patchSession(s.tabIds[0], { chatModel: model })}
                  conversation={s.conversation}
                  onConversationCreated={(conv) => handleAgentConversationCreated(s.tabIds[0], conv)}
                  onNewChat={() => currentTabId != null && handleAgentNewChat(currentTabId)}
                  slashCommands={slashCommands}
                  onOpenSettings={handleOpenSettings}
                />
              </div>
            ))
          )}
        </Suspense>
      </div>

      {activeTab !== 'agent' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {activeTab === 'settings' ? (
            <Suspense fallback={<TabFallback />}>
              <SettingsPage
                settings={settings}
                onSettingsChange={handleSettingsChange}
                onCommandsChanged={handleCommandsChanged}
              />
            </Suspense>
          ) : activeTab === 'agent-history' ? (
            <Suspense fallback={<TabFallback />}>
              <AgentHistoryTab
                activeConversationId={currentSession?.conversation?.id || null}
                onSelectConversation={handleAgentSelectConversation}
                onNewChat={() => currentTabId != null && handleAgentNewChat(currentTabId)}
              />
            </Suspense>
          ) : activeTab === 'tabs' ? (
            <Suspense fallback={<TabFallback />}><TabsTab /></Suspense>
          ) : activeTab === 'bookmarks' ? (
            <Suspense fallback={<TabFallback />}><BookmarksTab /></Suspense>
          ) : activeTab === 'reading-list' ? (
            <Suspense fallback={<TabFallback />}><ReadingListTab /></Suspense>
          ) : (
            <Suspense fallback={<TabFallback />}><NotesTab /></Suspense>
          )}
        </div>
      )}
    </div>
  )
}
