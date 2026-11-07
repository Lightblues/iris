import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanText, isChatPage, normalizeOutline } from './outline'

const h = (tag: string, text: string) => ({ tag, level: Number(tag.slice(1)), text })

test('levels are compressed to 1..n', () => {
  const out = normalizeOutline([h('h2', 'A'), h('h4', 'B'), h('h2', 'C')])
  assert.deepEqual(out.map(i => i.level), [1, 2, 1])
})

test('a leading h1 that repeats the title is dropped', () => {
  const out = normalizeOutline([h('h1', 'Attention Is All You Need'), h('h2', 'Intro'), h('h2', 'Method')], 'Attention Is All You Need | arXiv')
  assert.deepEqual(out.map(i => i.text), ['Intro', 'Method'])
  assert.equal(out[0].level, 1)
})

test('an h1 is kept when other h1s follow or the title differs', () => {
  assert.equal(normalizeOutline([h('h1', 'Part 1'), h('h1', 'Part 2')], 'Part 1').length, 2)
  assert.equal(normalizeOutline([h('h1', 'Guide'), h('h2', 'Setup')], 'Docs').length, 2)
})

test('empty and repeated entries are dropped', () => {
  const out = normalizeOutline([h('h2', ''), h('h2', 'A'), h('h2', 'A'), h('h3', 'A')])
  assert.deepEqual(out.map(i => `${i.tag}:${i.text}`), ['h2:A', 'h3:A'])
})

test('text is collapsed and clipped', () => {
  assert.equal(cleanText('  a\n\n  b '), 'a b')
  assert.equal(cleanText('x'.repeat(300)).length, 140)
})

test('chat platforms are recognised', () => {
  assert.ok(isChatPage('https://chatgpt.com/c/123'))
  assert.ok(isChatPage('https://chat.deepseek.com/a/chat/s/1'))
  assert.ok(isChatPage('https://gemini.google.com/app/abc'))
  assert.ok(!isChatPage('https://github.com/'))
})
