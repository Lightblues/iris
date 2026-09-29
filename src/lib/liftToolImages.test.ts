import assert from 'node:assert/strict'
import { test } from 'node:test'
import { liftToolImages } from './liftToolImages.ts'
import { rememberScreenshot, screenshotToModelOutput, getScreenshot } from './screenshotStore.ts'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

test('rememberScreenshot stores a short ref, not the data URL', () => {
  const ref = rememberScreenshot(`data:image/png;base64,${PNG}`)
  assert.equal(ref.mediaType, 'image/png')
  assert.ok(ref.imageId)
  assert.ok(ref.bytes > 0)
  assert.equal(getScreenshot(ref.imageId)?.data, PNG)
  const model = screenshotToModelOutput({ captured: true, ...ref })
  assert.equal(model.type, 'content')
  assert.equal(JSON.stringify(model).includes('data:image'), false)
})

test('liftToolImages moves image-data onto a user file part', () => {
  const prompt = [
    { role: 'user', content: [{ type: 'text', text: 'what is on screen?' }] },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'take_screenshot', input: {} }] },
    {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: 'c1',
        toolName: 'take_screenshot',
        output: {
          type: 'content',
          value: [
            { type: 'text', text: 'Viewport screenshot captured (image/png, 70 bytes).' },
            { type: 'image-data', data: PNG, mediaType: 'image/png' },
          ],
        },
      }],
    },
  ]
  const lifted = liftToolImages(prompt)
  assert.equal(lifted.length, 4)
  assert.equal(lifted[2].role, 'tool')
  const toolPart = (lifted[2].content as any[])[0]
  assert.equal(toolPart.output.type, 'text')
  assert.equal(JSON.stringify(toolPart.output).includes(PNG), false)
  assert.equal(lifted[3].role, 'user')
  const user = lifted[3].content as any[]
  assert.equal(user[0].type, 'text')
  assert.equal(user[1].type, 'file')
  assert.equal(user[1].mediaType, 'image/png')
  assert.equal(user[1].data, PNG)
})

test('liftToolImages keeps consecutive tool messages together', () => {
  const prompt = [
    { role: 'assistant', content: [
      { type: 'tool-call', toolCallId: 'a', toolName: 'take_screenshot', input: {} },
      { type: 'tool-call', toolCallId: 'b', toolName: 'read_page', input: {} },
    ] },
    {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: 'a',
        toolName: 'take_screenshot',
        output: { type: 'content', value: [{ type: 'image-data', data: PNG, mediaType: 'image/png' }] },
      }],
    },
    {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: 'b',
        toolName: 'read_page',
        output: { type: 'json', value: { title: 'x' } },
      }],
    },
  ]
  const lifted = liftToolImages(prompt)
  assert.equal(lifted[1].role, 'tool')
  assert.equal(lifted[2].role, 'tool')
  assert.equal(lifted[3].role, 'user')
})
