import { applyStringEdit } from './skillStore'

export interface StoredReport {
  id: string
  name: string
  content: string
  updated: number
}

export interface ReportRevision {
  savedAt: number
  content: string
}

const KEY = 'iris_reports'
const HISTORY_KEY = 'iris_report_history'
const HISTORY_CAP = 8
export const REPORT_MAX_BYTES = 64 * 1024
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,40}\.md$/

export function assertReportName(name: string): string {
  if (!NAME_RE.test(name)) {
    throw new Error(`Invalid report name '${name}'. Use lowercase letters, digits, and hyphens ending in .md, such as page-summary.md (max 44 characters).`)
  }
  return name
}

export function reportBytes(content: string): number {
  return new TextEncoder().encode(content).length
}

function assertSize(name: string, content: string): void {
  const bytes = reportBytes(content)
  if (bytes > REPORT_MAX_BYTES) throw new Error(`${name} would be ${bytes} bytes; the limit is ${REPORT_MAX_BYTES}.`)
}

export async function listReports(): Promise<StoredReport[]> {
  const bag = await chrome.storage.local.get(KEY)
  return (bag[KEY] as StoredReport[] | undefined) ?? []
}

export async function getReport(name: string): Promise<StoredReport | undefined> {
  return (await listReports()).find(report => report.name === name)
}

async function readHistory(): Promise<Record<string, ReportRevision[]>> {
  const bag = await chrome.storage.local.get(HISTORY_KEY)
  return (bag[HISTORY_KEY] as Record<string, ReportRevision[]> | undefined) ?? {}
}

export async function listReportHistory(id: string): Promise<ReportRevision[]> {
  return (await readHistory())[id] ?? []
}

async function rememberPrior(id: string, content: string): Promise<void> {
  const all = await readHistory()
  all[id] = [{ savedAt: Date.now(), content }, ...(all[id] ?? [])].slice(0, HISTORY_CAP)
  await chrome.storage.local.set({ [HISTORY_KEY]: all })
}

async function save(rows: StoredReport[], prior: StoredReport | undefined, next: StoredReport): Promise<StoredReport> {
  if (prior && prior.content !== next.content) await rememberPrior(prior.id, prior.content)
  await chrome.storage.local.set({ [KEY]: [...rows.filter(row => row.id !== next.id), next] })
  return next
}

export async function writeReport(name: string, content: string): Promise<StoredReport> {
  assertReportName(name)
  assertSize(name, content)
  const rows = await listReports()
  const prior = rows.find(row => row.name === name)
  return save(rows, prior, { id: prior?.id ?? `r_${crypto.randomUUID()}`, name, content, updated: Date.now() })
}

export async function editReport(name: string, oldString: string, newString: string, replaceAll = false): Promise<StoredReport> {
  assertReportName(name)
  const rows = await listReports()
  const prior = rows.find(row => row.name === name)
  if (!prior) throw new Error(`Report not found: ${name}. Use write_report to create it.`)
  const content = applyStringEdit(prior.content, { path: name, oldString, newString, replaceAll })
  assertSize(name, content)
  return save(rows, prior, { ...prior, content, updated: Date.now() })
}

export async function deleteReport(id: string): Promise<void> {
  const rows = await listReports()
  await chrome.storage.local.set({ [KEY]: rows.filter(row => row.id !== id) })
  const all = await readHistory()
  if (!all[id]) return
  delete all[id]
  await chrome.storage.local.set({ [HISTORY_KEY]: all })
}
