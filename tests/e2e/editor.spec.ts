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

  test('shortcuts still work after clicking a checkbox in the panel', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-part-visible="head"]').click();
    await expect(page.locator('[data-part-visible="head"]')).toBeFocused();
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

test.describe('pen and points', () => {
  const pathD = (page: import('@playwright/test').Page) => page.locator('[data-part="mouth_open"]').getAttribute('d');

  test('draws a closed curved path', async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press('p');
    await page.mouse.click(...(await toClient(page, 750, 510)));
    await drag(page, await toClient(page, 830, 510), await toClient(page, 840, 540));
    await page.mouse.click(...(await toClient(page, 790, 565)));
    await page.mouse.click(...(await toClient(page, 750, 510)));
    await expect(count(page, 'mouth_open')).toHaveText('1');
    const d = (await pathD(page))!;
    expect(d).toContain('C');
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  test('Enter finishes an open path; Backspace removes the last point', async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press('p');
    for (const [x, y] of [[750, 510], [800, 520], [830, 560]]) await page.mouse.click(...(await toClient(page, x, y)));
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    const d = (await pathD(page))!;
    expect(d).not.toContain('Z');
    expect((d.match(/C/g) ?? []).length).toBe(1);
  });

  test('undo cancels an in-progress pen path', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    await page.keyboard.press('p');
    await page.mouse.click(...(await toClient(page, 750, 510)));
    await page.mouse.click(...(await toClient(page, 800, 520)));
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-id="tool-layer"] *')).toHaveCount(0);
    await expect(count(page, 'head')).toHaveText('1');
    await expect(page.locator('[data-shape-id]')).toHaveCount(1);
  });

  test('edit points: drag a point, insert by double-click, delete a point', async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press('p');
    for (const [x, y] of [[750, 510], [830, 510], [830, 560], [750, 560]]) await page.mouse.click(...(await toClient(page, x, y)));
    await page.mouse.click(...(await toClient(page, 750, 510)));
    await page.keyboard.press('a');
    await page.mouse.click(...(await toClient(page, 790, 535)));
    const d0 = (await pathD(page))!;
    await dragSheet(page, [830, 510], [840, 510]);
    const d1 = (await pathD(page))!;
    expect(d1).not.toBe(d0);
    const cs = (d: string) => (d.match(/C/g) ?? []).length;
    await page.mouse.dblclick(...(await toClient(page, 790, 560)));
    await expect.poll(async () => cs((await pathD(page))!)).toBe(cs(d1) + 1);
    await page.mouse.click(...(await toClient(page, 750, 560)));
    await page.keyboard.press('Delete');
    await expect.poll(async () => cs((await pathD(page))!)).toBe(cs(d1));
  });

  test('edit points on a rotated path lands under the pointer', async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press('p');
    for (const [x, y] of [[750, 510], [830, 510], [830, 560]]) await page.mouse.click(...(await toClient(page, x, y)));
    await page.mouse.click(...(await toClient(page, 750, 510)));
    await page.keyboard.press('v');
    await page.mouse.click(...(await toClient(page, 815, 525)));
    await page.locator('[data-id="rotation"]').fill('90');
    await page.locator('[data-id="rotation"]').press('Enter');
    await page.locator('[data-tool="points"]').click();
    await page.mouse.click(...(await toClient(page, 790, 535)));
    const node = page.locator('[data-node="0"]');
    const b = (await node.boundingBox())!;
    const target = await toClient(page, 770, 590);
    await drag(page, [b.x + b.width / 2, b.y + b.height / 2], target);
    const a = (await node.boundingBox())!;
    expect(Math.abs(a.x + a.width / 2 - target[0])).toBeLessThan(1);
    expect(Math.abs(a.y + a.height / 2 - target[1])).toBeLessThan(1);
  });
});

