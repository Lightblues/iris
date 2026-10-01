import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { listAgentTools } from './agentToolCatalog.ts'
import { bindAgentTools } from './bindAgentTools.ts'
import { editReport, getReport, listReportHistory, REPORT_MAX_BYTES, writeReport } from './reportStore.ts'

let store: Record<string, unknown> = {}
;(globalThis as any).chrome = {
  storage: {
    local: {
      async get(key: string) { return key in store ? { [key]: structuredClone(store[key]) } : {} },
      async set(items: Record<string, unknown>) { Object.assign(store, structuredClone(items)) },
    },
  },
}

beforeEach(() => { store = {} })

test('write_report creates a report', async () => {
  const report = await writeReport('page-summary.md', '# Title\n\nBody\n')
  assert.match(report.id, /^r_/)
  assert.equal((await getReport('page-summary.md'))?.content, '# Title\n\nBody\n')
  assert.deepEqual(await listReportHistory(report.id), [])
})

test('edit_report replaces a unique match and snapshots the prior text', async () => {
  const { id } = await writeReport('a.md', '## One\nold\n## Two\nkeep\n')
  await editReport('a.md', 'old', 'new')
  assert.equal((await getReport('a.md'))?.content, '## One\nnew\n## Two\nkeep\n')
  const history = await listReportHistory(id)
  assert.equal(history.length, 1)
  assert.equal(history[0].content, '## One\nold\n## Two\nkeep\n')
})

test('edit_report rejects an ambiguous match, names the report, and leaves content unchanged', async () => {
  await writeReport('dup.md', 'x\nx\n')
  await assert.rejects(() => editReport('dup.md', 'x', 'y'), /matches 2 times in dup\.md/)
  assert.equal((await getReport('dup.md'))?.content, 'x\nx\n')
})

test('edit_report with replace_all replaces every match', async () => {
  await writeReport('all.md', 'x\nx\n')
  await editReport('all.md', 'x', 'y', true)
  assert.equal((await getReport('all.md'))?.content, 'y\ny\n')
})

test('edit_report on an unknown name throws', async () => {
  await assert.rejects(() => editReport('missing.md', 'a', 'b'), /Report not found: missing\.md/)
})

test('oversize content is rejected on write and edit', async () => {
  await assert.rejects(() => writeReport('big.md', 'x'.repeat(REPORT_MAX_BYTES + 1)), /limit is 65536/)
  await writeReport('near.md', 'x'.repeat(REPORT_MAX_BYTES - 1) + 'y')
  await assert.rejects(() => editReport('near.md', 'y', 'yy'), /limit is 65536/)
  assert.equal((await getReport('near.md'))?.content.length, REPORT_MAX_BYTES)
})

test('invalid names are rejected', async () => {
  for (const name of ['Report.md', 'report', '-a.md', '../x.md', 'a b.md', `${'a'.repeat(42)}.md`]) {
    await assert.rejects(() => writeReport(name, 'x'), /Invalid report name/, name)
  }
})

test('history keeps 8 revisions', async () => {
  const { id } = await writeReport('h.md', 'v0')
  for (let i = 1; i <= 10; i++) await writeReport('h.md', `v${i}`)
  const history = await listReportHistory(id)
  assert.equal(history.length, 8)
  assert.equal(history[0].content, 'v9')
})

test('report, tab, and automation tools are catalog tools with no attach step', () => {
  const names = ['list_reports', 'read_report', 'write_report', 'edit_report', 'create_tab_group', 'click']
  const listed = listAgentTools()
  for (const name of names) assert.ok(listed.some(tool => tool.name === name), name)
  const reports = listed.filter(tool => ['list_reports', 'read_report', 'write_report', 'edit_report'].includes(tool.name))
  assert.equal(reports.length, 4)
  assert.ok(reports.every(tool => tool.group === 'reports' && !tool.needsTab))

  const tools = bindAgentTools(() => 1)
  for (const name of names) assert.ok(name in tools, name)
})
