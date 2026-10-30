import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export function Wordmark({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2 rounded-md text-[17px] font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50', className)}>
      <img src="/icon.png" alt="" className="size-6 shrink-0" width={24} height={24} />
      Iris
    </Link>
  )
}
