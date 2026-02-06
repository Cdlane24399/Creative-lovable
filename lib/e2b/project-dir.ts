/**
 * Sandbox project directory resolution.
 *
 * Default behavior:
 * - With E2B template: use /home/user (current template layout)
 * - Without template: use /home/user/project (scaffolded layout)
 *
 * Override by setting E2B_PROJECT_DIR.
 */

const DEFAULT_PROJECT_DIR = "/home/user/project";
const TEMPLATE_PROJECT_DIR = "/home/user";

/**
 * Resolve the active project directory inside the sandbox.
 */
export function getProjectDir(): string {
  const configured = process.env.E2B_PROJECT_DIR?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "") || DEFAULT_PROJECT_DIR;
  }

  return process.env.E2B_TEMPLATE_ID
    ? TEMPLATE_PROJECT_DIR
    : DEFAULT_PROJECT_DIR;
}

export { DEFAULT_PROJECT_DIR, TEMPLATE_PROJECT_DIR };
