const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

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

test('mobile demo: readable question and compact citation UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });

  await page.getByRole('button', { name: /نموذج أسئلة تجريبي/ }).click();
  await page.getByRole('button', { name: /كتاب التوحيد/ }).click();
  await dismissOverlays(page);

  const qBox = page.locator('#game .q-box');
  await expect(qBox).toBeVisible();
  const qFont = await qBox.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(qFont).toBeGreaterThanOrEqual(18);

  await page.locator('.ans-btn').first().click();
  await expect(page.locator('#game .feedback.show')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#btn-speak-feedback')).toBeVisible();

  const citeQuote = page.locator('#game .feedback .book-cite-quote').first();
  if (await citeQuote.count()) {
    const citeFont = await citeQuote.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(citeFont).toBeLessThan(qFont);
    expect(citeFont).toBeLessThanOrEqual(15);
  }

  const reciteBtn = page.locator('#game .feedback .quran-recite-btn').first();
  if (await reciteBtn.count()) {
    const btnBox = await reciteBtn.boundingBox();
    expect(btnBox?.width || 0).toBeLessThan(390);
    await expect(reciteBtn).toHaveText(/تلاوة — الحذيفي/);
  }

  await expect(page.locator('#game .feedback .fb-continue-btn')).toBeVisible();
});
