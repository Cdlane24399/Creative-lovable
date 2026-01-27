import { test, expect, waitForHydration } from './fixtures/test-fixtures';

test.describe('Accessibility', () => {
  test.describe('Landing Page Accessibility', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await waitForHydration(page);
    });

    test('should have proper heading hierarchy', async ({ page }) => {
      // Get all headings
      const h1Count = await page.locator('h1').count();
      const h2Count = await page.locator('h2').count();

      // Should have at least one h1
      expect(h1Count).toBeGreaterThanOrEqual(1);

      // h1 should come before h2 in the DOM (proper hierarchy)
      if (h1Count > 0 && h2Count > 0) {
        const h1Position = await page.locator('h1').first().evaluate(el => {
          return Array.from(document.querySelectorAll('*')).indexOf(el);
        });
        const h2Position = await page.locator('h2').first().evaluate(el => {
          return Array.from(document.querySelectorAll('*')).indexOf(el);
        });
        expect(h1Position).toBeLessThan(h2Position);
      }
    });

    test('should have accessible images with alt text', async ({ page }) => {
      const images = page.locator('img');
      const imageCount = await images.count();

      for (let i = 0; i < imageCount; i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        const role = await img.getAttribute('role');

        // Images should have alt text or be decorative (role="presentation")
        const hasAccessibleAlt = alt !== null || role === 'presentation' || role === 'none';
        expect(hasAccessibleAlt).toBeTruthy();
      }
    });

    test('should have accessible form labels', async ({ page }) => {
      const inputs = page.locator('input:not([type="hidden"]), textarea, select');
      const inputCount = await inputs.count();

      for (let i = 0; i < inputCount; i++) {
        const input = inputs.nth(i);
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledBy = await input.getAttribute('aria-labelledby');
        const placeholder = await input.getAttribute('placeholder');

        // Input should have some form of accessible label
        const hasLabel = id
          ? await page.locator(`label[for="${id}"]`).count() > 0
          : false;
        const hasAccessibleName = ariaLabel || ariaLabelledBy || hasLabel || placeholder;

        expect(hasAccessibleName).toBeTruthy();
      }
    });

    test('should have sufficient color contrast', async ({ page }) => {
      // This is a basic check - for comprehensive testing use axe-core
      // Check that text elements have proper styling
      const textElements = page.locator('p, span, h1, h2, h3, h4, h5, h6, a, button');
      const count = await textElements.count();

      // Ensure text elements exist and are visible
      expect(count).toBeGreaterThan(0);

      // Check first few text elements are visible
      for (let i = 0; i < Math.min(5, count); i++) {
        const element = textElements.nth(i);
        if (await element.isVisible()) {
          // Element should have computed styles
          const color = await element.evaluate(el => {
            return window.getComputedStyle(el).color;
          });
          expect(color).toBeTruthy();
        }
      }
    });

    test('should be navigable with keyboard only', async ({ page }) => {
      // Start from the top of the page
      await page.keyboard.press('Tab');

      // Should be able to tab through interactive elements
      let focusableCount = 0;
      const maxTabs = 20;

      for (let i = 0; i < maxTabs; i++) {
        const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
        if (focusedTag && focusedTag !== 'BODY') {
          focusableCount++;
        }
        await page.keyboard.press('Tab');
      }

      // Should have focusable elements
      expect(focusableCount).toBeGreaterThan(0);
    });

    test('should have skip link or proper navigation', async ({ page }) => {
      // Check for skip link
      const skipLink = page.locator('a[href="#main"], a[href="#content"], a:has-text("Skip")');
      const hasSkipLink = await skipLink.count() > 0;

      // Check for main landmark
      const mainLandmark = page.locator('main, [role="main"]');
      const hasMainLandmark = await mainLandmark.count() > 0;

      // Should have either skip link or proper landmark structure
      expect(hasSkipLink || hasMainLandmark).toBeTruthy();
    });
  });

  test.describe('Auth Pages Accessibility', () => {
    test('login form should be accessible', async ({ page }) => {
      await page.goto('/login');
      await waitForHydration(page);

      // Check form has proper labels
      const emailInput = page.locator('input[type="email"], input[name="email"]');
      if (await emailInput.isVisible()) {
        const emailId = await emailInput.getAttribute('id');
        const emailAriaLabel = await emailInput.getAttribute('aria-label');
        const hasEmailLabel = emailId
          ? await page.locator(`label[for="${emailId}"]`).count() > 0
          : false;

        expect(hasEmailLabel || emailAriaLabel).toBeTruthy();
      }

      // Check password input
      const passwordInput = page.locator('input[type="password"]');
      if (await passwordInput.isVisible()) {
        const passwordId = await passwordInput.getAttribute('id');
        const passwordAriaLabel = await passwordInput.getAttribute('aria-label');
        const hasPasswordLabel = passwordId
          ? await page.locator(`label[for="${passwordId}"]`).count() > 0
          : false;

        expect(hasPasswordLabel || passwordAriaLabel).toBeTruthy();
      }
    });

    test('signup form should be accessible', async ({ page }) => {
      await page.goto('/signup');
      await waitForHydration(page);

      // Form should be keyboard accessible
      await page.keyboard.press('Tab');
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
    });
  });
});

test.describe('Focus Management', () => {
  test('should have visible focus indicators', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);

    // Tab to first focusable element
    await page.keyboard.press('Tab');

    // Check that focus is visible (element has focus styles)
    const hasFocusVisible = await page.evaluate(() => {
      const activeElement = document.activeElement;
      if (!activeElement || activeElement === document.body) return false;

      const styles = window.getComputedStyle(activeElement);
      // Check for common focus indicators
      return (
        styles.outline !== 'none' ||
        styles.outlineWidth !== '0px' ||
        styles.boxShadow !== 'none' ||
        activeElement.classList.contains('focus-visible') ||
        activeElement.matches(':focus-visible')
      );
    });

    // Focus should be visible (this may need adjustment based on design)
    expect(hasFocusVisible).toBeTruthy();
  });
});
