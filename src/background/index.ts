import { addBookmark, getBookmarks } from '../lib/storage';
import { addToReadingList } from '../lib/readingList';
import { createEntry, deleteEntry } from '../lib/knowledge';
import { tabTools } from '../lib/tabTools';
import { automationTools } from '../lib/automationEngine';
import { cleanupExpired } from '../lib/tabTrash';
import { recordEvent, detectSearchQuery, cleanupOldEvents } from '../lib/tracing';
import { loadSettings } from '../lib/sidepanelSettings';
import { syncToVesta } from '../lib/vestaSync';
import type { BookmarkLink, ExecuteCommandMessage, CommandResultMessage, GetPageContextMessage, PageContextResponse, TabAgentMessage, TabAgentResponse, AutomationMessage, AutomationResponse } from '../lib/types';

console.log('[Iris] Background script loaded');
console.log('[Iris] Tab tools loaded:', Object.keys(tabTools));

// Disable auto-open so we handle toggle manually per-tab.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);

// Track which windows have the panel open so we can toggle.
// Chrome's sidePanel is per-window (not per-tab) — opening on tabId just sets
// which tab triggered it, but close must target the windowId.
const panelOpenWindows = new Set<number>();

// Handle toolbar icon click — toggle.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.id == null || tab.windowId == null) return;
  try {
    if (panelOpenWindows.has(tab.windowId)) {
      await chrome.sidePanel.close({ windowId: tab.windowId });
      panelOpenWindows.delete(tab.windowId);
    } else {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  } catch (err) {
    console.warn('[Iris] sidePanel toggle from action click failed:', err);
  }
});

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Iris] Extension installed');
  setupContextMenus();

  // Schedule periodic trash cleanup (daily)
  chrome.alarms.create('cleanup-trash', {
    periodInMinutes: 24 * 60,
    when: Date.now() + 60000 // Start after 1 minute
  });

  // Tracing alarms
  chrome.alarms.create('flush-tracing', { periodInMinutes: 5 });
  chrome.alarms.create('cleanup-events', { periodInMinutes: 24 * 60, when: Date.now() + 120000 });

  // Vesta sync alarm (daily)
  chrome.alarms.create('vesta-sync', { periodInMinutes: 24 * 60, when: Date.now() + 180000 });
});

// Setup context menus for markdown conversion and notes
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'copy_page_as_markdown',
      title: 'Copy Page as Markdown',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: 'copy_selection_as_markdown',
      title: 'Copy Selection as Markdown',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'separator_1',
      type: 'separator',
      contexts: ['page', 'selection'],
    });
    chrome.contextMenus.create({
      id: 'save_page_as_note',
      title: 'Save Page to Iris Notes',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: 'save_selection_as_note',
      title: 'Save Selection to Iris Notes',
      contexts: ['selection'],
    });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  const menuId = info.menuItemId as string;

  // Handle markdown copy
  if (menuId === 'copy_page_as_markdown' || menuId === 'copy_selection_as_markdown') {
    const mode = menuId === 'copy_page_as_markdown' ? 'page' : 'selection';
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'convert-to-markdown', mode });
      console.log('[Iris] Markdown conversion result:', response);
    } catch (error) {
      console.log('[Iris] Could not convert to markdown:', error);
    }
    return;
  }

  // Handle save to knowledge
  if (menuId === 'save_page_as_note') {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'extract-page-content' }) as PageContextResponse;
      if (response.success && response.content) {
        await createEntry({
          type: 'page-snapshot',
          content: response.content,
          sourceUrl: tab.url || '',
          sourceTitle: tab.title || 'Unknown',
        });
        console.log('[Iris] Saved page to knowledge');
      }
    } catch (error) {
      console.log('[Iris] Could not save page:', error);
    }
  } else if (menuId === 'save_selection_as_note') {
    // Use unified highlight path: captures markdown + anchor + applies mark
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'save-highlight' });
      console.log('[Iris] Saved selection as highlight');
    } catch (error) {
      console.log('[Iris] Could not save highlight:', error);
    }
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[Iris] Command received:', command);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === 'open-command-menu') {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'open-command-menu' });
    } catch (error) {
      console.log('[Iris] Could not send message to tab:', error);
    }
  } else if (command === 'toggle-floating-sidebar') {
    // Toggle: close if open, open if closed.
    try {
      const windowId = tab.windowId!;
      if (panelOpenWindows.has(windowId)) {
        await chrome.sidePanel.close({ windowId });
        panelOpenWindows.delete(windowId);
      } else {
        await chrome.sidePanel.open({ tabId: tab.id! });
      }
    } catch (error) {
      console.log('[Iris] Could not toggle side panel:', error);
    }
  } else if (command === 'save-highlight') {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'save-highlight' });
      console.log('[Iris] Highlight save triggered via shortcut');
    } catch (error) {
      console.log('[Iris] Could not save highlight:', error);
    }
  }
});

