import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  FileText,
  Bot,
  Highlighter,
  ExternalLink,
  Trash2,
  Download,
  Upload,
  Pencil,
  Copy,
  Check,
  Cloud,
  CloudOff,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KnowledgeEntry, KnowledgeEntryType } from '@/lib/types'
import { KNOWLEDGE_TAGS } from '@/lib/types'
import {
  getAllEntries,
  deleteEntry,
  updateEntry,
  exportEntriesAsJson,
  exportEntryAsMarkdown,
  importEntries,
} from '@/lib/knowledge'
import {
  syncAllEntriesToNotion,
} from '@/lib/notionSync'
import { loadSettings } from '@/lib/sidepanelSettings'

// Lazy load markdown renderer
const MarkdownContent = lazy(() =>
  import('./MarkdownContent').then((m) => ({ default: m.MarkdownContent }))
)

function MarkdownFallback() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 bg-muted-foreground/20 rounded w-3/4" />
      <div className="h-3 bg-muted-foreground/20 rounded w-1/2" />
    </div>
  )
}

const TYPE_FILTERS: { value: KnowledgeEntryType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'highlight', label: 'Highlight' },
  { value: 'note', label: 'My Note' },
  { value: 'chat-save', label: 'Chat Save' },
  { value: 'page-snapshot', label: 'Snapshot' },
]

