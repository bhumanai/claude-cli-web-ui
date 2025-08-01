import React, { useEffect, useRef } from 'react'
import Prism from 'prismjs'
import 'prismjs/themes/prism-tomorrow.css'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markdown'
import { Copy, Check } from 'lucide-react'
import { cn } from '../utils/cn'

interface CodeHighlighterProps {
  code: string
  language?: string
  showLineNumbers?: boolean
  showCopyButton?: boolean
  className?: string
}

export const CodeHighlighter: React.FC<CodeHighlighterProps> = ({
  code,
  language = 'javascript',
  showLineNumbers = true,
  showCopyButton = true,
  className
}) => {
  const codeRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = React.useState(false)

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current)
    }
  }, [code, language])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const lines = code.split('\n')
  const lineNumberWidth = String(lines.length).length

  return (
    <div className={cn(
      "relative group bg-gray-900 rounded-lg overflow-hidden",
      className
    )}>
      {showCopyButton && (
        <button
          onClick={handleCopy}
          className={cn(
            "absolute top-2 right-2 p-2 rounded-md transition-all",
            "bg-gray-800 hover:bg-gray-700",
            "opacity-0 group-hover:opacity-100",
            "focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
          )}
          title="Copy code"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : (
            <Copy className="w-4 h-4 text-gray-400" />
          )}
        </button>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <tbody>
            <tr>
              {showLineNumbers && (
                <td className="select-none pr-4 py-4 text-right align-top">
                  <div className="text-gray-500 text-sm font-mono">
                    {lines.map((_, i) => (
                      <div key={i} style={{ minWidth: `${lineNumberWidth}ch` }}>
                        {i + 1}
                      </div>
                    ))}
                  </div>
                </td>
              )}
              <td className="py-4 pr-4 w-full">
                <pre className="text-sm font-mono">
                  <code
                    ref={codeRef}
                    className={`language-${language}`}
                    style={{ background: 'transparent' }}
                  >
                    {code}
                  </code>
                </pre>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Syntax detection utility
export const detectLanguage = (code: string): string => {
  // Simple heuristic-based language detection
  if (code.includes('function') || code.includes('const ') || code.includes('let ')) {
    return 'javascript'
  }
  if (code.includes('interface ') || code.includes('type ') || code.includes(': string')) {
    return 'typescript'
  }
  if (code.includes('def ') || code.includes('import ') || code.includes('print(')) {
    return 'python'
  }
  if (code.includes('#!/bin/') || code.includes('echo ') || code.includes('cd ')) {
    return 'bash'
  }
  if (code.trim().startsWith('{') || code.trim().startsWith('[')) {
    return 'json'
  }
  return 'text'
}