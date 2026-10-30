const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. */
export function ago(at: number, now = Date.now()): string {
  const diff = Math.max(0, now - at)
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`
  const days = Math.floor(diff / DAY)
  if (days < 14) return days === 1 ? 'yesterday' : `${days} days ago`
  return shortDate(at, now)
}

/** "Oct 27" this year, "Oct 27, 2025" otherwise. */
export function shortDate(at: number, now = Date.now()): string {
  const date = new Date(at)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** Full local date and time, for a `title` tooltip. */
export function fullTime(at: number): string {
  return new Date(at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
