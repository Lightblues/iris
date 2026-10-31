import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircleIcon, LoaderCircleIcon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Wordmark } from '@/components/wordmark.tsx'
import { login, loginErrorMessage } from '@/lib/api.ts'
import { useMe } from '@/lib/queries.ts'

/** Only same-site app paths, so a crafted link cannot send the user elsewhere after login. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/app') && !value.startsWith('//') ? value : '/app/devices'
}

export function LoginPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useMe()
  const [key, setKey] = useState('')
  const inputId = useId()
  const errorId = useId()
  const attempt = useMutation({
    mutationFn: login,
    onSuccess: (result) => {
      setKey('')
      queryClient.setQueryData(['me'], result)
      void navigate(next, { replace: true })
    },
  })

  if (me.data?.loggedIn && !attempt.isPending) return <Navigate to={next} replace />

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (attempt.isPending) return
    attempt.mutate(key.trim())
  }
  const error = attempt.isError ? loginErrorMessage(attempt.error) : null

  return (
    <div className="flex min-h-dvh flex-col px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-8">
      <header className="mx-auto w-full max-w-6xl">
        <Wordmark />
      </header>
      <main className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Log in to your browsers</h1>
          <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
            Paste a read or control key, the one sonar uses. The server answers with a session cookie that lasts 30 days and ends when the key is revoked; this page does not keep the key.
          </p>
          <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor={inputId}>Read or control key</Label>
              <Input
                id={inputId}
                type="password"
                name="iris-key"
                value={key}
                onChange={(event) => {
                  setKey(event.target.value)
                  if (attempt.isError) attempt.reset()
                }}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
                placeholder="IRIS_READ_KEY, or one from pnpm run token add"
              />
            </div>
            {error ? (
              <Alert variant="destructive" id={errorId}>
                <AlertCircleIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" size="lg" disabled={!key.trim() || attempt.isPending} className="h-10">
              {attempt.isPending ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : null}
              {attempt.isPending ? 'Logging in…' : 'Log in'}
            </Button>
          </form>
          <p className="mt-8 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground hover:underline">Back to the home page</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
