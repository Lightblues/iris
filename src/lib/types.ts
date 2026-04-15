export interface BookmarkLink {
  id: string;
  title: string;
  url: string;
  remark?: string;
  category?: string;
  createdAt: number;
}

export interface StorageData {
  bookmarks: BookmarkLink[];
}

// Chrome's readingList API entry type
export interface ReadingListEntry {
  url: string;
  title: string;
  hasBeenRead: boolean;
  creationTime: number;
  lastUpdateTime: number;
}

export const STORAGE_KEY = 'iris_bookmarks';

export const CATEGORIES = [
  'All',
  'Dev',
  'Scholar',
  'News',
  'Podcast',
  'Video',
  'Other'
] as const;

export type Category = typeof CATEGORIES[number];

export function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return '';
  }
}

// Command Menu Types
export type CommandId =
  | 'add_bookmark'
  | 'add_reading_list'
  | 'open_options'
  | 'copy_page_as_markdown'
  | 'copy_selection_as_markdown'
  | 'save_page_as_note'
  | 'save_selection_as_note';

export interface CommandItem {
  id: CommandId;
  label: string;
  description: string;
  icon: string;
}

export const COMMANDS: CommandItem[] = [
  {
    id: 'add_bookmark',
    label: 'Add Bookmark',
    description: 'Add current page to bookmarks',
    icon: '📚',
  },
  {
    id: 'add_reading_list',
    label: 'Add to Reading List',
    description: 'Add current page to reading list',
    icon: '📖',
  },
  {
    id: 'open_options',
    label: 'Open Settings',
    description: 'Open extension options page',
    icon: '⚙️',
  },
  {
    id: 'copy_page_as_markdown',
    label: 'Copy Page as Markdown',
    description: 'Convert page content to Markdown and copy',
    icon: '📋',
  },
  {
    id: 'copy_selection_as_markdown',
    label: 'Copy Selection as Markdown',
    description: 'Convert selected text to Markdown and copy',
    icon: '✂️',
  },
  {
    id: 'save_page_as_note',
    label: 'Save Page as Note',
    description: 'Save full page content to notes',
    icon: '📝',
  },
  {
    id: 'save_selection_as_note',
    label: 'Save Selection as Note',
    description: 'Save selected text to notes',
    icon: '📌',
  },
];

// Message types for background/content script communication
export interface OpenCommandMenuMessage {
  type: 'open-command-menu';
}

export interface ExecuteCommandMessage {
  type: 'execute-command';
  commandId: CommandId;
  pageInfo: { url: string; title: string };
}

export interface CommandResultMessage {
  success: boolean;
  message: string;
}

export interface MarkdownConvertMessage {
  type: 'convert-to-markdown';
  mode: 'page' | 'selection';
}

export type ExtensionMessage = OpenCommandMenuMessage | ExecuteCommandMessage | MarkdownConvertMessage | GetPageContextMessage;

// Chat types for sidepanel — aligned with AI SDK v6 UIMessage
import type { UIMessage } from 'ai'

// Token usage info stored per assistant message
export interface MessageUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;          // USD — from OpenRouter API (actual) or local estimate (fallback)
  model?: string;
}

// Iris-specific metadata stored on each UIMessage
export interface IrisMessageMetadata {
  timestamp: number;
  pageUrl?: string;
  pageTitle?: string;
  contextType?: 'page' | 'selection';  // Context injection type (mapped to user role)
  usage?: MessageUsage;  // Token usage from AI SDK stream (injected via DirectChatTransport messageMetadata)
  estimatedTokens?: number;  // Pre-send token estimate for context messages
}

// Image attachment for chat input (before conversion to file UIMessagePart)
export interface ChatImageAttachment {
  id: string;
  data: string;  // base64 data URL
  mimeType: string;
  size: number;
}

// Primary message type: AI SDK UIMessage parameterized with Iris metadata
export type IrisMessage = UIMessage<IrisMessageMetadata>
export type IrisMessagePart = UIMessage<IrisMessageMetadata>['parts'][number]

// Legacy types removed — migration code was in chatHistory.ts (deleted)

// Tool UI part helper — extract tool name from part.type ('tool-query_tabs' → 'query_tabs')
export function getToolNameFromPart(part: IrisMessagePart): string | null {
  if ('type' in part && typeof part.type === 'string' && part.type.startsWith('tool-')) {
    return part.type.slice(5);
  }
  return null;
}

export type AgentMode = 'general' | 'tab-agent' | 'automation' | 'paper'

// Conversation types live in @/agent/types — single source of truth

// Page context message types
export interface GetPageContextMessage {
  type: 'get-page-context';
}

export interface GetSelectionContextMessage {
  type: 'get-selection-context';
}

export interface PageContextResponse {
  success: boolean;
  content?: string;
  title?: string;
  error?: string;
}

// Knowledge types (replaces old Notes — P0)
export type KnowledgeEntryType = 'highlight' | 'note' | 'chat-save' | 'page-snapshot'

export interface HighlightAnchor {
  textContent: string
  xpath?: string
  cssSelector?: string
  startOffset?: number
  endOffset?: number
}

export interface KnowledgeEntry {
  id: string
  type: KnowledgeEntryType
  content: string
  title?: string
  source: {
    url: string
    title: string
    timestamp: number
    anchor?: HighlightAnchor
    conversationId?: string
  }
  tags: string[]
  createdAt: number
  updatedAt: number
  syncedAt?: number
}

export interface KnowledgeStore {
  entries: KnowledgeEntry[]
}

export const KNOWLEDGE_TAGS = [
  'Research',
  'Tutorial',
  'Reference',
  'Idea',
  'Todo',
  'Other'
] as const

export type KnowledgeTag = typeof KNOWLEDGE_TAGS[number]

// Tracing types (P0)
export type TracingEventType =
  | 'page_visit'
  | 'page_leave'
  | 'search_query'
  | 'highlight_created'
  | 'note_created'
  | 'chat_message'
  | 'chat_tool_call'

export interface TracingEvent {
  ts: number
  sessionId?: string
  type: TracingEventType
  data: Record<string, any>
}

// Legacy Notes types removed — replaced by Knowledge system (KnowledgeEntry etc. above)

// Notion Sync types live in lib/notionSync.ts

// Slash Command types
export type SlashCommandContextVar = 'pageContent' | 'selection' | 'url' | 'title' | 'ARGUMENTS';

export interface SlashCommand {
  id: string;                    // e.g., "eason:review"
  namespace: string;             // e.g., "eason"
  name: string;                  // e.g., "review"
  description: string;           // From frontmatter
  icon: string;                  // From frontmatter, default "⚡"
  template: string;              // Full markdown template
  contextVariables: SlashCommandContextVar[];  // Auto-detected from template
  source: 'builtin' | 'user';    // Origin
}

export interface SlashCommandState {
  isActive: boolean;
  query: string;
  selectedIndex: number;
}

export interface SlashCommandFrontmatter {
  description?: string;
  icon?: string;
}

// Tab Agent types
export interface TabAgentMessage {
  type: 'tab_agent_action';
  action: string;
  params: any;
}

export interface TabAgentResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// Automation Agent types
export interface AutomationMessage {
  type: 'automation_action';
  action: string;
  params: any;
}

export interface AutomationResponse {
  success: boolean;
  data?: any;
  error?: string;
}

