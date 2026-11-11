/** Style changes apply to the selection (one undo step) and become the default for new shapes. */
import { updateShape } from './commands';
import { findShape, type Style } from './model';
import type { Store } from './store';

/**
 * `live` changes (e.g. dragging in a colour picker) update the document without history; the caller
 * ends the gesture with store.endTransient() so the whole drag is one undo step.
 */
export function applyStyle(store: Store, patch: (s: Style) => Style, live = false) {
  store.set({ style: patch(store.get().style) });
  const shapes = store.get().selection.map((id) => findShape(store.doc(), id)?.shape).filter((s) => !!s);
  if (!shapes.length) return;
  let doc = store.doc();
  for (const s of shapes) doc = updateShape(doc, s!.id, { style: patch(s!.style) });
  if (live) store.transient(doc); else store.commit(doc);
}
