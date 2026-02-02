"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

interface CopyButtonProps {
    value: string
    className?: string
}

export function CopyButton({ value, className }: CopyButtonProps) {
    const [hasCopied, setHasCopied] = React.useState(false)

    const onCopy = (e: React.MouseEvent) => {
        e.stopPropagation() // Prevent triggering parent click handlers if any
        navigator.clipboard.writeText(value)
        setHasCopied(true)
        setTimeout(() => setHasCopied(false), 2000)
    }

    return (
        <button
            type="button"
            className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 transition-all z-10",
                hasCopied && "border-emerald-500/50 text-emerald-500",
                className
            )}
            onClick={onCopy}
            aria-label={hasCopied ? "Copied" : "Copy code"}
            title={hasCopied ? "Copied" : "Copy code"}
        >
            {hasCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
    )
}
