const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('voiceOn', 'false');
    localStorage.setItem('soundOn', 'false');
  });
});

async function dismissOverlays(page) {
  const tutorial = page.locator('#game-tutorial-overlay.open');
  if (await tutorial.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /فهمت/ }).click();
  }
}

test('demo flow shows question and answers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });

  await page.getByRole('button', { name: /نموذج أسئلة تجريبي/ }).click();
  await expect(page.locator('#demo-pick-count-tawheed')).toContainText('٨');
  await page.getByRole('button', { name: /كتاب التوحيد/ }).click();

  await expect(page.locator('#game')).toHaveClass(/active/);
  await dismissOverlays(page);

  await expect(page.locator('#q-text')).not.toHaveText('...');
  await expect(page.locator('.ans-btn').first()).toBeVisible();
  await expect(page.locator('#demo-bar')).toContainText('٨');

  const qText = await page.locator('#q-text').textContent();
  expect((qText || '').length).toBeGreaterThan(5);
});

test('login is locked — demo only', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#login-name')).toBeDisabled({ timeout: 5000 });
  await expect(page.locator('#btn-login')).toBeDisabled();
  await expect(page.locator('#login-demo-only-notice')).toBeVisible();
  await expect(page.getByRole('button', { name: /نموذج أسئلة تجريبي/ })).toBeEnabled();
});

test('offline banner hidden when online', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#offline-banner')).toBeHidden();
});

test('offline banner shows when network is off', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('#offline-banner')).toBeVisible({ timeout: 5000 });
});

test('game exit asks before leaving mid-round', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });

  await page.getByRole('button', { name: /نموذج أسئلة تجريبي/ }).click();
  await page.getByRole('button', { name: /كتاب التوحيد/ }).click();
  await dismissOverlays(page);

  page.once('dialog', (d) => d.dismiss());
  await page.locator('#game .close-btn').first().click();
  await expect(page.locator('#confirm-overlay.open')).toBeVisible();
  await page.locator('#confirm-cancel').click();
  await expect(page.locator('#game')).toHaveClass(/active/);
});

test('manifest includes PNG icons', async ({ page }) => {
  const res = await page.request.get('/manifest.json');
  const manifest = await res.json();
  const pngs = manifest.icons.filter((i) => i.type === 'image/png');
  expect(pngs.length).toBeGreaterThanOrEqual(2);
  for (const icon of pngs) {
    const iconRes = await page.request.get('/' + icon.src.replace(/^\.\//, ''));
    expect(iconRes.ok()).toBeTruthy();
  }
});
