import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Download } from 'lucide-react'
import type { ReadingListEntry } from '@/lib/types'
import { getFaviconUrl } from '@/lib/types'
import { getReadingList, updateReadingListEntry, removeFromReadingList, exportReadingList } from '@/lib/readingList'

type FilterType = 'all' | 'unread' | 'read'

export function ReadingListTab() {
  const [entries, setEntries] = useState<ReadingListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')

  useEffect(() => {
    loadReadingList()
  }, [])

  const loadReadingList = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getReadingList()
      data.sort((a, b) => b.creationTime - a.creationTime)
      setEntries(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reading list')
    } finally {
      setLoading(false)
    }
  }

  const filteredEntries = useMemo(() => {
    switch (filter) {
      case 'unread':
        return entries.filter(e => !e.hasBeenRead)
      case 'read':
        return entries.filter(e => e.hasBeenRead)
      default:
        return entries
    }
  }, [entries, filter])

  const handleToggleRead = async (entry: ReadingListEntry) => {
    const newReadStatus = !entry.hasBeenRead
    setEntries(prev => prev.map(e =>
      e.url === entry.url
        ? { ...e, hasBeenRead: newReadStatus, lastUpdateTime: Date.now() }
        : e
    ))
    try {
      await updateReadingListEntry(entry.url, { hasBeenRead: newReadStatus })
    } catch (err) {
      setEntries(prev => prev.map(e =>
        e.url === entry.url
          ? { ...e, hasBeenRead: !newReadStatus }
          : e
      ))
      alert(err instanceof Error ? err.message : 'Failed to update entry')
    }
  }

  const handleDelete = async (url: string, title: string) => {
    if (!confirm(`Remove "${title}" from reading list?`)) return
    try {
      await removeFromReadingList(url)
      await loadReadingList()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove entry')
    }
  }

  const handleExport = async () => {
    try {
      await exportReadingList()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export reading list')
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const unreadCount = entries.filter(e => !e.hasBeenRead).length
  const readCount = entries.filter(e => e.hasBeenRead).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <p className="text-sm text-destructive mb-4">Error: {error}</p>
        <Button variant="outline" onClick={loadReadingList} size="sm">
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-2 border-b space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="h-7 text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>

          {/* Filter toggles */}
          <div className="flex gap-1 bg-muted rounded-md p-0.5">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                filter === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({entries.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                filter === 'unread'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Unread ({unreadCount})
            </button>
            <button
              onClick={() => setFilter('read')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                filter === 'read'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Read ({readCount})
            </button>
          </div>
        </div>
      </div>

      {/* Reading list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {filteredEntries.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {entries.length === 0 ? (
                <>
                  <p className="text-sm">Your reading list is empty.</p>
                  <p className="text-xs mt-2">Add pages using Chrome's reading list feature.</p>
                </>
              ) : (
                <p className="text-sm">No {filter} items.</p>
              )}
            </div>
          ) : (
            filteredEntries.map(entry => (
              <div
                key={entry.url}
                className={`border rounded-md p-3 space-y-2 ${entry.hasBeenRead ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <img
                    src={getFaviconUrl(entry.url)}
                    alt=""
                    className="w-4 h-4 shrink-0 mt-0.5"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-sm font-medium hover:underline block ${
                        entry.hasBeenRead ? 'line-through' : ''
                      }`}
                    >
                      {entry.title}
                    </a>
                    <p className="text-xs text-muted-foreground truncate">
                      {new URL(entry.url).hostname}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Added {formatDate(entry.creationTime)}
                      {entry.lastUpdateTime !== entry.creationTime && (
                        <> · Updated {formatDate(entry.lastUpdateTime)}</>
                      )}
                    </p>
                  </div>
                  {entry.hasBeenRead ? (
                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 shrink-0 text-xs">
                      ✓ Read
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      Unread
                    </Badge>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleRead(entry)}
                    className="h-7 text-xs flex-1"
                  >
                    {entry.hasBeenRead ? 'Mark Unread' : 'Mark Read'}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(entry.url, entry.title)}
                    className="h-7 text-xs"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
