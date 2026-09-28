import { useState, useRef, useEffect, useMemo, type KeyboardEvent, type ClipboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Square, FileText, Scissors, Paperclip, X } from 'lucide-react'
import type { ChatImageAttachment } from '@/lib/types'

export interface SkillSlashItem {
  name: string
  description: string
}

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
  skills?: SkillSlashItem[]
  autoFocus?: boolean
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
  skills = [],
  autoFocus = false,
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [images, setImages] = useState<ChatImageAttachment[]>([])
  const [slashState, setSlashState] = useState({
    isActive: false,
    query: '',
    selectedIndex: 0,
  })
  const [queued, setQueued] = useState(false)
  const queuedRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (defaultValue !== undefined && defaultValue !== '') {
      /* eslint-disable react-hooks/set-state-in-effect -- hydrate composer from message edit */
      setValue(defaultValue)
      /* eslint-enable react-hooks/set-state-in-effect */
      onDefaultValueConsumed?.()
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [defaultValue, onDefaultValueConsumed])

  useEffect(() => {
    if (!autoFocus || disabled) return
    const focus = () => {
      if (document.visibilityState === 'hidden') return
      textareaRef.current?.focus()
    }
    focus()
    document.addEventListener('visibilitychange', focus)
    return () => document.removeEventListener('visibilitychange', focus)
  }, [autoFocus, disabled])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`
    }
  }, [value])

  // Filter commands based on query
  const filteredSkills = useMemo(() => {
    if (!slashState.isActive) return []
    const query = slashState.query.toLowerCase()
    if (!query) return skills
    return skills.filter(skill => skill.name.startsWith(query))
  }, [slashState.isActive, slashState.query, skills])

  // Slash menu is only for picking a name. Once arguments follow the name, Enter sends the whole line.
  const handleChange = (newValue: string) => {
    setValue(newValue)
    const naming = newValue.startsWith('/') && !newValue.includes(' ')
    if (naming) {
      setSlashState({
        isActive: true,
        query: newValue.slice(1),
        selectedIndex: 0,
      })
    } else {
      setSlashState(prev => prev.isActive ? { ...prev, isActive: false } : prev)
    }
  }

  const handleSelectSkill = (skill: SkillSlashItem) => {
    setValue(`/${skill.name} `)
    setSlashState({ isActive: false, query: '', selectedIndex: 0 })
    textareaRef.current?.focus()
  }

  const flushSend = () => {
    onSend(value, images.length > 0 ? images : undefined)
    setValue('')
    setImages([])
    setSlashState({ isActive: false, query: '', selectedIndex: 0 })
    queuedRef.current = false
    setQueued(false)
  }

  const handleSend = () => {
    if ((!value.trim() && images.length === 0) || disabled) return
    if (isLoading) {
      queuedRef.current = true
      setQueued(true)
      return
    }
    flushSend()
  }

  useEffect(() => {
    if (isLoading || !queuedRef.current) return
    if (value.trim() || images.length > 0) {
      /* eslint-disable react-hooks/set-state-in-effect -- send queued follow-up when the run ends */
      flushSend()
      /* eslint-enable react-hooks/set-state-in-effect */
    } else {
      queuedRef.current = false
      setQueued(false)
    }
  }, [isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStop = () => {
    queuedRef.current = false
    setQueued(false)
    onStop()
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
    if (slashState.isActive && filteredSkills.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashState(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, filteredSkills.length - 1),
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
      if (e.key === 'Tab') {
        e.preventDefault()
        const selected = filteredSkills[slashState.selectedIndex]
        if (selected) handleSelectSkill(selected)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing && !value.includes(' ')) {
        e.preventDefault()
        const selected = filteredSkills[slashState.selectedIndex]
        if (selected) handleSelectSkill(selected)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashState({ isActive: false, query: '', selectedIndex: 0 })
        return
      }
    }
    // Enter sends; Shift+Enter inserts a newline. IME composition must not send.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="relative border-t p-2 bg-background space-y-1.5">
      {slashState.isActive && filteredSkills.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 max-h-64 overflow-y-auto">
          {filteredSkills.map((skill, index) => (
            <button
              key={skill.name}
              type="button"
              className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                index === slashState.selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
              }`}
              onMouseDown={(e) => { e.preventDefault(); handleSelectSkill(skill) }}
              onMouseEnter={() => setSlashState(prev => ({ ...prev, selectedIndex: index }))}
            >
              <span className="font-mono text-sm">/{skill.name}</span>
              <span className="text-xs text-muted-foreground truncate">{skill.description}</span>
            </button>
          ))}
        </div>
      )}

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

      <div className="flex items-end gap-1">
        <div className="flex shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            title="Upload image"
            className="h-8 w-8"
            disabled={disabled}
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
            className="h-8 w-8"
          >
            <FileText className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onInjectSelection}
            title="Inject selected text"
            className="h-8 w-8"
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
          placeholder={
            disabled
              ? 'Enter API key in settings...'
              : queued
                ? 'Queued — sends when the reply finishes'
                : 'Type / for commands, or ask about this page...'
          }
          disabled={disabled}
          className="min-h-[36px] max-h-[150px] resize-none text-[13px] md:text-[13px] py-1.5 px-2.5"
          rows={1}
        />
        {isLoading ? (
          <Button variant="destructive" size="icon" onClick={handleStop} title="Stop" className="h-8 w-8 shrink-0">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSend}
            disabled={(!value.trim() && images.length === 0) || disabled}
            title="Send"
            className="h-8 w-8 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {queued
          ? 'Queued as next message · Stop cancels the queue'
          : <>Enter to send, Shift+Enter for a new line · Type <kbd className="px-1 rounded bg-muted">/</kbd> for commands</>}
      </p>
    </div>
  )
}
