import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, ExternalLink, Edit, Trash2, Upload, Download } from 'lucide-react'
import type { BookmarkLink } from '@/lib/types'
import { getBookmarks, addBookmark, updateBookmark, deleteBookmark, exportBookmarks, importBookmarks } from '@/lib/storage'
import { CATEGORIES, getFaviconUrl } from '@/lib/types'

export function BookmarksTab() {
  const [bookmarks, setBookmarks] = useState<BookmarkLink[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [isAdding, setIsAdding] = useState(false)
  const [isManageMode, setIsManageMode] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingBookmark, setEditingBookmark] = useState<BookmarkLink | null>(null)
  const [formData, setFormData] = useState({ title: '', url: '', remark: '', category: 'Other' })
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    setIsAdding(true)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab.url && tab.title) {
        const exists = bookmarks.some(b => b.url === tab.url)
        if (exists) {
          return
        }
        const newBookmark: BookmarkLink = {
          id: Date.now().toString(),
          title: tab.title,
          url: tab.url,
          createdAt: Date.now()
        }
        await addBookmark(newBookmark)
        await loadBookmarks()
      }
    } finally {
      setIsAdding(false)
    }
  }

  const handleOpenBookmark = (url: string) => {
    chrome.tabs.create({ url })
  }

  const handleAddNew = () => {
    setFormData({ title: '', url: '', remark: '', category: 'Other' })
    setShowAddDialog(true)
  }

  const handleAddSave = async () => {
    if (!formData.title || !formData.url) {
      alert('Title and URL are required')
      return
    }
    const newBookmark: BookmarkLink = {
      id: Date.now().toString(),
      title: formData.title,
      url: formData.url,
      remark: formData.remark || undefined,
      category: formData.category || 'Other',
      createdAt: Date.now()
    }
    await addBookmark(newBookmark)
    setShowAddDialog(false)
    await loadBookmarks()
  }

  const handleEdit = (bookmark: BookmarkLink) => {
    setEditingBookmark(bookmark)
    setFormData({
      title: bookmark.title,
      url: bookmark.url,
      remark: bookmark.remark || '',
      category: bookmark.category || 'Other'
    })
    setShowEditDialog(true)
  }

  const handleEditSave = async () => {
    if (!editingBookmark) return
    if (!formData.title || !formData.url) {
      alert('Title and URL are required')
      return
    }
    await updateBookmark(editingBookmark.id, formData)
    setShowEditDialog(false)
    setEditingBookmark(null)
    await loadBookmarks()
  }

  const handleDelete = async (bookmark: BookmarkLink) => {
    if (confirm(`Delete "${bookmark.title}"?`)) {
      await deleteBookmark(bookmark.id)
      await loadBookmarks()
    }
  }

  const handleExport = async () => {
    await exportBookmarks()
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await importBookmarks(file)
    if (result.error) {
      setImportStatus(`Error: ${result.error}`)
    } else {
      setImportStatus(`Imported ${result.success}, skipped ${result.skipped}`)
      await loadBookmarks()
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
    setTimeout(() => setImportStatus(null), 3000)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-2 border-b space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={handleAddCurrentTab}
            disabled={isAdding}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Tab
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddNew}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add New
          </Button>
          <Button
            variant={isManageMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIsManageMode(!isManageMode)}
            className="h-7 text-xs"
          >
            {isManageMode ? 'Done' : 'Manage'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="h-7 text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-7 text-xs"
          >
            <Upload className="h-3 w-3 mr-1" />
            Import
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          {importStatus && (
            <span className="text-xs text-muted-foreground">{importStatus}</span>
          )}
        </div>

        {/* Category filter */}
        <div className="overflow-x-auto">
          <div className="flex gap-1 pb-1">
            {CATEGORIES.map(category => (
              <Button
                key={category}
                onClick={() => setSelectedCategory(category)}
                variant={selectedCategory === category ? 'default' : 'outline'}
                size="sm"
                className="h-6 text-xs px-2 shrink-0"
              >
                {category}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Bookmarks list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredBookmarks.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">
                {bookmarks.length === 0
                  ? 'No bookmarks yet'
                  : `No bookmarks in "${selectedCategory}"`}
              </p>
              {bookmarks.length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddCurrentTab}
                  className="mt-2"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add current tab
                </Button>
              )}
            </div>
          ) : (
            filteredBookmarks.map(bookmark => (
              <div
                key={bookmark.id}
                className="flex items-center gap-2 p-2 rounded-md hover:bg-muted group"
              >
                <button
                  onClick={() => handleOpenBookmark(bookmark.url)}
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                >
                  <img
                    src={getFaviconUrl(bookmark.url)}
                    alt=""
                    className="w-4 h-4 shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  <span className="flex-1 text-sm truncate">{bookmark.title}</span>
                  {bookmark.category && bookmark.category !== 'Other' && !isManageMode && (
                    <Badge variant="secondary" className="text-xs shrink-0 hidden group-hover:inline-flex">
                      {bookmark.category}
                    </Badge>
                  )}
                  {!isManageMode && (
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                  )}
                </button>
                {isManageMode && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(bookmark)}
                      className="h-7 w-7 p-0"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(bookmark)}
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Bookmark</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">URL</label>
              <Input
                type="url"
                placeholder="https://..."
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter(c => c !== 'All').map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Remark (optional)</label>
              <Textarea
                placeholder="Notes..."
                value={formData.remark}
                onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSave}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Edit Bookmark</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">URL</label>
              <Input
                type="url"
                placeholder="https://..."
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter(c => c !== 'All').map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Remark (optional)</label>
              <Textarea
                placeholder="Notes..."
                value={formData.remark}
                onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowEditDialog(false)
              setEditingBookmark(null)
            }}>
              Cancel
            </Button>
            <Button onClick={handleEditSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
