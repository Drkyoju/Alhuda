const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

async function runAxe(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.describe('accessibility', () => {
  test('login has no serious axe violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
    await expect(page.locator('#login-screen.active')).toBeVisible();
    await runAxe(page);
  });

  test('welcome has no serious axe violations after login', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('onboardingDone', '1');
      localStorage.setItem('demoDone', '1');
    });
    await page.goto('/');
    await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
    await page.locator('#login-name').fill('A11y User');
  await page.locator('#login-name').press('Enter');
    await expect(page.locator('#welcome')).toHaveClass(/active/, { timeout: 25000 });
    await runAxe(page);
  });

  test('game has no serious axe violations', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('alhudaTutorialV2', '1');
      localStorage.setItem('gameTutorialDone', '1');
      localStorage.setItem('onboardingDone', '1');
      localStorage.setItem('demoDone', '1');
      localStorage.setItem('voiceOn', 'false');
    });
    await page.goto('/');
    await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
    await page.locator('#login-name').fill('A11y Gamer');
  await page.locator('#login-name').press('Enter');
    await expect(page.locator('#welcome')).toHaveClass(/active/, { timeout: 25000 });
    await page.locator('#btn-start-game').click();
    await expect(page.locator('#game')).toHaveClass(/active/, { timeout: 15000 });
    await runAxe(page);
  });

  test('settings overlay has dialog semantics', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
    await page.evaluate(() => { if (typeof toggleSettings === 'function') toggleSettings(); });
    const ov = page.locator('#settings-overlay');
    await expect(ov).toHaveClass(/open/);
    await expect(ov).toHaveAttribute('role', 'dialog');
    await expect(ov).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(ov).not.toHaveClass(/open/);
  });

  test('confirm overlay is accessible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
    // Open dialog directly — avoid flaky cloud login path for a11y checks.
    await page.evaluate(() => {
      if (typeof showConfirm === 'function') {
        void showConfirm('هل تريد/ين الخروج؟');
        return;
      }
      const ov = document.getElementById('confirm-overlay');
      if (!ov) return;
      ov.hidden = false;
      ov.classList.add('open');
    });
    const confirm = page.locator('#confirm-overlay');
    await expect(confirm).toHaveClass(/open/);
    await expect(confirm).toHaveAttribute('role', 'dialog');
    await page.locator('#confirm-cancel').click();
    await expect(confirm).not.toHaveClass(/open/);
  });

  test('onboarding overlay has dialog semantics when open', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
    await page.evaluate(() => {
      localStorage.removeItem('onboardingDone');
      document.getElementById('welcome')?.classList.add('active');
      document.getElementById('login-screen')?.classList.remove('active');
      const ov = document.getElementById('onboarding-overlay');
      ov?.classList.add('open');
      ov?.setAttribute('aria-hidden', 'false');
    });
    const ov = page.locator('#onboarding-overlay');
    await expect(ov).toHaveAttribute('role', 'dialog');
    await expect(ov).toHaveAttribute('aria-modal', 'true');
  });
});
