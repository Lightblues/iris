import { isRelayTab } from './browserMethods';
import { recordEvent, detectSearchQuery } from '../lib/tracing';
import { loadSettings } from '../lib/sidepanelSettings';

let currentActiveTab: { tabId: number; url: string; title: string; domain: string; startTime: number } | null = null;

async function isTracingOn(): Promise<boolean> {
  const settings = await loadSettings();
  return settings.tracingEnabled !== false;
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

async function handlePageVisit(tabId: number, url: string, title: string) {
  if (isRelayTab(tabId)) return;
  if (!(await isTracingOn())) return;
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

  const domain = extractDomain(url);

  // Emit page_leave for previous tab
  if (currentActiveTab) {
    const duration = Math.round((Date.now() - currentActiveTab.startTime) / 1000);
    await recordEvent({
      type: 'page_leave',
      data: { url: currentActiveTab.url, duration_seconds: duration },
    });
  }

  // Emit page_visit for new tab
  currentActiveTab = { tabId, url, title, domain, startTime: Date.now() };
  await recordEvent({
    type: 'page_visit',
    data: { url, title, domain },
  });

  // Detect search queries
  const search = detectSearchQuery(url);
  if (search) {
    await recordEvent({
      type: 'search_query',
      data: { query: search.query, engine: search.engine },
    });
  }
}

/** Emit page_leave for the active tab so far and restart its timer. */
export async function flushActivePage(): Promise<void> {
  if (!currentActiveTab) return;
  const duration = Math.round((Date.now() - currentActiveTab.startTime) / 1000);
  await recordEvent({
    type: 'page_leave',
    data: { url: currentActiveTab.url, duration_seconds: duration },
  });
  currentActiveTab.startTime = Date.now();
}

export function initTracing(): void {
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url) {
        await handlePageVisit(activeInfo.tabId, tab.url, tab.title || '');
      }
    } catch {
      // Tab may have been closed
    }
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab.url) return;
    // Only track if this is the currently active tab and URL changed
    if (currentActiveTab && currentActiveTab.tabId === tabId && currentActiveTab.url !== tab.url) {
      await handlePageVisit(tabId, tab.url, tab.title || '');
    } else if (!currentActiveTab) {
      // First load — set as active
      if (tab.active) {
        await handlePageVisit(tabId, tab.url, tab.title || '');
      }
    }
  });
}
