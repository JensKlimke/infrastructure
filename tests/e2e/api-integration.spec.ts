import { test, expect } from '@playwright/test';

test.describe('API Integration', () => {
  test.beforeEach(async ({ context }) => {
    // Clear all cookies to ensure unauthenticated state
    await context.clearCookies();
  });

  test('should authenticate and successfully fetch user data from API', async ({ page, request }) => {
    // Step 1: Navigate to main app -> redirected to login
    await page.goto('/');
    await expect(page).toHaveURL(/auth\.example\.test\/login/);

    // Step 2: Complete authentication flow
    const testEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
    await page.fill('input[type="email"]', testEmail);
    await page.click('button[type="submit"]');

    // Wait for code page
    await expect(page).toHaveURL(/auth\.example\.test\/code/);

    // Enter OTP code
    const devOtpCode = 'AAAAAA';
    const codeInputs = page.locator('.code-input');

    for (let i = 0; i < devOtpCode.length; i++) {
      await codeInputs.nth(i).fill(devOtpCode[i]);
    }

    // Wait for redirect to main page (authenticated)
    await expect(page).toHaveURL('https://example.test/');
    await expect(page.locator('text=marlene.cloud')).toBeVisible();

    // Step 3: Verify user card is visible with correct email
    await expect(page.locator('.user-card')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#userEmail')).toHaveText(testEmail);

    // Step 4: Make direct API call to verify endpoint
    const apiResponse = await page.request.get('https://api.example.test/user');
    expect(apiResponse.ok()).toBeTruthy();

    const apiData = await apiResponse.json();
    expect(apiData).toHaveProperty('user');
    expect(apiData.user).toBe(testEmail);

    console.log('✓ API returned user data:', apiData);

    // Step 5: Verify avatar initials are displayed
    const avatarText = await page.locator('#userAvatar').textContent();
    expect(avatarText).toBeTruthy();
    expect(avatarText?.length).toBeGreaterThan(0);

    console.log('✓ User avatar initials:', avatarText);
  });

  test('should return 401 when accessing API without authentication', async ({ page }) => {
    // Try to access API directly without authentication
    // This should redirect to login page due to Traefik auth middleware
    await page.goto('https://api.example.test/user');

    // Should be redirected to login page
    await expect(page).toHaveURL(/auth\.example\.test\/login/);
  });

  test('should show user card disappears after logout', async ({ page }) => {
    // Step 1: Complete authentication
    await page.goto('/');
    await expect(page).toHaveURL(/auth\.example\.test\/login/);

    const testEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
    await page.fill('input[type="email"]', testEmail);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/auth\.example\.test\/code/);

    const devOtpCode = 'AAAAAA';
    const codeInputs = page.locator('.code-input');

    for (let i = 0; i < devOtpCode.length; i++) {
      await codeInputs.nth(i).fill(devOtpCode[i]);
    }

    await expect(page).toHaveURL('https://example.test/');

    // Wait for user card to be visible
    await expect(page.locator('.user-card')).toBeVisible({ timeout: 5000 });

    // Step 2: Click logout button
    await page.click('.logout-btn');

    // Should be redirected to login page
    await expect(page).toHaveURL(/auth\.example\.test\/login/);

    // Step 3: Go back to main page - should not show user card
    await page.goto('/');

    // Should redirect to login because not authenticated
    await expect(page).toHaveURL(/auth\.example\.test\/login/);
  });
});
