import { test, expect } from '@playwright/test';

test.describe('Authentication Redirect', () => {
  test.beforeEach(async ({ context }) => {
    // Clear all cookies to ensure unauthenticated state
    await context.clearCookies();
  });

  test('should complete full authentication flow and redirect to original URL', async ({ page }) => {
    // Step 1: Navigate to main app -> redirected to login
    await page.goto('/');
    await expect(page).toHaveURL(/auth\.example\.test\/login/);
    await expect(page.locator('text=Enter your email')).toBeVisible();

    // Step 2: Submit email address -> redirected to code page
    const testEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
    await page.fill('input[type="email"]', testEmail);
    await page.click('button[type="submit"]');

    // Verify redirect to code page
    await expect(page).toHaveURL(/auth\.example\.test\/code/);
    await expect(page.locator('text=Enter the verification code sent by email')).toBeVisible();

    // Step 3: Enter OTP code -> redirect to original URL
    const devOtpCode = 'AAAAAA';
    const codeInputs = page.locator('.code-input');

    for (let i = 0; i < devOtpCode.length; i++) {
      await codeInputs.nth(i).fill(devOtpCode[i]);
    }

    // Should auto-submit and redirect to original URL
    await expect(page).toHaveURL('https://example.test/');
    await expect(page.locator('text=marlene.cloud')).toBeVisible();

    // Step 4: Reload page -> should NOT redirect (cookie is valid)
    await page.reload();
    await expect(page).toHaveURL('https://example.test/');
    await expect(page.locator('text=marlene.cloud')).toBeVisible();
  });
});
