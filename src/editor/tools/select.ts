/** Select tool: pick, move, resize, rotate, nudge, delete (sheet editor spec §2.3). */
import { deleteShapes, moveShapes, resizeSelection, resizeShape, rotateShapes, type Handle } from '../commands';
import { findShape, normAngle, type EditorDoc, type Vec2 } from '../model';
import { dragBox, selectionFrame } from '../selection';
import type { Tool } from './types';

type Drag =
  | { kind: 'move'; start: Vec2; base: EditorDoc; ids: string[] }
  | { kind: 'resize'; handle: Handle; base: EditorDoc; ids: string[] }
  | { kind: 'rotate'; start: Vec2; centre: Vec2; base: EditorDoc; ids: string[]; rot0: number };

const angleOf = (p: Vec2, c: Vec2) => (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI;

export function createSelectTool(): Tool {
  let drag: Drag | null = null;
  return {
    id: 'select',
    cursor: 'default',
    down(e, ctx) {
      const { store } = ctx;
      const st = store.get(), doc = store.doc();
      const p = ctx.toSheet(e);
      const handle = ctx.target(e)?.getAttribute('data-handle') as Handle | 'rotate' | null;
      if (handle && st.selection.length) {
        const frame = selectionFrame(doc, st.selection)!;
        if (handle === 'rotate') {
          const rot0 = frame.shapes.length === 1 ? frame.shapes[0].rotation : 0;
          drag = { kind: 'rotate', start: p, centre: frame.centre, base: doc, ids: st.selection, rot0 };
        } else drag = { kind: 'resize', handle, base: doc, ids: st.selection };
        return;
      }
      const id = ctx.shapeIdAt(e);
      if (!id) { if (!e.shiftKey) store.select([]); return; }
      let sel = st.selection;
      if (e.shiftKey) sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      else if (!sel.includes(id)) sel = [id];
      store.select(sel);
      const part = findShape(doc, id)?.part;
      if (part && part !== st.active) store.setActive(part);
      if (sel.includes(id)) drag = { kind: 'move', start: p, base: doc, ids: sel };
    },
    move(e, ctx) {
      if (!drag) return;
      const p = ctx.toSheet(e);
      let next: EditorDoc;
      if (drag.kind === 'move') next = moveShapes(drag.base, drag.ids, p[0] - drag.start[0], p[1] - drag.start[1]);
      else if (drag.kind === 'resize') {
        if (drag.ids.length === 1) next = resizeShape(drag.base, drag.ids[0], drag.handle, p, e.shiftKey);
        else {
          const from = selectionFrame(drag.base, drag.ids)!.box;
          next = resizeSelection(drag.base, drag.ids, from, dragBox(from, drag.handle, p, e.shiftKey));
        }
      } else {
        let delta = angleOf(p, drag.centre) - angleOf(drag.start, drag.centre);
        if (e.shiftKey) delta = Math.round((drag.rot0 + delta) / 15) * 15 - drag.rot0;
        next = rotateShapes(drag.base, drag.ids, normAngle(delta), drag.centre);
      }
      ctx.store.transient(next);
    },
    up(_e, ctx) {
      if (!drag) return;
      drag = null;
      ctx.store.endTransient();
    },
    key(e, ctx) {
      const { store } = ctx;
      const sel = store.get().selection;
      if (!sel.length) return false;
      if (e.key === 'Delete' || e.key === 'Backspace') { store.commit(deleteShapes(store.doc(), sel)); return true; }
      const step = e.shiftKey ? 10 : 1;
      const d: Record<string, Vec2> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (d[e.key]) { store.commit(moveShapes(store.doc(), sel, ...d[e.key])); return true; }
      return false;
    },
    cancel(ctx) {
      if (!drag) return false;
      drag = null;
      ctx.store.endTransient();
      return true;
    },
  };
}
