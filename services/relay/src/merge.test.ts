import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeConversations } from '../../../src/agent/conversationSync.ts'
import { remoteExtensionUrl, remoteHttpOrigin } from '../../../src/lib/remoteRelayUrl.ts'

const conv = (id: string, lastUpdated: number) => ({ id, lastUpdated, title: id })

test('newer remote conversation replaces the local one', () => {
  const merged = mergeConversations(
    [conv('a', 1)],
    [],
    [conv('a', 2)],
    [],
  )
  assert.equal(merged.conversations[0].lastUpdated, 2)
  assert.deepEqual(merged.tombstones, [])
})

test('older remote conversation is ignored', () => {
  const merged = mergeConversations([conv('a', 5)], [], [conv('a', 4)], [])
  assert.equal(merged.conversations[0].lastUpdated, 5)
})

test('equal lastUpdated keeps the local record', () => {
  const local = { ...conv('a', 5), title: 'local' }
  const remote = { ...conv('a', 5), title: 'remote' }
  const merged = mergeConversations([local], [], [remote], [])
  assert.equal(merged.conversations[0].title, 'local')
})

test('a newer tombstone deletes the conversation', () => {
  const merged = mergeConversations([conv('a', 5)], [], [], [{ id: 'a', deletedAt: 6 }])
  assert.deepEqual(merged.conversations, [])
  assert.deepEqual(merged.tombstones, [{ id: 'a', deletedAt: 6 }])
})

test('a newer body drops the tombstone', () => {
  const merged = mergeConversations(
    [],
    [{ id: 'a', deletedAt: 4 }],
    [conv('a', 9)],
    [],
  )
  assert.equal(merged.conversations.length, 1)
  assert.deepEqual(merged.tombstones, [])
})

test('remote extension url', () => {
  assert.equal(remoteExtensionUrl('https://iris.example'), 'wss://iris.example/extension')
  assert.equal(remoteExtensionUrl('wss://iris.example/extension'), 'wss://iris.example/extension')
  assert.equal(remoteHttpOrigin('wss://iris.example/extension'), 'https://iris.example')
  assert.equal(remoteExtensionUrl('ftp://iris.example'), null)
})
