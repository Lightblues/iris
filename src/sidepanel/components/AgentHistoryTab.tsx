import { useState, useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Trash2, MessageSquare, Download, Upload, Copy, Globe } from 'lucide-react'
import { loadAllConversations, deleteConversation, exportConversations, importConversations, conversationSearchText, displayUrl, samePage } from '@/agent/history'
import type { Conversation } from '@/agent/types'
import { historyRoute, parseIrisRoute } from '@/lib/irisRoute'
import { getSessionUsage, formatModelShort, formatCost } from '@/lib/tokenUtils'

interface AgentHistoryTabProps {
  activeConversationId: string | null
  pageUrl?: string | null
  onSelectConversation: (id: string) => void
  onNewChat: () => void
}

export function AgentHistoryTab({ activeConversationId, pageUrl, onSelectConversation, onNewChat }: AgentHistoryTabProps) {
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
  const onThisPage = pageUrl ? visible.filter(conv => samePage(pageUrl, conv)) : []
  const onThisPageIds = new Set(onThisPage.map(conv => conv.id))
  const groupedConversations = groupByDate(visible.filter(conv => !onThisPageIds.has(conv.id)))

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
            <>
              {onThisPage.length > 0 && (
                <ConversationGroup
                  label="This page"
                  conversations={onThisPage}
                  activeConversationId={activeConversationId}
                  onSelectConversation={onSelectConversation}
                  onCopy={copyRoute}
                  onDelete={handleDelete}
                />
              )}
              {Object.entries(groupedConversations).map(([dateLabel, convs]) => (
                <ConversationGroup
                  key={dateLabel}
                  label={dateLabel}
                  conversations={convs}
                  activeConversationId={activeConversationId}
                  onSelectConversation={onSelectConversation}
                  onCopy={copyRoute}
                  onDelete={handleDelete}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function ConversationGroup({
  label, conversations, activeConversationId, onSelectConversation, onCopy, onDelete,
}: {
  label: string
  conversations: Conversation[]
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onCopy: (e: React.MouseEvent, id: string) => void
  onDelete: (e: React.MouseEvent, id: string) => void
}) {
  return (
    <div className="mb-3">
      <div className="text-xs font-medium text-muted-foreground px-2 py-1">{label}</div>
      <div className="space-y-0.5">
        {conversations.map(conv => (
          <ConversationRow
            key={conv.id}
            conv={conv}
            active={conv.id === activeConversationId}
            onSelect={() => onSelectConversation(conv.id)}
            onCopy={onCopy}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

function ConversationRow({
  conv, active, onSelect, onCopy, onDelete,
}: {
  conv: Conversation
  active: boolean
  onSelect: () => void
  onCopy: (e: React.MouseEvent, id: string) => void
  onDelete: (e: React.MouseEvent, id: string) => void
}) {
  const usage = getSessionUsage(conv.messages)
  const url = conv.urls?.[0]
  return (
    <button
      onClick={onSelect}
      className={`w-full flex flex-col gap-0.5 px-2 py-1.5 rounded text-left text-sm hover:bg-muted group ${active ? 'bg-muted' : ''}`}
    >
      <span className="flex items-center gap-2 w-full">
        <span className="flex-1 truncate">{conv.title}</span>
        {(usage.model || usage.totalCost != null) && (
          <span className="text-[10px] text-muted-foreground/50 shrink-0">
            {usage.model && formatModelShort(usage.model)}
            {usage.totalCost != null && ` ${formatCost(usage.totalCost)}`}
          </span>
        )}
        <span className="text-xs text-muted-foreground shrink-0">{formatTime(conv.lastUpdated)}</span>
        <button
          onClick={(e) => { void onCopy(e, conv.id) }}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted-foreground/20 rounded"
          title="Copy iris://history/…"
        >
          <Copy className="h-3 w-3 text-muted-foreground" />
        </button>
        <button
          onClick={(e) => onDelete(e, conv.id)}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/20 rounded"
          title="Delete"
        >
          <Trash2 className="h-3 w-3 text-destructive" />
        </button>
      </span>
      <span className="text-[10px] font-mono text-muted-foreground/70 truncate" title={historyRoute(conv.id)}>
        {conv.id}
      </span>
      {url && (
        <span className="flex items-center gap-1 min-w-0 text-[10px] text-muted-foreground">
          <PageIcon url={url} />
          <span className="truncate">{displayUrl(url)}</span>
        </span>
      )}
      {(conv.skills?.length ?? 0) > 0 && (
        <span className="flex flex-wrap gap-1">
          {conv.skills.map(name => (
            <span key={name} className="text-[10px] px-1 py-0 rounded bg-primary/10 text-primary">{name}</span>
          ))}
        </span>
      )}
    </button>
  )
}

function PageIcon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false)
  let src = ''
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') src = `${parsed.origin}/favicon.ico`
  } catch { /* ignore */ }
  if (failed || !src) return <Globe className="h-3 w-3 shrink-0" />
  return <img src={src} alt="" className="h-3 w-3 shrink-0" onError={() => setFailed(true)} />
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
