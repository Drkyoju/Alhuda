const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('voiceOn', 'false');
    localStorage.setItem('soundOn', 'false');
    localStorage.setItem('gameTutorialDone', '1');
    localStorage.setItem('onboardingDone', '1');
    localStorage.setItem('demoDone', '1');
  });
});

test('name login enters welcome without demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 45000 });

  await expect(page.locator('#login-name')).toBeEnabled();
  await expect(page.locator('#login-name')).toBeVisible();
  await expect(page.getByRole('button', { name: /نموذج أسئلة تجريبي/ })).toHaveCount(0);

  await page.locator('#login-name').fill('Ahmed Test');
  await page.locator('#login-name').press('Enter');

  await expect(page.locator('#welcome')).toHaveClass(/active/, { timeout: 25000 });
  await expect(page.locator('#btn-start-game')).toBeVisible();
});

test('arabic name login also reaches welcome', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 45000 });
  await page.locator('#login-name').fill('أحمد');
  await page.locator('#login-name').press('Enter');
  await expect(page.locator('#welcome')).toHaveClass(/active/, { timeout: 25000 });
});
