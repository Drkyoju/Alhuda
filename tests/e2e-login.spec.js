const { test, expect } = require('@playwright/test');

async function prepStudent(page) {
  await page.addInitScript(() => {
    localStorage.setItem('demoDone', '1');
    localStorage.setItem('gameTutorialDone', '1');
    localStorage.setItem('onboardingDone', '1');
    localStorage.setItem('voiceOn', 'false');
    localStorage.setItem('soundOn', 'false');
  });
}

async function dismissOnboarding(page) {
  const ov = page.locator('#onboarding-overlay.open');
  if (await ov.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /تخطي|فهمت/ }).first().click();
  }
}

test('login → play 1 question → results', async ({ page }) => {
  const testName = 'E2E_' + Date.now().toString(36);
  await prepStudent(page);
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 45000 });

  await page.locator('#login-name').fill(testName);
  await page.locator('#btn-login').click();

  await expect(page.locator('#welcome')).toHaveClass(/active/, { timeout: 45000 });
  await dismissOnboarding(page);

  await page.locator('#q-from-input').fill('1');
  await page.locator('#q-to-input').fill('1');
  await page.locator('#btn-start-game').click();

  await expect(page.locator('#game')).toHaveClass(/active/, { timeout: 20000 });

  await page.locator('.ans-btn').first().click();
  await page.getByRole('button', { name: /متابعة/ }).click();

  await expect(page.locator('#results.active, #gameover.active')).toBeVisible({ timeout: 15000 });
});
