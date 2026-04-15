import { useState, useRef, useEffect, useMemo, type KeyboardEvent, type ClipboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Square, FileText, Scissors, Paperclip, X } from 'lucide-react'
import type { ChatImageAttachment, SlashCommand, SlashCommandState } from '@/lib/types'
import { filterCommands } from '@/lib/slashCommands'
import { SlashCommandDropdown } from './SlashCommandDropdown'

interface ChatInputProps {
  onSend: (message: string, images?: ChatImageAttachment[]) => void
  onStop: () => void
  isLoading: boolean
  disabled?: boolean
  usePageContext: boolean
  onInjectContext: () => void
  onInjectSelection: () => void
  defaultValue?: string
  onDefaultValueConsumed?: () => void
  slashCommands?: SlashCommand[]
}

export function ChatInput({
  onSend,
  onStop,
  isLoading,
  disabled,
  onInjectContext,
  onInjectSelection,
  defaultValue,
  onDefaultValueConsumed,
  slashCommands = [],
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [images, setImages] = useState<ChatImageAttachment[]>([])
  const [slashState, setSlashState] = useState<SlashCommandState>({
    isActive: false,
    query: '',
    selectedIndex: 0,
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle defaultValue for edit mode
  useEffect(() => {
    if (defaultValue !== undefined && defaultValue !== '') {
      setValue(defaultValue)
      onDefaultValueConsumed?.()
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [defaultValue, onDefaultValueConsumed])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`
    }
  }, [value])

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!slashState.isActive) return []
    return filterCommands(slashState.query, slashCommands)
  }, [slashState.isActive, slashState.query, slashCommands])

  // Detect slash command input
  const handleChange = (newValue: string) => {
    setValue(newValue)
    // Check if input starts with / and is at beginning of line
    if (newValue.startsWith('/')) {
      // Extract query: everything after / until first space (or end)
      const spaceIndex = newValue.indexOf(' ')
      const query = spaceIndex === -1 ? newValue.slice(1) : newValue.slice(1, spaceIndex)
      setSlashState({
        isActive: true,
        query,
        selectedIndex: 0,
      })
    } else {
      setSlashState(prev => ({ ...prev, isActive: false }))
    }
  }

  const handleSelectCommand = (command: SlashCommand) => {
    // Insert command with its full id (namespace:name) if not iris
    const commandText = command.namespace === 'iris' ? `/${command.name} ` : `/${command.id} `
    setValue(commandText)
    setSlashState({ isActive: false, query: '', selectedIndex: 0 })
    textareaRef.current?.focus()
  }

  const handleSend = () => {
    if ((value.trim() || images.length > 0) && !isLoading && !disabled) {
      onSend(value, images.length > 0 ? images : undefined)
      setValue('')
      setImages([])
      setSlashState({ isActive: false, query: '', selectedIndex: 0 })
    }
  }

  const handleImageSelect = async (files: FileList | null) => {
    if (!files) return
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith('image/')) continue
      if (file.size > 5 * 1024 * 1024) {
        console.warn('[Iris] Image too large (>5MB):', file.name)
        continue
      }
      const reader = new FileReader()
      reader.onload = (e) => {
        const data = e.target?.result as string
        const image: ChatImageAttachment = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          data,
          mimeType: file.type,
          size: file.size,
        }
        setImages((prev) => [...prev, image])
      }
      reader.readAsDataURL(file)
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          handleImageSelect(new DataTransfer().files)
          const dt = new DataTransfer()
          dt.items.add(file)
          handleImageSelect(dt.files)
        }
      }
    }
  }

  const handleRemoveImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle slash command navigation when dropdown is active
    if (slashState.isActive && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashState(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, filteredCommands.length - 1),
        }))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashState(prev => ({
          ...prev,
          selectedIndex: Math.max(prev.selectedIndex - 1, 0),
        }))
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault()
        const selected = filteredCommands[slashState.selectedIndex]
        if (selected) {
          handleSelectCommand(selected)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashState({ isActive: false, query: '', selectedIndex: 0 })
        return
      }
    }
    // Cmd+Enter or Ctrl+Enter to send
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="relative border-t p-3 bg-background space-y-2">
      {/* Slash command dropdown */}
      <SlashCommandDropdown
        commands={filteredCommands}
        selectedIndex={slashState.selectedIndex}
        onSelect={handleSelectCommand}
        visible={slashState.isActive}
      />

      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap pb-2 border-b">
          {images.map((img) => (
            <div key={img.id} className="relative group">
              <img
                src={img.data}
                alt="Upload preview"
                className="w-20 h-20 object-cover rounded border border-border"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleRemoveImage(img.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            title="Upload image"
            className="h-9 w-9"
            disabled={disabled || isLoading}
          >
            <Paperclip className="h-4 w-4 text-muted-foreground" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleImageSelect(e.target.files)}
            className="hidden"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onInjectContext}
            title="Inject full page content"
            className="h-9 w-9"
          >
            <FileText className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onInjectSelection}
            title="Inject selected text"
            className="h-9 w-9"
          >
            <Scissors className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={disabled ? 'Enter API key in settings...' : 'Type / for commands, or ask about this page...'}
          disabled={disabled || isLoading}
          className="min-h-[40px] max-h-[150px] resize-none"
          rows={1}
        />
        {isLoading ? (
          <Button variant="destructive" size="icon" onClick={onStop} title="Stop" className="h-9 w-9 shrink-0">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSend}
            disabled={(!value.trim() && images.length === 0) || disabled}
            title="Send"
            className="h-9 w-9 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Enter for new line, Cmd+Enter to send · Type <kbd className="px-1 rounded bg-muted">/</kbd> for commands
      </p>
    </div>
  )
}
