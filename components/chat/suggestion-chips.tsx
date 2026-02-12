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

const HEURISTIC_RULES: Array<{ keywords: string[]; suggestions: string[] }> = [
  {
    keywords: ["auth", "login", "signup", "user"],
    suggestions: [
      "Add forgot-password flow",
      "Add social sign-in",
      "Add account settings page",
      "Add role-based access",
    ],
  },
  {
    keywords: ["dashboard", "analytics", "metrics", "chart"],
    suggestions: [
      "Add date-range filters",
      "Add export to CSV",
      "Add realtime metrics",
      "Add drill-down charts",
    ],
  },
  {
    keywords: ["ecommerce", "shop", "cart", "product", "checkout"],
    suggestions: [
      "Add product search",
      "Add saved favorites",
      "Add order history",
      "Add checkout validation",
    ],
  },
  {
    keywords: ["landing", "marketing", "hero", "homepage"],
    suggestions: [
      "Add testimonials section",
      "Add pricing comparison",
      "Add FAQ accordion",
      "Add conversion tracking",
    ],
  },
]

export function buildHeuristicSuggestions(contextText?: string): string[] {
  const normalized = (contextText || "").toLowerCase()
  for (const rule of HEURISTIC_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.suggestions
    }
  }
  return defaultSuggestions
}

export const defaultSuggestions = [
  "Add loading skeletons",
  "Add empty state UX",
  "Add keyboard shortcuts",
  "Add mobile polish",
]
