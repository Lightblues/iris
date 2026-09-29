import { useState, useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Trash2, MessageSquare, Download, Upload, Copy } from 'lucide-react'
import { loadAllConversations, deleteConversation, exportConversations, importConversations, conversationSearchText } from '@/agent/history'
import type { Conversation, AgentMode } from '@/agent/types'
import { historyRoute, parseIrisRoute } from '@/lib/irisRoute'
import { getSessionUsage, formatModelShort, formatCost } from '@/lib/tokenUtils'

const AGENT_LABELS: Record<AgentMode, string> = {
  'general': '',
  'tab-agent': 'Tab',
  'automation': 'Auto',
  'paper': 'Paper',
}

interface AgentHistoryTabProps {
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewChat: () => void
}

export function AgentHistoryTab({ activeConversationId, onSelectConversation, onNewChat }: AgentHistoryTabProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadConversations()
  }, [activeConversationId])

  const loadConversations = async () => {
    setLoading(true)
    const store = await loadAllConversations()
    setConversations(store.conversations)
    setLoading(false)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await deleteConversation(id)
    await loadConversations()
  }

  const handleExport = async () => {
    if (conversations.length === 0) return
    await exportConversations()
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await importConversations(file)
    if (result.error) {
      setImportStatus(`Error: ${result.error}`)
    } else {
      setImportStatus(`Imported ${result.success}, skipped ${result.skipped}`)
      await loadConversations()
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
    setTimeout(() => setImportStatus(null), 3000)
  }

  const indexed = useMemo(
    () => conversations.map(conv => ({ conv, hay: conversationSearchText(conv) })),
    [conversations],
  )
  const needle = query.trim().toLowerCase()
  const visible = needle
    ? indexed.filter(row => row.hay.includes(needle)).map(row => row.conv)
    : conversations
  const groupedConversations = groupByDate(visible)

  const openQuery = () => {
    const raw = query.trim()
    const route = parseIrisRoute(raw)
    const id = route?.page === 'history' ? route.id : conversations.some(c => c.id === raw) ? raw : undefined
    if (!id) return
    if (!conversations.some(c => c.id === id)) {
      setNotice('No conversation with that id')
      return
    }
    setNotice(null)
    onSelectConversation(id)
  }

  const copyRoute = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(historyRoute(id))
    setNotice('Copied route')
    setTimeout(() => setNotice(null), 1500)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b space-y-2">
        <div className="flex items-center gap-2">
          <Button onClick={onNewChat} className="flex-1 h-8 text-sm">
            <Plus className="h-4 w-4 mr-1" />
            New Chat
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={handleExport}
            disabled={conversations.length === 0}
            className="h-8 text-xs"
            title="Export history"
          >
            <Download className="h-3 w-3" />
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 text-xs"
            title="Import history"
          >
            <Upload className="h-3 w-3" />
          </Button>
          <input
            type="file" ref={fileInputRef} accept=".json"
            onChange={handleImport} className="hidden"
          />
        </div>
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setNotice(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') openQuery() }}
          placeholder="Search or paste iris://history/…"
          className="h-8 text-sm"
        />
        {(importStatus || notice) && (
          <div className="text-xs text-muted-foreground text-center">{importStatus || notice}</div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {loading ? (
            <div className="text-center text-muted-foreground py-8 text-sm">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Start a new chat to begin</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">No matches</div>
          ) : (
            Object.entries(groupedConversations).map(([dateLabel, convs]) => (
              <div key={dateLabel} className="mb-3">
                <div className="text-xs font-medium text-muted-foreground px-2 py-1">{dateLabel}</div>
                <div className="space-y-0.5">
                  {convs.map((conv) => {
                    const usage = getSessionUsage(conv.messages)
                    return (
                      <button
                        key={conv.id}
                        onClick={() => onSelectConversation(conv.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-muted group ${
                          conv.id === activeConversationId ? 'bg-muted' : ''
                        }`}
                      >
                        <span className="flex-1 truncate" title={historyRoute(conv.id)}>{conv.title}</span>
                        {conv.agentMode && AGENT_LABELS[conv.agentMode] && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-primary/15 text-primary shrink-0">
                            {AGENT_LABELS[conv.agentMode]}
                          </span>
                        )}
                        {(usage.model || usage.totalCost != null) && (
                          <span className="text-[10px] text-muted-foreground/50 shrink-0">
                            {usage.model && formatModelShort(usage.model)}
                            {usage.totalCost != null && ` ${formatCost(usage.totalCost)}`}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatTime(conv.lastUpdated)}
                        </span>
                        <button
                          onClick={(e) => { void copyRoute(e, conv.id) }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted-foreground/20 rounded"
                          title="Copy iris://history/… id"
                        >
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, conv.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/20 rounded"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function groupByDate(conversations: Conversation[]): Record<string, Conversation[]> {
  const groups: Record<string, Conversation[]> = {}
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000

  for (const conv of conversations) {
    const convDate = new Date(conv.lastUpdated)
    const convDay = new Date(convDate.getFullYear(), convDate.getMonth(), convDate.getDate()).getTime()
    let label: string
    if (convDay >= today) label = 'Today'
    else if (convDay >= yesterday) label = 'Yesterday'
    else label = convDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (!groups[label]) groups[label] = []
    groups[label].push(conv)
  }
  return groups
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}
