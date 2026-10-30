import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FolderOpen, RefreshCw, Unlink } from 'lucide-react'
import {
  getChatExportDirectoryHandle,
  requestChatExportDirectoryAccess,
  clearChatExportDirectoryHandle,
  queryDirectoryPermission,
  verifyDirectoryPermission,
} from '@/lib/fileSystemAccess'
import { SectionHeader } from './shared'

interface Props {
  onError: (message: string | null) => void
}

export function ChatExportSection({ onError }: Props) {
  const [chatExportDirName, setChatExportDirName] = useState<string | null>(null)
  const [chatExportNeedsGrant, setChatExportNeedsGrant] = useState(false)

  useEffect(() => {
    getChatExportDirectoryHandle().then(async handle => {
      if (!handle) return
      setChatExportDirName(handle.name)
      setChatExportNeedsGrant((await queryDirectoryPermission(handle)) !== 'granted')
    })
  }, [])

  const handleLinkChatExport = async () => {
    try {
      const handle = await requestChatExportDirectoryAccess()
      if (handle) {
        setChatExportDirName(handle.name)
        setChatExportNeedsGrant(false)
      }
    } catch (err: any) {
      onError(err.message || 'Failed to link chat export directory')
    }
  }

  const handleReconnectChatExport = async () => {
    const handle = await getChatExportDirectoryHandle()
    if (!handle) return
    try {
      const ok = await verifyDirectoryPermission(handle)
      setChatExportNeedsGrant(!ok)
      if (!ok) onError('Permission was not granted for the export directory')
    } catch (err: any) {
      onError(err.message || 'Failed to reconnect export directory')
    }
  }

  const handleUnlinkChatExport = async () => {
    await clearChatExportDirectoryHandle()
    setChatExportDirName(null)
    setChatExportNeedsGrant(false)
  }

  return (
    <section className="space-y-3">
      <SectionHeader title="Chat Export" />

      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Directory:</span>
        {chatExportDirName ? (
          <>
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded truncate max-w-[120px]">{chatExportDirName}/</span>
            <Button variant="ghost" size="sm" onClick={handleUnlinkChatExport} className="h-5 px-1 text-destructive" title="Unlink chat export directory">
              <Unlink className="h-3 w-3" />
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground italic">None</span>
        )}
      </div>

      {chatExportNeedsGrant && chatExportDirName && (
        <div className="text-xs p-2 rounded text-amber-600 bg-amber-500/10">
          Access expired after extension reload. Click Reconnect to restore it.
        </div>
      )}

      <div className="flex gap-2">
        {chatExportNeedsGrant && chatExportDirName && (
          <Button variant="outline" size="sm" onClick={handleReconnectChatExport} className="h-7 text-xs flex-1" title="Re-grant access to the saved directory">
            <RefreshCw className="h-3 w-3 mr-1" />
            Reconnect
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleLinkChatExport} className="h-7 text-xs flex-1" title="Pick the directory to export online AI chats into">
          <FolderOpen className="h-3 w-3 mr-1" />
          {chatExportDirName ? 'Re-link' : 'Choose Directory'}
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Export ChatGPT / DeepSeek / Gemini conversations as raw JSON via the on-page FAB.
        Files land in <span className="font-mono">&lt;dir&gt;/&lt;platform&gt;/&lt;id&gt;.json</span>.
      </p>
    </section>
  )
}