// Handle alarms (periodic tasks)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanup-trash') {
    const removed = await cleanupExpired();
    console.log(`[Iris] Cleaned up ${removed} expired trash items`);
  } else if (alarm.name === 'flush-tracing') {
    // Flush page_leave for currently active tab
    if (currentActiveTab) {
      const duration = Math.round((Date.now() - currentActiveTab.startTime) / 1000);
      await recordEvent({
        type: 'page_leave',
        data: { url: currentActiveTab.url, duration_seconds: duration },
      });
      currentActiveTab.startTime = Date.now();
    }
  } else if (alarm.name === 'cleanup-events') {
    const removed = await cleanupOldEvents(30);
    console.log(`[Iris] Cleaned up ${removed} old event days`);
  } else if (alarm.name === 'vesta-sync') {
    try {
      const result = await syncToVesta();
      console.log(`[Iris] Vesta auto-sync: ${result.eventsSynced} events, ${result.entriesSynced} entries`);
    } catch (err) {
      // Silent failure for auto-sync — error is stored in sync state
      console.log('[Iris] Vesta auto-sync skipped:', (err as Error).message);
    }
  }
});

// --- Tracing: Tab tracking ---
let currentActiveTab: { tabId: number; url: string; title: string; domain: string; startTime: number } | null = null;

async function isTracingOn(): Promise<boolean> {
  const settings = await loadSettings();
  return settings.tracingEnabled !== false;
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

async function handlePageVisit(tabId: number, url: string, title: string) {
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

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      await handlePageVisit(activeInfo.tabId, tab.url, tab.title || '');
    }
  } catch (err) {
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

// Clean up panel tracking when a tab is closed.
chrome.tabs.onRemoved.addListener((_tabId, removeInfo) => {
  // If no more tabs in this window, remove tracking.
  // (Chrome auto-closes the panel when the last tab closes anyway.)
  if (removeInfo.isWindowClosing) {
    panelOpenWindows.delete(removeInfo.windowId);
  }
});

// Handle messages from content scripts, popup, or sidepanel
chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  console.log('[Iris] Message received:', message);

  // Open native side panel for in-page entry points such as the FAB.
  // `chrome.sidePanel.open()` still needs the originating user gesture, so the
  // content script forwards the click and the background performs the open.
  if (message.type === 'open-side-panel') {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ success: false, error: 'No tab id on sender' });
      return true;
    }
    chrome.sidePanel.open({ tabId })
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        console.warn('[Iris] sidePanel.open failed:', err);
        sendResponse({ success: false, error: err?.message || String(err) });
      });
    return true;
  }

  // Track sidepanel open/close state per window (for toggle)
  if (message.type === 'sidepanel-opened') {
    const windowId = message.windowId as number | undefined;
    if (windowId != null) panelOpenWindows.add(windowId);
    sendResponse({ success: true });
    return true;
  }
  if (message.type === 'sidepanel-closed') {
    const windowId = message.windowId as number | undefined;
    if (windowId != null) panelOpenWindows.delete(windowId);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'execute-command') {
    handleExecuteCommand(message as ExecuteCommandMessage)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ success: false, message: error.message || 'Unknown error' });
      });
    return true;
  }

  if (message.type === 'get-page-context') {
    handleGetPageContext(message as GetPageContextMessage)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ success: false, error: error.message || 'Failed to get context' });
      });
    return true;
  }

  if (message.type === 'get-selection-context') {
    handleGetSelectionContext()
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ success: false, error: error.message || 'Failed to get selection' });
      });
    return true;
  }

  if (message.type === 'tab_agent_action') {
    handleTabAgentAction(message as TabAgentMessage)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ success: false, error: error.message || 'Tab agent action failed' });
      });
    return true;
  }

  if (message.type === 'automation_action') {
    handleAutomationAction(message as AutomationMessage)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ success: false, error: error.message || 'Automation action failed' });
      });
    return true;
  }

  if (message.type === 'create-highlight') {
    // Unified: content script captured selection → save entry and return id
    createEntry({
      type: 'highlight',
      content: message.content,
      sourceUrl: message.url,
      sourceTitle: message.title,
      anchor: message.anchor,
    }).then((entry) => {
      sendResponse({ success: true, entryId: entry.id });
    }).catch(() => {
      sendResponse({ success: false, message: 'Failed to save highlight' });
    });
    return true;
  }

  if (message.type === 'delete-highlight') {
    deleteEntry(message.id).then(() => sendResponse({ success: true, message: 'Deleted' })).catch(() => sendResponse({ success: false, message: 'Failed' }));
    return true;
  }

  sendResponse({ success: true, message: 'ok' });
  return true;
});

