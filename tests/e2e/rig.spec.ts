import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { drag } from './editor-helpers';

async function openRig(page: Page) {
  await page.goto('/');
  await page.evaluate(() => { indexedDB.deleteDatabase('character-rig'); localStorage.clear(); });
  await page.reload();
  await page.getByRole('radio', { name: 'Edit rig' }).click();
  await expect(page.locator('[data-id="rig-canvas"]')).toBeVisible();
  await expect(page.locator('[data-joint="root"]')).toBeAttached();
}
/** Character-space point → client point. */
async function at(page: Page, x: number, y: number): Promise<[number, number]> {
  return page.evaluate(([x, y]) => {
    const svg = document.querySelector<SVGSVGElement>('[data-id="rig-canvas"]')!;
    const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);
    return [p.x, p.y] as [number, number];
  }, [x, y]);
}
async function centre(page: Page, joint: string): Promise<[number, number]> {
  const b = (await page.locator(`[data-joint="${joint}"]`).boundingBox())!;
  return [b.x + b.width / 2, b.y + b.height / 2];
}
/** A joint's position in character space (immune to page layout shifts such as a banner appearing). */
async function pos(page: Page, joint: string): Promise<[number, number]> {
  return page.locator(`[data-joint="${joint}"]`).evaluate((el) => {
    const b = (el as SVGGraphicsElement).getBBox();
    return [b.x + b.width / 2, b.y + b.height / 2] as [number, number];
  });
}
const near = (a: number[], b: number[], tol = 1) => { expect(Math.abs(a[0] - b[0])).toBeLessThan(tol); expect(Math.abs(a[1] - b[1])).toBeLessThan(tol); };

