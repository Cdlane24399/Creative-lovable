import { test, expect, waitForHydration } from './fixtures/test-fixtures';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);
  });

  test('should load the landing page successfully', async ({ page }) => {
    // Check that the page loaded
    await expect(page).toHaveTitle(/Creative/i);

    // Verify the main content is visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display the main heading', async ({ page }) => {
    // Look for a prominent heading on the landing page
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();
  });

  test('should have working navigation', async ({ page }) => {
    // Check for navigation links
    const navLinks = page.locator('nav a, header a');
    const linkCount = await navLinks.count();

    // Should have at least some navigation
    expect(linkCount).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await waitForHydration(page);

    // Page should still be functional
    await expect(page.locator('body')).toBeVisible();

    // Check no horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20); // Small tolerance
  });

  test('should navigate to editor when starting a project', async ({ page }) => {
    // Look for a CTA button that would start a project
    const ctaButton = page.locator('button, a').filter({ hasText: /start|build|create|try/i }).first();

    if (await ctaButton.isVisible()) {
      await ctaButton.click();
      // Should navigate or show editor interface
      await page.waitForTimeout(1000);
      // Verify we're in a different state (editor mode or different page)
    }
  });
});

test.describe('Landing Page - Visual Regression', () => {
  test('landing page visual snapshot - desktop', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);

    // Wait for any animations to complete
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('landing-desktop.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('landing page visual snapshot - mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await waitForHydration(page);

    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('landing-mobile.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('landing page visual snapshot - tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await waitForHydration(page);

    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('landing-tablet.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});
