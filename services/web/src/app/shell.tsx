import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { PageMenu } from '@/components/page-menu.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Wordmark } from '@/components/wordmark.tsx'
import { logout } from '@/lib/api.ts'
import { useMe } from '@/lib/queries.ts'

/** Every /app page: logged-out visits go to /login and come back here afterwards. */
export function AppShell() {
  const me = useMe()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [leaving, setLeaving] = useState(false)

  if (me.data && !me.data.loggedIn) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }

  const signOut = async () => {
    setLeaving(true)
    await logout().catch(() => {})
    queryClient.clear()
    queryClient.setQueryData(['me'], { loggedIn: false })
    void navigate('/', { replace: true })
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b pt-[env(safe-area-inset-top)] bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark to="/app/devices" />
          <div className="flex items-center gap-1">
            <NavLink
              to="/app/devices"
              className={({ isActive }) => `rounded-md px-3 py-1.5 text-sm hover:text-foreground ${isActive ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
            >
              Devices
            </NavLink>
            {me.data?.user ? (
              <span className="hidden px-2 text-sm text-muted-foreground sm:inline">
                {me.data.user} · {me.data.level}
              </span>
            ) : null}
            <PageMenu onSignOut={() => void signOut()} leaving={leaving} account={me.data?.user ? `${me.data.user} · ${me.data.level}` : undefined} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pt-6 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-8">
        {me.data?.loggedIn ? (
          <Outlet />
        ) : me.isError ? (
          <p className="py-16 text-muted-foreground">The Iris server did not answer. Reload the page to try again.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
      </main>
    </div>
  )
}
