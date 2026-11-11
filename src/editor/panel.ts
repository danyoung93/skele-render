/** Right-hand panel (sheet editor spec §2.2). Static structure; values refreshed from the store. */
import lottie, { type AnimationItem } from 'lottie-web/build/player/lottie_light';
import { ANIMATIONS } from '../anim';
import { buildLottie } from '../lottie/build';
import { AREAS, PART_IDS } from '../sheet/layout';
import type { SheetBus } from '../ui/sheet-bus';
import { esc, warningsHtml } from '../ui/util';
import { reorder, updateShape } from './commands';
import { findShape, normAngle, type EditorShape, type Paint, type Style } from './model';
import type { Store } from './store';
import type { CanvasView } from './view';

export interface PanelHooks { extraSections?: string; bind?(root: HTMLElement): void; refresh?(root: HTMLElement): void }

export function createPanel(root: HTMLElement, store: Store, bus: SheetBus, view: CanvasView, hooks: PanelHooks = {}) {
  root.innerHTML = `
  <section class="ps"><h2>Sheet</h2>
    <label class="row">Name <input data-id="sheet-name" type="text" spellcheck="false"/></label>
    <div data-id="sheet-actions" class="row wrap"></div>
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
    <div class="row"><button class="btn" data-id="forward">Bring forward</button><button class="btn" data-id="backward">Send backward</button>
      <button class="btn danger" data-id="delete">Delete</button></div>
  </section>
  ${hooks.extraSections ?? ''}
  <section class="ps"><h2>Live preview</h2>
    <select data-id="preview-anim" aria-label="Preview animation">${ANIMATIONS.map((a) => `<option value="${a.id}">${a.label}</option>`).join('')}</select>
    <div class="preview" data-id="preview"></div>
  </section>
  <section class="ps warnings" data-id="warnings"></section>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-id="${id}"]`)!;
  const nameIn = $<HTMLInputElement>('sheet-name');
  const fill = $<HTMLInputElement>('fill'), fillOp = $<HTMLInputElement>('fill-opacity'), fillNone = $<HTMLInputElement>('fill-none');
  const stroke = $<HTMLInputElement>('stroke'), strokeOp = $<HTMLInputElement>('stroke-opacity'), strokeNone = $<HTMLInputElement>('stroke-none');
  const width = $<HTMLInputElement>('stroke-width'), radius = $<HTMLInputElement>('radius'), rotation = $<HTMLInputElement>('rotation');

  const selected = (): EditorShape[] => store.get().selection.map((id) => findShape(store.doc(), id)?.shape).filter((s): s is EditorShape => !!s);
  const currentStyle = (): Style => selected()[0]?.style ?? store.get().style;

  /** Apply a style change to the selection (one undo step) and to the default style. */
  function applyStyle(patch: (s: Style) => Style) {
    store.set({ style: patch(store.get().style) });
    const sel = selected();
    if (!sel.length) return;
    let doc = store.doc();
    for (const s of sel) doc = updateShape(doc, s.id, { style: patch(s.style) });
    store.commit(doc);
  }
  const paintFrom = (color: HTMLInputElement, op: HTMLInputElement, none: HTMLInputElement, prev: Paint | null): Paint | null =>
    none.checked ? null : { color: color.value, opacity: Math.min(1, Math.max(0, (Number(op.value) || (prev ? prev.opacity * 100 : 100)) / 100)) };

  fill.addEventListener('input', () => { fillNone.checked = false; applyStyle((s) => ({ ...s, fill: paintFrom(fill, fillOp, fillNone, s.fill) })); });
  fillOp.addEventListener('change', () => applyStyle((s) => ({ ...s, fill: paintFrom(fill, fillOp, fillNone, s.fill) })));
  fillNone.addEventListener('change', () => applyStyle((s) => ({ ...s, fill: paintFrom(fill, fillOp, fillNone, s.fill) })));
  stroke.addEventListener('input', () => { strokeNone.checked = false; applyStyle((s) => ({ ...s, stroke: paintFrom(stroke, strokeOp, strokeNone, s.stroke) })); });
  strokeOp.addEventListener('change', () => applyStyle((s) => ({ ...s, stroke: paintFrom(stroke, strokeOp, strokeNone, s.stroke) })));
  strokeNone.addEventListener('change', () => applyStyle((s) => ({ ...s, stroke: paintFrom(stroke, strokeOp, strokeNone, s.stroke) })));
  width.addEventListener('change', () => applyStyle((s) => ({ ...s, strokeWidth: Math.max(0, Number(width.value) || 0) })));
  radius.addEventListener('change', () => {
    let doc = store.doc();
    for (const s of selected()) if (s.kind === 'rect') doc = updateShape(doc, s.id, { r: Math.max(0, Number(radius.value) || 0) });
    store.commit(doc);
  });
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

  const parts = $('parts');
  parts.addEventListener('change', (e) => {
    const p = (e.target as HTMLElement).getAttribute('data-part-visible');
    if (!p) return;
    const hidden = new Set(store.get().hidden);
    if ((e.target as HTMLInputElement).checked) hidden.delete(p as never); else hidden.add(p as never);
    store.set({ hidden });
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
    $('warnings').innerHTML = warningsHtml(bus.get().warnings);
  }
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
    for (const id of ['forward', 'backward', 'delete']) ($(id) as HTMLButtonElement).disabled = !sel.length;
    hooks.refresh?.(root);
  }
  hooks.bind?.(root);
  store.subscribe(refresh);
  refresh();
  return { refresh, renderPreview, esc };
}
