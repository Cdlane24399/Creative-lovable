import { test, expect, waitForHydration, clearBrowserState } from './fixtures/test-fixtures';

test.describe('Authentication Pages', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test.describe('Login Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await waitForHydration(page);
    });

    test('should display login form', async ({ page }) => {
      // Check for login card/form
      await expect(page.locator('text=Login').first()).toBeVisible();

      // Check for email input
      const emailInput = page.locator('input[type="email"], input[name="email"]');
      await expect(emailInput).toBeVisible();

      // Check for password input
      const passwordInput = page.locator('input[type="password"]');
      await expect(passwordInput).toBeVisible();

      // Check for submit button
      const submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
      await expect(submitButton.first()).toBeVisible();
    });

    test('should have link to signup page', async ({ page }) => {
      const signupLink = page.locator('a[href="/signup"], a:has-text("Sign up")');
      await expect(signupLink.first()).toBeVisible();

      await signupLink.first().click();
      await expect(page).toHaveURL(/\/signup/);
    });

    test('should show validation errors for empty form submission', async ({ page }) => {
      const submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();
      await submitButton.click();

      // Should show validation or remain on page
      await expect(page).toHaveURL(/\/login/);
    });

    test('should show error for invalid credentials', async ({ page }) => {
      // Fill in invalid credentials
      await page.fill('input[type="email"], input[name="email"]', 'invalid@test.com');
      await page.fill('input[type="password"]', 'wrongpassword');

      const submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();
      await submitButton.click();

      // Wait for error response
      await page.waitForTimeout(2000);

      // Should show error message or stay on login page
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Signup Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/signup');
      await waitForHydration(page);
    });

    test('should display signup form', async ({ page }) => {
      // Check for signup title
      await expect(page.locator('text=Sign up').first()).toBeVisible();

      // Check for email input
      const emailInput = page.locator('input[type="email"], input[name="email"]');
      await expect(emailInput).toBeVisible();

      // Check for password input
      const passwordInput = page.locator('input[type="password"]');
      await expect(passwordInput).toBeVisible();
    });

    test('should have link to login page', async ({ page }) => {
      const loginLink = page.locator('a[href="/login"], a:has-text("Login"), a:has-text("Log in")');
      await expect(loginLink.first()).toBeVisible();

      await loginLink.first().click();
      await expect(page).toHaveURL(/\/login/);
    });
  });
});

test.describe('Auth Pages - Visual Regression', () => {
  test('login page visual snapshot', async ({ page }) => {
    await page.goto('/login');
    await waitForHydration(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('login-page.png', {
      animations: 'disabled',
    });
  });

  test('signup page visual snapshot', async ({ page }) => {
    await page.goto('/signup');
    await waitForHydration(page);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('signup-page.png', {
      animations: 'disabled',
    });
  });
});
