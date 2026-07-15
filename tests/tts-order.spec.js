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

test('question speech uses on-screen answer order', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app-loading')).toBeHidden({ timeout: 30000 });
  await page.getByRole('button', { name: /نموذج أسئلة تجريبي/ }).click();
  await page.getByRole('button', { name: /كتاب التوحيد/ }).click();
  await expect(page.locator('#game')).toHaveClass(/active/, { timeout: 15000 });
  await dismissOverlays(page);

  // Find an MC question (skip TF)
  for (let i = 0; i < 8; i++) {
    const type = await page.locator('#q-type-badge').evaluate((el) => getComputedStyle(el).display);
    if (type === 'none') break;
    await page.locator('.ans-btn').first().click();
    await expect(page.locator('#game .feedback.show')).toBeVisible({ timeout: 5000 });
    await page.locator('#game .feedback .fb-continue-btn').click();
    await expect(page.locator('#game .feedback.show')).toBeHidden({ timeout: 5000 });
  }

  const typeBadgeHidden = await page.locator('#q-type-badge').evaluate((el) => getComputedStyle(el).display === 'none');
  test.skip(!typeBadgeHidden, 'no MC question in this demo round');

  const onScreen = await page.locator('.ans-btn').allTextContents();
  expect(onScreen.length).toBeGreaterThanOrEqual(2);

  const spoken = await page.evaluate(() => {
    const q = state.questions[state.idx];
    const spokenText = buildQuestionSpeechText(q);
    const strip = (s) => String(s || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '');
    return {
      spoken: spokenText,
      spokenBare: strip(spokenText),
      order: (state.displayAnswerOrder || []).slice(),
      optionsBare: (state.displayAnswerOrder || []).map((i) => strip(q.a[i])),
    };
  });

  expect(spoken.order.length).toBe(onScreen.length);
  let prev = -1;
  for (let i = 0; i < onScreen.length; i++) {
    const bareOpt = onScreen[i].replace(/[\u064B-\u065F\u0670\u0640]/g, '');
    expect(spoken.optionsBare[i]).toBe(bareOpt);
    const idx = spoken.spokenBare.indexOf(bareOpt);
    expect(idx, `missing option in speech: ${onScreen[i]}`).toBeGreaterThanOrEqual(0);
    expect(idx).toBeGreaterThan(prev);
    prev = idx;
  }

  // Must not append book citation leftovers
  expect(spoken.spoken).not.toMatch(/الإجابة الصحيحة هي:/);
});
