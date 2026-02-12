/**
 * E2B template environment configuration.
 *
 * Fragments-style approach: a single template env var (`E2B_TEMPLATE`) with a
 * legacy fallback (`E2B_TEMPLATE_ID`) for compatibility.
 */

const TEMPLATE_ENV_KEY = "E2B_TEMPLATE";
const LEGACY_TEMPLATE_ENV_KEY = "E2B_TEMPLATE_ID";

/**
 * Returns the configured E2B template identifier/name, if any.
 */
export function getConfiguredTemplate(): string | undefined {
  const preferred = process.env[TEMPLATE_ENV_KEY]?.trim();
  if (preferred) return preferred;

  const legacy = process.env[LEGACY_TEMPLATE_ENV_KEY]?.trim();
  if (legacy) return legacy;

  return undefined;
}

/**
 * Whether an E2B template has been configured.
 */
export function hasConfiguredTemplate(): boolean {
  return !!getConfiguredTemplate();
}

export { TEMPLATE_ENV_KEY, LEGACY_TEMPLATE_ENV_KEY };
