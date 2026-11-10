import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { AREAS, PART_IDS, type PartId } from '../../src/sheet/layout';

const fx = (n: string) => readFileSync(resolve(process.cwd(), 'tests/fixtures', n), 'utf8');
const MAX_DIFF = 0.01;

// Parts that use approximated features (spec 6.3) get a looser limit.
const LOOSER: Record<string, number> = {
  'features.svg/torso': 0.03, // group opacity over overlapping children
};

const FILES: [string, () => Promise<string> | string][] = [
  ['template', () => ''],
  ['figma.svg', () => fx('figma.svg')],
  ['illustrator.svg', () => fx('illustrator.svg')],
  ['inkscape.svg', () => fx('inkscape.svg')],
  ['affinity.svg', () => fx('affinity.svg')],
  ['features.svg', () => fx('features.svg')],
];

for (const [file, text] of FILES) {
  test.describe(file, () => {
    for (const part of PART_IDS) {
      test(part, async ({ page }, info) => {
        await page.goto('/tests/e2e/fidelity.html');
        await page.waitForFunction(() => 'renderPart' in window);
        const src = (await text()) || (await page.evaluate(() => window.templateText));
        const present = await page.evaluate(([s, p]) => window.renderPart(s, p as PartId).then(() => true, () => false), [src, part]);
        test.skip(!present, `${part} not in ${file}`);
        await page.waitForTimeout(50);
        const a = AREAS[part];
        const shotA = PNG.sync.read(await page.locator('#src').screenshot());
        const shotB = PNG.sync.read(await page.locator('#lottie').screenshot());
        expect([shotA.width, shotA.height]).toEqual([a.w, a.h]);
        expect([shotB.width, shotB.height]).toEqual([a.w, a.h]);
        const diff = new PNG({ width: a.w, height: a.h });
        const n = pixelmatch(shotA.data, shotB.data, diff.data, a.w, a.h, { threshold: 0.1 });
        const ratio = n / (a.w * a.h);
        info.annotations.push({ type: 'diff', description: (ratio * 100).toFixed(3) + '%' });
        if (ratio > 0) {
          await info.attach('diff.png', { body: PNG.sync.write(diff), contentType: 'image/png' });
        }
        expect(ratio, `${file}/${part}: ${(ratio * 100).toFixed(2)}% pixels differ`).toBeLessThanOrEqual(LOOSER[`${file}/${part}`] ?? MAX_DIFF);
      });
    }
  });
}
