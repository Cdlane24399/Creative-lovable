import { tool } from "ai"
import { z } from "zod"
import { planStepsSchema } from "../schemas/tool-schemas"
import { setCurrentPlan, completeStep, recordToolExecution, getAgentContext } from "../agent-context"
import { createErrorResult } from "../utils"

/**
 * Creates planning tools for managing multi-step implementation workflows.
 * These tools help break down complex tasks and track progress.
 */
export function createPlanningTools(projectId: string) {
  const ctx = () => getAgentContext(projectId)

  return {
    /**
     * Creates a detailed plan for implementing features or changes.
     * Use FIRST before starting complex multi-step tasks.
     */
    planChanges: tool({
      description:
        "Create a detailed plan for implementing a feature or making changes. " +
        "Use this FIRST before starting complex tasks to break them into manageable steps. " +
        "Each step should be a discrete, verifiable action.",
      inputSchema: z.object({
        goal: z
          .string()
          .min(1)
          .max(500)
          .describe("The overall goal or feature to implement - be specific and measurable"),
        steps: planStepsSchema,
      }),
      execute: async ({ goal, steps }) => {
        const startTime = new Date()

        try {
          setCurrentPlan(projectId, steps)

          recordToolExecution(
            projectId,
            "planChanges",
            { goal, steps },
            { success: true },
            true,
            undefined,
            startTime
          )

          return {
            success: true,
            goal,
            totalSteps: steps.length,
            steps,
            message: `Plan created with ${steps.length} steps. Execute steps sequentially and mark each complete.`,
            nextStep: steps[0],
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Planning failed"
          recordToolExecution(projectId, "planChanges", { goal, steps }, undefined, false, errorMsg, startTime)
          return createErrorResult(error)
        }
      },
    }),

    /**
     * Marks a planned step as complete with optional notes.
     * Use after finishing each step to track progress.
     */
    markStepComplete: tool({
      description:
        "Mark a planned step as complete. Use this after finishing each step in your plan. " +
        "Provides progress tracking and shows remaining steps.",
      inputSchema: z.object({
        step: z.string().min(1).describe("Description of the completed step (should match plan)"),
        notes: z
          .string()
          .max(500)
          .optional()
          .describe("Optional notes about implementation details or issues encountered"),
      }),
      execute: async ({ step, notes }) => {
        const startTime = new Date()

        try {
          completeStep(projectId, step)
          const context = ctx()

          const totalSteps = context.currentPlan?.length ?? 0
          const completedCount = context.completedSteps.length
          const remainingSteps = context.currentPlan?.slice(completedCount) ?? []

          const result = {
            success: true,
            completedStep: step,
            progress: `${completedCount}/${totalSteps}`,
            progressPercent: totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 100,
            remainingSteps,
            nextStep: remainingSteps[0] ?? null,
            notes,
            isComplete: remainingSteps.length === 0,
          }

          recordToolExecution(projectId, "markStepComplete", { step, notes }, result, true, undefined, startTime)

          return result
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Failed to mark step complete"
          recordToolExecution(projectId, "markStepComplete", { step }, undefined, false, errorMsg, startTime)
          return createErrorResult(error)
        }
      },
    }),
  }
}
