const { test, expect } = require('@playwright/test');

test('demo flow shows question and answers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });

  await page.getByRole('button', { name: /نموذج أسئلة تجريبي/ }).click();
  await page.getByRole('button', { name: /كتاب التوحيد/ }).click();

  await expect(page.locator('#game')).toHaveClass(/active/);
  await expect(page.locator('#q-text')).not.toHaveText('...');
  await expect(page.locator('.ans-btn').first()).toBeVisible();

  const qText = await page.locator('#q-text').textContent();
  expect((qText || '').length).toBeGreaterThan(5);
});

test('login is unlocked', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('#login-name')).toBeEnabled();
  await expect(page.locator('#btn-login')).toBeEnabled();
});
