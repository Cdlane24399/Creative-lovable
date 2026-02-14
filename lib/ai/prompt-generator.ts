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

## Agentic Workflow

1. Inspect state with \`getProjectStructure\` before changes
2. \`readFile\` before editing existing code
3. Use \`planChanges\` to break complex tasks into steps
4. Prefer \`batchWriteFiles\` for multi-file work; use \`writeFile\`/\`editFile\` for single files
5. Check \`getBuildStatus\` after changes and fix errors immediately
6. Call \`syncProject\` after significant milestones
7. Runtime/dev-server is template-managed — do not manually start it

## Project Naming

Use descriptive lowercase-hyphenated names (e.g. "coffee-shop-landing", "fitness-tracker"). Avoid generic names like "project" or "my-app".
`;

  return basePrompt + contextSection + recommendationSection + agenticAddendum;
}
