import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { withAuth } from "@/lib/auth"
import { getProjectService } from "@/lib/services"

// Use Claude Haiku for fast, cheap title generation
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
})

const model = anthropic("claude-3-5-haiku-20241022")

const TITLE_PROMPT = `Generate a short, descriptive project title (2-4 words) based on the user's request. 
The title should be:
- Concise and memorable
- Descriptive of what's being built
- In Title Case (capitalize first letter of each word)
- NO quotes, NO punctuation, just the title words

Examples:
- "build me a coffee shop website" → "Coffee Shop Website"
- "create a dashboard for my startup" → "Startup Dashboard"
- "make a portfolio site for a photographer" → "Photography Portfolio"
- "I need a todo app" → "Todo App"
- "build an e-commerce store for shoes" → "Shoe Store"

User request: `

export const POST = withAuth(async (req: Request) => {
  try {
    const { prompt, projectId } = await req.json()

    if (!prompt || typeof prompt !== "string") {
      return Response.json(
        { error: "Prompt is required" },
        { status: 400 }
      )
    }

    // Generate a title using Claude Haiku (fast and cheap)
    const result = await generateText({
      model,
      prompt: TITLE_PROMPT + prompt,
      maxOutputTokens: 20,
      temperature: 0.3,
    })

    // Clean up the title - remove quotes, punctuation, extra whitespace
    let title = result.text
      .trim()
      .replace(/^["']|["']$/g, "") // Remove surrounding quotes
      .replace(/[.!?:;]$/g, "") // Remove trailing punctuation
      .trim()

    // Ensure title is in Title Case
    title = title
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ")

    // Limit length
    if (title.length > 50) {
      title = title.substring(0, 47) + "..."
    }

    // Update project name in database if projectId provided
    if (projectId) {
      try {
        const projectService = getProjectService()
        await projectService.updateProject(projectId, { name: title })
        console.log(`[Generate Title] Updated project ${projectId} to "${title}"`)
      } catch (dbError) {
        console.warn("Failed to update project name:", dbError)
      }
    }

    return Response.json({ title })
  } catch (error) {
    console.error("Generate title error:", error)
    return Response.json(
      { error: "Failed to generate title" },
      { status: 500 }
    )
  }
})
