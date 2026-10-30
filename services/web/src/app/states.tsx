import { AlertCircleIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx'
import { ApiError } from '@/lib/api.ts'

export function LoadError({ error, what }: { error: unknown; what: string }) {
  const status = error instanceof ApiError ? error.status : -1
  const text = status === 0
    ? 'The Iris server did not answer. It retries every few seconds.'
    : `The server could not load the ${what}${error instanceof Error ? `: ${error.message}` : '.'}`
  return (
    <Alert variant="destructive" className="max-w-2xl">
      <AlertCircleIcon />
      <AlertTitle>Could not load</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>
}

export function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Nothing here</h1>
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground hover:underline">Back to the home page</Link>
    </div>
  )
}
