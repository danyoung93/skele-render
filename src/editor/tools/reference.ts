/** Move reference: drag moves the image, wheel scales it around the pointer (sheet editor spec §2.3). */
import { setReference } from '../commands';
import type { EditorDoc, Vec2 } from '../model';
import type { Tool } from './types';

export function createReferenceTool(): Tool {
  let drag: { start: Vec2; base: EditorDoc } | null = null;
  let wheelTimer: ReturnType<typeof setTimeout> | null = null;
  return {
    id: 'reference',
    cursor: 'move',
    down(e, ctx) {
      if (ctx.store.doc().reference.locked) return;
      drag = { start: ctx.toSheet(e), base: ctx.store.doc() };
    },
    move(e, ctx) {
      if (!drag) return;
      const p = ctx.toSheet(e), r = drag.base.reference;
      ctx.store.transient(setReference(drag.base, { x: r.x + p[0] - drag.start[0], y: r.y + p[1] - drag.start[1] }));
    },
    up(_e, ctx) { if (drag) { drag = null; ctx.store.endTransient(); } },
    wheel(e, ctx) {
      const doc = ctx.store.doc(), r = doc.reference;
      if (r.locked || !r.hasImage) return false;
      const p = ctx.toSheet(e), f = Math.exp(-e.deltaY * 0.0015);
      ctx.store.transient(setReference(doc, { scale: r.scale * f, x: p[0] - (p[0] - r.x) * f, y: p[1] - (p[1] - r.y) * f }));
      // A burst of wheel steps is one undo step.
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelTimer = null; ctx.store.endTransient(); }, 300);
      return true;
    },
    cancel(ctx) {
      if (!drag) return false;
      drag = null; ctx.store.endTransient();
      return true;
    },
  };
}
