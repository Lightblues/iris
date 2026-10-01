import { useEffect, useState } from 'react'
import { ArrowLeft, Download, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  deleteReport,
  listReportHistory,
  listReports,
  reportBytes,
  type ReportRevision,
  type StoredReport,
} from '@/lib/reportStore'
import { MarkdownContent } from './MarkdownContent'

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString()
}

function downloadMarkdown(name: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const PROSE = '[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1 [&_hr]:my-2'

export function ReportsTab() {
  const [rows, setRows] = useState<StoredReport[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [history, setHistory] = useState<ReportRevision[]>([])
  const [preview, setPreview] = useState<ReportRevision | null>(null)

  const refresh = async () => setRows(await listReports())

  useEffect(() => {
    refresh().catch(err => setError(err.message))
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.iris_reports) refresh().catch(err => setError(err.message))
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [])

  const selected = rows.find(row => row.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) return
    setPreview(null)
    listReportHistory(selectedId).then(setHistory).catch(err => setError(err.message))
  }, [selectedId, selected?.updated])

  if (selected) {
    const showing = preview?.content ?? selected.content
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <button type="button" onClick={() => setSelectedId(null)} className="flex items-center gap-1 text-sm font-medium hover:text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Reports
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-3 py-3 space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-medium truncate">{selected.name}</h2>
            <span className="text-[10px] text-muted-foreground shrink-0">{reportBytes(selected.content)} B · {formatWhen(selected.updated)}</span>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => downloadMarkdown(selected.name, showing)}>
              <Download className="h-3 w-3 mr-1" />Download
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
              if (!confirm(`Delete ${selected.name}?`)) return
              deleteReport(selected.id).then(() => { setSelectedId(null); return refresh() }).catch(err => setError(err.message))
            }}>
              <Trash2 className="h-3 w-3 mr-1" />Delete
            </Button>
          </div>
          <section className="space-y-1">
            <h3 className="text-xs font-medium">Revisions</h3>
            <ul className="text-xs border rounded-md divide-y">
              <li>
                <button
                  type="button"
                  className={cn('w-full text-left px-2 py-1.5 hover:bg-muted/60', !preview && 'bg-muted/40')}
                  onClick={() => setPreview(null)}
                >
                  Current
                </button>
              </li>
              {history.map(rev => (
                <li key={rev.savedAt}>
                  <button
                    type="button"
                    className={cn('w-full text-left px-2 py-1.5 hover:bg-muted/60', preview?.savedAt === rev.savedAt && 'bg-muted/40')}
                    onClick={() => setPreview(rev)}
                  >
                    {formatWhen(rev.savedAt)} · {reportBytes(rev.content)} B
                  </button>
                </li>
              ))}
              {history.length === 0 && (
                <li className="px-2 py-1.5 text-muted-foreground">No earlier copy. One is kept on each change.</li>
              )}
            </ul>
          </section>
          <section className="space-y-1">
            <h3 className="text-xs font-medium">{preview ? `Revision from ${formatWhen(preview.savedAt)}` : 'Preview'}</h3>
            <div className={cn('text-xs rounded-md border p-3', PROSE)}>
              <MarkdownContent content={showing} />
            </div>
          </section>
        </div>
      </div>
    )
  }

  const sorted = [...rows].sort((a, b) => b.updated - a.updated)
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {error && <p className="px-3 py-2 text-xs text-destructive border-b">{error}</p>}
      <ul className="flex-1 min-h-0 overflow-auto">
        {sorted.length === 0 && (
          <li className="px-3 py-8 text-center text-xs text-muted-foreground">No reports. Ask the agent to write one.</li>
        )}
        {sorted.map(row => (
          <li key={row.id} className="border-b">
            <button type="button" className="w-full text-left px-3 py-2 hover:bg-muted/40" onClick={() => setSelectedId(row.id)}>
              <div className="text-sm truncate">{row.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{reportBytes(row.content)} B · {formatWhen(row.updated)}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
