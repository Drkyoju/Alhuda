const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

async function runAxe(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

const PAGES = [
  { name: 'login', path: '/', ready: '#login-screen.active' },
  { name: 'demo-intro', path: '/', ready: '#login-screen.active', action: async (page) => {
    await page.getByRole('button', { name: /نموذج أسئلة تجريبي/ }).click();
    await expect(page.locator('#demo-intro')).toHaveClass(/active/);
  }},
];

test.describe('accessibility', () => {
  for (const pg of PAGES) {
    test(`${pg.name} has no serious axe violations`, async ({ page }) => {
      await page.goto(pg.path);
      await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
      if (pg.action) await pg.action(page);
      else await expect(page.locator(pg.ready)).toBeVisible();
      await runAxe(page);
    });
  }

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
    await page.addInitScript(() => {
      localStorage.setItem('gameTutorialDone', '1');
      localStorage.setItem('onboardingDone', '1');
      localStorage.setItem('voiceOn', 'false');
    });
    await page.goto('/');
    await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
    await page.getByRole('button', { name: /نموذج أسئلة تجريبي/ }).click();
    await page.locator('.demo-book-pick').first().click();
    await expect(page.locator('#game')).toHaveClass(/active/, { timeout: 15000 });
    await page.locator('#game .close-btn').first().click();
    const confirm = page.locator('#confirm-overlay');
    await expect(confirm).toHaveClass(/open/);
    await expect(confirm).toHaveAttribute('role', 'dialog');
    await page.locator('#confirm-cancel').click();
    await expect(confirm).not.toHaveClass(/open/);
  });
});
