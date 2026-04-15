/**
 * Test script: connect to MCP server, list tools, then run a paper agent query.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-... npx tsx scripts/test-paper-agent.ts [query]
 */
import { createMCPClient } from '@ai-sdk/mcp'
import { createOpenAI } from '@ai-sdk/openai'
import { ToolLoopAgent, stepCountIs } from 'ai'

const MCP_URL = process.env.MCP_URL || 'http://localhost:8000/mcp'
const API_KEY = process.env.OPENROUTER_API_KEY || ''
const MODEL = process.env.MODEL || 'anthropic/claude-3.5-sonnet'

async function main() {
  if (!API_KEY) {
    console.error('Set OPENROUTER_API_KEY environment variable')
    process.exit(1)
  }

  // 1. Connect MCP
  console.log('--- Connecting MCP:', MCP_URL)
  const transportType = MCP_URL.endsWith('/sse') ? 'sse' as const : 'http' as const
  console.log('    Transport type:', transportType)

  const client = await createMCPClient({ transport: { type: transportType, url: MCP_URL } })
  console.log('--- MCP connected')

  const tools = await client.tools()
  const toolNames = Object.keys(tools)
  console.log('--- Tools discovered:', toolNames.length)
  toolNames.forEach(t => console.log('   ', t))

  // 2. Create agent
  const provider = createOpenAI({
    apiKey: API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: { 'HTTP-Referer': 'https://test.local', 'X-Title': 'Iris-Test' },
  })

  const agent = new ToolLoopAgent({
    id: 'test-paper-agent',
    model: provider.chat(MODEL),
    instructions: 'You are a helpful research assistant with access to tools for searching and reading academic papers.',
    tools,
    stopWhen: stepCountIs(5),
    onStepFinish(event) {
      console.log(`\n--- Step (reason: ${event.finishReason})`)
      if (event.toolCalls && event.toolCalls.length > 0) {
        for (const tc of event.toolCalls) {
          console.log('    Tool:', tc.toolName, JSON.stringify(tc.args ?? tc).slice(0, 150))
        }
      }
      if (event.text) console.log('    Text:', event.text.slice(0, 300))
    },
  })

  // 3. Run a query
  const query = process.argv[2] || 'Search for recent papers about "chain of thought prompting" on arxiv and give me the title and abstract of the top result.'
  console.log('\n--- Query:', query)
  console.log('--- Running agent...\n')

  const result = await agent.generate({ prompt: query })

  console.log('\n=== Final Response ===')
  console.log(result.text)
  console.log('\n=== Usage ===')
  console.log(JSON.stringify(result.usage, null, 2))
  console.log('Steps:', result.steps.length)

  // Cleanup
  await client.close()
  console.log('\n--- Done')
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
