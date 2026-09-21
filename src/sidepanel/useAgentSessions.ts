import { useCallback, useEffect, useRef, useState } from 'react'
import { loadAllConversations } from '@/agent/history'
import type { AgentMode, Conversation } from '@/agent/types'
import {
  dropTabBinding,
  isBrowserNewTab,
  newSessionId,
  persistSessionBindings,
  readTabSessions,
  tabIdsForSession,
  type PersistedTabSession,
} from './sessionPersist'

export interface AgentSession {
  id: string
  tabIds: number[]
  conversation: Conversation | null
  agentMode: AgentMode
  chatModel: string | null
  sessionKey: number
}

function emptySession(tabId: number): AgentSession {
  return {
    id: newSessionId(),
    tabIds: [tabId],
    conversation: null,
    agentMode: 'general',
    chatModel: null,
    sessionKey: 0,
  }
}

function toRecord(session: AgentSession): PersistedTabSession {
  return {
    sessionId: session.id,
    conversationId: session.conversation?.id ?? null,
    agentMode: session.agentMode,
    chatModel: session.chatModel,
  }
}

function persistFrom(session: AgentSession): void {
  void persistSessionBindings(session.tabIds, toRecord(session))
}

function indexTabs(sessions: Record<string, AgentSession>): Record<number, string> {
  const idx: Record<number, string> = {}
  for (const s of Object.values(sessions)) {
    for (const id of s.tabIds) idx[id] = s.id
  }
  return idx
}

async function hydrateSession(tabId: number): Promise<AgentSession> {
  let saved = (await readTabSessions())[String(tabId)]
  if (!saved) {
    try {
      const tab = await chrome.tabs.get(tabId)
      if (tab.openerTabId != null) {
        for (let i = 0; i < 5 && !saved; i++) {
          await new Promise(r => setTimeout(r, 40))
          saved = (await readTabSessions())[String(tabId)]
        }
      }
    } catch { /* tab gone */ }
  }
  if (!saved) {
    const session = emptySession(tabId)
    persistFrom(session)
    return session
  }
  let conversation: Conversation | null = null
  if (saved.conversationId) {
    const store = await loadAllConversations()
    conversation = store.conversations.find(c => c.id === saved.conversationId) ?? null
  }
  const all = await readTabSessions()
  const tabIds = tabIdsForSession(all, saved.sessionId)
  return {
    id: saved.sessionId,
    tabIds: tabIds.length ? tabIds : [tabId],
    conversation,
    agentMode: saved.agentMode ?? 'general',
    chatModel: saved.chatModel ?? null,
    sessionKey: 0,
  }
}

/**
 * Live AgentPanel slots keyed by session. Cmd+click from an Iris tab joins
 * the opener's session; Cmd+T / unrelated tabs stay unbound.
 */
