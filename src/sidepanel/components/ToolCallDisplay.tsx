import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Wrench, CheckCircle2, ChevronDown, ChevronUp, Copy, Check, AlertCircle } from 'lucide-react'

// Accept any tool UI part shape from AI SDK (static 'tool-{name}' or dynamic 'dynamic-tool')
export interface ToolPartProps {
  type: string        // 'tool-query_tabs' (static) or 'dynamic-tool' (dynamic/MCP)
  toolName?: string   // present on dynamic tool parts
  toolCallId: string
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error' | 'approval-requested' | 'approval-responded' | 'output-denied'
  input?: any
  output?: any
  errorText?: string
}

interface ToolCallDisplayProps {
  part: ToolPartProps
}

export function ToolCallDisplay({ part }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false)
  const [copiedField, setCopiedField] = useState<'input' | 'output' | null>(null)

  // Dynamic tools: type='dynamic-tool', name in toolName. Static tools: type='tool-{name}'.
  const toolName = part.type === 'dynamic-tool'
    ? (part.toolName || 'unknown')
    : part.type.startsWith('tool-') ? part.type.slice(5) : part.type

  const handleCopy = async (data: any, field: 'input' | 'output') => {
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 1500)
  }

  const inputStr = part.input ? JSON.stringify(part.input, null, 2) : '{}'
  const outputStr = part.output
    ? typeof part.output === 'string'
      ? part.output
      : JSON.stringify(part.output, null, 2)
    : null

  const hasOutput = part.state === 'output-available'
  const hasError = part.state === 'output-error'

  return (
    <Card className="p-2 my-1.5 bg-blue-50/80 dark:bg-blue-950/50 border-blue-200/60 dark:border-blue-800/60 overflow-hidden min-w-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-left"
      >
        <Wrench className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <Badge variant="outline" className="text-xs font-mono">
          {toolName}
        </Badge>
        {hasOutput && (
          <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0" />
        )}
        {hasError && (
          <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
        )}
        <span className="flex-1" />
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        }
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {/* Input/Args */}
          {inputStr !== '{}' && (
            <div className="text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground font-medium">Args</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={(e) => { e.stopPropagation(); handleCopy(part.input, 'input') }}
                >
                  {copiedField === 'input'
                    ? <Check className="h-3 w-3 text-green-600" />
                    : <Copy className="h-3 w-3 text-muted-foreground" />
                  }
                </Button>
              </div>
              <pre className="p-2 bg-background rounded text-xs overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
                {inputStr}
              </pre>
            </div>
          )}

          {/* Output/Result */}
          {outputStr && (
            <div className="text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-green-700 dark:text-green-400 font-medium">Result</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={(e) => { e.stopPropagation(); handleCopy(part.output, 'output') }}
                >
                  {copiedField === 'output'
                    ? <Check className="h-3 w-3 text-green-600" />
                    : <Copy className="h-3 w-3 text-muted-foreground" />
                  }
                </Button>
              </div>
              <pre className="p-2 bg-green-50 dark:bg-green-950/50 rounded text-xs overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
                {outputStr}
              </pre>
            </div>
          )}

          {/* Error */}
          {hasError && part.errorText && (
            <div className="text-xs">
              <span className="text-red-500 font-medium">Error: </span>
              <span className="text-red-400">{part.errorText}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
