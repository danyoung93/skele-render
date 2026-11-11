/** Edit rig mode (rig editor spec §3). */
import type { EditorStore } from '../editor/store';
import { isTyping } from '../editor/view';
import { moveJoint } from '../rig/rig-edit';
import type { AppBanner } from '../ui/app';
import type { SheetBus } from '../ui/sheet-bus';
import { createRigPanel } from './panel';
import { startRigAutosave } from './autosave';
import { createRigStore } from './store';
import { createRigView } from './view';

export function mountRigEditor(el: HTMLElement, bus: SheetBus, editorStore: EditorStore, banner: AppBanner) {
  const store = createRigStore(bus);
  el.innerHTML = `
  <div class="editor rig-editor">
    <div class="canvas-wrap">
      <div class="canvas-host" data-id="rig-canvas-host"></div>
      <div class="zoom">
        <button class="btn" data-id="rig-zoom-out" aria-label="Zoom out">−</button>
        <button class="btn" data-id="rig-zoom-fit">Fit</button>
        <button class="btn" data-id="rig-zoom-in" aria-label="Zoom in">+</button>
      </div>
    </div>
    <aside class="panel editor-panel" data-id="rig-panel"></aside>
  </div>`;
  const view = createRigView(el.querySelector('[data-id="rig-canvas-host"]')!, store, bus, () => editorStore.get().reference);
  const panel = createRigPanel(el.querySelector('[data-id="rig-panel"]')!, store, bus, view, editorStore, banner);
  el.querySelector('[data-id="rig-zoom-in"]')!.addEventListener('click', () => view.zoomBy(1.25));
  el.querySelector('[data-id="rig-zoom-out"]')!.addEventListener('click', () => view.zoomBy(1 / 1.25));
  el.querySelector('[data-id="rig-zoom-fit"]')!.addEventListener('click', () => view.fit());

  // The reference image is shared with Edit sheet; a new image gets fitted to the character area here.
  let lastBlob: Blob | null = null;
  editorStore.subscribe(() => {
    const img = editorStore.get().reference;
    if (img && img.blob !== lastBlob) {
      lastBlob = img.blob;
      if (!store.doc().reference.hasImage || visible) store.commit({ ...store.doc(), reference: store.fitReference(img.w, img.h) });
    }
    view.render();
  });

  let visible = false;
  window.addEventListener('keydown', (e) => {
    if (!visible || isTyping(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) store.redo(); else if (!view.cancel()) store.undo();
      return;
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); store.redo(); return; }
    if (e.key === 'Escape') { if (!view.cancel()) store.set({ selected: null }); return; }
    const sel = store.get().selected;
    const step = e.shiftKey ? 10 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (sel && d[e.key] && (e.target as HTMLElement)?.getAttribute?.('type') !== 'range') {
      e.preventDefault();
      store.commit({ ...store.doc(), rig: moveJoint(store.doc().rig, sel, d[e.key], e.altKey) });
    }
  });

  void startRigAutosave(store, bus, banner);
  return {
    store,
    show() { visible = true; el.hidden = false; view.render(); panel.renderPreview(); },
    hide() { visible = false; el.hidden = true; },
  };
}
