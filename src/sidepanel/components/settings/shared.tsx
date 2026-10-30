export function SectionHeader({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold pb-1 mb-3 border-b">{title}</h3>
}

export type RelayStatusKind = 'checking' | 'connected' | 'disconnected'
