import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSnapshot } from './tabMirror'

const tab = (url: string, extra: Partial<chrome.tabs.Tab> = {}) => ({ url, title: url, groupId: -1, incognito: false, pinned: false, ...extra }) as chrome.tabs.Tab

test('snapshot keeps web tabs of normal windows, with group labels, and never incognito', () => {
  const windows = [
    { id: 1, focused: true, incognito: false, type: 'normal', tabs: [
      tab('https://a.example/x', { groupId: 7, favIconUrl: 'https://a.example/f.ico', pinned: true }),
      tab('chrome://newtab/'),
      tab('https://b.example/', { favIconUrl: 'data:image/png;base64,AAAA' }),
    ] },
    { id: 2, focused: false, incognito: true, type: 'normal', tabs: [tab('https://secret.example/')] },
    { id: 3, focused: false, incognito: false, type: 'popup', tabs: [tab('https://popup.example/')] },
    { id: 4, focused: false, incognito: false, type: 'normal', tabs: [tab('chrome://settings/')] },
  ] as chrome.windows.Window[]
  const groups = [{ id: 7, title: 'Papers', color: 'blue' }] as chrome.tabGroups.TabGroup[]
  const snap = buildSnapshot(windows, groups, 'work', 5)
  assert.deepEqual(snap, {
    label: 'work',
    at: 5,
    windows: [{ focused: true, tabs: [
      { title: 'https://a.example/x', url: 'https://a.example/x', favIconUrl: 'https://a.example/f.ico', pinned: true, group: { title: 'Papers', color: 'blue' } },
      { title: 'https://b.example/', url: 'https://b.example/' },
    ] }],
  })
})
