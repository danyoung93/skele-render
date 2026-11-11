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

import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

async function dropFile(page: Page, name: string, text: string) {
  const dt = await page.evaluateHandle(([n, t]) => {
    const d = new DataTransfer();
    d.items.add(new File([t], n, { type: 'application/json' }));
    return d;
  }, [name, text]);
  await page.dispatchEvent('body', 'drop', { dataTransfer: dt });
}

test('three modes: Animate, Edit sheet, Edit rig', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Edit rig' }).click();
  await expect(page.locator('[data-id="rig-root"]')).toBeVisible();
  await expect(page.locator('[data-id="stage"]')).toBeHidden();
  await expect(page.locator('[data-id="editor-root"]')).toBeHidden();
  await page.getByRole('radio', { name: 'Animate' }).click();
  await expect(page.locator('[data-id="rig-root"]')).toBeHidden();
});

test('Animate shows the rig name, and a dropped rig file becomes the current rig', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-id="rig-name"]')).toHaveText('Rig: default');
  const rig = JSON.parse(readFileSync('tests/fixtures/chunky.rig.json', 'utf8'));
  await dropFile(page, 'chunky.rig.json', JSON.stringify(rig));
  await expect(page.locator('[data-id="rig-name"]')).toHaveText('Rig: chunky');
  // The export uses the rig: the left shoulder now sits where the rig puts it.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Lottie' }).click()]);
  const doc = JSON.parse(readFileSync((await dl.path())!, 'utf8'));
  const torso = doc.layers.find((l: { nm: string }) => l.nm === 'bone:torso');
  const shoulder = doc.layers.find((l: { nm: string }) => l.nm === 'bone:shoulder_L');
  expect(shoulder.parent).toBe(torso.ind);
  expect(shoulder.ks.p.k).toEqual([rig.joints.shoulder_L[0] - rig.joints.root[0], rig.joints.shoulder_L[1] - rig.joints.root[1]]);
});

test('a broken rig file shows the app banner and keeps the current rig', async ({ page }) => {
  await page.goto('/');
  await dropFile(page, 'oops.rig.json', '{"format":"nope"}');
  await expect(page.locator('[data-id="app-banner"]')).toContainText('Not a rig file (format should be character-rig/rig)');
  await expect(page.locator('[data-id="rig-name"]')).toHaveText('Rig: default');
  await page.locator('[data-id="app-banner"]').click();
  await expect(page.locator('[data-id="app-banner"]')).toBeHidden();
});
