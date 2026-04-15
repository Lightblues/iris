import type { KnowledgeEntry } from './types'
import { markdownToBlocks } from '@tryfabric/martian'

const NOTION_API_VERSION = '2025-09-03'
const NOTION_API_BASE = 'https://api.notion.com/v1'

export interface NotionSyncConfig {
  token: string
  databaseId: string
  dataSourceId?: string  // Optional: if not provided, will fetch from database
}

export interface NotionSyncState {
  lastSyncTime: number
  syncedNotes: Record<string, NotionPageInfo> // noteId -> NotionPageInfo
}

export interface NotionPageInfo {
  pageId: string
  lastSyncedAt: number
  checksum: string // MD5 hash of content for conflict detection
}

const SYNC_STATE_KEY = 'iris_notion_sync_state'

async function loadSyncState(): Promise<NotionSyncState> {
  const result = await chrome.storage.local.get(SYNC_STATE_KEY)
  const state = result[SYNC_STATE_KEY] as NotionSyncState | undefined
  return state || { lastSyncTime: 0, syncedNotes: {} }
}

async function saveSyncState(state: NotionSyncState): Promise<void> {
  await chrome.storage.local.set({ [SYNC_STATE_KEY]: state })
}

function computeChecksum(content: string): string {
  // Simple hash for change detection
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(36)
}

async function notionRequest(
  config: NotionSyncConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `${NOTION_API_BASE}${endpoint}`
  const headers = {
    'Authorization': `Bearer ${config.token}`,
    'Notion-Version': NOTION_API_VERSION,
    'Content-Type': 'application/json',
    ...options.headers,
  }

  const response = await fetch(url, { ...options, headers })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Notion API error: ${response.status} - ${error}`)
  }

  return response.json()
}

// Convert KnowledgeEntry to Notion page properties
function entryToNotionProperties(entry: KnowledgeEntry) {
  return {
    'Title': {
      title: [{ text: { content: entry.title || 'Untitled' } }],
    },
    'Source URL': {
      url: entry.source.url || null,
    },
    'Source Title': {
      rich_text: [{ text: { content: entry.source.title || '' } }],
    },
    'Source Type': {
      select: { name: entry.type },
    },
    'Extracted At': {
      date: { start: new Date(entry.source.timestamp).toISOString() },
    },
    'Tags': {
      multi_select: entry.tags.map(tag => ({ name: tag })),
    },
    'Iris ID': {
      rich_text: [{ text: { content: entry.id } }],
    },
    'Checksum': {
      rich_text: [{ text: { content: computeChecksum(entry.content) } }],
    },
    ...(entry.source.conversationId && {
      'Conversation ID': {
        rich_text: [{ text: { content: entry.source.conversationId } }],
      },
    }),
  }
}

// Convert Markdown content to Notion blocks using martian
function contentToNotionBlocks(content: string): any[] {
  try {
    // Use martian to convert markdown to Notion blocks
    const blocks = markdownToBlocks(content)

    // Notion has a limit of 100 blocks per request
    return blocks.slice(0, 100)
  } catch (error) {
    console.error('Failed to convert markdown with martian:', error)
    // Fallback to simple paragraph block
    return [{
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: content.slice(0, 2000) } }],
      },
    }]
  }
}

// Get data source ID from database (uses new 2025-09-03 API)
async function getDataSourceId(config: NotionSyncConfig): Promise<string> {
  if (config.dataSourceId) {
    return config.dataSourceId
  }

  // Fetch database to get data_sources
  const database = await notionRequest(config, `/databases/${config.databaseId}`)

  if (!database.data_sources || database.data_sources.length === 0) {
    throw new Error('No data sources found in database')
  }

  // Use the first data source
  return database.data_sources[0].id
}

export async function createNotionPage(
  config: NotionSyncConfig,
  entry: KnowledgeEntry
): Promise<string> {
  // Get data source ID (required for new API)
  const dataSourceId = await getDataSourceId(config)

  const response = await notionRequest(config, '/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: {
        type: 'data_source_id',
        data_source_id: dataSourceId
      },
      properties: entryToNotionProperties(entry),
      children: contentToNotionBlocks(entry.content),
    }),
  })

  return response.id
}

export async function findNotionPageByIrisId(
  config: NotionSyncConfig,
  irisId: string
): Promise<string | null> {
  // Get data source ID (required for new API)
  const dataSourceId = await getDataSourceId(config)

  // Use new data_sources query endpoint
  const response = await notionRequest(config, `/data_sources/${dataSourceId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        property: 'Iris ID',
        rich_text: { equals: irisId },
      },
    }),
  })

  if (response.results && response.results.length > 0) {
    return response.results[0].id
  }
  return null
}

