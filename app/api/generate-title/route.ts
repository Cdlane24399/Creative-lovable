import { generateText } from "ai";
import { withAuth } from "@/lib/auth";
import { asyncErrorHandler } from "@/lib/errors";
import { ValidationError } from "@/lib/errors";
import { getProjectService } from "@/lib/services";
import {
  getModel,
  getGatewayProviderOptions,
  getOpenRouterModel,
  hasOpenRouterFallback,
} from "@/lib/ai/providers";

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

User request: `;

export const POST = withAuth(
  asyncErrorHandler(async (req: Request) => {
    const { prompt, projectId } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      throw new ValidationError("Prompt is required", {
        prompt: ["string required"],
      });
    }

    // Generate a title using Claude Haiku (fast and cheap)
    let result: Awaited<ReturnType<typeof generateText>>;
    try {
      result = await generateText({
        model: getModel("haiku"),
        providerOptions: getGatewayProviderOptions("haiku"),
        prompt: TITLE_PROMPT + prompt,
        maxOutputTokens: 20,
        temperature: 0.3,
      });
    } catch (gatewayError) {
      if (!hasOpenRouterFallback()) {
        throw gatewayError;
      }

      console.warn(
        "[generate-title] Gateway failed, retrying with OpenRouter fallback:",
        gatewayError,
      );
      result = await generateText({
        model: getOpenRouterModel("haiku"),
        prompt: TITLE_PROMPT + prompt,
        maxOutputTokens: 20,
        temperature: 0.3,
      });
    }

    // Clean up the title - remove quotes, punctuation, extra whitespace
    let title = result.text
      .trim()
      .replace(/^["']|["']$/g, "") // Remove surrounding quotes
      .replace(/[.!?:;]$/g, "") // Remove trailing punctuation
      .trim();

    // Ensure title is in Title Case
    title = title
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    // Limit length
    if (title.length > 50) {
      title = title.substring(0, 47) + "...";
    }

    // Update project name in database if projectId provided.
    // Keep this in-band so auto naming is reliable.
    if (projectId) {
      try {
        const projectService = getProjectService();
        await projectService.ensureProjectExists(projectId, title);
        await projectService.updateProject(projectId, { name: title });
      } catch (dbError) {
        console.warn("[generate-title] Failed to update project name:", dbError);
      }
    }

    return Response.json({ title });
  }),
);
