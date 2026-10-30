import { createEntry } from '../lib/knowledge';
import type { PageContextResponse } from '../lib/types';

// Setup context menus for markdown conversion and notes
export function setupContextMenus() {
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

export function initContextMenus(): void {
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
}