test.describe('reference image', () => {
  async function refPng(info: import('@playwright/test').TestInfo): Promise<string> {
    const { PNG } = await import('pngjs');
    const { writeFileSync } = await import('node:fs');
    const png = new PNG({ width: 400, height: 200 });
    for (let y = 0; y < 200; y++) for (let x = 0; x < 400; x++) {
      const i = (y * 400 + x) * 4, [r, g, b] = x < 200 ? [0x33, 0x66, 0xcc] : [0xf4, 0xb9, 0xa0];
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
    const path = info.outputPath('reference.png');
    writeFileSync(path, PNG.sync.write(png));
    return path;
  }
  const img = (page: import('@playwright/test').Page) => page.locator('[data-id="reference"]');

  test('loads, moves with Move reference, locks, scales with the wheel', async ({ page }, info) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    const shapeBefore = await page.locator('[data-shape-id]').first().getAttribute('cx');
    await page.locator('[data-id="ref-load"]').setInputFiles(await refPng(info));
    await expect(img(page)).toBeVisible();
    // Fitted to the sheet: 400x200 → scale 2.56, centred vertically.
    await expect(img(page)).toHaveAttribute('width', '1024');
    const x0 = Number(await img(page).getAttribute('x'));
    await page.locator('[data-id="ref-move"]').check();
    await dragSheet(page, [500, 500], [600, 500]);
    expect(Number(await img(page).getAttribute('x'))).toBeCloseTo(x0 + 100, 0);
    expect(await page.locator('[data-shape-id]').first().getAttribute('cx')).toBe(shapeBefore);
    const w0 = Number(await img(page).getAttribute('width'));
    await page.mouse.move(...(await toClient(page, 500, 500)));
    await page.mouse.wheel(0, -240);
    await expect.poll(async () => Number(await img(page).getAttribute('width'))).toBeGreaterThan(w0);
    await page.locator('[data-id="ref-lock"]').check();
    await expect(page.locator('[data-id="ref-move"]')).toBeDisabled();
    const x1 = await img(page).getAttribute('x');
    await dragSheet(page, [500, 500], [600, 500]);
    expect(await img(page).getAttribute('x')).toBe(x1);
  });

  test('choosing a drawing tool turns Move reference off', async ({ page }, info) => {
    await openEditor(page);
    await page.locator('[data-id="ref-load"]').setInputFiles(await refPng(info));
    await page.locator('[data-id="ref-move"]').check();
    await page.locator('[data-tool="ellipse"]').click();
    await expect(page.locator('[data-id="ref-move"]')).not.toBeChecked();
  });

  test('eyedropper sets fill and (with Shift) stroke from the reference', async ({ page }, info) => {
    await openEditor(page);
    await page.locator('[data-id="ref-load"]').setInputFiles(await refPng(info));
    await expect(img(page)).toBeVisible();
    await page.keyboard.press('i');
    // Image spans x 0..1024, y 256..768 after fitting; left half blue, right half peach.
    await page.mouse.click(...(await toClient(page, 200, 500)));
    await expect(page.locator('[data-id="fill"]')).toHaveValue('#3366cc');
    await page.keyboard.down('Shift');
    await page.mouse.click(...(await toClient(page, 800, 500)));
    await page.keyboard.up('Shift');
    await expect(page.locator('[data-id="stroke"]')).toHaveValue('#f4b9a0');
    await expect(page.locator('[data-id="stroke-none"]')).not.toBeChecked();
  });

  test('a file that is not an image shows an error and keeps the previous reference', async ({ page }, info) => {
    await openEditor(page);
    await page.locator('[data-id="ref-load"]').setInputFiles(await refPng(info));
    const href = await img(page).getAttribute('href');
    const bad = info.outputPath('notes.png');
    (await import('node:fs')).writeFileSync(bad, 'not really a png');
    await page.locator('[data-id="ref-load"]').setInputFiles(bad);
    await expect(page.locator('[data-id="banner"]')).toContainText('Could not read that image');
    expect(await img(page).getAttribute('href')).toBe(href);
  });
});

