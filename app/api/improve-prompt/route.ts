import { generateText } from "ai"
import { withAuth } from "@/lib/auth"
import { asyncErrorHandler } from "@/lib/errors"
import { getModel, getGatewayProviderOptions } from "@/lib/ai/providers"
import { improvePromptSchema, createValidationErrorResponse, ValidationError as ZodValidationError } from "@/lib/validations"
import { logger } from "@/lib/logger"

export const maxDuration = 30

const PROMPT_IMPROVER_SYSTEM = `You are a prompt enhancement specialist. Your job is to take a user's brief web development request and expand it into a detailed, actionable prompt that will result in a better web application.

Rules:
1. Keep the core intent but add specific details about:
   - UI/UX features (animations, interactions, responsive design)
   - Pages and navigation structure
   - Key components and sections
   - Visual style and design direction
   - Interactive elements and user flows

2. Be specific but concise - aim for 2-4 sentences max
3. Use natural language, not bullet points
4. Maintain the user's original vision while enhancing it
5. Add suggestions for modern design patterns (bento grids, glassmorphism, gradients, etc.)
6. Include interactivity requirements (forms, modals, state changes)

Examples:
Input: "landing page for a startup"
Output: "Build a modern SaaS landing page with a hero section featuring animated gradient backgrounds and a product demo video, a bento-grid features section with hover effects, customer testimonials carousel, tiered pricing cards with interactive toggle for monthly/yearly billing, and a contact form with validation. Use a dark theme with vibrant accent colors and smooth scroll animations."

Input: "dashboard"
Output: "Create a comprehensive analytics dashboard with a collapsible sidebar navigation, real-time stats cards with animated counters, interactive data visualization charts, a recent activity feed with live updates, user profile dropdown menu, and a dark/light theme toggle. Include loading skeletons, empty states, and toast notifications for user actions."

Input: "portfolio"
Output: "Design a creative portfolio website with an immersive hero section featuring parallax scrolling and a 3D element, a filterable project gallery with modal previews and smooth transitions, an about section with animated skill bars, a timeline-based experience section, and a contact form with social links. Use a minimal aesthetic with bold typography and subtle micro-interactions."

Return ONLY the improved prompt, nothing else.`

export const POST = withAuth(asyncErrorHandler(async (req: Request) => {
  const requestId = req.headers.get('x-request-id') ?? 'unknown'
  const log = logger.child({ requestId, operation: 'improve-prompt' })
  
  const body = await req.json()
  
  // Validate with Zod schema
  const validation = improvePromptSchema.safeParse(body)
  if (!validation.success) {
    return createValidationErrorResponse(
      new ZodValidationError('Invalid improve-prompt request', validation.error.issues)
    )
  }
  
  const { prompt } = validation.data
  log.info('Improving prompt', { promptLength: prompt.length })

  const result = await generateText({
    model: getModel('anthropic'),
    providerOptions: getGatewayProviderOptions('anthropic'),
    system: PROMPT_IMPROVER_SYSTEM,
    prompt: prompt,
    maxOutputTokens: 300,
  })

  return Response.json({ improvedPrompt: result.text.trim() })
}))
