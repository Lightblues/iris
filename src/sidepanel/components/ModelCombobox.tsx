import { useState, useRef, useEffect, useCallback } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModelConfig } from '@/lib/sidepanelSettings'

interface ModelComboboxProps {
  models: ModelConfig[]
  favourites: string[]
  value: string
  onChange: (modelId: string) => void
  className?: string
}

/**
 * Searchable model selector with favourites-first ordering.
 * Compact enough for the ChatHeader bar.
 */
export function ModelCombobox({ models, favourites, value, onChange, className }: ModelComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const favSet = new Set(favourites)

  // Filter and sort: favourites first, then rest, both filtered by query
  const filtered = getFilteredModels(models, favourites, query)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Reset highlight when query changes
  useEffect(() => {
    setHighlightIndex(0)
  }, [query])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlightIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex, open])

  const handleSelect = useCallback((modelId: string) => {
    onChange(modelId)
    setOpen(false)
    setQuery('')
  }, [onChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightIndex(i => Math.min(i + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[highlightIndex]) {
          handleSelect(filtered[highlightIndex].id)
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        setQuery('')
        break
    }
  }

  // Display label for the current value
  const activeModel = models.find(m => m.id === value)
  const displayLabel = activeModel
    ? formatModelShort(activeModel.id)
    : formatModelShort(value)

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger / Search input */}
      <div
        className={cn(
          'flex items-center h-7 min-w-[90px] max-w-[160px] border rounded px-2 text-[11px] cursor-pointer bg-background hover:bg-accent/50 transition-colors',
          open && 'ring-1 ring-ring',
        )}
        onClick={() => {
          setOpen(true)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
      >
        {open ? (
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search models..."
            className="w-full bg-transparent outline-none text-[11px] placeholder:text-muted-foreground/50"
            autoFocus
          />
        ) : (
          <span className="truncate">{displayLabel}</span>
        )}
      </div>

      {/* Dropdown list */}
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 top-full left-0 mt-1 w-[280px] max-h-[300px] overflow-y-auto rounded-md border bg-popover shadow-md"
        >
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {models.length === 0 ? 'No models loaded — fetch in Settings' : 'No matches'}
            </div>
          )}
          {filtered.map((model, i) => {
            const isFav = favSet.has(model.id)
            const isActive = model.id === value
            const isHighlighted = i === highlightIndex
            return (
              <div
                key={model.id}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1.5 text-xs cursor-pointer transition-colors',
                  isHighlighted && 'bg-accent',
                  isActive && 'font-medium',
                )}
                onMouseEnter={() => setHighlightIndex(i)}
                onClick={() => handleSelect(model.id)}
              >
                {isFav && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />}
                <span className={cn('truncate', isFav ? 'font-medium' : 'text-muted-foreground')}>
                  {model.id}
                </span>
                {isActive && <span className="ml-auto text-[10px] text-primary shrink-0">●</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Helpers ---

/** Filter models by query (case-insensitive substring), favourites first.
 *  Favourites always appear even if not in the fetched models list. */
function getFilteredModels(
  models: ModelConfig[],
  favourites: string[],
  query: string,
): ModelConfig[] {
  const q = query.toLowerCase()
  const modelMap = new Map(models.map(m => [m.id, m]))

  // Build favourite models list (include even if not in fetched models)
  const favModels: ModelConfig[] = favourites
    .filter(id => !q || id.toLowerCase().includes(q))
    .map(id => modelMap.get(id) ?? { id, name: id })

  // Rest: fetched models that are not favourites
  const favSet = new Set(favourites)
  const restModels = models
    .filter(m => !favSet.has(m.id) && (!q || m.id.toLowerCase().includes(q)))

  return [...favModels, ...restModels]
}

/** Shorten model ID for display: 'anthropic/claude-3.5-sonnet' → 'claude-3.5-sonnet' */
function formatModelShort(id: string): string {
  const parts = id.split('/')
  return parts.length > 1 ? parts.slice(1).join('/') : id
}
