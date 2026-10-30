import { useMutation } from '@tanstack/react-query'
import { ActivityIcon, CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon, PlugIcon, UnplugIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { testDevice, type Device } from '@/lib/api.ts'
import { clock, deviceState, duration, LATE_FRAME_MS, reasonText, STATE_LABEL, timeline, UNSTABLE_RECONNECTS } from '@/lib/devices.ts'
import { DEVICES_REFRESH_MS, useDevices, useNow } from '@/lib/queries.ts'
import { ago, fullTime } from '@/lib/time.ts'
import { cn } from '@/lib/utils'
import { Empty, LoadError } from './states.tsx'

const RECENT_EVENTS = 8

export function DevicesPage() {
  const devices = useDevices()
  const now = useNow()
  const list = devices.data?.devices ?? []
  const online = list.filter((d) => d.online).length

  return (
    <section aria-labelledby="devices-title" className="min-w-0">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 id="devices-title" className="text-2xl font-semibold tracking-tight">Devices</h1>
        {devices.data ? (
          <span className="text-sm text-muted-foreground tabular">
            {online} of {list.length} online · history since the server started{' '}
            <span title={fullTime(devices.data.startedAt)}>{ago(devices.data.startedAt, now)}</span> · refreshes every {DEVICES_REFRESH_MS / 1000} s
          </span>
        ) : null}
      </div>
      {devices.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      ) : devices.isError && !devices.data ? (
        <LoadError error={devices.error} what="devices" />
      ) : list.length === 0 ? (
        <Empty>No browser has connected since the server started. Turn on Settings → Remote Relay in Iris, with this server's URL and a device token.</Empty>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {list.map((device) => (
            <li key={device.id} className="min-w-0">
              <DeviceCard device={device} startedAt={devices.data!.startedAt} now={now} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DeviceCard({ device, startedAt, now }: { device: Device; startedAt: number; now: number }) {
  const state = deviceState(device, now)
  const frameAge = now - device.lastSeen
  const offlineSince = device.events.find((e) => e.type === 'disconnect')?.at ?? device.lastSeen
  const test = useMutation({ mutationFn: () => testDevice(device.id) })
  const result = test.data

  return (
    <div data-state={state} className="flex h-full flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight">
            <span className={cn('size-2.5 shrink-0 rounded-full bg-tone', state === 'online' && 'shadow-[0_0_0_3px] shadow-tone/20')} aria-hidden="true" />
            <span className="truncate">{device.label}</span>
          </h2>
          <p className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground" title={device.id}>{device.id}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-tone/12 px-2 py-0.5 text-xs font-medium">
          {STATE_LABEL[state]}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <Meta label="Level">{device.level}</Meta>
        <Meta label="Version">{device.version ?? ''}</Meta>
        <Meta label={device.online ? 'Connected for' : 'Offline for'}>
          {device.online && device.connectedAt ? (
            <span title={fullTime(device.connectedAt)}>{duration(now - device.connectedAt)}</span>
          ) : (
            <span title={fullTime(offlineSince)}>{duration(now - offlineSince)}</span>
          )}
        </Meta>
        <Meta label="Last frame">
          <span className={cn('tabular', device.online && frameAge > LATE_FRAME_MS && 'text-bronze')} title={fullTime(device.lastSeen)}>
            {duration(frameAge)} ago
          </span>
        </Meta>
        <Meta label="Reconnects, 1 h">
          <span className={cn('tabular', device.reconnectsLastHour >= UNSTABLE_RECONNECTS && 'text-bronze')}>{device.reconnectsLastHour}</span>
        </Meta>
        <Meta label="Relay test">
          <span className="flex items-center gap-1.5">
            {test.isPending ? (
              <span className="text-muted-foreground">calling…</span>
            ) : result ? (
              result.ok ? (
                <span className="flex items-center gap-1 text-ok"><CircleCheckIcon className="size-3.5" />{result.ms} ms</span>
              ) : (
                <span className="flex min-w-0 items-center gap-1 text-destructive" title={result.message}>
                  <CircleAlertIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{result.status || 'network'} · {result.message}</span>
                </span>
              )
            ) : (
              <span className="font-normal text-ink-faint">Not run</span>
            )}
          </span>
        </Meta>
      </dl>

      <Timeline device={device} startedAt={startedAt} now={now} />

      <div className="mt-auto flex items-end justify-between gap-4 border-t pt-3">
        <ol className="flex min-w-0 flex-col gap-1 text-[13px]" aria-label="Recent connects and disconnects">
          {device.events.slice(0, RECENT_EVENTS).map((event, i) => (
            <li key={`${event.at}-${i}`} className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 font-mono text-[12px] text-muted-foreground tabular" title={fullTime(event.at)}>{clock(event.at)}</span>
              {event.type === 'connect' ? <PlugIcon className="size-3.5 shrink-0 text-ok" /> : <UnplugIcon className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="shrink-0">{event.type === 'connect' ? 'Connected' : 'Disconnected'}</span>
              {event.reason ? <span className="min-w-0 truncate text-muted-foreground">{reasonText(event.reason)}</span> : null}
            </li>
          ))}
          {device.events.length > RECENT_EVENTS ? <li className="text-muted-foreground">and {device.events.length - RECENT_EVENTS} earlier</li> : null}
        </ol>
        <Button
          variant="outline"
          size="sm"
          onClick={() => test.mutate()}
          disabled={!device.online || test.isPending}
          title={device.online ? 'Run iris.capabilities on this browser' : 'Offline'}
          className="shrink-0"
        >
          {test.isPending ? <LoaderCircleIcon className="animate-spin" /> : <ActivityIcon />}
          Test
        </Button>
      </div>
    </div>
  )
}

/** The last hour as one bar: online, offline, and before the server started. */
function Timeline({ device, startedAt, now }: { device: Device; startedAt: number; now: number }) {
  const spans = timeline(device, startedAt, now)
  return (
    <div>
      <div className="relative flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label="Online over the last hour">
        {spans.map((span, i) => (
          <span
            key={i}
            className={cn(
              'h-full',
              span.kind === 'online' ? 'bg-ok' : span.kind === 'offline' ? 'bg-cold/45' : 'bg-[repeating-linear-gradient(135deg,var(--input)_0_3px,transparent_3px_7px)]',
            )}
            style={{ width: `${(span.to - span.from) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular">
        <span>1 h ago</span>
        <span>30 min</span>
        <span>now</span>
      </div>
    </div>
  )
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === '' || children === null || children === undefined
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium">{empty ? <span className="font-normal text-ink-faint">None</span> : children}</dd>
    </div>
  )
}
