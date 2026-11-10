import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = (n: string) => resolve(process.cwd(), 'tests/fixtures', n);

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('[data-id="stage"] svg path').first()).toBeAttached();
  return errors;
}

test('loads with the template character and no errors', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByText('No warnings. All parts loaded.')).toBeVisible();
  await expect(page.locator('[data-id="name"]')).toHaveText('Sheet: character-rig-template');
  for (const a of ['Talking', 'Listening', 'Idle']) {
    await page.getByRole('radio', { name: a }).click();
    await expect(page.locator('[data-id="stage"] svg path').first()).toBeAttached();
  }
  await page.getByLabel('Show bones').check();
  expect(errors).toEqual([]);
});

test('downloaded template loads back without warnings', async ({ page }, info) => {
  await open(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download template' }).click()]);
  expect(dl.suggestedFilename()).toBe('character-rig-template.svg');
  const path = info.outputPath('template.svg');
  await dl.saveAs(path);
  expect(readFileSync(path, 'utf8')).toContain('viewBox="0 0 1024 1024"');
  await page.locator('[data-id="file"]').setInputFiles(path);
  await expect(page.locator('[data-id="name"]')).toHaveText('Sheet: template');
  await expect(page.getByText('No warnings. All parts loaded.')).toBeVisible();
});

test('exported JSON is vector-only and plays in a fresh lottie-web page', async ({ page, context }, info) => {
  await open(page);
  await page.getByRole('radio', { name: 'Talking' }).click();
  await page.getByLabel('Show bones').check();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Lottie' }).click()]);
  expect(dl.suggestedFilename()).toBe('character-rig-template-talking.json');
  const path = info.outputPath('export.json');
  await dl.saveAs(path);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  expect(json.assets).toEqual([]);
  expect(json.op).toBe(60);
  expect(json.layers.some((l: { nm: string }) => l.nm.startsWith('debug:'))).toBe(false);

  const fresh = await context.newPage();
  const errors: string[] = [];
  fresh.on('pageerror', (e) => errors.push(e.message));
  await fresh.goto('/tests/e2e/fidelity.html');
  await fresh.waitForFunction(() => 'renderDoc' in window);
  await fresh.evaluate((doc) => window.renderDoc(doc), json);
  await expect(fresh.locator('#lottie svg path').first()).toBeAttached();
  expect(errors).toEqual([]);
});

test('keeps the previous sheet when a bad file is loaded', async ({ page }, info) => {
  await open(page);
  const bad = info.outputPath('wide.svg');
  writeFileSync(bad, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768"><g id="head"/></svg>');
  await page.locator('[data-id="file"]').setInputFiles(bad);
  await expect(page.getByRole('alert')).toContainText('must be square');
  await expect(page.getByRole('alert')).toContainText('1024 × 768');
  await expect(page.locator('[data-id="name"]')).toHaveText('Sheet: character-rig-template');
  await expect(page.locator('[data-id="stage"] svg path').first()).toBeAttached();

  const notSvg = info.outputPath('notes.svg');
  writeFileSync(notSvg, 'hello <');
  await page.locator('[data-id="file"]').setInputFiles(notSvg);
  await expect(page.getByRole('alert')).toContainText('Not valid SVG');
  await expect(page.locator('[data-id="name"]')).toHaveText('Sheet: character-rig-template');
});

test('scripts and event handlers in a sheet never run', async ({ page }) => {
  await open(page);
  await page.locator('[data-id="file"]').setInputFiles(fixture('unsupported.svg'));
  await expect(page.locator('[data-id="name"]')).toHaveText('Sheet: unsupported');
  await expect(page.locator('.warnings')).toContainText('Scripts ignored');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __crPwned?: string }).__crPwned)).toBeUndefined();
});

test('sheets can be dropped onto the page', async ({ page }) => {
  await open(page);
  const text = readFileSync(fixture('figma.svg'), 'utf8');
  const dt = await page.evaluateHandle((t) => {
    const d = new DataTransfer();
    d.items.add(new File([t], 'figma.svg', { type: 'image/svg+xml' }));
    return d;
  }, text);
  await page.dispatchEvent('body', 'drop', { dataTransfer: dt });
  await expect(page.locator('[data-id="name"]')).toHaveText('Sheet: figma');
  await expect(page.locator('.warnings')).toContainText('Did you mean mouth_half');
});
