"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

interface ChatMarkdownProps {
  content: string
  className?: string
}

export function ChatMarkdown({ content, className }: ChatMarkdownProps) {
  return (
    <div className={cn("prose prose-invert prose-sm max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom code block styling
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "")
            const isInline = !match
            
            if (isInline) {
              return (
                <code
                  className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-xs font-mono text-emerald-400"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            
            return (
              <code className={cn("text-xs", className)} {...props}>
                {children}
              </code>
            )
          },
          // Custom pre block styling
          pre({ children, ...props }) {
            return (
              <pre
                className="my-2 overflow-x-auto rounded-xl border border-zinc-700/50 bg-zinc-900 p-3 text-xs"
                {...props}
              >
                {children}
              </pre>
            )
          },
          // Custom link styling
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 hover:underline"
                {...props}
              >
                {children}
              </a>
            )
          },
          // Custom paragraph styling
          p({ children, ...props }) {
            return (
              <p className="mb-2 last:mb-0 leading-relaxed" {...props}>
                {children}
              </p>
            )
          },
          // Custom list styling
          ul({ children, ...props }) {
            return (
              <ul className="my-2 ml-4 list-disc space-y-1" {...props}>
                {children}
              </ul>
            )
          },
          ol({ children, ...props }) {
            return (
              <ol className="my-2 ml-4 list-decimal space-y-1" {...props}>
                {children}
              </ol>
            )
          },
          // Custom heading styles
          h1({ children, ...props }) {
            return (
              <h1 className="mb-2 mt-4 text-lg font-semibold text-zinc-100" {...props}>
                {children}
              </h1>
            )
          },
          h2({ children, ...props }) {
            return (
              <h2 className="mb-2 mt-3 text-base font-semibold text-zinc-100" {...props}>
                {children}
              </h2>
            )
          },
          h3({ children, ...props }) {
            return (
              <h3 className="mb-1 mt-2 text-sm font-semibold text-zinc-100" {...props}>
                {children}
              </h3>
            )
          },
          // Custom blockquote
          blockquote({ children, ...props }) {
            return (
              <blockquote
                className="my-2 border-l-2 border-zinc-600 pl-3 italic text-zinc-400"
                {...props}
              >
                {children}
              </blockquote>
            )
          },
          // Custom table styling
          table({ children, ...props }) {
            return (
              <div className="my-2 overflow-x-auto rounded-lg border border-zinc-700/50">
                <table className="w-full text-xs" {...props}>
                  {children}
                </table>
              </div>
            )
          },
          th({ children, ...props }) {
            return (
              <th className="border-b border-zinc-700/50 bg-zinc-800/50 px-3 py-2 text-left font-medium text-zinc-300" {...props}>
                {children}
              </th>
            )
          },
          td({ children, ...props }) {
            return (
              <td className="border-b border-zinc-700/30 px-3 py-2 text-zinc-400" {...props}>
                {children}
              </td>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
