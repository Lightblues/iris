/**
 * Test script to verify Notion integration setup
 * Usage: tsx scripts/test-notion-setup.ts <token> <database_id>
 */

const NOTION_API_VERSION = '2025-09-03'
const NOTION_API_BASE = 'https://api.notion.com/v1'

async function testNotionConnection(token: string, databaseId: string) {
  console.log('Testing Notion connection...\n')

  try {
    // Test 1: Retrieve database
    console.log('1. Testing database access...')
    const dbResponse = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': NOTION_API_VERSION,
      },
    })

    if (!dbResponse.ok) {
      const error = await dbResponse.text()
      throw new Error(`Failed to access database: ${dbResponse.status} - ${error}`)
    }

    const db = await dbResponse.json()
    console.log('✓ Database accessible')
    console.log(`  Title: ${db.title?.[0]?.plain_text || 'Untitled'}`)
    console.log(`  ID: ${db.id}`)

    // Check data sources
    if (!db.data_sources || db.data_sources.length === 0) {
      throw new Error('No data sources found in database')
    }
    console.log(`  Data Sources: ${db.data_sources.length}`)
    const dataSourceId = db.data_sources[0].id
    console.log(`  Using Data Source: ${dataSourceId}`)

    // Test 2: Check schema from data source
    console.log('\n2. Checking data source schema...')

    // Fetch data source to get properties
    const dsResponse = await fetch(`${NOTION_API_BASE}/data_sources/${dataSourceId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': NOTION_API_VERSION,
      },
    })

    if (!dsResponse.ok) {
      const error = await dsResponse.text()
      throw new Error(`Failed to fetch data source: ${dsResponse.status} - ${error}`)
    }

    const dataSource = await dsResponse.json()
    const properties = dataSource.properties || {}
    const requiredProps = [
      { name: 'Title', type: 'title' },
      { name: 'Source URL', type: 'url' },
      { name: 'Source Title', type: 'rich_text' },
      { name: 'Source Type', type: 'select' },
      { name: 'Extracted At', type: 'date' },
      { name: 'Tags', type: 'multi_select' },
      { name: 'Iris ID', type: 'rich_text' },
      { name: 'Checksum', type: 'rich_text' },
    ]

    const missing: string[] = []
    for (const req of requiredProps) {
      const prop = Object.values(properties).find(
        (p: any) => p.name === req.name && p.type === req.type
      )
      if (!prop) {
        missing.push(`${req.name} (${req.type})`)
      } else {
        console.log(`  ✓ ${req.name} (${req.type})`)
      }
    }

    if (missing.length > 0) {
      console.log('\n  ⚠️  Missing properties:')
      missing.forEach(m => console.log(`    - ${m}`))
      console.log('\n  Please add these properties to your database manually.')
      console.log('  See docs/NOTION_SETUP.md for detailed instructions.')
    }

    // Test 3: Try creating a test page
    console.log('\n3. Testing page creation...')
    const testPage = {
      parent: {
        type: 'data_source_id',
        data_source_id: dataSourceId
      },
      properties: {
        'Title': {
          title: [{ text: { content: '[TEST] Iris Sync Test' } }],
        },
        'Source URL': {
          url: 'https://example.com',
        },
        'Source Title': {
          rich_text: [{ text: { content: 'Test Page' } }],
        },
        'Source Type': {
          select: { name: 'page' },
        },
        'Extracted At': {
          date: { start: new Date().toISOString() },
        },
        'Tags': {
          multi_select: [{ name: 'Other' }],
        },
        'Iris ID': {
          rich_text: [{ text: { content: 'test-' + Date.now() } }],
        },
        'Checksum': {
          rich_text: [{ text: { content: 'test-checksum' } }],
        },
      },
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: 'This is a test note created by Iris setup script. You can safely delete it.' } }
            ],
          },
        },
      ],
    }

    const createResponse = await fetch(`${NOTION_API_BASE}/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPage),
    })

    if (!createResponse.ok) {
      const error = await createResponse.text()
      throw new Error(`Failed to create test page: ${createResponse.status} - ${error}`)
    }

    const created = await createResponse.json()
    console.log('✓ Test page created successfully')
    console.log(`  Page ID: ${created.id}`)
    console.log(`  URL: ${created.url}`)

    console.log('\n✅ All tests passed! Your Notion integration is ready.')
    console.log('\nNext steps:')
    console.log('1. Configure token and database ID in Iris settings')
    console.log('2. Go to Notes tab and click the Cloud icon to sync')
    console.log('3. Check the test page in Notion (you can delete it)')

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error)
    console.log('\nTroubleshooting:')
    console.log('- Verify token starts with "secret_"')
    console.log('- Check database ID is 32 characters (no dashes)')
    console.log('- Ensure database is shared with your integration')
    console.log('- See docs/NOTION_SETUP.md for detailed setup')
    process.exit(1)
  }
}

// Parse args
const args = process.argv.slice(2)
if (args.length < 2) {
  console.log('Usage: tsx scripts/test-notion-setup.ts <token> <database_id>')
  console.log('\nExample:')
  console.log('  tsx scripts/test-notion-setup.ts secret_abc123... 1234567890abcdef1234567890abcdef')
  process.exit(1)
}

const [token, databaseId] = args
testNotionConnection(token, databaseId)
