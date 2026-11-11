import { test, expect } from '@playwright/test';
import { openEditor, toClient, drag, dragSheet, count } from './editor-helpers';

test.describe('shapes', () => {
  test('draws an ellipse in head and a rectangle in torso; preview and Animate update', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    await page.locator('[data-tool="rect"]').click();
    await dragSheet(page, [450, 100], [650, 400]);
    await expect(count(page, 'head')).toHaveText('1');
    await expect(count(page, 'torso')).toHaveText('1');
    await expect(page.locator('[data-shape-id][data-part="head"]')).toHaveCount(1);
    await expect(page.locator('[data-id="preview"] svg path').first()).toBeAttached();
    await page.getByRole('radio', { name: 'Animate' }).click();
    await expect(page.locator('[data-id="name"]')).toHaveText('Sheet: my-character');
  });

  test('draws under the pointer at 200% zoom after panning', async ({ page }) => {
    await openEditor(page);
    const box = (await page.locator('[data-id="canvas"]').boundingBox())!;
    const mid: [number, number] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(...mid);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -120);
    await drag(page, mid, [mid[0] - 80, mid[1] - 40], { button: 'middle' });
    await page.locator('[data-tool="ellipse"]').click();
    const a: [number, number] = [mid[0] - 60, mid[1] - 50], b: [number, number] = [mid[0] + 70, mid[1] + 30];
    await drag(page, a, b);
    const r = (await page.locator('[data-shape-id]').first().boundingBox())!;
    expect(Math.abs(r.x - a[0])).toBeLessThan(1);
    expect(Math.abs(r.y - a[1])).toBeLessThan(1);
    expect(Math.abs(r.x + r.width - b[0])).toBeLessThan(1);
    expect(Math.abs(r.y + r.height - b[1])).toBeLessThan(1);
  });

  test('select, rotate with Shift snaps to 15°, undo resets; resize keeps rotation', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="rect"]').click();
    await dragSheet(page, [450, 150], [650, 300]);
    await page.locator('[data-tool="select"]').click();
    await page.mouse.click(...(await toClient(page, 550, 225)));
    const handle = (await page.locator('[data-handle="rotate"]').boundingBox())!;
    const c = await toClient(page, 550, 225);
    await page.keyboard.down('Shift');
    await drag(page, [handle.x + handle.width / 2, handle.y + handle.height / 2], [c[0] + 120, c[1] - 70]);
    await page.keyboard.up('Shift');
    const rot = Number(await page.locator('[data-id="rotation"]').inputValue());
    expect(rot % 15).toBe(0);
    expect(rot).not.toBe(0);
    const se = (await page.locator('[data-handle="se"]').boundingBox())!;
    await drag(page, [se.x + se.width / 2, se.y + se.height / 2], [se.x + 30, se.y + 30]);
    expect(Number(await page.locator('[data-id="rotation"]').inputValue())).toBe(rot);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-id="rotation"]')).toHaveValue('0');
  });

  test('shortcuts ignored while typing', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-id="sheet-name"]').fill('hero');
    await page.locator('[data-id="sheet-name"]').press('e');
    await expect(page.locator('[data-tool="select"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-id="sheet-name"]')).toHaveValue('heroe');
    await page.locator('[data-id="canvas"]').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('e');
    await expect(page.locator('[data-tool="ellipse"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('fill colour applies to the selected shape', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    await page.locator('[data-id="fill"]').fill('#ff0000');
    await expect(page.locator('[data-shape-id]').first()).toHaveAttribute('fill', '#ff0000');
  });

  test('drawing still works right after typing in a panel field', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [60, 70], [320, 330]);
    await page.locator('[data-tool="rect"]').click();
    await page.locator('[data-id="fill"]').fill('#6b8597');
    await dragSheet(page, [410, 60], [680, 440]);
    await expect(count(page, 'torso')).toHaveText('1');
    await expect(page.locator('[data-part="torso"]')).toHaveAttribute('fill', '#6b8597');
  });

  test('Escape clears the selection so a colour applies to the next shape only', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-id="style-title"]')).toHaveText('New shape style');
    await page.locator('[data-id="fill"]').fill('#00ff00');
    await dragSheet(page, [450, 100], [650, 400]);
    await expect(page.locator('[data-part="head"]')).toHaveAttribute('fill', '#cccccc');
    await expect(page.locator('[data-part="torso"]')).toHaveAttribute('fill', '#00ff00');
  });

  test('parts list: hide a part and pick the active part', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    await page.locator('[data-part-visible="head"]').uncheck();
    await expect(page.locator('[data-shape-id][data-part="head"]')).toHaveCount(0);
    await page.locator('[data-part-row="torso"]').click();
    await page.locator('[data-tool="ellipse"]').click();
    await page.locator('[data-id="zoom-fit"]').click();
    await dragSheet(page, [20, 900], [200, 1000]);
    await expect(count(page, 'torso')).toHaveText('1');
  });
});
