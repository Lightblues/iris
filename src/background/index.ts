import { initSidePanel } from './sidePanel';
import { initBrowserRelay } from './browserRelay';
import { initRemoteRelay } from './remoteRelay';
import { initSelfUpdate } from './selfUpdate';
import { initKeepalive } from './keepalive';
import { initContextMenus, setupContextMenus } from './contextMenus';
import { initShortcuts } from './commands';
import { initAlarms, scheduleAlarms } from './alarms';
import { initTracing } from './tracing';
import { initMessageRouter } from './messages';
import { ensureSeedScripts } from '../lib/scriptStore';
import { syncUserScripts } from '../lib/scriptRuntime';

console.log('[Iris] Background script loaded');

initKeepalive();
initSidePanel();
initBrowserRelay();
initRemoteRelay();
initSelfUpdate();
ensureSeedScripts().then(() => syncUserScripts()).catch(err => console.warn('[Iris] scripts:', err));

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Iris] Extension installed');
  setupContextMenus();
  scheduleAlarms();
});

initContextMenus();
initShortcuts();
initAlarms();
initTracing();
initMessageRouter();
