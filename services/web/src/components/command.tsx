import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { cn } from '@/lib/utils'

/** A command that wraps between words, so `--key-stdin` never splits at its hyphen; only a long URL breaks inside. */
export function CommandText({ command }: { command: string }) {
  const words = command.split(' ')
  return (
    <>
      {words.map((word, i) => (
        <span key={i}>
          <span className={word.length > 32 ? 'break-all' : 'whitespace-nowrap'}>{word}</span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </>
  )
}

/** A shell command with a copy button. Long commands wrap instead of overflowing on a phone. */
export function CommandLine({ command, className }: { command: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () => {
    void navigator.clipboard?.writeText(command).then(() => setCopied(true), () => {})
  }
  return (
    <div className={cn('flex min-h-11 items-start gap-2 rounded-lg border bg-card py-1 pr-1 pl-3 font-mono text-[13px] sm:text-sm', className)}>
      <span className="pt-[7px] text-ink-faint select-none" aria-hidden="true">$</span>
      <code className="min-w-0 flex-1 pt-[7px] pb-1 leading-5">
        <CommandText command={command} />
      </code>
      <Button type="button" variant="ghost" size="icon" onClick={copy} aria-label={copied ? 'Copied' : 'Copy command'} className="shrink-0 text-muted-foreground">
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  )
}
