import { tool } from "ai"
import { z } from "zod"

const suggestionSchema = z.object({
  text: z
    .string()
    .min(3)
    .max(50)
    .describe("Short actionable suggestion (3-8 words)"),
  type: z
    .enum(["next-step", "exploration"])
    .describe("'next-step' for logical follow-ups, 'exploration' for creative alternatives"),
})

const suggestionsInputSchema = z.object({
  suggestions: z
    .array(suggestionSchema)
    .length(4)
    .describe("Exactly 4 suggestions mixing next-steps and explorations"),
})

type SuggestionsInput = z.infer<typeof suggestionsInputSchema>

/**
 * Creates suggestion tools for generating contextual follow-up suggestions.
 * These tools help guide users on what to do next after AI completes a task.
 */
export function createSuggestionTools(_projectId: string) {
  return {
    /**
     * Generates contextual suggestions for what the user might want to do next.
     * Call this at the END of every response to provide helpful follow-up options.
     */
    generateSuggestions: tool({
      description:
        "Generate 4 contextual follow-up suggestions based on what was just built or changed. " +
        "Call this at the END of every response. Mix practical next steps (what to build next) " +
        "with creative exploration options (alternative approaches, enhancements). " +
        "Keep suggestions short (3-8 words) and actionable.",
      inputSchema: suggestionsInputSchema,
      execute: async ({ suggestions }: SuggestionsInput) => {
        // Simply return the suggestions - they'll be extracted client-side
        return {
          success: true,
          suggestions: suggestions.map((s) => s.text),
          metadata: suggestions,
        }
      },
    }),
  }
}
