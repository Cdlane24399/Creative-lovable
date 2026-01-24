"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  children?: React.ReactNode
}

export function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  const [isCopied, setIsCopied] = React.useState(false)
  const preRef = React.useRef<HTMLPreElement>(null)

  const copyToClipboard = async () => {
    if (!preRef.current) return

    const code = preRef.current.textContent || ""
    try {
      await navigator.clipboard.writeText(code)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy text: ", err)
    }
  }

  return (
    <div className="relative group">
      <pre
        ref={preRef}
        className={cn(
          "my-2 overflow-x-auto rounded-xl border border-zinc-700/50 bg-zinc-900 p-3 text-xs pr-10",
          className
        )}
        {...props}
      >
        {children}
      </pre>

      <button
        onClick={copyToClipboard}
        className={cn(
          "absolute right-2 top-2 p-1.5 rounded-lg border border-zinc-700/50 bg-zinc-800/80 text-zinc-400 opacity-0 transition-all focus:opacity-100 group-hover:opacity-100",
          "hover:bg-zinc-700 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500",
          isCopied && "border-emerald-500/50 text-emerald-400 opacity-100 bg-emerald-500/10"
        )}
        aria-label={isCopied ? "Copied" : "Copy code"}
        title="Copy code"
      >
        {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
