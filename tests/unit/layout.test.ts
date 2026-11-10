import { describe, it, expect } from 'vitest';
import { AREAS, PART_IDS, REF_SIZE, MIN_GAP, LEGEND_Y } from '../../src/sheet/layout';

describe('layout', () => {
  it('areas lie inside the sheet and above the legend strip', () => {
    for (const id of PART_IDS) {
      const a = AREAS[id];
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(REF_SIZE);
      expect(a.y + a.h).toBeLessThanOrEqual(LEGEND_Y);
    }
  });
  it('areas are at least 32 units apart', () => {
    for (const p of PART_IDS) for (const q of PART_IDS) {
      if (p >= q) continue;
      const a = AREAS[p], b = AREAS[q];
      const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
      const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      expect(Math.max(gapX, gapY), `${p} vs ${q}`).toBeGreaterThanOrEqual(MIN_GAP);
    }
  });
  it('pivots lie inside their areas', () => {
    for (const id of PART_IDS) {
      const a = AREAS[id];
      expect(a.pivot[0]).toBeGreaterThanOrEqual(0);
      expect(a.pivot[0]).toBeLessThanOrEqual(a.w);
      expect(a.pivot[1]).toBeGreaterThanOrEqual(0);
      expect(a.pivot[1]).toBeLessThanOrEqual(a.h);
    }
  });
});
