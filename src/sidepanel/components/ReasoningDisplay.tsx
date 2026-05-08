import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Brain } from 'lucide-react'

interface ReasoningDisplayProps {
  text: string
  isStreaming?: boolean
}

export function ReasoningDisplay({ text, isStreaming }: ReasoningDisplayProps) {
  const [expanded, setExpanded] = useState(isStreaming ?? false)
  const prevStreamingRef = useRef(isStreaming)

  // Auto-collapse when streaming finishes
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      setExpanded(false)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming])

  if (!text) return null

  return (
    <div className="my-1 rounded border border-muted-foreground/20 bg-muted/30 overflow-hidden text-[12px]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Brain className="h-3 w-3 shrink-0" />
        <span className="text-[11px] font-medium">
          {isStreaming ? 'Thinking...' : 'Thought'}
        </span>
        {isStreaming && (
          <span className="inline-block w-1 h-3 bg-muted-foreground/50 animate-pulse" />
        )}
        <span className="ml-auto">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 text-muted-foreground/70 italic whitespace-pre-wrap [overflow-wrap:anywhere] max-h-60 overflow-y-auto leading-relaxed">
          {text}
        </div>
      )}
    </div>
  )
}
