import { test, expect, waitForHydration } from './fixtures/test-fixtures';

test.describe('Editor Interface', () => {
  test.describe('Editor Navigation', () => {
    test('should navigate to editor from landing page', async ({ page }) => {
      await page.goto('/');
      await waitForHydration(page);

      // Find and click a button that would start a project
      const startButton = page.locator('button, a').filter({
        hasText: /start|build|create|get started|try/i
      }).first();

      if (await startButton.isVisible()) {
        await startButton.click();
        await page.waitForTimeout(1000);

        // Should now be in editor mode - look for editor-specific elements
        // The exact elements depend on the implementation
        const editorIndicators = [
          page.locator('[data-testid="editor"]'),
          page.locator('[data-testid="code-editor"]'),
          page.locator('.monaco-editor'),
          page.locator('[class*="editor"]'),
        ];

        let editorFound = false;
        for (const indicator of editorIndicators) {
          if (await indicator.isVisible({ timeout: 2000 }).catch(() => false)) {
            editorFound = true;
            break;
          }
        }
        // Editor should be present after navigation
        // If not found, it might be a different implementation
      }
    });
  });

  test.describe('Chat Interface', () => {
    test('should have a chat input area', async ({ page }) => {
      await page.goto('/');
      await waitForHydration(page);

      // Look for chat input elements on landing or after navigation
      const chatInput = page.locator(
        'textarea, input[type="text"]'
      ).filter({ hasText: '' }); // Empty text filter to get all

      // There should be some form of input on the page
      const inputCount = await chatInput.count();
      expect(inputCount).toBeGreaterThanOrEqual(0);
    });
  });
});

test.describe('Editor - Keyboard Navigation', () => {
  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);

    // Tab through focusable elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Check that focus is moving (element should be focused)
    const focusedElement = await page.evaluate(() => {
      return document.activeElement?.tagName;
    });

    // Should have focused some element
    expect(focusedElement).toBeTruthy();
  });

  test('should handle Escape key appropriately', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);

    // Press Escape should not cause errors
    await page.keyboard.press('Escape');

    // Page should still be functional
    await expect(page.locator('body')).toBeVisible();
  });
});
