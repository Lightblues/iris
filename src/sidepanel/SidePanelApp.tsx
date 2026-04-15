import { useState, useEffect, useRef, useCallback } from 'react'
import { SidebarHeader } from './components/SidebarHeader'
import { SettingsPage } from './components/SettingsPage'
import { BookmarksTab } from './components/BookmarksTab'
import { ReadingListTab } from './components/ReadingListTab'
import { TabsTab } from './components/TabsTab'
import { NotesTab } from './components/NotesTab'
import { AgentPanel } from './components/AgentPanel'
import { AgentHistoryTab } from './components/AgentHistoryTab'
import { type TabType } from './components/TabSwitcher'
import { loadSettings, saveSettings, type SidePanelSettings, DEFAULT_SETTINGS } from '@/lib/sidepanelSettings'
import {
  loadAllConversations as loadAgentConversations,
  setActiveConversation as setAgentActiveConversation,
} from '@/agent/history'
import type { SlashCommand } from '@/lib/types'
import type { Conversation as AgentConversation } from '@/agent/types'
import type { AgentMode as NewAgentMode } from '@/agent/types'
import { initTelemetry, shutdownTelemetry } from '@/lib/telemetry'
import { loadAllCommands } from '@/lib/commandStorage'
import { disconnectMcp as disconnectAgentMcp } from '@/agent/useAgentChat'

const TAB_STORAGE_KEY = 'sidepanel_active_tab'

// Detect if running inside floating sidebar iframe
const isFloatingMode = new URLSearchParams(window.location.search).get('mode') === 'floating'

export default function SidePanelApp() {
  const [activeTab, setActiveTab] = useState<TabType>('agent')
  const [settings, setSettings] = useState<SidePanelSettings>(DEFAULT_SETTINGS)
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([])
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
      if (s.phoenixEndpoint) initTelemetry(s.phoenixEndpoint)
    })
    loadAgentActiveConversation()
    loadAllCommands().then((cmds) => {
      console.log('[Iris] Loaded', cmds.length, 'slash commands')
      setSlashCommands(cmds)
    })
    chrome.storage.local.get(TAB_STORAGE_KEY).then((result) => {
      if (result[TAB_STORAGE_KEY]) setActiveTab(result[TAB_STORAGE_KEY] as TabType)
    })
    return () => { shutdownTelemetry() }
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
      await disconnectAgentMcp()
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
      shutdownTelemetry()
      if (updated.phoenixEndpoint) initTelemetry(updated.phoenixEndpoint)
    }
  }

  const handleClose = useCallback(() => {
    if (isFloatingMode) {
      window.parent.postMessage({ type: 'iris-sidebar-close' }, '*')
    }
  }, [])

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
        isFloatingMode={isFloatingMode}
        onClose={handleClose}
      />

      {activeTab === 'settings' ? (
        <SettingsPage
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onCommandsChanged={handleCommandsChanged}
        />
      ) : activeTab === 'agent' ? (
        <AgentPanel
          key={`agent-${newAgentMode}-${agentSessionKey}`}
          agentMode={newAgentMode}
          settings={settings}
          chatModel={agentChatModel}
          onChatModelChange={setAgentChatModel}
          conversation={agentConversation}
          onConversationCreated={handleAgentConversationCreated}
          onNewChat={handleAgentNewChat}
          onAgentModeChange={handleNewAgentModeChange}
          slashCommands={slashCommands}
          onOpenSettings={handleOpenSettings}
        />
      ) : activeTab === 'agent-history' ? (
        <AgentHistoryTab
          activeConversationId={agentConversation?.id || null}
          onSelectConversation={handleAgentSelectConversation}
          onNewChat={handleAgentNewChat}
        />
      ) : activeTab === 'tabs' ? (
        <TabsTab />
      ) : activeTab === 'bookmarks' ? (
        <BookmarksTab />
      ) : activeTab === 'reading-list' ? (
        <ReadingListTab />
      ) : (
        <NotesTab />
      )}
    </div>
  )
}