async function handleGetPageContext(_message: GetPageContextMessage): Promise<PageContextResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { success: false, error: 'No active tab' };
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'extract-page-content' });
    return response as PageContextResponse;
  } catch (error: any) {
    return { success: false, error: error.message || 'Content script not available' };
  }
}

async function handleGetSelectionContext(): Promise<PageContextResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { success: false, error: 'No active tab' };
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'extract-selection-content' });
    return response as PageContextResponse;
  } catch (error: any) {
    return { success: false, error: error.message || 'Content script not available' };
  }
}

async function handleExecuteCommand(message: ExecuteCommandMessage): Promise<CommandResultMessage> {
  const { commandId, pageInfo } = message;

  switch (commandId) {
    case 'add_bookmark': {
      // Check for duplicate
      const existingBookmarks = await getBookmarks();
      const isDuplicate = existingBookmarks.some((b) => b.url === pageInfo.url);
      if (isDuplicate) {
        return { success: false, message: 'Bookmark already exists' };
      }

      const newBookmark: BookmarkLink = {
        id: Date.now().toString(),
        title: pageInfo.title,
        url: pageInfo.url,
        category: 'Other',
        createdAt: Date.now(),
      };
      await addBookmark(newBookmark);
      return { success: true, message: 'Added to bookmarks' };
    }

    case 'add_reading_list': {
      try {
        await addToReadingList({ url: pageInfo.url, title: pageInfo.title });
        return { success: true, message: 'Added to reading list' };
      } catch (error: any) {
        // Chrome throws if URL already exists
        if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
          return { success: false, message: 'Already in reading list' };
        }
        throw error;
      }
    }

    case 'open_options': {
      await chrome.runtime.openOptionsPage();
      return { success: true, message: 'Opened settings' };
    }

    case 'copy_page_as_markdown':
    case 'copy_selection_as_markdown': {
      // These commands are handled directly by content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        return { success: false, message: 'No active tab' };
      }
      const mode = commandId === 'copy_page_as_markdown' ? 'page' : 'selection';
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'convert-to-markdown', mode }) as CommandResultMessage;
      return response;
    }

    case 'save_page_as_note': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        return { success: false, message: 'No active tab' };
      }
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'extract-page-content' }) as PageContextResponse;
        if (!response.success || !response.content) {
          return { success: false, message: response.error || 'Could not extract page' };
        }
        await createEntry({
          type: 'page-snapshot',
          content: response.content,
          sourceUrl: tab.url || pageInfo.url,
          sourceTitle: tab.title || pageInfo.title,
        });
        return { success: true, message: 'Saved to knowledge' };
      } catch (error: any) {
        return { success: false, message: error.message || 'Failed to save' };
      }
    }

    case 'save_selection_as_note': {
      // Use unified highlight path: markdown + anchor + immediate mark
      const [tab2] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab2?.id) {
        return { success: false, message: 'No active tab' };
      }
      try {
        const response = await chrome.tabs.sendMessage(tab2.id, { type: 'save-highlight' }) as any;
        if (response?.success) {
          return { success: true, message: 'Saved as highlight' };
        }
        return { success: false, message: 'No text selected' };
      } catch (error: any) {
        return { success: false, message: error.message || 'Failed to save' };
      }
    }

    default:
      return { success: false, message: `Unknown command: ${commandId}` };
  }
}

async function handleTabAgentAction(message: TabAgentMessage): Promise<TabAgentResponse> {
  const { action, params } = message;
  console.log('[Iris Background] Tab agent action:', action, params);

  const tool = tabTools[action as keyof typeof tabTools];
  if (!tool) {
    console.error('[Iris Background] Unknown tab action:', action);
    console.log('[Iris Background] Available tools:', Object.keys(tabTools));
    return { success: false, error: `Unknown tab action: ${action}` };
  }

  try {
    console.log('[Iris Background] Executing tool:', action);
    const result = await tool.execute(params);
    console.log('[Iris Background] Tool result:', result);
    return { success: true, data: result };
  } catch (error: any) {
    console.error('[Iris Background] Tool execution error:', error);
    return { success: false, error: error.message || 'Action failed' };
  }
}

async function handleAutomationAction(message: AutomationMessage): Promise<AutomationResponse> {
  const { action, params } = message;
  console.log('[Iris Background] Automation action:', action, params);

  const tool = automationTools[action as keyof typeof automationTools];
  if (!tool) {
    return { success: false, error: `Unknown automation action: ${action}` };
  }

  try {
    const result = await tool.execute(params);
    return { success: true, data: result };
  } catch (error: any) {
    console.error('[Iris Background] Automation error:', error);
    return { success: false, error: error.message || 'Action failed' };
  }
}
