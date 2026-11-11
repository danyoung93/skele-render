import { test, expect } from '@playwright/test';

test('mode switch shows the editor and returns to the same Animate frame', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-id="stage"] svg path').first()).toBeAttached();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.locator('[data-id="scrub"]').fill('20');
  await page.locator('[data-id="scrub"]').dispatchEvent('input');
  await expect(page.locator('[data-id="frame"]')).toHaveText('20 / 120');

  await page.getByRole('radio', { name: 'Edit sheet' }).click();
  await expect(page.locator('[data-id="editor-root"]')).toBeVisible();
  await expect(page.locator('[data-id="stage"]')).toBeHidden();

  await page.getByRole('radio', { name: 'Animate' }).click();
  await expect(page.locator('[data-id="stage"]')).toBeVisible();
  await expect(page.locator('[data-id="editor-root"]')).toBeHidden();
  await expect(page.locator('[data-id="frame"]')).toHaveText('20 / 120');
});
