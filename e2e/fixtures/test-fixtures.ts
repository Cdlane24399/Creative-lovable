import { test as base, expect } from '@playwright/test';

/**
 * Extended test fixtures for Creative-lovable e2e tests
 */
export const test = base.extend<{
  /**
   * Navigate to the landing page and wait for it to load
   */
  landingPage: void;
}>({
  landingPage: async ({ page }, use) => {
    await page.goto('/');
    // Wait for the landing page to be fully loaded
    await page.waitForLoadState('networkidle');
    await use();
  },
});

export { expect };

/**
 * Helper to wait for hydration to complete
 */
export async function waitForHydration(page: import('@playwright/test').Page) {
  // Wait for React hydration - look for interactive elements
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle');
  // Small delay to ensure React hydration completes
  await page.waitForTimeout(500);
}

/**
 * Helper to take a full page screenshot with consistent settings
 */
export async function takeFullPageScreenshot(
  page: import('@playwright/test').Page,
  name: string
) {
  await waitForHydration(page);
  return page.screenshot({
    path: `test-results/screenshots/${name}.png`,
    fullPage: true,
  });
}

/**
 * Mock authentication for protected routes
 */
export async function mockAuthentication(page: import('@playwright/test').Page) {
  // This would be expanded based on actual auth implementation
  // For now, it's a placeholder for setting auth cookies/localStorage
  await page.evaluate(() => {
    // Mock auth state if needed
    localStorage.setItem('auth-test-mode', 'true');
  });
}

/**
 * Clear all browser state
 */
export async function clearBrowserState(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}
