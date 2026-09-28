import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { describeScripts, deleteScript, setScriptEnabled, writeScript, scriptRegisterError, type ScriptRecord } from '@/lib/scriptStore'
import { scriptMatchesUrl } from '@/lib/scriptMeta'

type Row = ScriptRecord | { id: string; source: string; enabled: boolean; error: string }

export function ScriptLibrary() {
  const [rows, setRows] = useState<Row[]>([])
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

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

  const ordered = [...rows].sort((a, b) => {
    const am = 'meta' in a && scriptMatchesUrl(a.meta, url) ? 0 : 1
    const bm = 'meta' in b && scriptMatchesUrl(b.meta, url) ? 0 : 1
    return am - bm
  })

  return (
    <div className="space-y-2">
      {runtimeError && <p className="text-xs text-destructive">{runtimeError}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[10px] text-muted-foreground">
        Standard <code>.user.js</code> and <code>.agent.js</code> files. Matching the current tab are listed first. Allow user scripts must be on for them to run.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => refresh()}>Refresh</Button>
        <label className="text-xs">
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
          <span className="inline-flex h-8 items-center rounded-md border px-3 cursor-pointer">Import</span>
        </label>
      </div>
      <ul className="space-y-2">
        {ordered.map(row => {
          const meta = 'meta' in row ? row.meta : null
          const matches = meta ? scriptMatchesUrl(meta, url) : false
          return (
            <li key={row.id} className="border rounded-md p-2 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{meta?.name || row.id}</span>
                <span className="text-muted-foreground shrink-0">{meta?.kind === 'agent' ? 'agent' : 'user'}{matches ? ' · this tab' : ''}</span>
              </div>
              {'error' in row && <p className="text-destructive">{row.error}</p>}
              {meta && meta.unsupported.length > 0 && (
                <p className="text-amber-600">Unsupported: {meta.unsupported.join(', ')}</p>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setScriptEnabled(row.id, !row.enabled).then(refresh)}>
                  {row.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(row.source)}>Export</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => deleteScript(row.id).then(refresh)}>Delete</Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