test.describe('Edit rig', () => {
  test('dragging an elbow moves its wrist too; Alt moves it alone; root moves everything', async ({ page }) => {
    await openRig(page);
    const w0 = await centre(page, 'wrist_L'), e0 = await centre(page, 'elbow_L');
    await drag(page, e0, [e0[0] - 30, e0[1] + 10]);
    near(await centre(page, 'elbow_L'), [e0[0] - 30, e0[1] + 10]);
    near(await centre(page, 'wrist_L'), [w0[0] - 30, w0[1] + 10]);
    const w1 = await centre(page, 'wrist_L'), e1 = await centre(page, 'elbow_L');
    await page.keyboard.down('Alt');
    await drag(page, e1, [e1[0] + 20, e1[1]]);
    await page.keyboard.up('Alt');
    near(await centre(page, 'wrist_L'), w1);
    const others = await Promise.all(['neck', 'mouth', 'wrist_R'].map((j) => centre(page, j)));
    const r0 = await centre(page, 'root');
    await drag(page, r0, [r0[0] + 15, r0[1] - 15]);
    const after = await Promise.all(['neck', 'mouth', 'wrist_R'].map((j) => centre(page, j)));
    after.forEach((p, i) => near(p, [others[i][0] + 15, others[i][1] - 15]));
  });

  test('joint drag lands under the pointer at 200% after panning', async ({ page }) => {
    await openRig(page);
    const box = (await page.locator('[data-id="rig-canvas"]').boundingBox())!;
    const mid: [number, number] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(...mid);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120);
    await drag(page, mid, [mid[0] - 60, mid[1] - 30], { button: 'middle' });
    const n0 = await centre(page, 'neck');
    const target: [number, number] = [n0[0] + 37, n0[1] - 23];
    await drag(page, n0, target);
    near(await centre(page, 'neck'), target);
  });

  test('the exported Lottie uses the edited rig', async ({ page }) => {
    await openRig(page);
    const e0 = await centre(page, 'elbow_L');
    await drag(page, e0, [e0[0] - 60, e0[1] - 10]);
    await page.getByRole('radio', { name: 'Animate' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Lottie' }).click()]);
    const doc = JSON.parse(readFileSync((await dl.path())!, 'utf8'));
    const shoulder = doc.layers.find((l: { nm: string }) => l.nm === 'bone:shoulder_L');
    // Idle animates the shoulder, so read the rest value from the first keyframe.
    const rest = shoulder.ks.r.a ? shoulder.ks.r.k[0].s[0] : shoulder.ks.r.k;
    expect(rest).toBeGreaterThan(10);
  });

  test('undo/redo a joint drag; Escape mid-drag reverts it', async ({ page }) => {
    await openRig(page);
    const n0 = await centre(page, 'neck');
    await drag(page, n0, [n0[0] + 40, n0[1]]);
    await page.keyboard.press('Control+z');
    near(await centre(page, 'neck'), n0);
    await page.keyboard.press('Control+Shift+z');
    near(await centre(page, 'neck'), [n0[0] + 40, n0[1]]);
    const n1 = await centre(page, 'neck');
    await page.mouse.move(...n1); await page.mouse.down(); await page.mouse.move(n1[0], n1[1] + 50, { steps: 4 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    near(await centre(page, 'neck'), n1);
  });

  test('download, reset (asks, undoable), load back; a broken rig file is refused', async ({ page }, info) => {
    await openRig(page);
    await page.locator('[data-id="rig-name-input"]').fill('bearded');
    await page.locator('[data-id="rig-name-input"]').press('Enter');
    const n0 = await centre(page, 'neck'), p0 = await pos(page, 'neck');
    await drag(page, n0, [n0[0] + 30, n0[1] + 20]);
    const moved = await pos(page, 'neck');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-id="rig-download"]').click()]);
    expect(dl.suggestedFilename()).toBe('bearded.rig.json');
    const path = info.outputPath('bearded.rig.json');
    await dl.saveAs(path);
    page.once('dialog', (d) => d.accept());
    await page.locator('[data-id="rig-reset"]').click();
    near(await pos(page, 'neck'), p0, 0.01);
    await page.locator('[data-id="rig-load"]').setInputFiles(path);
    await expect.poll(async () => (await pos(page, 'neck'))[0]).toBeCloseTo(moved[0], 2);
    const bad = info.outputPath('bad.rig.json');
    writeFileSync(bad, '{"format":"character-rig/rig","version":1,"joints":{}}');
    await page.locator('[data-id="rig-load"]').setInputFiles(bad);
    await expect(page.locator('[data-id="app-banner"]')).toContainText('Rig is missing joint root');
    near(await pos(page, 'neck'), moved, 0.01);
    await page.locator('[data-id="rig-canvas"]').focus();
    await page.keyboard.press('Control+z');
    near(await pos(page, 'neck'), p0, 0.01);
  });

  test('the reference image is shared with Edit sheet but placed separately', async ({ page }, info) => {
    await page.goto('/');
    await page.evaluate(() => { indexedDB.deleteDatabase('character-rig'); localStorage.clear(); });
    await page.reload();
    const { PNG } = await import('pngjs');
    const png = new PNG({ width: 40, height: 20 }); png.data.fill(180);
    const path = info.outputPath('ref.png');
    writeFileSync(path, PNG.sync.write(png));
    await page.getByRole('radio', { name: 'Edit sheet' }).click();
    await page.locator('[data-id="ref-load"]').setInputFiles(path);
    await expect(page.locator('[data-id="reference"]')).toBeVisible();
    const sheetX = await page.locator('[data-id="reference"]').getAttribute('x');
    await page.getByRole('radio', { name: 'Edit rig' }).click();
    const img = page.locator('[data-id="rig-reference"]');
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('width', '512');
    await page.locator('[data-id="rig-ref-move"]').check();
    const x0 = Number(await img.getAttribute('x'));
    await drag(page, await at(page, 100, 300), await at(page, 150, 300));
    expect(Number(await img.getAttribute('x'))).toBeCloseTo(x0 + 50, 0);
    await page.getByRole('radio', { name: 'Edit sheet' }).click();
    await expect(page.locator('[data-id="reference"]')).toHaveAttribute('x', sheetX!);
  });

  test('Edit rig with an empty sheet renders bones without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByRole('radio', { name: 'Edit sheet' }).click();
    await page.locator('[data-id="new-sheet"]').click();
    await page.locator('[data-tool="ellipse"]').click();
    await page.getByRole('radio', { name: 'Edit rig' }).click();
    await expect(page.locator('[data-joint="wrist_R"]')).toBeAttached();
    expect(errors).toEqual([]);
  });

  test('character opacity applies to the character layer; arrows nudge the selected joint', async ({ page }) => {
    await openRig(page);
    await page.locator('[data-id="char-opacity"]').fill('30');
    await expect(page.locator('[data-id="rig-character"]')).toHaveAttribute('opacity', '0.3');
    const m0 = await centre(page, 'mouth');
    await page.mouse.click(...m0);
    await expect(page.locator('[data-id="joint-readout"]')).toContainText(/mouth/i);
    await page.keyboard.press('Shift+ArrowUp');
    const m1 = await centre(page, 'mouth');
    expect(m1[1]).toBeLessThan(m0[1]);
  });
});

test('loading a reference image never replaces the loaded sheet (Edit sheet or Edit rig)', async ({ page }, info) => {
  await page.goto('/');
  await page.evaluate(() => { indexedDB.deleteDatabase('character-rig'); localStorage.clear(); });
  await page.reload();
  await page.locator('[data-id="file"]').setInputFiles('examples/bearded-worker.svg');
  await expect(page.locator('[data-id="name"]')).toHaveText('Sheet: bearded-worker');
  const { PNG } = await import('pngjs');
  const png = new PNG({ width: 40, height: 20 }); png.data.fill(180);
  const path = info.outputPath('ref.png');
  writeFileSync(path, PNG.sync.write(png));
  await page.getByRole('radio', { name: 'Edit rig' }).click();
  await page.locator('[data-id="rig-ref-load"]').setInputFiles(path);
  await expect(page.locator('[data-id="rig-reference"]')).toBeVisible();
  await expect(page.locator('[data-id="rig-character"] [data-rig-part]')).not.toHaveCount(0);
  await page.getByRole('radio', { name: 'Edit sheet' }).click();
  await page.locator('[data-id="ref-opacity"]').fill('20');
  await page.getByRole('radio', { name: 'Animate' }).click();
  await expect(page.locator('[data-id="name"]')).toHaveText('Sheet: bearded-worker');
});
