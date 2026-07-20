const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 768, height: 1024 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('voiceOn', 'false');
    localStorage.setItem('soundOn', 'false');
  });
});

async function dismissOverlays(page) {
  const tutorial = page.locator('#game-tutorial-overlay.open');
  try {
    await tutorial.waitFor({ state: 'visible', timeout: 2500 });
  } catch {
    return;
  }
  await page.getByRole('button', { name: /فهمت/ }).click();
  await expect(tutorial).toBeHidden({ timeout: 3000 });
}

test('iPad demo: two-column answers and readable voice layout', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });

  await page.getByRole('button', { name: /نموذج أسئلة تجريبي/ }).click();
  await page.getByRole('button', { name: /كتاب التوحيد/ }).click();
  await dismissOverlays(page);

  const qBox = page.locator('#game .q-box');
  await expect(qBox).toBeVisible();
  const qFont = await qBox.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(qFont).toBeGreaterThanOrEqual(16);

  const ansGrid = page.locator('#game .ans-grid');
  const cols = await ansGrid.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  // Tablet layout uses 2 columns (e.g. "px px")
  expect((cols || '').split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(2);

  await page.locator('.ans-btn').first().click();
  await expect(page.locator('#game .feedback.show')).toBeVisible({ timeout: 5000 });

  const voiceBtn = page.locator('#btn-speak-question');
  await expect(voiceBtn).toBeVisible();
  const qBox2 = await qBox.boundingBox();
  const voiceBox = await voiceBtn.boundingBox();
  if (qBox2 && voiceBox) {
    expect(voiceBox.width).toBeGreaterThan(28);
    expect(voiceBox.height).toBeGreaterThan(28);
  }

  await expect(page.locator('#game .feedback .fb-continue-btn')).toBeVisible();
});
