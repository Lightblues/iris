import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasAgentTool, listAgentTools } from './agentToolCatalog.ts'
import { decodeEvalResult, evalSource, evalUserCode, isEvalCspBlock } from './pageTools.ts'

test('eval runs a function body, a bare expression, and a thrown error', async () => {
  assert.deepEqual(await evalUserCode('return 1 + 1'), { result: '2' })
  assert.deepEqual(await evalUserCode('1 + 1'), { result: '2' })
  assert.deepEqual(await evalUserCode('return "hi"'), { result: '"hi"' })
  const thrown = await evalUserCode('throw new Error("nope")')
  assert.equal(thrown.error, 'nope')
  const syntax = await evalUserCode('return {')
  assert.match(syntax.error ?? '', /Unexpected|Invalid|expected/i)
})

test('csp failures are not reported as syntax errors', () => {
  const chrome = "Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive: \"script-src github.githubassets.com\""
  assert.equal(isEvalCspBlock(chrome), true)
  assert.equal(isEvalCspBlock('The code did not parse. Check for a syntax error.'), false)
  assert.equal(isEvalCspBlock('Cannot read properties of null'), false)
})

test('page script returns console-like values as JSON', async () => {
  const run = async (body: string, asExpression: boolean) => {
    const raw = await new Function(`return ${evalSource(body, asExpression)}`)()
    return decodeEvalResult(raw)
  }
  assert.deepEqual(await run('1 + 1', true), { result: '2' })
  assert.deepEqual(await run('return "hi"', false), { result: '"hi"' })
  assert.deepEqual(await run('return function foo() {}', false), { result: JSON.stringify({ function: 'foo' }) })
  assert.deepEqual(await run('throw new Error("nope")', false), { error: 'nope' })
  assert.throws(() => new Function(evalSource('return {', false)), /SyntaxError|Unexpected|Invalid/)
})

test('evaluate_js is an alias of eval, not a second tool', () => {
  const names = listAgentTools().map(tool => tool.name)
  assert.equal(names.filter(name => name === 'eval').length, 1)
  assert.equal(names.includes('evaluate_js'), false)
  assert.equal(hasAgentTool('evaluate_js'), true)
  assert.equal(hasAgentTool('eval'), true)
})
