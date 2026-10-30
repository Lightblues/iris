import { createBrowserRouter, Navigate } from 'react-router'
import { NotFound } from '@/app/states.tsx'
import { LandingPage } from '@/landing/landing.tsx'

/** The landing page ships in the entry chunk; login and the app views load on demand. */
export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/login', lazy: () => import('@/app/login.tsx').then((m) => ({ Component: m.LoginPage })) },
  {
    path: '/app',
    lazy: () => import('@/app/shell.tsx').then((m) => ({ Component: m.AppShell })),
    children: [
      { index: true, element: <Navigate to="/app/devices" replace /> },
      { path: 'devices', lazy: () => import('@/app/devices.tsx').then((m) => ({ Component: m.DevicesPage })) },
      { path: '*', element: <Navigate to="/app/devices" replace /> },
    ],
  },
  { path: '*', element: <NotFound /> },
])