test.describe('sheet actions and autosave', () => {
  test('autosave restores shapes and the reference image after a reload', async ({ page }, info) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    await dragSheet(page, [450, 100], [650, 400]);
    const { PNG } = await import('pngjs');
    const png = new PNG({ width: 20, height: 10 }); png.data.fill(200);
    const path = info.outputPath('ref.png');
    (await import('node:fs')).writeFileSync(path, PNG.sync.write(png));
    await page.locator('[data-id="ref-load"]').setInputFiles(path);
    await expect(page.locator('[data-id="reference"]')).toBeVisible();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole('radio', { name: 'Edit sheet' }).click();
    await expect(count(page, 'head')).toHaveText('1');
    await expect(count(page, 'torso')).toHaveText('1');
    await expect(page.locator('[data-id="reference"]')).toBeVisible();
    // Animate picks up the restored drawing too.
    await page.getByRole('radio', { name: 'Animate' }).click();
    await expect(page.locator('[data-id="name"]')).toHaveText('Sheet: my-character');
  });

  test('Edit current sheet imports the Animate sheet, notes the gradient, and can be undone', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-id="edit-current"]').click();
    await expect(count(page, 'head')).toHaveText('6');
    await expect(page.locator('[data-id="editor-warnings"]')).toContainText('gradient flattened to its first colour');
    await page.keyboard.press('Control+z');
    await expect(count(page, 'head')).toHaveText('0');
  });

  test('New blank sheet asks first when there are unsaved changes', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    page.once('dialog', (d) => d.dismiss());
    await page.locator('[data-id="new-sheet"]').click();
    await expect(count(page, 'head')).toHaveText('1');
    page.once('dialog', (d) => d.accept());
    await page.locator('[data-id="new-sheet"]').click();
    await expect(count(page, 'head')).toHaveText('0');
  });

  test('Download SVG saves a sheet that loads in Animate without warnings for drawn parts', async ({ page }, info) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-id="download-svg"]').click()]);
    expect(dl.suggestedFilename()).toBe('my-character.svg');
    const path = info.outputPath('my-character.svg');
    await dl.saveAs(path);
    await page.getByRole('radio', { name: 'Animate' }).click();
    await page.locator('[data-id="file"]').setInputFiles(path);
    await expect(page.locator('[data-id="name"]')).toHaveText('Sheet: my-character');
    await expect(page.locator('.warnings details summary', { hasText: /^head$/ })).toHaveCount(0);
    // No confirmation needed after a download.
    let asked = false;
    page.once('dialog', (d) => { asked = true; void d.accept(); });
    await page.getByRole('radio', { name: 'Edit sheet' }).click();
    await page.locator('[data-id="new-sheet"]').click();
    expect(asked).toBe(false);
  });

  test('Export Lottie after drawing gives JSON that plays in lottie-web', async ({ page, context }, info) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    await page.getByRole('radio', { name: 'Animate' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Lottie' }).click()]);
    expect(dl.suggestedFilename()).toBe('my-character-idle.json');
    const path = info.outputPath('x.json');
    await dl.saveAs(path);
    const json = JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'));
    const fresh = await context.newPage();
    const errors: string[] = [];
    fresh.on('pageerror', (e) => errors.push(e.message));
    await fresh.goto('/tests/e2e/fidelity.html');
    await fresh.waitForFunction(() => 'renderDoc' in window);
    await fresh.evaluate((doc) => window.renderDoc(doc), json);
    await expect(fresh.locator('#lottie svg path').first()).toBeAttached();
    expect(errors).toEqual([]);
  });

  test('undo and redo shortcuts across three shapes', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    for (const x of [60, 120, 180]) await dragSheet(page, [x, 100], [x + 40, 140]);
    const shapes = page.locator('[data-shape-id]');
    await expect(shapes).toHaveCount(3);
    await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
    await expect(shapes).toHaveCount(1);
    await page.keyboard.press('Control+Shift+z');
    await expect(shapes).toHaveCount(2);
    await page.keyboard.press('Control+y');
    await expect(shapes).toHaveCount(3);
  });

  test('when storage is unavailable, a banner says autosave is off and drawing still works', async ({ page }) => {
    await page.addInitScript(() => { IDBFactory.prototype.open = () => { throw new Error('blocked'); }; });
    await page.goto('/');
    await page.getByRole('radio', { name: 'Edit sheet' }).click();
    await expect(page.locator('[data-id="banner"]')).toContainText('Autosave is off. Download your sheet to keep it.');
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    await expect(count(page, 'head')).toHaveText('1');
  });
});

