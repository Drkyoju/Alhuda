const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('voiceOn', 'false');
    localStorage.setItem('soundOn', 'false');
    localStorage.setItem('gameTutorialDone', '1');
    localStorage.setItem('onboardingDone', '1');
  });
});

test('full login unlocked: name entry visible, demo still playable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 45000 });

  await expect(page.locator('#login-demo-only-notice')).toBeHidden();
  await expect(page.locator('#login-name')).toBeEnabled();
  await expect(page.locator('#btn-login')).toBeEnabled();

  await page.getByRole('button', { name: /نموذج أسئلة تجريبي/ }).click();
  await expect(page.locator('#demo-intro')).toHaveClass(/active/);
  await expect(page.locator('#demo-pick-count-tawheed')).toContainText('٨');

  await page.getByRole('button', { name: /كتاب التوحيد/ }).click();
  await expect(page.locator('#game')).toHaveClass(/active/, { timeout: 25000 });
  await expect(page.locator('#demo-bar')).toContainText('٨');
  await expect(page.locator('.ans-btn').first()).toBeVisible();
});

test('feedback screen offers real-game CTA', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 45000 });
  await page.evaluate(() => {
    if (typeof endDemo === 'function') endDemo();
    else document.getElementById('feedback-screen')?.classList.add('active');
  });
  await expect(page.locator('#real-game-locked-cta')).toBeVisible();
  await expect(page.locator('#real-game-cta-btn')).toBeEnabled();
});
