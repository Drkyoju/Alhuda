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
  try {
    await tutorial.waitFor({ state: 'visible', timeout: 2500 });
  } catch {
    return;
  }
  await page.getByRole('button', { name: /فهمت/ }).click();
  await expect(tutorial).toBeHidden({ timeout: 3000 });
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
  expect(qFont).toBeGreaterThanOrEqual(16);

  await page.locator('.ans-btn').first().click();
  await expect(page.locator('#game .feedback.show')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#btn-speak-feedback')).toBeVisible();

  // Voice button sits upper-left of the question on iPhone layout
  const voiceBtn = page.locator('#btn-speak-question');
  const qBox2 = await qBox.boundingBox();
  const voiceBox = await voiceBtn.boundingBox();
  if (qBox2 && voiceBox) {
    expect(voiceBox.y).toBeLessThanOrEqual(qBox2.y + 12);
    expect(voiceBox.x).toBeLessThan(qBox2.x + qBox2.width / 2);
  }

  const citeQuote = page.locator('#game .feedback .book-cite-quote').first();
  if (await citeQuote.count()) {
    const citeFont = await citeQuote.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(citeFont).toBeLessThan(qFont);
    expect(citeFont).toBeLessThanOrEqual(16);
  }

  const reciteBtn = page.locator('#game .feedback .quran-recite-btn').first();
  if (await reciteBtn.count()) {
    const btnBox = await reciteBtn.boundingBox();
    expect(btnBox?.width || 0).toBeLessThan(220);
    expect(btnBox?.height || 0).toBeLessThanOrEqual(34);
    await expect(reciteBtn).toHaveText(/تلاوة/);
    const ayah = page.locator('#game .feedback .book-cite-ayah').first();
    if (await ayah.count()) {
      const reciteY = (await reciteBtn.boundingBox())?.y ?? 0;
      const ayahY = (await ayah.boundingBox())?.y ?? 0;
      expect(reciteY).toBeLessThan(ayahY);
    }
  }

  await expect(page.locator('#game .feedback .fb-continue-btn')).toBeVisible();
});
