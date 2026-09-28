import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Copy, Download, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { scriptMatchesUrl, type ScriptMeta } from '@/lib/scriptMeta'
import {
  deleteScript,
  describeScripts,
  listScriptHistory,
  resyncScripts,
  scriptRegisterError,
  setScriptEnabled,
  writeScript,
  type ScriptRecord,
  type ScriptRevision,
} from '@/lib/scriptStore'

type Row = ScriptRecord | { id: string; source: string; enabled: boolean; error: string }
type Filter = 'all' | 'here' | 'user' | 'agent'

function metaOf(row: Row): ScriptMeta | null {
  return 'meta' in row ? row.meta : null
}

function matchLabel(matches: string[]): string {
  if (matches.length === 0) return 'no match'
  const host = matches[0].replace(/^\*:\/\//, '').replace(/\/.*$/, '')
  return matches.length > 1 ? `${host} +${matches.length - 1}` : host
}

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString()
}

function downloadSource(name: string, kind: 'user' | 'agent', source: string) {
  const blob = new Blob([source], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/[^\w.-]+/g, '_')}.${kind === 'agent' ? 'agent' : 'user'}.js`
  a.click()
  URL.revokeObjectURL(url)
}

function EnableSwitch({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      title={enabled ? 'Disable' : 'Enable'}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
        enabled ? 'bg-primary' : 'bg-muted-foreground/30',
      )}
    >
      <span className={cn(
        'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform',
        enabled && 'translate-x-4',
      )} />
    </button>
  )
}

export function ScriptsTab() {
  const [rows, setRows] = useState<Row[]>([])
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [history, setHistory] = useState<ScriptRevision[]>([])
  const [preview, setPreview] = useState<ScriptRevision | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = async () => {
    const [list, tabs, registered] = await Promise.all([
      describeScripts(),
      chrome.tabs.query({ active: true, currentWindow: true }),
      scriptRegisterError(),
    ])
    setRows(list)
    setUrl(tabs[0]?.url || '')
    setRuntimeError(registered)
  }

  useEffect(() => { refresh().catch(err => setError(err.message)) }, [])

  const selected = rows.find(row => row.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) return
    setPreview(null)
    listScriptHistory(selectedId).then(setHistory).catch(err => setError(err.message))
  }, [selectedId])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...rows]
      .filter(row => {
        const meta = metaOf(row)
        if (filter === 'here' && !(meta && scriptMatchesUrl(meta, url))) return false
        if (filter === 'user' && meta?.kind !== 'user') return false
        if (filter === 'agent' && meta?.kind !== 'agent') return false
        if (!q) return true
        const hay = [meta?.name, meta?.description, ...(meta?.matches ?? []), row.id].join(' ').toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => {
        const am = metaOf(a) && scriptMatchesUrl(metaOf(a)!, url) ? 0 : 1
        const bm = metaOf(b) && scriptMatchesUrl(metaOf(b)!, url) ? 0 : 1
        if (am !== bm) return am - bm
        return (metaOf(a)?.name || a.id).localeCompare(metaOf(b)?.name || b.id)
      })
  }, [rows, filter, query, url])

  const toggle = async (row: Row) => {
    try {
      await setScriptEnabled(row.id, !row.enabled)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (selected) {
    const meta = metaOf(selected)
    const showing = preview?.source ?? selected.source
    const version = preview?.version ?? meta?.version ?? 'unknown'
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <button type="button" onClick={() => setSelectedId(null)} className="flex items-center gap-1 text-sm font-medium hover:text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Scripts
          </button>
          <div className="flex-1" />
          <EnableSwitch enabled={selected.enabled} onClick={() => toggle(selected)} />
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-3 py-3 space-y-3">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-medium truncate">{meta?.name || selected.id}</h2>
              <span className="text-[10px] text-muted-foreground shrink-0">{meta?.kind === 'agent' ? 'agent' : 'user'} · v{meta?.version || '?'}</span>
            </div>
            {meta?.description && <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>}
            {'error' in selected && <p className="text-xs text-destructive mt-1">{selected.error}</p>}
            {meta && meta.unsupported.length > 0 && (
              <p className="text-xs text-amber-600 mt-1">Unsupported: {meta.unsupported.join(', ')}</p>
            )}
          </div>
          {meta && (
            <dl className="text-[11px] space-y-1 text-muted-foreground">
              <div><dt className="inline text-foreground">Match </dt><dd className="inline">{meta.matches.join(', ') || '—'}</dd></div>
              <div><dt className="inline text-foreground">Run </dt><dd className="inline">{meta.runAt} · {meta.world === 'MAIN' ? 'page' : 'isolated'}</dd></div>
              {meta.grants.length > 0 && <div><dt className="inline text-foreground">Grant </dt><dd className="inline">{meta.grants.join(', ')}</dd></div>}
            </dl>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
              navigator.clipboard.writeText(showing).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1200)
              })
            }}>
              <Copy className="h-3 w-3 mr-1" />{copied ? 'Copied' : 'Copy'}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => downloadSource(meta?.name || selected.id, meta?.kind || 'user', showing)}>
              <Download className="h-3 w-3 mr-1" />Export
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
              if (!confirm(`Delete ${meta?.name || selected.id}?`)) return
              deleteScript(selected.id).then(() => { setSelectedId(null); return refresh() }).catch(err => setError(err.message))
            }}>
              <Trash2 className="h-3 w-3 mr-1" />Delete
            </Button>
          </div>
          <section className="space-y-1">
            <h3 className="text-xs font-medium">Versions</h3>
            <ul className="text-xs border rounded-md divide-y">
              <li>
                <button
                  type="button"
                  className={cn('w-full text-left px-2 py-1.5 hover:bg-muted/60', !preview && 'bg-muted/40')}
                  onClick={() => setPreview(null)}
                >
                  v{meta?.version || '?'} · current
                </button>
              </li>
              {history.map(rev => (
                <li key={rev.savedAt}>
                  <button
                    type="button"
                    className={cn('w-full text-left px-2 py-1.5 hover:bg-muted/60', preview?.savedAt === rev.savedAt && 'bg-muted/40')}
                    onClick={() => setPreview(rev)}
                  >
                    v{rev.version} · {formatWhen(rev.savedAt)}
                  </button>
                </li>
              ))}
              {history.length === 0 && (
                <li className="px-2 py-1.5 text-muted-foreground">No earlier copy. One is kept when this script is replaced.</li>
              )}
            </ul>
          </section>
          <section className="space-y-1">
            <h3 className="text-xs font-medium">
              {preview ? `Preview v${version}` : 'Source'}
            </h3>
            <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-2 max-h-[50vh] overflow-auto">{showing}</pre>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-2 space-y-2 border-b">
        {runtimeError && <p className="text-xs text-destructive">{runtimeError} Reload the extension after turning the switch on.</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search scripts" className="h-8 text-xs" />
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => resyncScripts().then(refresh).catch(err => setError(err.message))}>Refresh</Button>
          <label className="shrink-0">
            <input
              type="file"
              accept=".js,.user.js,.agent.js"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  await writeScript(await file.text())
                  await refresh()
                } catch (err) {
                  setError((err as Error).message)
                }
              }}
            />
            <span className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs cursor-pointer hover:bg-muted">
              <Upload className="h-3 w-3" />Import
            </span>
          </label>
        </div>
        <div className="flex gap-1">
          {(['all', 'here', 'user', 'agent'] as Filter[]).map(id => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                'px-2 py-0.5 text-[11px] rounded-full border',
                filter === id ? 'bg-foreground text-background border-foreground' : 'text-muted-foreground',
              )}
            >
              {id === 'all' ? 'All' : id === 'here' ? 'This tab' : id === 'user' ? 'User' : 'Agent'}
            </button>
          ))}
        </div>
      </div>
      <ul className="flex-1 min-h-0 overflow-auto">
        {visible.length === 0 && (
          <li className="px-3 py-8 text-center text-xs text-muted-foreground">No scripts</li>
        )}
        {visible.map(row => {
          const meta = metaOf(row)
          const matches = meta ? scriptMatchesUrl(meta, url) : false
          return (
            <li key={row.id} className="border-b">
              <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(row.id)}>
                  <div className="flex items-baseline gap-2">
                    <span className={cn('text-sm truncate', !row.enabled && 'text-muted-foreground')}>{meta?.name || row.id}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">v{meta?.version || '?'}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {meta?.kind === 'agent' ? 'Agent' : 'User'}
                    {meta ? ` · ${matchLabel(meta.matches)}` : ''}
                    {matches ? ' · this tab' : ''}
                    {meta && meta.unsupported.length > 0 ? ' · unsupported' : ''}
                    {'error' in row ? ` · ${row.error}` : ''}
                  </div>
                </button>
                <EnableSwitch enabled={row.enabled} onClick={() => toggle(row)} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
