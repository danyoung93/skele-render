import { expect, type Page } from '@playwright/test';

export async function openEditor(page: Page) {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('character-rig'));
  await page.reload();
  await page.getByRole('radio', { name: 'Edit sheet' }).click();
  await expect(page.locator('[data-id="canvas"]')).toBeVisible();
}

/** Sheet (reference unit) point → client (CSS px) point, via the canvas's own transform. */
export async function toClient(page: Page, x: number, y: number): Promise<[number, number]> {
  return page.evaluate(([x, y]) => {
    const svg = document.querySelector<SVGSVGElement>('[data-id="canvas"]')!;
    const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);
    return [p.x, p.y] as [number, number];
  }, [x, y]);
}

export async function drag(page: Page, from: [number, number], to: [number, number], opts: { button?: 'left' | 'middle'; steps?: number } = {}) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down({ button: opts.button ?? 'left' });
  await page.mouse.move(to[0], to[1], { steps: opts.steps ?? 8 });
  await page.mouse.up({ button: opts.button ?? 'left' });
}

export async function dragSheet(page: Page, a: [number, number], b: [number, number]) {
  await drag(page, await toClient(page, ...a), await toClient(page, ...b));
}

export const count = (page: Page, part: string) => page.locator(`[data-part-count="${part}"]`);
