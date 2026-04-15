import { useState, useEffect, useRef } from 'react'
import type { BookmarkLink } from '@/lib/types'
import { getBookmarks, addBookmark, exportBookmarks, importBookmarks } from '@/lib/storage'
import { CATEGORIES, getFaviconUrl } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function PopupApp() {
  const [bookmarks, setBookmarks] = useState<BookmarkLink[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('All')

  useEffect(() => {
    loadBookmarks()
  }, [])

  const loadBookmarks = async () => {
    const data = await getBookmarks()
    setBookmarks(data)
  }

  const filteredBookmarks = selectedCategory === 'All'
    ? bookmarks
    : bookmarks.filter(b => b.category === selectedCategory)

  const handleAddCurrentTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab.url && tab.title) {
      const newBookmark: BookmarkLink = {
        id: Date.now().toString(),
        title: tab.title,
        url: tab.url,
        createdAt: Date.now()
      }
      await addBookmark(newBookmark)
      await loadBookmarks()
    }
  }

  const handleOpenOptions = () => {
    chrome.runtime.openOptionsPage()
  }

  const handleExport = async () => {
    try {
      await exportBookmarks()
    } catch (error) {
      alert('Failed to export bookmarks: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImport = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const result = await importBookmarks(file)
    
    if (result.error) {
      alert(`Import failed: ${result.error}`)
    } else {
      const message = `Import completed!\n✓ Imported: ${result.success}\n⊘ Skipped (duplicates): ${result.skipped}`
      alert(message)
      await loadBookmarks()
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="w-[600px] min-h-[400px] max-h-[600px] flex flex-col bg-background">
      <header className="border-b p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">EA Navigation</h1>
          <div className="flex gap-2">
            <Button onClick={handleAddCurrentTab} size="sm">
              + Add Current Tab
            </Button>
            <Button onClick={handleImport} variant="outline" size="sm">
              Import
            </Button>
            <Button onClick={handleExport} variant="outline" size="sm">
              Export
            </Button>
            <Button onClick={handleOpenOptions} variant="outline" size="sm">
              Manage Links
            </Button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />

        <nav className="flex gap-2 flex-wrap">
          {CATEGORIES.map(category => (
            <Button
              key={category}
              onClick={() => setSelectedCategory(category)}
              variant={selectedCategory === category ? 'default' : 'outline'}
              size="sm"
            >
              {category}
            </Button>
          ))}
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {filteredBookmarks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>
              {bookmarks.length === 0
                ? 'No bookmarks yet. Click "Add Current Tab" to get started!'
                : `No bookmarks in "${selectedCategory}" category.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredBookmarks.map(bookmark => (
              <a
                key={bookmark.id}
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="p-3 pb-2">
                    <div className="flex items-start gap-2">
                      <img
                        src={getFaviconUrl(bookmark.url)}
                        alt=""
                        className="w-4 h-4 mt-0.5 flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                      <h3 className="font-medium text-sm line-clamp-2 flex-1">
                        {bookmark.title}
                      </h3>
                    </div>
                  </CardHeader>
                  {bookmark.remark && (
                    <CardContent className="p-3 pt-0">
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {bookmark.remark}
                      </p>
                    </CardContent>
                  )}
                  <CardFooter className="p-3 pt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground truncate">
                      {new URL(bookmark.url).hostname}
                    </span>
                    {bookmark.category && bookmark.category !== 'Other' && (
                      <Badge variant="secondary" className="text-xs">
                        {bookmark.category}
                      </Badge>
                    )}
                  </CardFooter>
                </Card>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default PopupApp
