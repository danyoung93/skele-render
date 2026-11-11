import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { openEditor, toClient, drag, count } from './editor-helpers';

/** 1024² reference: red circle in the head box, blue rectangle in the torso box, a 2×2 speck in the eyes box. */
async function referencePng(info: TestInfo): Promise<string> {
  const { PNG } = await import('pngjs');
  const png = new PNG({ width: 1024, height: 1024 });
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
    let c = [255, 255, 255];
    if ((x + 0.5 - 192) ** 2 + (y + 0.5 - 192) ** 2 <= 100 * 100) c = [210, 50, 40];
    if (x >= 450 && x < 650 && y >= 100 && y < 400) c = [40, 90, 200];
    if (x >= 520 && x < 580 && y >= 200 && y < 260) c = [240, 200, 40];
    if (x >= 800 && x < 802 && y >= 80 && y < 82) c = [0, 0, 0];
    const i = (y * 1024 + x) * 4;
    png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255;
  }
  const path = info.outputPath('trace-ref.png');
  writeFileSync(path, PNG.sync.write(png));
  return path;
}
async function withReference(page: Page, info: TestInfo) {
  await openEditor(page);
  await page.locator('[data-id="ref-load"]').setInputFiles(await referencePng(info));
  await expect(page.locator('[data-id="reference"]')).toBeVisible();
}
async function pathBox(page: Page, part: string) {
  return page.locator(`[data-part="${part}"]`).last().evaluate((el) => { const b = (el as SVGGraphicsElement).getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
}

test.describe('Trace tool', () => {
  test('hover previews the area; a click creates a matching path in the right part', async ({ page }, info) => {
    await withReference(page, info);
    await page.keyboard.press('t');
    await page.mouse.move(...(await toClient(page, 190, 190)));
    await page.mouse.move(...(await toClient(page, 192, 192)));
    await expect(page.locator('[data-id="trace-preview"]')).toBeAttached();
    await page.mouse.click(...(await toClient(page, 192, 192)));
    await expect(count(page, 'head')).toHaveText('1');
    const shape = page.locator('[data-part="head"]');
    await expect(shape).toHaveAttribute('fill', '#d23228');
    const b = await pathBox(page, 'head');
    expect(Math.abs(b.x + b.w / 2 - 192)).toBeLessThan(1.5);
    expect(Math.abs(b.w - 200)).toBeLessThan(2);
    await expect(page.locator('[data-id="style-title"]')).toHaveText('Selected (1)');
    await page.mouse.click(...(await toClient(page, 470, 150)));
    await expect(count(page, 'torso')).toHaveText('1');
    const t = await pathBox(page, 'torso');
    expect(Math.abs(t.w - 200)).toBeLessThan(2); expect(Math.abs(t.h - 300)).toBeLessThan(2);
    await page.keyboard.press('Control+z');
    await expect(count(page, 'torso')).toHaveText('0');
  });

  test('trace lands on the shape after moving the reference; clicks outside the image do nothing', async ({ page }, info) => {
    await withReference(page, info);
    await page.locator('[data-id="ref-move"]').check();
    await drag(page, await toClient(page, 500, 500), await toClient(page, 540, 500));
    await page.keyboard.press('t');
    await page.mouse.click(...(await toClient(page, 232, 192)));
    const b = await pathBox(page, 'head');
    expect(Math.abs(b.x + b.w / 2 - 232)).toBeLessThan(1.5);
    await page.mouse.click(...(await toClient(page, 20, 600)));
    await expect(count(page, 'upper_arm_L')).toHaveText('0');
  });

  test('a speck is too small to trace; the sliders exist with their defaults', async ({ page }, info) => {
    await withReference(page, info);
    await page.keyboard.press('t');
    await expect(page.locator('[data-id="trace-tolerance"]')).toHaveValue('12');
    await expect(page.locator('[data-id="trace-smoothness"]')).toHaveValue('0.6');
    await page.mouse.click(...(await toClient(page, 801, 81)));
    await expect(page.locator('[data-id="banner"]')).toContainText('That area is too small to trace.');
    await expect(count(page, 'eyes_open')).toHaveText('0');
  });

  test('without a reference image: hover is quiet and a click explains what to do', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openEditor(page);
    await page.keyboard.press('t');
    await page.mouse.move(...(await toClient(page, 100, 100)));
    await page.mouse.move(...(await toClient(page, 120, 120)));
    await page.mouse.click(...(await toClient(page, 120, 120)));
    await expect(page.locator('[data-id="banner"]')).toContainText('Load a reference image first');
    expect(errors).toEqual([]);
  });

  test('after tracing an area, clicking a different colour inside it traces that colour (no stale reuse)', async ({ page }, info) => {
    await withReference(page, info);
    await page.keyboard.press('t');
    await page.mouse.move(...(await toClient(page, 470, 150)));
    await page.mouse.click(...(await toClient(page, 470, 150)));
    await page.mouse.move(...(await toClient(page, 550, 230)));
    await page.waitForTimeout(150);
    await page.mouse.click(...(await toClient(page, 550, 230)));
    await expect(count(page, 'torso')).toHaveText('2');
    await expect(page.locator('[data-part="torso"]').last()).toHaveAttribute('fill', '#f0c828');
  });
});

