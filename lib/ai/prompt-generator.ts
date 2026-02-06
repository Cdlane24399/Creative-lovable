import {
  generateContextSummary,
  getContextRecommendations,
} from "./agent-context";

/**
 * Generate enhanced system prompt with context awareness.
 * Adds project state information and recommendations to the base prompt.
 */
export function generateAgenticSystemPrompt(
  projectId: string,
  basePrompt: string,
): string {
  const summary = generateContextSummary(projectId);
  const recommendations = getContextRecommendations(projectId);

  const contextSection =
    summary !== "No context available yet."
      ? `\n\n## Current Project State\n${summary}`
      : "";

  const recommendationSection =
    recommendations.length > 0
      ? `\n\n## Recommendations\n${recommendations.map((r) => `- ${r}`).join("\n")}`
      : "";

  const agenticAddendum = `

## Agentic Workflow Guidelines

You are an autonomous agent with deep awareness of project state. Follow these principles:

1. **Check State First**: Use \`getProjectStructure\` to understand what already exists before making any changes
2. **Plan First**: For complex tasks, use \`planChanges\` to break work into steps
3. **Create Clearly**: Use explicit \`writeFile\` and \`editFile\` calls per file
4. **Track Progress**: Use \`markStepComplete\` after finishing each planned step
5. **Fix Errors**: Always check \`getBuildStatus\` after changes and fix any errors
6. **Iterate**: Don't stop at first attempt - verify, fix, and improve

## Project Naming Guidelines

When creating new projects:
- ALWAYS use descriptive names based on the user's request
- Good examples: "coffee-shop-landing", "portfolio-site", "fitness-tracker", "restaurant-menu"
- BAD examples: "project", "my-app", "test", "website" (too generic!)
- Names should be lowercase with hyphens, no spaces or special characters
`;

  return basePrompt + contextSection + recommendationSection + agenticAddendum;
}