test.describe('review fixes', () => {
  test('Ctrl+Z during a drag puts the shape back and records nothing (#5)', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="rect"]').click();
    await dragSheet(page, [420, 100], [520, 200]);
    await page.keyboard.press('v');
    const x0 = await page.locator('[data-shape-id]').getAttribute('x');
    await page.mouse.move(...(await toClient(page, 470, 150)));
    await page.mouse.down();
    await page.mouse.move(...(await toClient(page, 520, 150)), { steps: 5 });
    await page.keyboard.press('Control+z');
    await page.mouse.up();
    await expect(page.locator('[data-shape-id]')).toHaveAttribute('x', x0!);
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-shape-id]')).toHaveCount(0);
  });

  test('Space still presses buttons and checkboxes, in Animate and in the editor panel (#2)', async ({ page }) => {
    await page.goto('/');
    const play = page.getByRole('button', { name: 'Pause' });
    await play.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await page.getByRole('radio', { name: 'Edit sheet' }).click();
    const vis = page.locator('[data-part-visible="head"]');
    await vis.focus();
    await page.keyboard.press('Space');
    await expect(vis).not.toBeChecked();
  });

  test('Space held while the window loses focus does not leave the canvas stuck in pan mode (#2)', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-id="canvas"]').focus();
    await page.keyboard.down('Space');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    await expect(count(page, 'head')).toHaveText('1');
  });

  test('dragging in the colour picker is one undo step (#3)', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    await page.locator('[data-id="fill"]').evaluate((el: HTMLInputElement) => {
      for (const c of ['#110000', '#220000', '#330000', '#440000', '#550000']) { el.value = c; el.dispatchEvent(new Event('input', { bubbles: true })); }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('[data-part="head"]')).toHaveAttribute('fill', '#550000');
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-part="head"]')).toHaveAttribute('fill', '#cccccc');
  });

  test('hiding a part deselects its shapes, so Delete cannot remove them unseen (#7)', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    await page.keyboard.press('v');
    await page.locator('[data-part-visible="head"]').uncheck();
    await page.keyboard.press('Delete');
    await page.locator('[data-part-visible="head"]').check();
    await expect(count(page, 'head')).toHaveText('1');
  });

  test('Edit points forgets the chosen point when another path is selected (#8)', async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press('p');
    for (const [x, y] of [[750, 510], [830, 510], [790, 565]]) await page.mouse.click(...(await toClient(page, x, y)));
    await page.mouse.click(...(await toClient(page, 750, 510)));
    for (const [x, y] of [[894, 396], [978, 396], [936, 450]]) await page.mouse.click(...(await toClient(page, x, y)));
    await page.mouse.click(...(await toClient(page, 894, 396)));
    await page.keyboard.press('a');
    await page.mouse.click(...(await toClient(page, 790, 525)));
    await page.locator('[data-node="1"]').click();
    await page.keyboard.press('v');
    await page.mouse.click(...(await toClient(page, 936, 415)));
    await page.keyboard.press('a');
    await page.keyboard.press('Delete');
    const d = (await page.locator('[data-part="mouth_half"]').getAttribute('d'))!;
    expect((d.match(/C/g) ?? []).length).toBe(3);
  });

  test('an edit made just before a reload is not lost (#9)', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="rect"]').click();
    await dragSheet(page, [450, 100], [650, 400]);
    await page.reload();
    await page.getByRole('radio', { name: 'Edit sheet' }).click();
    await expect(count(page, 'torso')).toHaveText('1');
  });

  test('after a reload, New blank sheet still asks before replacing undownloaded work (#11)', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool="ellipse"]').click();
    await dragSheet(page, [100, 100], [250, 220]);
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByRole('radio', { name: 'Edit sheet' }).click();
    await expect(count(page, 'head')).toHaveText('1');
    let asked = false;
    page.once('dialog', (dlg) => { asked = true; void dlg.dismiss(); });
    await page.locator('[data-id="new-sheet"]').click();
    expect(asked).toBe(true);
    await expect(count(page, 'head')).toHaveText('1');
  });
});

