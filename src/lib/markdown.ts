import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { Readability } from '@mozilla/readability';

// Configure Turndown with GFM support
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
turndownService.use(gfm);

export interface ConversionResult {
  success: boolean;
  markdown?: string;
  title?: string;
  error?: string;
}

/** Extract main content and convert to Markdown */
export function extractAndConvertPage(): ConversionResult {
  try {
    // Create a new document from HTML string to avoid Custom Elements issues
    const parser = new DOMParser();
    const docClone = parser.parseFromString(document.documentElement.outerHTML, 'text/html');

    const reader = new Readability(docClone);
    const article = reader.parse();

    if (article?.content) {
      const markdown = turndownService.turndown(article.content);
      return { success: true, markdown, title: article.title };
    }

    // Fallback: convert body content directly
    const fallbackHtml = document.body.innerHTML;
    const markdown = turndownService.turndown(fallbackHtml);
    return { success: true, markdown, title: document.title };
  } catch (err) {
    console.error('[Iris] extractAndConvertPage error:', err);
    return { success: false, error: (err as Error).message || 'Failed to convert page' };
  }
}

/** Convert selected HTML to Markdown */
export function convertSelectionToMarkdown(): ConversionResult {
  try {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return { success: false, error: 'No text selected' };
    }

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();

    // Convert fragment to HTML string
    const container = document.createElement('div');
    container.appendChild(fragment);
    const html = container.innerHTML;

    if (!html.trim()) {
      return { success: false, error: 'No text selected' };
    }

    const markdown = turndownService.turndown(html);
    return { success: true, markdown };
  } catch (err) {
    return { success: false, error: (err as Error).message || 'Failed to convert selection' };
  }
}

/** Copy text to clipboard */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
