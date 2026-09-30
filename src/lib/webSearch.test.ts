import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listAgentTools } from './agentToolCatalog.ts'
import { TOOL_GROUPS } from './scriptTools.ts'
import { searchExa } from './webSearch.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('searchExa posts query, count, and contents to Exa', async () => {
  let captured: { url: string; init: RequestInit } | undefined
  const fetchImpl: typeof fetch = async (url, init) => {
    captured = { url: String(url), init: init ?? {} }
    return jsonResponse({
      results: [{ title: 'Widgets', url: 'https://example.com/w', publishedDate: '2026-01-02', text: 'short' }],
    })
  }
  const results = await searchExa('widgets', { numResults: 3 }, { apiKey: 'exa-test-key', fetch: fetchImpl })
  assert.equal(captured?.url, 'https://api.exa.ai/search')
  assert.equal((captured?.init.method || '').toUpperCase(), 'POST')
  const headers = new Headers(captured?.init.headers)
  assert.equal(headers.get('x-api-key'), 'exa-test-key')
  assert.equal(headers.get('content-type'), 'application/json')
  assert.deepEqual(JSON.parse(String(captured?.init.body)), {
    query: 'widgets',
    numResults: 3,
    type: 'auto',
    contents: { text: true },
  })
  assert.deepEqual(results, [{
    title: 'Widgets',
    url: 'https://example.com/w',
    publishedDate: '2026-01-02',
    text: 'short',
  }])
  assert.equal(JSON.stringify(results).includes('exa-test-key'), false)
})

test('searchExa maps hits and cuts text to 1000 characters', async () => {
  const fetchImpl: typeof fetch = async () => jsonResponse({
    results: [{
      title: 'Long',
      url: 'https://example.com/long',
      text: 'x'.repeat(1400),
      extra: 'drop me',
    }],
  })
  const [row] = await searchExa('q', { numResults: 1 }, { apiKey: 'k', fetch: fetchImpl })
  assert.equal(row.title, 'Long')
  assert.equal(row.url, 'https://example.com/long')
  assert.equal(row.publishedDate, '')
  assert.equal(row.text.length, 1000)
  assert.equal(row.text, 'x'.repeat(1000))
  assert.equal(JSON.stringify(row).includes('drop me'), false)
})

test('searchExa tells the user where to set a missing key', async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error('should not fetch')
  }
  await assert.rejects(
    () => searchExa('q', {}, { apiKey: '   ', fetch: fetchImpl }),
    /Settings → Web Search/,
  )
})

test('searchExa includes the HTTP status and Exa message', async () => {
  const fetchImpl: typeof fetch = async () => jsonResponse({ error: 'Invalid API key' }, 401)
  await assert.rejects(
    () => searchExa('q', { numResults: 5 }, { apiKey: 'exa-test-key', fetch: fetchImpl }),
    (err: unknown) => {
      assert.match(String((err as Error).message), /Exa search failed \(401\): Invalid API key/)
      assert.equal(String((err as Error).message).includes('exa-test-key'), false)
      return true
    },
  )
})

test('web_search is a core catalog tool', () => {
  const tool = listAgentTools().find(item => item.name === 'web_search')
  assert.ok(tool)
  assert.equal(tool.group, 'search')
  assert.equal(tool.needsTab, false)
  const schema = tool.inputSchema as { required?: string[]; properties?: Record<string, { type?: string }> }
  assert.deepEqual(schema.required, ['query'])
  assert.equal(schema.properties?.query?.type, 'string')
  assert.equal(schema.properties?.numResults?.type, 'number')
  assert.equal(TOOL_GROUPS.core.includes('web_search'), true)
})
