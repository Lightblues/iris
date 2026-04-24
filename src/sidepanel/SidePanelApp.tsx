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
import type { AgentMode as NewAgentMode } from '@/agent/types'
import { loadAllCommands } from '@/lib/commandStorage'
import { fetchModels } from '@/lib/modelRegistry'

// Lazy-loaded tabs — only fetched when user navigates to them
const SettingsPage = lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })))
const BookmarksTab = lazy(() => import('./components/BookmarksTab').then(m => ({ default: m.BookmarksTab })))
const ReadingListTab = lazy(() => import('./components/ReadingListTab').then(m => ({ default: m.ReadingListTab })))
const TabsTab = lazy(() => import('./components/TabsTab').then(m => ({ default: m.TabsTab })))
const NotesTab = lazy(() => import('./components/NotesTab').then(m => ({ default: m.NotesTab })))
const AgentHistoryTab = lazy(() => import('./components/AgentHistoryTab').then(m => ({ default: m.AgentHistoryTab })))
const AgentPanel = lazy(() => import('./components/AgentPanel').then(m => ({ default: m.AgentPanel })))

// Lazy telemetry — only loaded when a Phoenix endpoint is configured
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

  // Agent system state
  const [agentConversation, setAgentConversation] = useState<AgentConversation | null>(null)
  const [agentChatModel, setAgentChatModel] = useState<string | null>(null)
  const [newAgentMode, setNewAgentMode] = useState<NewAgentMode>('general')
  const agentSessionRef = useRef(0) // bumped on explicit new-chat / mode-change / history-select
  const [agentSessionKey, setAgentSessionKey] = useState(0)
  const bumpAgentSession = useCallback(() => {
    agentSessionRef.current += 1
    setAgentSessionKey(agentSessionRef.current)
  }, [])

  // Load settings and active conversation on mount
  useEffect(() => {
    console.log('[Iris] Initializing...')
    loadSettings().then((s) => {
      console.log('[Iris] Settings loaded')
      setSettings(s)
      // Defer heavy side-effects to after first paint so the Agent UI mounts fast.
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
    loadAgentActiveConversation()
    loadAllCommands().then((cmds) => {
      console.log('[Iris] Loaded', cmds.length, 'slash commands')
      setSlashCommands(cmds)
    })
    chrome.storage.local.get(TAB_STORAGE_KEY).then((result) => {
      if (result[TAB_STORAGE_KEY]) setActiveTab(result[TAB_STORAGE_KEY] as TabType)
    })
    return () => { shutdownTelemetryIfLoaded() }
  }, [])

  const loadAgentActiveConversation = async () => {
    const store = await loadAgentConversations()
    if (store.activeConversationId) {
      const conv = store.conversations.find((c) => c.id === store.activeConversationId)
      if (conv) {
        setAgentConversation(conv)
        if (conv.agentMode) setNewAgentMode(conv.agentMode)
        console.log('[Iris] Loaded active agent conversation:', conv.id)
        return
      }
    }
    setAgentConversation(null)
  }

  // Tab navigation
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

  // Agent system handlers
  const handleAgentSelectConversation = async (id: string) => {
    const store = await loadAgentConversations()
    const conv = store.conversations.find((c) => c.id === id)
    if (conv) {
      setAgentConversation(conv)
      if (conv.agentMode) setNewAgentMode(conv.agentMode)
      await setAgentActiveConversation(id)
      bumpAgentSession()
      setActiveTab('agent')
    }
  }

  const handleAgentNewChat = async () => {
    setAgentConversation(null)
    setAgentChatModel(null)
    bumpAgentSession()
    setActiveTab('agent')
    await setAgentActiveConversation(null)
  }

  const handleAgentConversationCreated = useCallback((conv: AgentConversation) => {
    setAgentConversation(conv)
    setAgentActiveConversation(conv.id).catch(() => {})
  }, [])

  const handleNewAgentModeChange = useCallback(async (mode: NewAgentMode) => {
    if (mode === newAgentMode) return
    if (newAgentMode === 'paper') {
      const { disconnectMcp } = await import('@/agent/useAgentChat')
      await disconnectMcp()
    }
    setNewAgentMode(mode)
    setAgentConversation(null)
    bumpAgentSession()
    await setAgentActiveConversation(null)
  }, [newAgentMode, bumpAgentSession])

  // Settings
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

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <SidebarHeader
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onToggleSettings={handleOpenSettings}
        onSettingsBack={handleSettingsBack}
      />

      {activeTab === 'settings' ? (
        <Suspense fallback={<TabFallback />}>
          <SettingsPage
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onCommandsChanged={handleCommandsChanged}
          />
        </Suspense>
      ) : activeTab === 'agent' ? (
        <Suspense fallback={<TabFallback />}>
          <AgentPanel
            key={`agent-${newAgentMode}-${agentSessionKey}`}
            agentMode={newAgentMode}
            settings={settings}
            availableModels={availableModels}
            chatModel={agentChatModel}
            onChatModelChange={setAgentChatModel}
            conversation={agentConversation}
            onConversationCreated={handleAgentConversationCreated}
            onNewChat={handleAgentNewChat}
            onAgentModeChange={handleNewAgentModeChange}
            slashCommands={slashCommands}
            onOpenSettings={handleOpenSettings}
          />
        </Suspense>
      ) : activeTab === 'agent-history' ? (
        <Suspense fallback={<TabFallback />}>
          <AgentHistoryTab
            activeConversationId={agentConversation?.id || null}
            onSelectConversation={handleAgentSelectConversation}
            onNewChat={handleAgentNewChat}
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
  )
}
