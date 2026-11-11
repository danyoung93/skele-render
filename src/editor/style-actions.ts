/** Style changes apply to the selection (one undo step) and become the default for new shapes. */
import { updateShape } from './commands';
import { findShape, type Style } from './model';
import type { Store } from './store';

export function applyStyle(store: Store, patch: (s: Style) => Style) {
  store.set({ style: patch(store.get().style) });
  const shapes = store.get().selection.map((id) => findShape(store.doc(), id)?.shape).filter((s) => !!s);
  if (!shapes.length) return;
  let doc = store.doc();
  for (const s of shapes) doc = updateShape(doc, s!.id, { style: patch(s!.style) });
  store.commit(doc);
}