function TypeIcon({ type, className }: { type: KnowledgeEntryType; className?: string }) {
  switch (type) {
    case 'highlight': return <Highlighter className={cn('h-4 w-4 text-yellow-500', className)} />
    case 'note': return <Pencil className={cn('h-4 w-4 text-green-500', className)} />
    case 'chat-save': return <Bot className={cn('h-4 w-4 text-purple-500', className)} />
    case 'page-snapshot': return <FileText className={cn('h-4 w-4 text-blue-500', className)} />
    default: return <FileText className={cn('h-4 w-4', className)} />
  }
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export function NotesTab() {
  const [notes, setNotes] = useState<KnowledgeEntry[]>([])
  const [selectedNote, setSelectedNote] = useState<KnowledgeEntry | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<KnowledgeEntryType | 'all'>('all')
  const [filterTag, setFilterTag] = useState<string>('All')
  const [copied, setCopied] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 })
  const [notionConfigured, setNotionConfigured] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load notes on mount
  useEffect(() => {
    loadNotes()
    checkNotionConfig()
  }, [])

  const checkNotionConfig = async () => {
    const settings = await loadSettings()
    setNotionConfigured(!!(settings.notionToken && settings.notionDatabaseId))
  }

  const loadNotes = async () => {
    const allEntries = await getAllEntries()
    setNotes(allEntries)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return
    await deleteEntry(id)
    if (selectedNote?.id === id) setSelectedNote(null)
    await loadNotes()
  }

  const handleStartEdit = () => {
    if (!selectedNote) return
    setEditTitle(selectedNote.title || '')
    setEditTags([...selectedNote.tags])
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedNote) return
    const updated = await updateEntry(selectedNote.id, {
      title: editTitle,
      tags: editTags,
    })
    if (updated) {
      setSelectedNote(updated)
      await loadNotes()
    }
    setIsEditing(false)
  }

  const handleToggleTag = (tag: string) => {
    if (editTags.includes(tag)) {
      setEditTags(editTags.filter((t) => t !== tag))
    } else {
      setEditTags([...editTags, tag])
    }
  }

  const handleCopyContent = async () => {
    if (!selectedNote) return
    await navigator.clipboard.writeText(selectedNote.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExportJson = async () => {
    await exportEntriesAsJson()
  }

  const handleExportSingleMarkdown = async (id: string) => {
    await exportEntryAsMarkdown(id)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const result = await importEntries(file)
    if (result.error) {
      alert(`Import failed: ${result.error}`)
    } else {
      alert(`Imported ${result.success} entries, skipped ${result.skipped}`)
      await loadNotes()
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSyncToNotion = async () => {
    const settings = await loadSettings()
    if (!settings.notionToken || !settings.notionDatabaseId) {
      alert('Please configure Notion settings first')
      return
    }

    setSyncing(true)
    setSyncProgress({ current: 0, total: notes.length })

    try {
      const result = await syncAllEntriesToNotion(
        {
          token: settings.notionToken,
          databaseId: settings.notionDatabaseId,
        },
        notes,
        (current, total) => {
          setSyncProgress({ current, total })
        }
      )

      alert(
        `Sync complete!\nCreated: ${result.success}\nSkipped: ${result.skipped}\nFailed: ${result.failed}${
          result.errors.length > 0 ? '\n\nErrors:\n' + result.errors.map(e => e.error).join('\n') : ''
        }`
      )
    } catch (error) {
      alert(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSyncing(false)
      setSyncProgress({ current: 0, total: 0 })
    }
  }

  // Filter notes
  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      !searchQuery ||
      (note.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = filterType === 'all' || note.type === filterType
    const matchesTag = filterTag === 'All' || note.tags.includes(filterTag)
    return matchesSearch && matchesType && matchesTag
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-sm flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={handleSyncToNotion}
            disabled={!notionConfigured || syncing}
            title={
              !notionConfigured
                ? 'Configure Notion in Settings'
                : syncing
                ? `Syncing ${syncProgress.current}/${syncProgress.total}...`
                : 'Sync all notes to Notion'
            }
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : notionConfigured ? (
              <Cloud className="h-4 w-4" />
            ) : (
              <CloudOff className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={handleExportJson}
            title="Export JSON"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            title="Import JSON"
          >
            <Upload className="h-4 w-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImport}
            className="hidden"
          />
        </div>

        {/* Type filter */}
        <div className="flex gap-1 flex-wrap">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilterType(f.value)}
              className={cn(
                'px-2 py-0.5 text-xs rounded-full transition-colors',
                filterType === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Tag filter */}
        <div className="flex gap-1 flex-wrap">
          {['All', ...KNOWLEDGE_TAGS].map((tag) => (
            <button
              key={tag}
              onClick={() => setFilterTag(tag)}
              className={cn(
                'px-2 py-0.5 text-xs rounded-full transition-colors',
                filterTag === tag
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Notes List */}
      <ScrollArea className="flex-1">
        {filteredNotes.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            <p>No notes yet</p>
            <p className="text-xs mt-1">
              Save page content or selections as notes from the Chat tab
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => setSelectedNote(note)}
                className={cn(
                  'p-3 cursor-pointer hover:bg-muted/50 transition-colors',
                  selectedNote?.id === note.id && 'bg-muted'
                )}
              >
                <div className="flex items-start gap-2">
                  <TypeIcon type={note.type} className="shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{note.title || 'Untitled'}</h3>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {getDomain(note.source.url) || note.source.title}
                    </p>
                    {note.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {note.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 text-[10px] bg-muted rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Note Preview Dialog */}
      <Dialog open={!!selectedNote} onOpenChange={(open) => !open && setSelectedNote(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedNote && <TypeIcon type={selectedNote.type} />}
              <span className="truncate">{selectedNote?.title || 'Untitled'}</span>
            </DialogTitle>
          </DialogHeader>

          {selectedNote && (
            <>
              {/* Source info */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground border-b pb-2">
                <a
                  href={selectedNote.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground truncate"
                >
                  <ExternalLink className="h-3 w-3" />
                  {selectedNote.source.title}
                </a>
                <span className="shrink-0">
                  {new Date(selectedNote.source.timestamp).toLocaleDateString()}
                </span>
              </div>

              {/* Tags */}
              {selectedNote.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {selectedNote.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs bg-muted rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Content */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Suspense fallback={<MarkdownFallback />}>
                    <MarkdownContent content={selectedNote.content} />
                  </Suspense>
                </div>
              </ScrollArea>

              <DialogFooter className="flex-row gap-2 sm:justify-between">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleStartEdit}
                    title="Edit title & tags"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyContent}
                    title="Copy content"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExportSingleMarkdown(selectedNote.id)}
                    title="Export as Markdown"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(selectedNote.id)}
                    title="Delete note"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedNote(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Title</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Tags</label>
              <div className="flex gap-1 flex-wrap">
                {KNOWLEDGE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleToggleTag(tag)}
                    className={cn(
                      'px-2 py-1 text-xs rounded transition-colors',
                      editTags.includes(tag)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveEdit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