export function useAgentSessions() {
  const [currentTabId, setCurrentTabId] = useState<number | null>(null)
  const [sessions, setSessions] = useState<Record<string, AgentSession>>({})
  const sessionsRef = useRef(sessions)
  const hydratingRef = useRef(new Set<number>())

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  const activateTab = useCallback((tabId: number) => {
    setCurrentTabId(tabId)
    const idx = indexTabs(sessionsRef.current)
    if (idx[tabId] || hydratingRef.current.has(tabId)) return
    hydratingRef.current.add(tabId)
    hydrateSession(tabId)
      .then(session => {
        setSessions(prev => {
          const existing = prev[session.id]
          if (existing) {
            if (existing.tabIds.includes(tabId)) return prev
            const next = { ...existing, tabIds: [...existing.tabIds, tabId] }
            persistFrom(next)
            return { ...prev, [session.id]: next }
          }
          return { ...prev, [session.id]: session }
        })
      })
      .catch(() => {
        setSessions(prev => {
          if (indexTabs(prev)[tabId]) return prev
          const session = emptySession(tabId)
          persistFrom(session)
          return { ...prev, [session.id]: session }
        })
      })
      .finally(() => hydratingRef.current.delete(tabId))
  }, [])

  const attachDerivedTab = useCallback((childId: number, openerId: number) => {
    setSessions(prev => {
      const idx = indexTabs(prev)
      const sid = idx[openerId]
      if (!sid) return prev
      if (idx[childId] === sid) return prev

      const next = { ...prev }
      const oldSid = idx[childId]
      if (oldSid && oldSid !== sid) {
        const old = next[oldSid]
        if (old) {
          const remaining = old.tabIds.filter(id => id !== childId)
          if (remaining.length === 0) {
            delete next[oldSid]
          } else {
            const updated = { ...old, tabIds: remaining }
            next[oldSid] = updated
            persistFrom(updated)
          }
        }
      }

      const s = next[sid]
      if (!s || s.tabIds.includes(childId)) return next
      const updated = { ...s, tabIds: [...s.tabIds, childId] }
      next[sid] = updated
      persistFrom(updated)
      return next
    })
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
    const onCreated = (tab: chrome.tabs.Tab) => {
      if (tab.id == null || tab.openerTabId == null) return
      if (isBrowserNewTab(tab)) return
      const childId = tab.id
      const openerId = tab.openerTabId
      const tryAttach = (attempts = 0) => {
        const idx = indexTabs(sessionsRef.current)
        if (idx[openerId]) {
          attachDerivedTab(childId, openerId)
          return
        }
        if (attempts >= 20) return
        setTimeout(() => tryAttach(attempts + 1), 50)
      }
      tryAttach()
    }
    const onRemoved = (tabId: number) => {
      hydratingRef.current.delete(tabId)
      setSessions(prev => {
        const idx = indexTabs(prev)
        const sid = idx[tabId]
        if (!sid) return prev
        const s = prev[sid]
        if (!s) return prev
        const tabIds = s.tabIds.filter(id => id !== tabId)
        if (tabIds.length === 0) {
          const next = { ...prev }
          delete next[sid]
          return next
        }
        const updated = { ...s, tabIds }
        persistFrom(updated)
        return { ...prev, [sid]: updated }
      })
      void dropTabBinding(tabId)
    }

    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onCreated.addListener(onCreated)
    chrome.tabs.onRemoved.addListener(onRemoved)
    document.addEventListener('visibilitychange', activateVisible)
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onCreated.removeListener(onCreated)
      chrome.tabs.onRemoved.removeListener(onRemoved)
      document.removeEventListener('visibilitychange', activateVisible)
    }
  }, [activateTab, attachDerivedTab])

  const patchSession = useCallback((tabId: number, patch: Partial<AgentSession>) => {
    setSessions(prev => {
      const sid = indexTabs(prev)[tabId]
      if (!sid) return prev
      const cur = prev[sid]
      if (!cur) return prev
      const next = { ...cur, ...patch, tabIds: cur.tabIds, id: cur.id }
      persistFrom(next)
      return { ...prev, [sid]: next }
    })
  }, [])

  const remountSession = useCallback((tabId: number, patch?: Partial<AgentSession>) => {
    setSessions(prev => {
      const sid = indexTabs(prev)[tabId]
      if (!sid) return prev
      const cur = prev[sid]
      if (!cur) return prev
      const next = { ...cur, ...patch, tabIds: cur.tabIds, id: cur.id, sessionKey: cur.sessionKey + 1 }
      persistFrom(next)
      return { ...prev, [sid]: next }
    })
  }, [])

  const unlinkToNewChat = useCallback((tabId: number) => {
    setSessions(prev => {
      const idx = indexTabs(prev)
      const oldSid = idx[tabId]
      const next = { ...prev }
      if (oldSid && next[oldSid]) {
        const remaining = next[oldSid].tabIds.filter(id => id !== tabId)
        if (remaining.length === 0) {
          delete next[oldSid]
        } else {
          const updated = { ...next[oldSid], tabIds: remaining }
          next[oldSid] = updated
          persistFrom(updated)
        }
      }
      const fresh = emptySession(tabId)
      next[fresh.id] = fresh
      persistFrom(fresh)
      return next
    })
  }, [])

  const changeMode = useCallback((tabId: number, mode: AgentMode) => {
    setSessions(prev => {
      const sid = indexTabs(prev)[tabId]
      if (!sid) return prev
      const cur = prev[sid]
      if (!cur || cur.agentMode === mode) return prev
      const next = { ...cur, agentMode: mode, conversation: null, sessionKey: cur.sessionKey + 1 }
      persistFrom(next)
      return { ...prev, [sid]: next }
    })
  }, [])

  return {
    currentTabId,
    sessions,
    patchSession,
    remountSession,
    unlinkToNewChat,
    changeMode,
  }
}
