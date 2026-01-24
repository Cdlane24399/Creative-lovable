"use client"

import { Sparkles, Layers, Grid3X3, Wand2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SuggestionChipsProps {
    suggestions: string[]
    onSelect: (suggestion: string) => void
    className?: string
}

// Map suggestions to appropriate icons
function getIconForSuggestion(suggestion: string) {
    const lowerSuggestion = suggestion.toLowerCase()

    if (lowerSuggestion.includes("3d") || lowerSuggestion.includes("interactive")) {
        return Sparkles
    }
    if (lowerSuggestion.includes("gallery") || lowerSuggestion.includes("grid")) {
        return Grid3X3
    }
    if (lowerSuggestion.includes("card") || lowerSuggestion.includes("content") || lowerSuggestion.includes("section")) {
        return Layers
    }
    // Default icon for effects, animations, etc.
    return Wand2
}

export function SuggestionChips({ suggestions, onSelect, className }: SuggestionChipsProps) {
    if (!suggestions || suggestions.length === 0) {
        return null
    }

    return (
        <div className={cn("flex flex-wrap gap-2 px-1 pt-2", className)}>
            {suggestions.map((suggestion, index) => {
                const Icon = getIconForSuggestion(suggestion)

                return (
                    <button
                        key={`${suggestion}-${index}`}
                        onClick={() => onSelect(suggestion)}
                        className={cn(
                            "inline-flex items-center gap-1.5",
                            "bg-zinc-800 hover:bg-zinc-700",
                            "text-zinc-300 hover:text-zinc-100",
                            "text-xs px-3 py-1.5 rounded-full",
                            "border border-zinc-700/50 hover:border-zinc-600",
                            "transition-all duration-200 ease-out",
                            "hover:scale-[1.02] hover:shadow-md hover:shadow-black/20",
                            "active:scale-[0.98]",
                            "focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:ring-offset-1 focus:ring-offset-zinc-900"
                        )}
                    >
                        <Icon className="h-3 w-3 text-zinc-400" />
                        <span>{suggestion}</span>
                    </button>
                )
            })}
        </div>
    )
}

// Default contextual suggestions based on common UI enhancements
export const defaultSuggestions = [
    "Add 3D interactive card",
    "Add card content",
    "Create card gallery",
    "Add particle effects",
]
