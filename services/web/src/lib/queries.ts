import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { fetchDevices, fetchMe } from './api.ts'

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 60_000 })

export const DEVICES_REFRESH_MS = 3000

export const useDevices = () =>
  useQuery({ queryKey: ['devices'], queryFn: fetchDevices, refetchInterval: DEVICES_REFRESH_MS, refetchIntervalInBackground: false, staleTime: 0 })

/** The current time, ticking every `ms`, so ages stay live between refreshes. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(timer)
  }, [ms])
  return now
}
