export interface SyncTombstone {
  id: string
  deletedAt: number
}

interface SyncRecord {
  id: string
  lastUpdated: number
}

const MAX_TOMBSTONES = 500

/** Newer lastUpdated wins. A tombstone deletes the record only when deletedAt is greater. */
export function mergeConversations<T extends SyncRecord>(
  local: T[],
  localTombstones: SyncTombstone[],
  incoming: T[],
  incomingTombstones: SyncTombstone[],
): { conversations: T[]; tombstones: SyncTombstone[] } {
  const convs = new Map<string, T>()
  for (const conv of local) {
    if (conv?.id) convs.set(conv.id, conv)
  }
  const tombs = new Map<string, number>()
  const addTomb = (tomb: SyncTombstone) => {
    if (!tomb?.id || typeof tomb.deletedAt !== 'number') return
    const prev = tombs.get(tomb.id) ?? 0
    if (tomb.deletedAt > prev) tombs.set(tomb.id, tomb.deletedAt)
  }
  for (const tomb of localTombstones) addTomb(tomb)
  for (const tomb of incomingTombstones) addTomb(tomb)

  const consider = (conv: T) => {
    if (!conv?.id || typeof conv.lastUpdated !== 'number') return
    const deletedAt = tombs.get(conv.id) ?? 0
    if (deletedAt > conv.lastUpdated) {
      convs.delete(conv.id)
      return
    }
    if (deletedAt) tombs.delete(conv.id)
    const prev = convs.get(conv.id)
    if (!prev || conv.lastUpdated > prev.lastUpdated) convs.set(conv.id, conv)
  }
  for (const conv of incoming) consider(conv)

  for (const [id, deletedAt] of [...tombs]) {
    const conv = convs.get(id)
    if (!conv) continue
    if (deletedAt > conv.lastUpdated) convs.delete(id)
    else tombs.delete(id)
  }

  const tombstones = [...tombs.entries()]
    .map(([id, deletedAt]) => ({ id, deletedAt }))
    .sort((a, b) => b.deletedAt - a.deletedAt)
    .slice(0, MAX_TOMBSTONES)
  const conversations = [...convs.values()].sort((a, b) => b.lastUpdated - a.lastUpdated)
  return { conversations, tombstones }
}
