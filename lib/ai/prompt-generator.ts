import {
  generateContextSummary,
  getContextRecommendations,
} from "./agent-context";
import { getSkillsContext } from "./skills-context";

/**
 * Generate enhanced system prompt with context awareness.
 * Adds project state information and recommendations to the base prompt.
 * Injects condensed skills knowledge for better code quality by default.
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

  const skillsContext = getSkillsContext();

  const agenticAddendum = `

## Agentic Workflow

1. **Research** — Call \`research\` with the user's task description. This runs a dedicated research agent that searches the web and skills registry, returning a concise summary. Use the findings to inform your design and architecture decisions.
2. Inspect state with \`getProjectStructure\` before changes
3. \`readFile\` before editing existing code
4. Use \`planChanges\` to break complex tasks into steps
5. Prefer \`batchWriteFiles\` for multi-file work; use \`writeFile\`/\`editFile\` for single files
6. Check \`getBuildStatus\` after changes and fix errors immediately
7. Call \`syncProject\` after significant milestones
8. Runtime/dev-server is template-managed — do not manually start it

## Project Naming

Use descriptive lowercase-hyphenated names (e.g. "coffee-shop-landing", "fitness-tracker"). Avoid generic names like "project" or "my-app".

${skillsContext}
`;

  return basePrompt + contextSection + recommendationSection + agenticAddendum;
}
