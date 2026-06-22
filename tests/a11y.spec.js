const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

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

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
});
