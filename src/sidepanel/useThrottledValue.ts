import { useEffect, useRef, useState } from 'react'

/** While `active`, publish `value` at most `fps` times per second. Always show the latest value immediately when `active` is false. */
export function useThrottledValue<T>(value: T, active: boolean, fps = 16): T {
  const [shown, setShown] = useState(value)
  const latest = useRef(value)
  const lastFlush = useRef(0)
  latest.current = value

  useEffect(() => {
    if (!active) {
      setShown(value)
      return
    }
    const minDelta = 1000 / fps
    const elapsed = performance.now() - lastFlush.current
    const flush = () => {
      lastFlush.current = performance.now()
      setShown(latest.current)
    }
    if (elapsed >= minDelta) {
      flush()
      return
    }
    const timer = setTimeout(flush, minDelta - elapsed)
    return () => clearTimeout(timer)
  }, [value, active, fps])

  return active ? shown : value
}
