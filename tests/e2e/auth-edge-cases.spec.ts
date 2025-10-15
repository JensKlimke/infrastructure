import { test, expect } from '@playwright/test';

test.describe('Authentication Edge Cases', () => {
  test.beforeEach(async ({ context }) => {
    // Clear all cookies to ensure clean state
    await context.clearCookies();
  });

  test('should maintain authentication when navigating to different paths', async ({ page }) => {
    // Complete authentication flow
    await page.goto('/');
    await expect(page).toHaveURL(/auth\.example\.test\/login/);

    const testEmail = `test-${Date.now()}@example.com`;
    await page.fill('input[type="email"]', testEmail);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/auth\.example\.test\/code/);

    const devOtpCode = 'AAAAAA';
    const codeInputs = page.locator('.code-input');

    for (let i = 0; i < devOtpCode.length; i++) {
      await codeInputs.nth(i).fill(devOtpCode[i]);
    }

    await expect(page).toHaveURL('https://example.test/');

    // Now try navigating to different paths - should not redirect to login
    await page.goto('https://example.test/some-path');
    // Even though this path doesn't exist, we should get a 404 from the app, not a redirect to login
    // We can verify this by checking we're NOT on the auth subdomain
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('auth.example.test');
  });

  test('should persist authentication across multiple page reloads', async ({ page }) => {
    // Complete authentication
    await page.goto('/');
    const testEmail = `test-${Date.now()}@example.com`;

    await page.fill('input[type="email"]', testEmail);
    await page.click('button[type="submit"]');

    const devOtpCode = 'AAAAAA';
    const codeInputs = page.locator('.code-input');

    for (let i = 0; i < devOtpCode.length; i++) {
      await codeInputs.nth(i).fill(devOtpCode[i]);
    }

    await expect(page).toHaveURL('https://example.test/');

    // Reload multiple times
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await expect(page).toHaveURL('https://example.test/');
      await expect(page.locator('text=marlene.cloud')).toBeVisible();
    }
  });

  test('should handle accessing login page while already authenticated', async ({ page }) => {
    // Complete authentication flow
    await page.goto('/');
    const testEmail = `test-${Date.now()}@example.com`;

    await page.fill('input[type="email"]', testEmail);
    await page.click('button[type="submit"]');

    const devOtpCode = 'AAAAAA';
    const codeInputs = page.locator('.code-input');

    for (let i = 0; i < devOtpCode.length; i++) {
      await codeInputs.nth(i).fill(devOtpCode[i]);
    }

    await expect(page).toHaveURL('https://example.test/');

    // Now try to access login page directly
    await page.goto('https://auth.example.test/login');

    // Document current behavior: login page is accessible even when authenticated
    // This is acceptable as it allows users to login with a different account
    await expect(page).toHaveURL(/auth\.example\.test\/login/);
    await expect(page.locator('text=Enter your email')).toBeVisible();
  });
});
