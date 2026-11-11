import { it, expect } from 'vitest';
import { sheetToImagePixel } from '../../../src/editor/eyedropper-math';

it('maps sheet points to reference image pixels', () => {
  const ref = { x: 100, y: 50, scale: 0.5, opacity: 1, locked: false, hasImage: true };
  expect(sheetToImagePixel(ref, 400, 200, [100, 50])).toEqual([0, 0]);
  expect(sheetToImagePixel(ref, 400, 200, [299.9, 149.9])).toEqual([399, 199]);
  expect(sheetToImagePixel(ref, 400, 200, [99, 50])).toBeNull();
  expect(sheetToImagePixel(ref, 400, 200, [300, 100])).toBeNull();
});
