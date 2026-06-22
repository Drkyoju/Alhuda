const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('voiceOn', 'false');
    localStorage.setItem('soundOn', 'false');
    localStorage.setItem('gameTutorialDone', '1');
  });
});

test('demo-only mode: login locked, demo playable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 45000 });

  await expect(page.locator('#login-demo-only-notice')).toBeVisible();
  await expect(page.locator('#login-name')).toBeDisabled();
  await expect(page.locator('#btn-login')).toBeDisabled();
  await expect(page.locator('#login-or-divider')).toBeHidden();

  await page.getByRole('button', { name: /نموذج أسئلة تجريبي/ }).click();
  await expect(page.locator('#demo-intro')).toHaveClass(/active/);
  await expect(page.locator('#demo-pick-count-tawheed')).toContainText('٨');

  await page.getByRole('button', { name: /كتاب التوحيد/ }).click();
  await expect(page.locator('#game')).toHaveClass(/active/, { timeout: 25000 });
  await expect(page.locator('#demo-bar')).toContainText('٨');
  await expect(page.locator('.ans-btn').first()).toBeVisible();
});

test('feedback screen shows locked real-game CTA', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 45000 });
  await page.evaluate(() => {
    if (typeof endDemo === 'function') endDemo();
    else document.getElementById('feedback-screen')?.classList.add('active');
  });
  await expect(page.locator('#real-game-locked-cta')).toBeVisible();
  await expect(page.locator('.real-game-locked-btn')).toBeDisabled();
});
