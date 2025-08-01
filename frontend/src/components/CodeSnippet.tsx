import React, { useState, useRef, useEffect } from 'react'
import {
  Copy,
  Check,
  Play,
  Download,
  Maximize2,
  X,
  Code,
  FileText,
  Terminal
} from 'lucide-react'
import { cn } from '../utils/cn'
import { CodeHighlighter, detectLanguage } from './CodeHighlighter'

interface CodeSnippetProps {
  code: string
  language?: string
  title?: string
  description?: string
  filename?: string
  executable?: boolean
  showLineNumbers?: boolean
  maxHeight?: number
  onExecute?: (code: string) => void
  onDownload?: (code: string, filename?: string) => void
  className?: string
}

export const CodeSnippet: React.FC<CodeSnippetProps> = ({
  code,
  language,
  title,
  description,
  filename,
  executable = false,
  showLineNumbers = true,
  maxHeight = 400,
  onExecute,
  onDownload,
  className
}) => {
  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [detectedLang, setDetectedLang] = useState(language)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!language && code) {
      setDetectedLang(detectLanguage(code))
    }
  }, [code, language])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const handleExecute = () => {
    if (onExecute && executable) {
      onExecute(code)
    }
  }

  const handleDownload = () => {
    if (onDownload) {
      onDownload(code, filename)
    } else {
      // Default download behavior
      const blob = new Blob([code], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || `code.${getFileExtension(detectedLang)}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const getFileExtension = (lang?: string) => {
    switch (lang) {
      case 'typescript':
        return 'ts'
      case 'javascript':
        return 'js'
      case 'python':
        return 'py'
      case 'bash':
        return 'sh'
      case 'json':
        return 'json'
      case 'markdown':
        return 'md'
      default:
        return 'txt'
    }
  }

  const getLanguageIcon = (lang?: string) => {
    switch (lang) {
      case 'bash':
        return <Terminal className="w-4 h-4" />
      case 'json':
      case 'markdown':
        return <FileText className="w-4 h-4" />
      default:
        return <Code className="w-4 h-4" />
    }
  }

  const shouldTruncate = !isExpanded && containerRef.current && containerRef.current.scrollHeight > maxHeight

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden",
      className
    )}>
      {/* Header */}
      {(title || description || filename) && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {title && (
                <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                  {title}
                </h4>
              )}
              {filename && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-1">
                  {getLanguageIcon(detectedLang)}
                  <span className="font-mono">{filename}</span>
                  {detectedLang && (
                    <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">
                      {detectedLang}
                    </span>
                  )}
                </div>
              )}
              {description && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {description}
                </p>
              )}
            </div>
            
            {/* Action buttons */}
            <div className="flex items-center gap-1 ml-4">
              {executable && onExecute && (
                <button
                  onClick={handleExecute}
                  className="p-2 text-gray-500 hover:text-green-600 dark:hover:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                  title="Execute code"
                >
                  <Play className="w-4 h-4" />
                </button>
              )}
              
              <button
                onClick={handleDownload}
                className="p-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                title="Download code"
              >
                <Download className="w-4 h-4" />
              </button>
              
              <button
                onClick={handleCopy}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                title="Copy code"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              
              {shouldTruncate && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                  title={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? (
                    <X className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Code content */}
      <div
        ref={containerRef}
        className={cn(
          "relative overflow-hidden",
          !isExpanded && `max-h-[${maxHeight}px]`
        )}
        style={{ maxHeight: !isExpanded ? maxHeight : undefined }}
      >
        <CodeHighlighter
          code={code}
          language={detectedLang}
          showLineNumbers={showLineNumbers}
          showCopyButton={false} // We have our own copy button
          className="border-0 rounded-none"
        />
        
        {/* Fade overlay when truncated */}
        {shouldTruncate && !isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-gray-900 to-transparent pointer-events-none" />
        )}
      </div>

      {/* Expand/Collapse button for truncated content */}
      {shouldTruncate && (
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
          >
            {isExpanded ? 'Show less' : `Show more (${code.split('\n').length} lines)`}
          </button>
        </div>
      )}

      {/* Footer with quick actions */}
      {!title && !description && !filename && (
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <span className="text-gray-500 dark:text-gray-400">
                {code.split('\n').length} lines
              </span>
              {detectedLang && (
                <span className="text-gray-500 dark:text-gray-400">
                  {detectedLang}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {executable && onExecute && (
                <button
                  onClick={handleExecute}
                  className="text-green-600 dark:text-green-400 hover:underline flex items-center gap-1"
                >
                  <Play className="w-3 h-3" />
                  Run
                </button>
              )}
              <button
                onClick={handleCopy}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Export utility function for external use
export const createCodeSnippet = (
  code: string,
  options: Partial<CodeSnippetProps> = {}
) => {
  return {
    code,
    language: options.language || detectLanguage(code),
    ...options
  }
}