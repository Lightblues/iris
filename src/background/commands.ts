import { toggleForTab } from './sidePanel';
import { addBookmark, getBookmarks } from '../lib/storage';
import { addToReadingList } from '../lib/readingList';
import { createEntry } from '../lib/knowledge';
import type { BookmarkLink, ExecuteCommandMessage, CommandResultMessage, PageContextResponse } from '../lib/types';

export function initShortcuts(): void {
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
      try {
        await toggleForTab(tab);
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
}

export async function handleExecuteCommand(message: ExecuteCommandMessage): Promise<CommandResultMessage> {
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
