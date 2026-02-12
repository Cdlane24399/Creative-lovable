/**
 * Sandbox project directory resolution.
 *
 * Default behavior:
 * - With E2B template: use /home/user/project (project root)
 * - Without template: use /home/user/project (scaffolded layout)
 *
 * Override by setting E2B_PROJECT_DIR.
 */

import { hasConfiguredTemplate } from "./template-config";

const DEFAULT_PROJECT_DIR = "/home/user/project";
// Even with a template, the project should live under /home/user/project.
// Using /home/user causes sync tools to capture shell dotfiles and other system artifacts.
const TEMPLATE_PROJECT_DIR = "/home/user/project";

/**
 * Resolve the active project directory inside the sandbox.
 */
export function getProjectDir(): string {
  const configured = process.env.E2B_PROJECT_DIR?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "") || DEFAULT_PROJECT_DIR;
  }

  return hasConfiguredTemplate() ? TEMPLATE_PROJECT_DIR : DEFAULT_PROJECT_DIR;
}

export { DEFAULT_PROJECT_DIR, TEMPLATE_PROJECT_DIR };
