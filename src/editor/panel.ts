/** Right-hand panel (sheet editor spec §2.2). Static structure; values refreshed from the store. */
import lottie, { type AnimationItem } from 'lottie-web/build/player/lottie_light';
import { ANIMATIONS } from '../anim';
import { buildLottie } from '../lottie/build';
import { AREAS, PART_IDS } from '../sheet/layout';
import type { SheetBus } from '../ui/sheet-bus';
import { esc, warningsHtml } from '../ui/util';
import { flipShapes, reorder, setSize, updateShape } from './commands';
import { applyStyle as applyStyleTo } from './style-actions';
import { findShape, normAngle, tightBounds, type EditorShape, type Paint, type Style } from './model';
import type { Store } from './store';
import type { CanvasView } from './view';
import type { ToolId } from './tools/types';
import { setReference } from './commands';
import { REF_SIZE } from '../sheet/layout';

export interface PanelHooks {
  extraSections?: string;
  useTool(id: ToolId): void;
  duplicate(): void;
  newSheet(): void;
  editCurrent(): void;
  downloadSvg(): void;
  bind?(root: HTMLElement): void;
  refresh?(root: HTMLElement): void;
}

export function createPanel(root: HTMLElement, store: Store, bus: SheetBus, view: CanvasView, hooks: PanelHooks) {
  root.innerHTML = `
  <section class="ps"><h2>Sheet</h2>
    <label class="row">Name <input data-id="sheet-name" type="text" spellcheck="false"/></label>
    <div class="row"><button class="btn" data-id="new-sheet">New blank sheet</button>
      <button class="btn" data-id="edit-current" title="Turn the sheet shown in Animate into editable shapes">Edit current sheet</button></div>
    <div class="row"><button class="btn primary" data-id="download-svg">Download SVG</button></div>
  </section>
  <section class="ps"><h2>Parts</h2>
    <div class="parts" data-id="parts">${PART_IDS.map((p) => `
      <div class="part-row" data-part-row="${p}" role="button" tabindex="0">
        <input type="checkbox" checked data-part-visible="${p}" aria-label="Show ${p}"/>
        <span class="part-name">${p}</span><span class="part-count" data-part-count="${p}">0</span>
      </div>`).join('')}
    </div>
  </section>
  <section class="ps"><h2 data-id="style-title">New shape style</h2>
    <div class="row"><label>Fill <input type="color" data-id="fill"/></label>
      <label title="Fill opacity (%)"><input type="number" min="0" max="100" step="5" data-id="fill-opacity"/>%</label>
      <label><input type="checkbox" data-id="fill-none"/> none</label></div>
    <div class="row"><label>Stroke <input type="color" data-id="stroke"/></label>
      <label title="Stroke opacity (%)"><input type="number" min="0" max="100" step="5" data-id="stroke-opacity"/>%</label>
      <label><input type="checkbox" data-id="stroke-none"/> none</label></div>
    <div class="row"><label>Width <input type="number" min="0" step="0.5" data-id="stroke-width"/></label>
      <label>Corner <input type="number" min="0" step="1" data-id="radius"/></label>
      <label>Rotation <input type="number" step="1" data-id="rotation"/>°</label></div>
    <div class="row"><label>W <input type="number" min="1" step="1" data-id="width"/></label>
      <label>H <input type="number" min="1" step="1" data-id="height"/></label>
      <label title="Keep proportions when resizing (Shift does the same on the handles)"><input type="checkbox" data-id="keep-ratio"/> Keep proportions</label></div>
    <div class="row"><button class="btn" data-id="forward">Bring forward</button><button class="btn" data-id="backward">Send backward</button>
      <button class="btn" data-id="duplicate" title="Duplicate (Ctrl/Cmd+D)">Duplicate</button>
      <button class="btn" data-id="flip-h">Flip horizontally</button>
      <button class="btn" data-id="flip-v">Flip vertically</button>
      <button class="btn danger" data-id="delete">Delete</button></div>
  </section>
  <section class="ps"><h2>Reference image</h2>
    <div class="row"><label class="btn">Load image <input type="file" accept="image/*" data-id="ref-load" hidden/></label>
      <button class="btn" data-id="ref-reset">Reset</button></div>
    <div class="row"><label>Opacity <input type="range" min="0" max="100" data-id="ref-opacity"/></label></div>
    <div class="row"><label><input type="checkbox" data-id="ref-move"/> Move reference</label>
      <label><input type="checkbox" data-id="ref-lock"/> Lock</label></div>
  </section>
  ${hooks.extraSections ?? ''}
  <section class="ps"><h2>Live preview</h2>
    <select data-id="preview-anim" aria-label="Preview animation">${ANIMATIONS.map((a) => `<option value="${a.id}">${a.label}</option>`).join('')}</select>
    <div class="preview" data-id="preview"></div>
  </section>
  <section class="ps warn-list" data-id="editor-warnings"></section>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-id="${id}"]`)!;
  const nameIn = $<HTMLInputElement>('sheet-name');
  const fill = $<HTMLInputElement>('fill'), fillOp = $<HTMLInputElement>('fill-opacity'), fillNone = $<HTMLInputElement>('fill-none');
  const stroke = $<HTMLInputElement>('stroke'), strokeOp = $<HTMLInputElement>('stroke-opacity'), strokeNone = $<HTMLInputElement>('stroke-none');
  const width = $<HTMLInputElement>('stroke-width'), radius = $<HTMLInputElement>('radius'), rotation = $<HTMLInputElement>('rotation');

  const selected = (): EditorShape[] => store.get().selection.map((id) => findShape(store.doc(), id)?.shape).filter((s): s is EditorShape => !!s);
  const currentStyle = (): Style => selected()[0]?.style ?? store.get().style;

  const applyStyle = (patch: (s: Style) => Style, live = false) => applyStyleTo(store, patch, live);
  /** Reads the fields now (before any store update re-renders them) and returns a paint builder. */
  const readPaint = (color: HTMLInputElement, op: HTMLInputElement, none: HTMLInputElement) => {
    const c = color.value, o = Number(op.value), off = none.checked;
    return (prev: Paint | null): Paint | null =>
      off ? null : { color: c, opacity: Math.min(1, Math.max(0, (o || (prev ? prev.opacity * 100 : 100)) / 100)) };
  };
  const setFill = (live = false) => { const f = readPaint(fill, fillOp, fillNone); applyStyle((s) => ({ ...s, fill: f(s.fill) }), live); };
  const setStroke = (live = false) => { const f = readPaint(stroke, strokeOp, strokeNone); applyStyle((s) => ({ ...s, stroke: f(s.stroke) }), live); };

  fill.addEventListener('input', () => { fillNone.checked = false; setFill(true); });
  fill.addEventListener('change', () => store.endTransient());
  fillOp.addEventListener('change', () => setFill());
  fillNone.addEventListener('change', () => setFill());
  stroke.addEventListener('input', () => { strokeNone.checked = false; setStroke(true); });
  stroke.addEventListener('change', () => store.endTransient());
  strokeOp.addEventListener('change', () => setStroke());
  strokeNone.addEventListener('change', () => setStroke());
  width.addEventListener('change', () => applyStyle((s) => ({ ...s, strokeWidth: Math.max(0, Number(width.value) || 0) })));
  radius.addEventListener('change', () => {
    let doc = store.doc();
    for (const s of selected()) if (s.kind === 'rect') doc = updateShape(doc, s.id, { r: Math.max(0, Number(radius.value) || 0) });
    store.commit(doc);
  });
  const widthIn = $<HTMLInputElement>('width'), heightIn = $<HTMLInputElement>('height'), keepRatio = $<HTMLInputElement>('keep-ratio');
  const sizeChange = (which: 'w' | 'h', el: HTMLInputElement) => {
    const v = Number(el.value);
    if (!Number.isFinite(v) || v <= 0) { refresh(); return; }
    store.commit(setSize(store.doc(), store.get().selection, { [which]: v }, store.get().keepRatio));
  };
  widthIn.addEventListener('change', () => sizeChange('w', widthIn));
  heightIn.addEventListener('change', () => sizeChange('h', heightIn));
  keepRatio.addEventListener('change', () => store.set({ keepRatio: keepRatio.checked }));
  rotation.addEventListener('change', () => {
    let doc = store.doc();
    for (const s of selected()) doc = updateShape(doc, s.id, { rotation: normAngle(Number(rotation.value) || 0) });
    store.commit(doc);
  });
  $('forward').addEventListener('click', () => { const s = selected(); if (s.length === 1) store.commit(reorder(store.doc(), s[0].id, 'forward')); });
  $('backward').addEventListener('click', () => { const s = selected(); if (s.length === 1) store.commit(reorder(store.doc(), s[0].id, 'backward')); });
  $('delete').addEventListener('click', () => view.ctx.store.commit(
    store.get().selection.reduce((d, id) => { const f = findShape(d, id); return f ? { ...d, parts: { ...d.parts, [f.part]: d.parts[f.part].filter((x) => x.id !== id) } } : d; }, store.doc())));
  nameIn.addEventListener('change', () => {
    const name = nameIn.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'my-character';
    store.commit({ ...store.doc(), name });
  });

  $('duplicate').addEventListener('click', () => hooks.duplicate());
  $('flip-h').addEventListener('click', () => store.commit(flipShapes(store.doc(), store.get().selection, 'h')));
  $('flip-v').addEventListener('click', () => store.commit(flipShapes(store.doc(), store.get().selection, 'v')));
  $('new-sheet').addEventListener('click', () => hooks.newSheet());
  $('edit-current').addEventListener('click', () => hooks.editCurrent());
  $('download-svg').addEventListener('click', () => hooks.downloadSvg());

  // Reference image controls
  const refMove = $<HTMLInputElement>('ref-move'), refLock = $<HTMLInputElement>('ref-lock'), refOpacity = $<HTMLInputElement>('ref-opacity');
  $<HTMLInputElement>('ref-load').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement, f = input.files?.[0];
    if (f) void store.loadReference(f);
    input.value = '';
  });
  refOpacity.addEventListener('input', () => store.transient(setReference(store.doc(), { opacity: Number(refOpacity.value) / 100 })));
  refOpacity.addEventListener('change', () => store.endTransient());
  refMove.addEventListener('change', () => hooks.useTool(refMove.checked ? 'reference' : 'select'));
  refLock.addEventListener('change', () => {
    store.commit(setReference(store.doc(), { locked: refLock.checked }));
    if (refLock.checked && store.get().tool === 'reference') hooks.useTool('select');
  });
  $('ref-reset').addEventListener('click', () => {
    const ref = store.get().reference;
    if (!ref) return;
    const scale = Math.min(REF_SIZE / ref.w, REF_SIZE / ref.h);
    store.commit(setReference(store.doc(), { scale, x: (REF_SIZE - ref.w * scale) / 2, y: (REF_SIZE - ref.h * scale) / 2 }));
  });

  const parts = $('parts');
  parts.addEventListener('change', (e) => {
    const p = (e.target as HTMLElement).getAttribute('data-part-visible');
    if (!p) return;
    const hidden = new Set(store.get().hidden);
    const showing = (e.target as HTMLInputElement).checked;
    if (showing) hidden.delete(p as never); else hidden.add(p as never);
    // Hidden shapes can't stay selected, or Delete/arrow keys would change them unseen.
    const doc = store.doc();
    const selection = showing ? store.get().selection : store.get().selection.filter((id) => findShape(doc, id)?.part !== p);
    store.set({ hidden, selection });
  });
  parts.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('input')) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-part-row]');
    if (!row) return;
    const p = row.dataset.partRow as (typeof PART_IDS)[number];
    store.setActive(p);
    const a = AREAS[p];
    view.fit({ x0: a.x, y0: a.y, x1: a.x + a.w, y1: a.y + a.h });
  });

  // Live preview of the shared sheet.
  let player: AnimationItem | null = null;
  const preview = $('preview'), previewAnim = $<HTMLSelectElement>('preview-anim');
  function renderPreview() {
    player?.destroy();
    preview.innerHTML = '';
    const anim = ANIMATIONS.find((a) => a.id === previewAnim.value) ?? ANIMATIONS[0];
    player = lottie.loadAnimation({ container: preview, renderer: 'svg', loop: true, autoplay: true, animationData: buildLottie(bus.get(), anim, { debug: false }) });
    renderWarnings();
  }
  function renderWarnings() {
    const notes = store.get().importNotes;
    $('editor-warnings').innerHTML = (notes.length
      ? `<h2>Import notes (${notes.length})</h2><ul>${notes.map((w) => `<li><b>${esc(w.part)}</b>: ${esc(w.message)}</li>`).join('')}</ul>`
      : '') + warningsHtml(bus.get().warnings);
  }
  let lastNotes = store.get().importNotes;
  store.subscribe(() => { if (store.get().importNotes !== lastNotes) { lastNotes = store.get().importNotes; renderWarnings(); } });
  previewAnim.addEventListener('change', renderPreview);
  bus.subscribe(() => { if (!root.closest('[hidden]')) renderPreview(); });

  const setIfIdle = (el: HTMLInputElement, v: string, prop: 'value' | 'checked' = 'value') => {
    if (document.activeElement === el) return;
    if (prop === 'checked') el.checked = v === 'true'; else el.value = v;
  };
  function refresh() {
    const st = store.get(), doc = store.doc(), sel = selected();
    setIfIdle(nameIn, doc.name);
    for (const p of PART_IDS) {
      root.querySelector(`[data-part-count="${p}"]`)!.textContent = String(doc.parts[p].length);
      root.querySelector(`[data-part-row="${p}"]`)!.classList.toggle('active', st.active === p);
      setIfIdle(root.querySelector<HTMLInputElement>(`[data-part-visible="${p}"]`)!, String(!st.hidden.has(p)), 'checked');
    }
    $('style-title').textContent = sel.length ? `Selected (${sel.length})` : 'New shape style';
    const style = currentStyle();
    setIfIdle(fill, style.fill?.color ?? '#cccccc'); setIfIdle(fillOp, String(Math.round((style.fill?.opacity ?? 1) * 100)));
    setIfIdle(fillNone, String(!style.fill), 'checked');
    setIfIdle(stroke, style.stroke?.color ?? '#333333'); setIfIdle(strokeOp, String(Math.round((style.stroke?.opacity ?? 1) * 100)));
    setIfIdle(strokeNone, String(!style.stroke), 'checked');
    setIfIdle(width, String(style.strokeWidth));
    const s0 = sel[0];
    radius.disabled = !(s0 && s0.kind === 'rect');
    setIfIdle(radius, s0 && s0.kind === 'rect' ? String(Math.round(s0.r * 100) / 100) : '');
    rotation.disabled = !sel.length;
    setIfIdle(rotation, s0 ? String(Math.round(s0.rotation * 100) / 100) : '');
    // W/H: the outline's size (one shape, or an unrotated multi-selection).
    const sizable = sel.length === 1 || (sel.length > 1 && sel.every((x) => x.rotation === 0));
    const box = sizable ? sel.map(tightBounds).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })) : null;
    const r1 = (n: number) => String(Math.round(n * 10) / 10);
    widthIn.disabled = heightIn.disabled = !box;
    setIfIdle(widthIn, box ? r1(box.x1 - box.x0) : '');
    setIfIdle(heightIn, box ? r1(box.y1 - box.y0) : '');
    setIfIdle(keepRatio, String(st.keepRatio), 'checked');
    for (const id of ['forward', 'backward', 'duplicate', 'flip-h', 'flip-v', 'delete']) ($(id) as HTMLButtonElement).disabled = !sel.length;
    const r = doc.reference, hasRef = !!st.reference && r.hasImage;
    setIfIdle(refOpacity, String(Math.round(r.opacity * 100)));
    refOpacity.disabled = !hasRef;
    setIfIdle(refLock, String(r.locked), 'checked');
    refLock.disabled = !hasRef;
    refMove.checked = st.tool === 'reference';
    refMove.disabled = !hasRef || r.locked;
    ($('ref-reset') as HTMLButtonElement).disabled = !hasRef;
    hooks.refresh?.(root);
  }
  hooks.bind?.(root);
  store.subscribe(refresh);
  refresh();
  return { refresh, renderPreview, esc };
}
