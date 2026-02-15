/**
 * Skills Context - Condensed Best Practices for System Prompt
 *
 * Loads and condenses the highest-impact rules from installed skills
 * into a compact context string for injection into the system prompt.
 *
 * Sources:
 * - vercel-react-best-practices: 57 rules, 8 categories
 * - vercel-composition-patterns: Compound components, state lifting, React 19
 * - web-design-guidelines: Accessibility, performance, responsive design
 *
 * Kept under 500 tokens to avoid bloating the system prompt.
 */

/**
 * Condensed skills context string for system prompt injection.
 *
 * Contains the highest-impact rules extracted from installed skills,
 * organized by priority. These rules guide the agent to produce
 * better code by default without needing external lookups.
 */
export const SKILLS_CONTEXT = `## Code Quality Rules (from installed skills)

### Performance (CRITICAL)
- Use Promise.all() for independent async operations — never sequential awaits
- Use next/dynamic for heavy components (charts, editors, maps, 3D)
- Import directly from modules — avoid barrel file re-exports
- Use Suspense boundaries to stream independent content sections
- Parallelize server-side data fetching by restructuring component hierarchy
- Use after() for non-blocking operations (logging, analytics)
- Preload components on hover/focus for perceived speed

### Architecture (HIGH)
- Never add boolean props to customize behavior — use composition and explicit variants
- Use compound components with shared context for complex UI (Tabs, Accordions, Dialogs)
- Lift state into provider components when siblings need access
- Decouple state implementation from component interface via context providers
- Use children for composition instead of renderX props

### React Patterns (MEDIUM)
- Derive state during render, not in effects — avoid unnecessary useEffect
- Use functional setState for stable callbacks that don't trigger re-renders
- Pass functions to useState for expensive initial values
- Use refs for transient frequently-changing values (scroll position, mouse coords)
- Use startTransition for non-urgent updates (filtering, sorting)
- Use content-visibility: auto for long scrollable lists

### Design & Accessibility (HIGH)
- All interactive elements must have visible focus states (outline, ring)
- All images must have alt text; decorative images use alt=""
- Touch targets minimum 44x44px on mobile
- Color contrast minimum 4.5:1 for text, 3:1 for large text
- Test keyboard navigation for all interactive flows
- Use semantic HTML (nav, main, article, section, aside)
- Provide loading, empty, and error states for all async UI

### React 19 (when applicable)
- Don't use forwardRef — pass ref as a regular prop
- Use use() instead of useContext() for reading context`;

/**
 * Get the condensed skills context for system prompt injection.
 * Returns the pre-built context string.
 */
export function getSkillsContext(): string {
  return SKILLS_CONTEXT;
}
