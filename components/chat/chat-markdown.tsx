"use client"

import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import { cn } from "@/lib/utils"

interface ChatMarkdownProps {
  content: string
  className?: string
  isStreaming?: boolean
}

export function ChatMarkdown({ content, className, isStreaming = false }: ChatMarkdownProps) {
  return (
    <div className={cn("prose prose-invert prose-sm max-w-none", className)}>
      <Streamdown isAnimating={isStreaming} className="streamdown">
        {content}
      </Streamdown>
    </div>
  )
}
