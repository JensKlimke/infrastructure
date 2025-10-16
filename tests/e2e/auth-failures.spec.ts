import { test, expect } from '@playwright/test';

test.describe('Authentication Failures', () => {
  test.beforeEach(async ({ context }) => {
    // Clear all cookies to ensure unauthenticated state
    await context.clearCookies();
  });

  test('should show error for invalid OTP code', async ({ page }) => {
    // Navigate to app and reach code page
    await page.goto('/');
    await expect(page).toHaveURL(/auth\.example\.test\/login/);

    const testEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
    await page.fill('input[type="email"]', testEmail);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/auth\.example\.test\/code/);

    // Enter wrong OTP code
    const wrongCode = 'BBBBBB';
    const codeInputs = page.locator('.code-input');

    for (let i = 0; i < wrongCode.length; i++) {
      await codeInputs.nth(i).fill(wrongCode[i]);
    }

    // Wait for auto-submit and error to appear
    await page.waitForTimeout(500);

    // Should stay on code page with error
    await expect(page).toHaveURL(/auth\.example\.test\/code/);
    await expect(page.locator('.error')).toBeVisible();
    await expect(page.locator('.error')).toContainText('Invalid or expired code');
  });

  test('should show error for invalid email format', async ({ page }) => {
    await page.goto('https://auth.example.test/login');

    // Try submitting invalid email
    const invalidEmail = 'notanemail';
    await page.fill('input[type="email"]', invalidEmail);

    // Remove HTML5 validation to test server-side validation
    await page.evaluate(() => {
      const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
      if (emailInput) {
        emailInput.type = 'text';
      }
    });

    await page.click('button[type="submit"]');

    // Should stay on login page with error
    await expect(page).toHaveURL(/auth\.example\.test\/login/);
    await expect(page.locator('.error')).toBeVisible();
    await expect(page.locator('.error')).toContainText('valid email address');
  });

  test('should handle empty email submission', async ({ page }) => {
    await page.goto('https://auth.example.test/login');

    // Remove required attribute and submit empty form
    await page.evaluate(() => {
      const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
      if (emailInput) {
        emailInput.removeAttribute('required');
      }
    });

    await page.click('button[type="submit"]');

    // Should receive error response (400 or show error message)
    // The server returns "Email is required" with 400 status
    await expect(page.locator('text=Email is required')).toBeVisible();
  });

  test('should redirect to login when accessing code page directly without email', async ({ page }) => {
    // Try to access code page directly without email parameter
    await page.goto('https://auth.example.test/code');

    // Should redirect to login page
    await expect(page).toHaveURL(/auth\.example\.test\/login/);
    await expect(page.locator('text=Enter your email')).toBeVisible();
  });

  test('should show error when submitting empty code', async ({ page }) => {
    // Navigate to app and reach code page
    await page.goto('/');
    await expect(page).toHaveURL(/auth\.example\.test\/login/);

    const testEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
    await page.fill('input[type="email"]', testEmail);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/auth\.example\.test\/code/);

    // Make the submit button visible and click it without entering code
    await page.evaluate(() => {
      const button = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      if (button) {
        button.style.display = 'block';
      }
    });

    await page.click('button[type="submit"]');

    // Should receive error (400 status or error message)
    await expect(page.locator('text=Email and code are required')).toBeVisible();
  });
});
