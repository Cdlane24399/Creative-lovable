/**
 * E2B template environment configuration.
 *
 * Supports both variable names for backward compatibility:
 * - E2B_TEMPLATE (preferred)
 * - E2B_TEMPLATE_ID (legacy)
 */

const TEMPLATE_ENV_KEYS = ["E2B_TEMPLATE", "E2B_TEMPLATE_ID"] as const;

/**
 * Returns the configured E2B template identifier/name, if any.
 */
export function getConfiguredTemplate(): string | undefined {
  for (const key of TEMPLATE_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

/**
 * Whether an E2B template has been configured.
 */
export function hasConfiguredTemplate(): boolean {
  return !!getConfiguredTemplate();
}

export { TEMPLATE_ENV_KEYS };