export async function syncEntryToNotion(
  config: NotionSyncConfig,
  entry: KnowledgeEntry,
  force: boolean = false
): Promise<{ success: boolean; pageId?: string; error?: string; skipped?: boolean }> {
  try {
    const state = await loadSyncState()
    const syncInfo = state.syncedNotes[entry.id]
    const currentChecksum = computeChecksum(entry.content)

    // Check if already synced and unchanged
    if (!force && syncInfo && syncInfo.checksum === currentChecksum) {
      return { success: true, pageId: syncInfo.pageId, skipped: true }
    }

    // Check if page exists in Notion (by Iris ID)
    let pageId: string | null = syncInfo?.pageId || null
    if (!pageId) {
      pageId = await findNotionPageByIrisId(config, entry.id)
    }

    if (pageId) {
      // Page exists: DO NOT UPDATE (per requirement - Notion is for editing)
      console.log(`Entry ${entry.id} already exists in Notion (${pageId}), skipping update`)

      // Update sync state to mark as synced (even though we didn't update)
      state.syncedNotes[entry.id] = {
        pageId,
        lastSyncedAt: Date.now(),
        checksum: currentChecksum,
      }
      await saveSyncState(state)

      return { success: true, pageId, skipped: true }
    }

    // Create new page
    pageId = await createNotionPage(config, entry)

    // Update sync state
    state.syncedNotes[entry.id] = {
      pageId,
      lastSyncedAt: Date.now(),
      checksum: currentChecksum,
    }
    state.lastSyncTime = Date.now()
    await saveSyncState(state)

    return { success: true, pageId }
  } catch (error) {
    console.error('Failed to sync entry to Notion:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function syncAllEntriesToNotion(
  config: NotionSyncConfig,
  entries: KnowledgeEntry[],
  onProgress?: (current: number, total: number, entry: KnowledgeEntry) => void
): Promise<{
  success: number
  skipped: number
  failed: number
  errors: Array<{ entryId: string; error: string }>
}> {
  const result = {
    success: 0,
    skipped: 0,
    failed: 0,
    errors: [] as Array<{ entryId: string; error: string }>,
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    onProgress?.(i + 1, entries.length, entry)

    const syncResult = await syncEntryToNotion(config, entry)

    if (syncResult.success) {
      if (syncResult.skipped) {
        result.skipped++
      } else {
        result.success++
      }
    } else {
      result.failed++
      if (syncResult.error) {
        result.errors.push({ entryId: entry.id, error: syncResult.error })
      }
    }

    // Rate limiting: 3 requests/second
    if (i < entries.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 350))
    }
  }

  return result
}

export async function getSyncState(): Promise<NotionSyncState> {
  return loadSyncState()
}

export async function clearSyncState(): Promise<void> {
  await chrome.storage.local.remove(SYNC_STATE_KEY)
}

// Initialize Notion database with proper schema
export async function initializeNotionDatabase(
  config: NotionSyncConfig
): Promise<{ success: boolean; error?: string; dataSourceId?: string }> {
  try {
    // Check if database exists and is accessible
    const database = await notionRequest(config, `/databases/${config.databaseId}`)

    // Get data source ID
    if (!database.data_sources || database.data_sources.length === 0) {
      return {
        success: false,
        error: 'No data sources found in database'
      }
    }

    return {
      success: true,
      dataSourceId: database.data_sources[0].id
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Database not accessible'
    }
  }
}
