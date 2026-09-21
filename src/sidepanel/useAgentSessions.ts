import { useCallback, useEffect, useRef, useState } from 'react'
import { loadAllConversations } from '@/agent/history'
import type { AgentMode, Conversation } from '@/agent/types'

export interface AgentTabSession {
  tabId: number
  conversation: Conversation | null
  agentMode: AgentMode
  chatModel: string | null
  sessionKey: number
}

const PERSIST_KEY = 'iris_tab_agent_sessions'

interface PersistedTabSession {
  conversationId: string | null
  agentMode: AgentMode
  chatModel: string | null
}

type PersistedMap = Record<string, PersistedTabSession>

function emptySession(tabId: number): AgentTabSession {
  return {
    tabId,
    conversation: null,
    agentMode: 'general',
    chatModel: null,
    sessionKey: 0,
  }
}

async function readPersisted(): Promise<PersistedMap> {
  try {
    const data = await chrome.storage.session.get(PERSIST_KEY)
    return (data[PERSIST_KEY] as PersistedMap) ?? {}
  } catch {
    return {}
  }
}

async function persistSession(session: AgentTabSession): Promise<void> {
  const all = await readPersisted()
  all[String(session.tabId)] = {
    conversationId: session.conversation?.id ?? null,
    agentMode: session.agentMode,
    chatModel: session.chatModel,
  }
  await chrome.storage.session.set({ [PERSIST_KEY]: all })
}

async function dropPersisted(tabId: number): Promise<void> {
  const all = await readPersisted()
  delete all[String(tabId)]
  await chrome.storage.session.set({ [PERSIST_KEY]: all })
}

async function hydrateSession(tabId: number): Promise<AgentTabSession> {
  const saved = (await readPersisted())[String(tabId)]
  if (!saved) return emptySession(tabId)
  let conversation: Conversation | null = null
  if (saved.conversationId) {
    const store = await loadAllConversations()
    conversation = store.conversations.find(c => c.id === saved.conversationId) ?? null
  }
  return {
    tabId,
    conversation,
    agentMode: saved.agentMode ?? 'general',
    chatModel: saved.chatModel ?? null,
    sessionKey: 0,
  }
}

/**
 * Live AgentPanel slots for tabs that currently have the side panel enabled.
 * Only activates while the panel document is visible, so switching to a tab
 * without Iris does not spawn a session. Bindings persist in session storage
 * so a remount after Chrome hides the panel can restore the conversation.
 */
export function useAgentSessions() {
  const [currentTabId, setCurrentTabId] = useState<number | null>(null)
  const [sessions, setSessions] = useState<Record<number, AgentTabSession>>({})
  const sessionsRef = useRef(sessions)
  const hydratingRef = useRef(new Set<number>())

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  const activateTab = useCallback((tabId: number) => {
    setCurrentTabId(tabId)
    if (sessionsRef.current[tabId] || hydratingRef.current.has(tabId)) return
    hydratingRef.current.add(tabId)
    hydrateSession(tabId)
      .then(session => {
        setSessions(prev => (prev[tabId] ? prev : { ...prev, [tabId]: session }))
      })
      .catch(() => {
        setSessions(prev => (prev[tabId] ? prev : { ...prev, [tabId]: emptySession(tabId) }))
      })
      .finally(() => hydratingRef.current.delete(tabId))
  }, [])

  useEffect(() => {
    let windowId: number | undefined

    const activateVisible = () => {
      if (document.visibilityState === 'hidden') return
      const query = windowId != null
        ? chrome.tabs.query({ active: true, windowId })
        : chrome.windows.getCurrent().then(win => {
            windowId = win.id
            if (win.id == null) return [] as chrome.tabs.Tab[]
            return chrome.tabs.query({ active: true, windowId: win.id })
          })
      void query.then(tabs => {
        const tab = Array.isArray(tabs) ? tabs[0] : undefined
        if (tab?.id != null) activateTab(tab.id)
      })
    }

    chrome.windows.getCurrent().then(win => {
      windowId = win.id
      activateVisible()
    })

    const onActivated = (info: { tabId: number; windowId: number }) => {
      if (windowId != null && info.windowId !== windowId) return
      if (document.visibilityState === 'hidden') return
      activateTab(info.tabId)
    }
    const onRemoved = (tabId: number) => {
      hydratingRef.current.delete(tabId)
      setSessions(prev => {
        if (!(tabId in prev)) return prev
        const next = { ...prev }
        delete next[tabId]
        return next
      })
      void dropPersisted(tabId)
    }

    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onRemoved.addListener(onRemoved)
    document.addEventListener('visibilitychange', activateVisible)
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onRemoved.removeListener(onRemoved)
      document.removeEventListener('visibilitychange', activateVisible)
    }
  }, [activateTab])

  const patchSession = useCallback((tabId: number, patch: Partial<AgentTabSession>) => {
    setSessions(prev => {
      const cur = prev[tabId]
      if (!cur) return prev
      const next = { ...cur, ...patch }
      void persistSession(next)
      return { ...prev, [tabId]: next }
    })
  }, [])

  const remountSession = useCallback((tabId: number, patch?: Partial<AgentTabSession>) => {
    setSessions(prev => {
      const cur = prev[tabId]
      if (!cur) return prev
      const next = { ...cur, ...patch, sessionKey: cur.sessionKey + 1 }
      void persistSession(next)
      return { ...prev, [tabId]: next }
    })
  }, [])

  const changeMode = useCallback((tabId: number, mode: AgentMode) => {
    setSessions(prev => {
      const cur = prev[tabId]
      if (!cur || cur.agentMode === mode) return prev
      const next = { ...cur, agentMode: mode, conversation: null, sessionKey: cur.sessionKey + 1 }
      void persistSession(next)
      return { ...prev, [tabId]: next }
    })
  }, [])

  return { currentTabId, sessions, patchSession, remountSession, changeMode }
}
