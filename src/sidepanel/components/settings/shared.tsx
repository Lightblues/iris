export function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <h3 className="flex items-baseline justify-between text-sm font-semibold pb-1 mb-3 border-b">
      {title}
      {note && <span className="text-[10px] font-normal text-muted-foreground">{note}</span>}
    </h3>
  )
}

export function SubHeader({ title, note }: { title: string; note?: string }) {
  return (
    <h4 className="flex items-baseline justify-between text-xs font-semibold">
      {title}
      {note && <span className="text-[10px] font-normal text-muted-foreground">{note}</span>}
    </h4>
  )
}

export const NOT_SYNCED = 'not synced'

export type RelayStatusKind = 'checking' | 'connected' | 'disconnected'
