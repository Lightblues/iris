import { ArrowUpIcon, CheckIcon, CopyIcon, EllipsisIcon, LogOutIcon, RotateCwIcon, ShareIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'

/** The header's ⋯: back to top (phone), then share, copy, and reload the page, which an installed PWA has no browser bar for, then log out. */
export function PageMenu({ onSignOut, leaving, account }: { onSignOut: () => void; leaving: boolean; account?: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => {
      setOpen(false)
      setCopied(false)
    }, 900)
    return () => clearTimeout(timer)
  }, [copied])
  const canShare = typeof navigator.share === 'function'
  const phone = open && window.matchMedia('(max-width: 639px)').matches

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="More" className="text-muted-foreground">
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {phone ? (
          <>
            <DropdownMenuItem onSelect={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <ArrowUpIcon />
              Back to top
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {canShare ? (
          <DropdownMenuItem onSelect={() => void navigator.share({ title: document.title, url: location.href }).catch(() => {})}>
            <ShareIcon />
            Share…
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            void navigator.clipboard?.writeText(location.href).then(() => setCopied(true), () => setOpen(false))
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Copied' : 'Copy link'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => location.reload()}>
          <RotateCwIcon />
          Reload
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {account ? <DropdownMenuLabel className="font-normal text-muted-foreground">{account}</DropdownMenuLabel> : null}
        <DropdownMenuItem onSelect={onSignOut} disabled={leaving}>
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
