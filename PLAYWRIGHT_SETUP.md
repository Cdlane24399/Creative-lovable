# Playwright Test Setup Guide

This guide explains how to set up and run Playwright end-to-end tests for the Creative-lovable project, including how to safely provide environment variables.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Playwright Browsers

```bash
npm run playwright:install
# or
npx playwright install --with-deps
```

### 3. Set Up Environment Variables

Copy the `.env.example` file to `.env.local`:

```bash
cp .env.example .env.local
```

Then edit `.env.local` with your actual values. **Note:** `.env.local` is already in `.gitignore` and will never be committed to the repository.

#### Minimum Required Environment Variables

For local testing, you need at least these variables:

```env
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# Database (Required)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/creative_lovable

# AI Provider (At least one required)
ANTHROPIC_API_KEY=sk-ant-your_key_here
# OR
OPENAI_API_KEY=sk-proj-your_key_here
# OR
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key_here

# E2B (Required for code execution)
E2B_API_KEY=e2b_your_key_here
```

### 4. Run Tests

```bash
# Run all tests
npm run test:e2e

# Run tests in UI mode (interactive)
npm run test:e2e:ui

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Run tests in debug mode
npm run test:e2e:debug

# Run tests for a specific browser
npm run test:e2e:chromium
npm run test:e2e:firefox
npm run test:e2e:webkit

# Run mobile tests
npm run test:e2e:mobile

# Show test report
npm run test:e2e:report
```

## How to Safely Provide Environment Variables

### For Local Development

1. **Never commit `.env.local` to git** - It's already in `.gitignore`
2. **Use placeholder values for testing** - The provided `.env.local` has safe placeholders
3. **Store real credentials securely** - Use a password manager or secrets vault
4. **Share credentials securely** - Use encrypted channels, never plain text

### For GitHub Actions (CI/CD)

Environment variables for CI/CD should be stored as GitHub Secrets:

1. Go to your GitHub repository
2. Navigate to **Settings → Secrets and variables → Actions**
3. Click **New repository secret**
4. Add each required secret:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `DATABASE_URL`
   - `E2B_API_KEY`
   - `ANTHROPIC_API_KEY` (or other AI provider keys)

The GitHub Actions workflow (`.github/workflows/playwright.yml`) is configured to use these secrets with fallback to placeholder values, so tests won't fail if secrets are not set.

### For Team Collaboration

#### Option 1: Shared Development Credentials

Create a separate set of non-production API keys for development/testing:

1. Create development-only API keys from each service
2. Share these keys securely with your team (e.g., via 1Password, LastPass)
3. Each team member adds them to their local `.env.local`

#### Option 2: Individual Credentials

Each team member uses their own API keys:

1. Each person creates their own API keys
2. Each person adds them to their own `.env.local`
3. No sharing of credentials needed

## Environment Variable Reference

### Required Variables

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | [Supabase Dashboard](https://app.supabase.com) → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | [Supabase Dashboard](https://app.supabase.com) → Project Settings → API |
| `DATABASE_URL` | PostgreSQL connection string | Local: `postgresql://postgres:postgres@localhost:5432/creative_lovable`<br>Neon: Your connection string |
| `E2B_API_KEY` | E2B API key for sandboxes | [E2B Dashboard](https://e2b.dev/dashboard?tab=keys) |
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude) | [Anthropic Console](https://console.anthropic.com/) |

### Optional Variables

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `OPENAI_API_KEY` | OpenAI API key (GPT) | [OpenAI Platform](https://platform.openai.com/api-keys) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI key (Gemini) | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `AI_GATEWAY_URL` | AI Gateway endpoint | Your AI Gateway provider |
| `AI_GATEWAY_TOKEN` | AI Gateway token | Your AI Gateway provider |
| `E2B_TEMPLATE_ID` | Custom E2B template ID | After building custom template |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL | [Upstash Console](https://console.upstash.com/redis) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | [Upstash Console](https://console.upstash.com/redis) |

## Troubleshooting

### Tests fail with "webServer process not available"

**Solution:** Make sure you're using `npm` not `pnpm`. The playwright.config.ts has been updated to use `npm run dev`.

### Tests fail with authentication errors

**Solution:** Check that your Supabase credentials in `.env.local` are correct.

### Tests timeout waiting for the development server

**Solution:**
1. Make sure port 3000 is not already in use
2. Try running the dev server manually first: `npm run dev`
3. Check that all required environment variables are set

### "Module not found" errors

**Solution:** Run `npm install` to ensure all dependencies are installed.

### Playwright browsers not installed

**Solution:** Run `npm run playwright:install` or `npx playwright install --with-deps`

## Test Structure

```
e2e/
├── accessibility.spec.ts    # Accessibility tests (WCAG compliance)
├── auth.spec.ts            # Authentication flow tests
├── editor.spec.ts          # Editor interface tests
├── landing.spec.ts         # Landing page tests
└── fixtures/
    └── test-fixtures.ts    # Shared test utilities and fixtures
```

## Writing New Tests

When writing new tests:

1. Import fixtures from `./fixtures/test-fixtures`
2. Use `waitForHydration(page)` after navigation to ensure React has hydrated
3. Use descriptive test names
4. Group related tests with `test.describe()`
5. Add accessibility checks where appropriate

Example:

```typescript
import { test, expect, waitForHydration } from './fixtures/test-fixtures';

test.describe('My Feature', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/my-feature');
    await waitForHydration(page);

    // Your test code here
    await expect(page.locator('h1')).toBeVisible();
  });
});
```

## Best Practices

1. **Keep secrets out of version control** - Always use `.env.local` for local development
2. **Use GitHub Secrets for CI/CD** - Never hardcode credentials in workflow files
3. **Test with realistic data** - Use development API keys that mirror production
4. **Run tests before committing** - Ensure your changes don't break existing tests
5. **Update snapshots carefully** - Only update visual snapshots when intentional changes are made

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [Creative-lovable Documentation](./README.md)
- [Environment Variables Guide](./.env.example)
