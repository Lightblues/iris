import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  deleteSkill,
  listSkillHistory,
  listSkills,
  setSkillEnabled,
  type SkillAuthor,
  type SkillRevision,
  type StoredSkill,
} from '@/lib/skillStore'

type Filter = 'all' | SkillAuthor

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString()
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

export function SkillsTab() {
  const [rows, setRows] = useState<StoredSkill[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [history, setHistory] = useState<SkillRevision[]>([])
  const [preview, setPreview] = useState<SkillRevision | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = async () => {
    setRows(await listSkills())
  }

  useEffect(() => { refresh().catch(err => setError(err.message)) }, [])

  const selected = rows.find(row => row.name === selectedName) ?? null

  useEffect(() => {
    if (!selectedName) return
    setPreview(null)
    listSkillHistory(selectedName).then(setHistory).catch(err => setError(err.message))
  }, [selectedName])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...rows]
      .filter(row => {
        if (filter !== 'all' && row.author !== filter) return false
        if (!q) return true
        return `${row.name} ${row.description}`.toLowerCase().includes(q)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, filter, query])

  const toggle = async (row: StoredSkill) => {
    try {
      await setSkillEnabled(row.name, !row.enabled)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (selected) {
    const showing = preview?.files['SKILL.md'] ?? selected.files['SKILL.md'] ?? ''
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <button type="button" onClick={() => setSelectedName(null)} className="flex items-center gap-1 text-sm font-medium hover:text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Skills
          </button>
          <div className="flex-1" />
          <EnableSwitch enabled={selected.enabled} onClick={() => toggle(selected)} />
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-3 py-3 space-y-3">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-medium truncate">{selected.name}</h2>
              <span className="text-[10px] text-muted-foreground shrink-0">{selected.author}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{selected.description}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
              navigator.clipboard.writeText(showing).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1200)
              })
            }}>
              <Copy className="h-3 w-3 mr-1" />{copied ? 'Copied' : 'Copy'}
            </Button>
            {selected.author !== 'builtin' && (
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
                if (!confirm(`Delete ${selected.name}?`)) return
                deleteSkill(selected.name).then(() => { setSelectedName(null); return refresh() }).catch(err => setError(err.message))
              }}>
                <Trash2 className="h-3 w-3 mr-1" />Delete
              </Button>
            )}
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
                  current
                </button>
              </li>
              {history.map(rev => (
                <li key={rev.savedAt}>
                  <button
                    type="button"
                    className={cn('w-full text-left px-2 py-1.5 hover:bg-muted/60', preview?.savedAt === rev.savedAt && 'bg-muted/40')}
                    onClick={() => setPreview(rev)}
                  >
                    {formatWhen(rev.savedAt)}
                  </button>
                </li>
              ))}
              {history.length === 0 && (
                <li className="px-2 py-1.5 text-muted-foreground">No earlier copy. One is kept when this skill is replaced.</li>
              )}
            </ul>
          </section>
          <section className="space-y-1">
            <h3 className="text-xs font-medium">{preview ? 'Preview' : 'SKILL.md'}</h3>
            <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-2 max-h-[50vh] overflow-auto">{showing}</pre>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-2 space-y-2 border-b">
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search skills" className="h-8 text-xs" />
        <div className="flex gap-1">
          {(['all', 'builtin', 'user', 'agent'] as Filter[]).map(id => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                'px-2 py-0.5 text-[11px] rounded-full border capitalize',
                filter === id ? 'bg-foreground text-background border-foreground' : 'text-muted-foreground',
              )}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
      <ul className="flex-1 min-h-0 overflow-auto">
        {visible.length === 0 && (
          <li className="px-3 py-8 text-center text-xs text-muted-foreground">No skills</li>
        )}
        {visible.map(row => (
          <li key={row.name} className="border-b">
            <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedName(row.name)}>
                <div className="flex items-baseline gap-2">
                  <span className={cn('text-sm truncate', !row.enabled && 'text-muted-foreground')}>/{row.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{row.author}</span>
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{row.description}</div>
              </button>
              <EnableSwitch enabled={row.enabled} onClick={() => toggle(row)} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
