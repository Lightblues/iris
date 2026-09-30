/**
 * Live Exa search check.
 *
 * Usage:
 *   EXA_API_KEY=... pnpm exec tsx scripts/test-web-search.ts "AI SDK 6 ToolLoopAgent"
 */
import { searchExa } from '../src/lib/webSearch.ts'

const query = process.argv.slice(2).join(' ').trim() || 'AI SDK 6 ToolLoopAgent'
const apiKey = process.env.EXA_API_KEY || ''

async function main() {
  if (!apiKey) {
    console.error('Set EXA_API_KEY to run the live web search check')
    process.exit(2)
  }
  const results = await searchExa(query, { numResults: 5 }, { apiKey })
  if (results.length === 0) {
    console.error('No results')
    process.exit(1)
  }
  for (const row of results) {
    console.log(JSON.stringify({
      title: row.title,
      url: row.url,
      publishedDate: row.publishedDate,
      text: row.text,
    }, null, 2))
  }
  const first = results[0]
  if (!first.title || !first.url || !first.text) {
    console.error('Result missing title, url, or text')
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
