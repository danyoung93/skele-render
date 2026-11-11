/** Eyedropper: click sets fill, Shift-click sets stroke, from the reference image (sheet editor spec §2.3). */
import { sheetToImagePixel } from '../eyedropper-math';
import { applyStyle } from '../style-actions';
import type { Tool } from './types';

const hex = (v: number) => v.toString(16).padStart(2, '0');

export function createEyedropperTool(): Tool {
  return {
    id: 'eyedropper',
    cursor: 'copy',
    down(e, ctx) {
      const { store } = ctx;
      const ref = store.get().reference, r = store.doc().reference;
      if (!ref || !r.hasImage) return;
      const px = sheetToImagePixel(r, ref.w, ref.h, ctx.toSheet(e));
      if (!px) return;
      const [R, G, B] = ref.pixels.getImageData(px[0], px[1], 1, 1).data;
      const color = `#${hex(R)}${hex(G)}${hex(B)}`;
      if (e.shiftKey) applyStyle(store, (s) => ({ ...s, stroke: { color, opacity: s.stroke?.opacity ?? 1 } }));
      else applyStyle(store, (s) => ({ ...s, fill: { color, opacity: s.fill?.opacity ?? 1 } }));
    },
    move() {},
    up() {},
  };
}
