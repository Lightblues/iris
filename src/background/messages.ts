import { openForTab, noteDerivedGesture } from './sidePanel';
import { getRelayState, reconnectRelay } from './browserRelay';
import { getRemoteRelayState, reconnectRemoteRelay, syncRemoteRelay } from './remoteRelay';
import { handleExecuteCommand } from './commands';
import { SW_INSTANCE } from './keepalive';
import { createEntry, deleteEntry } from '../lib/knowledge';
import { tabTools } from '../lib/tabTools';
import { automationTools } from '../lib/automationEngine';
import { saveChatExport, readChatExportIndex, checkChatExportReady } from '../lib/chatExportStore';
import { syncUserScripts, handleGmRequest } from '../lib/scriptRuntime';
import type { ExecuteCommandMessage, GetPageContextMessage, PageContextResponse, TabAgentMessage, TabAgentResponse, AutomationMessage, AutomationResponse, ChatExportSaveMessage } from '../lib/types';

export function initMessageRouter(): void {
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
      openForTab(tabId)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.warn('[Iris] sidePanel.open failed:', err);
          sendResponse({ success: false, error: err?.message || String(err) });
        });
      return true;
    }

    if (message.type === 'iris-expect-derived-tab') {
      if (sender.tab?.id != null) noteDerivedGesture(sender.tab.id)
      sendResponse({ ok: true })
      return true
    }

    if (message.type === 'execute-command') {
      handleExecuteCommand(message as ExecuteCommandMessage)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({ success: false, message: error.message || 'Unknown error' });
        });
      return true;
    }

    if (message.type === 'chat_export_check') {
      checkChatExportReady()
        .then(sendResponse)
        .catch((error) => {
          sendResponse({ ready: false, error: error?.message || 'Unknown error' });
        });
      return true;
    }

    if (message.type === 'chat_export_index') {
      readChatExportIndex(message.platform)
        .then((entries) => sendResponse({ success: true, entries }))
        .catch((error) => {
          sendResponse({ success: false, error: error?.message || 'Unknown error' });
        });
      return true;
    }

    if (message.type === 'chat_export_save') {
      saveChatExport(message as ChatExportSaveMessage)
        .then((r) => sendResponse({ ...r, swInstance: SW_INSTANCE }))
        .catch((error) => {
          sendResponse({ success: false, error: error?.message || 'Unknown error' });
        });
      return true;
    }

    if (message.type === 'iris_sync_scripts') {
      syncUserScripts()
        .then(error => sendResponse({ error }))
        .catch(err => sendResponse({ error: err?.message || String(err) }))
      return true
    }

    if (message.type === 'iris_gm') {
      handleGmRequest(message.scriptId, message.method, message.payload)
        .then(result => sendResponse({ ok: true, result }))
        .catch(err => sendResponse({ ok: false, error: err?.message || String(err) }))
      return true
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
      handleGetSelectionContext(message)
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

    if (message.type === 'browser_relay_status') {
      sendResponse(getRelayState());
      return true;
    }

    if (message.type === 'browser_relay_reconnect') {
      sendResponse(reconnectRelay());
      return true;
    }

    if (message.type === 'remote_relay_status') {
      getRemoteRelayState().then(sendResponse)
      return true
    }

    if (message.type === 'remote_relay_reconnect') {
      reconnectRemoteRelay()
      getRemoteRelayState().then(sendResponse)
      return true
    }

    if (message.type === 'remote_relay_sync') {
      syncRemoteRelay()
      sendResponse({ ok: true })
      return true
    }

    sendResponse({ success: true, message: 'ok' });
    return true;
  });
}

async function resolveContextTab(tabId?: number): Promise<chrome.tabs.Tab | undefined> {
  if (tabId != null) {
    try {
      return await chrome.tabs.get(tabId);
    } catch {
      return undefined;
    }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function handleGetPageContext(message: GetPageContextMessage): Promise<PageContextResponse> {
  const tab = await resolveContextTab(message.tabId);
  if (!tab?.id) {
    return { success: false, error: 'No tab' };
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'extract-page-content' });
    return response as PageContextResponse;
  } catch (error: any) {
    return { success: false, error: error.message || 'Content script not available' };
  }
}

async function handleGetSelectionContext(message?: { tabId?: number }): Promise<PageContextResponse> {
  const tab = await resolveContextTab(message?.tabId);
  if (!tab?.id) {
    return { success: false, error: 'No tab' };
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'extract-selection-content' });
    return response as PageContextResponse;
  } catch (error: any) {
    return { success: false, error: error.message || 'Content script not available' };
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
