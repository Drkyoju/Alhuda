const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('voiceOn', 'false');
    localStorage.setItem('soundOn', 'false');
    localStorage.setItem('demoDone', '1');
    localStorage.setItem('alhudaTutorialV2', '1');
    localStorage.setItem('gameTutorialDone', '1');
    localStorage.setItem('onboardingDone', '1');
  });
});

async function dismissOverlays(page) {
  const tutorial = page.locator('#game-tutorial-overlay.open');
  if (await tutorial.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /فهمت/ }).click();
  }
}

async function loginAndStart(page, name = 'Smoke Tester') {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
  await page.locator('#login-name').fill(name);
  await page.locator('#login-name').press('Enter');
  await expect(page.locator('#welcome')).toHaveClass(/active/, { timeout: 25000 });
  await page.locator('#btn-start-game').click();
  await expect(page.locator('#game')).toHaveClass(/active/, { timeout: 15000 });
  await dismissOverlays(page);
}

test('login then play shows question and answers', async ({ page }) => {
  await loginAndStart(page);
  await expect(page.locator('#q-text')).not.toHaveText('...');
  await expect(page.locator('.ans-btn').first()).toBeVisible();
  const qText = await page.locator('#q-text').textContent();
  expect((qText || '').length).toBeGreaterThan(5);
});

test('login is unlocked — name entry enabled, no demo button', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('#login-name')).toBeEnabled({ timeout: 5000 });
  await expect(page.locator('#login-name')).toBeVisible();
  await expect(page.getByRole('button', { name: /نموذج أسئلة تجريبي/ })).toHaveCount(0);
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
  await loginAndStart(page);
  page.once('dialog', (d) => d.dismiss());
  await page.locator('#game .close-btn').first().click();
  await expect(page.locator('#confirm-overlay.open')).toBeVisible();
  await page.locator('#confirm-cancel').click();
  await expect(page.locator('#game')).toHaveClass(/active/);
});

test('settings has dark mode and Hudhaify default', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
  await page.evaluate(() => {
    if (typeof toggleSettings === 'function') toggleSettings();
  });
  await expect(page.locator('#settings-overlay.open')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#theme-btn')).toBeVisible();
  await expect(page.locator('#reciter-label')).toHaveText(/الحذيفي/);
  await page.evaluate(() => {
    if (typeof toggleDarkMode === 'function') toggleDarkMode();
  });
  await expect(page.locator('body')).toHaveClass(/dark-mode/);
});

test('offline name login still starts a round', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
  await context.setOffline(true);
  await page.locator('#login-name').fill('Offline Player');
  await page.locator('#login-name').press('Enter');
  await expect(page.locator('#welcome')).toHaveClass(/active/, { timeout: 25000 });
  await page.locator('#btn-start-game').click();
  await expect(page.locator('#game')).toHaveClass(/active/, { timeout: 15000 });
  await dismissOverlays(page);
  await expect(page.locator('#q-text')).not.toHaveText('...');
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
