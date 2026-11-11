/** Edit rig panel (rig editor spec §3.1). */
import lottie, { type AnimationItem } from 'lottie-web/build/player/lottie_light';
import { ANIMATIONS } from '../anim';
import type { EditorStore } from '../editor/store';
import { buildLottie } from '../lottie/build';
import { DEFAULT_RIG, parseRig, RigError, rigsEqual, serializeRig } from '../rig/rig-file';
import { mirrorArmsFrom } from '../rig/rig-edit';
import type { AppBanner } from '../ui/app';
import type { SheetBus } from '../ui/sheet-bus';
import { download, esc } from '../ui/util';
import type { RigStore } from './store';
import { jointLabel, type RigView } from './view';

export function createRigPanel(root: HTMLElement, store: RigStore, bus: SheetBus, view: RigView, editorStore: EditorStore, banner: AppBanner) {
  root.innerHTML = `
  <section class="ps"><h2>Rig</h2>
    <label class="row">Name <input data-id="rig-name-input" type="text" spellcheck="false"/></label>
    <div class="row"><label class="btn">Load rig <input type="file" accept=".json,application/json" data-id="rig-load" hidden/></label>
      <button class="btn primary" data-id="rig-download">Download rig</button>
      <button class="btn" data-id="rig-reset">Reset to default</button></div>
  </section>
  <section class="ps"><label class="row" title="Moving either arm's joint mirrors it onto the other arm"><input type="checkbox" data-id="rig-mirror"/> Mirror arms</label></section>
  <section class="ps"><h2>Selected joint</h2><p class="readout" data-id="joint-readout"></p>
    <p class="hint">Drag a joint: everything attached below it moves too. Alt+drag moves just that joint.</p></section>
  <section class="ps"><h2>Reference image</h2>
    <div class="row"><label class="btn">Load image <input type="file" accept="image/*" data-id="rig-ref-load" hidden/></label>
      <button class="btn" data-id="rig-ref-reset">Reset</button></div>
    <div class="row"><label>Opacity <input type="range" min="0" max="100" data-id="rig-ref-opacity"/></label></div>
    <div class="row"><label><input type="checkbox" data-id="rig-ref-move"/> Move reference</label>
      <label><input type="checkbox" data-id="rig-ref-lock"/> Lock</label></div>
    <div class="row"><label>Character opacity <input type="range" min="0" max="100" data-id="char-opacity"/></label></div>
  </section>
  <section class="ps"><h2>Live preview</h2>
    <select data-id="rig-preview-anim" aria-label="Preview animation">${ANIMATIONS.map((a) => `<option value="${a.id}">${a.label}</option>`).join('')}</select>
    <div class="preview" data-id="rig-preview"></div>
  </section>
  <section class="ps warn-list" data-id="rig-warnings"></section>`;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-id="${id}"]`)!;
  const nameIn = $<HTMLInputElement>('rig-name-input');
  const refOpacity = $<HTMLInputElement>('rig-ref-opacity'), refMove = $<HTMLInputElement>('rig-ref-move');
  const refLock = $<HTMLInputElement>('rig-ref-lock'), charOpacity = $<HTMLInputElement>('char-opacity');

  nameIn.addEventListener('change', () => {
    const name = nameIn.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'rig';
    store.commit({ ...store.doc(), rig: { ...store.doc().rig, name } });
  });
  $<HTMLInputElement>('rig-load').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement, f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const { rig } = parseRig(await f.text());
      store.commit({ ...store.doc(), rig });
      banner.hide();
    } catch (err) {
      banner.show(err instanceof RigError ? `${f.name}: ${err.message}. Kept the current rig.` : `Could not read ${f.name}`, 'error');
    }
  });
  $('rig-download').addEventListener('click', () => {
    const rig = store.doc().rig;
    download(`${rig.name}.rig.json`, serializeRig(rig), 'application/json');
  });
  $('rig-reset').addEventListener('click', () => {
    const d = store.doc();
    if (rigsEqual(d.rig, DEFAULT_RIG)) return;
    if (!window.confirm('Reset every joint to the default rig? You can undo this with Ctrl+Z.')) return;
    store.commit({ ...d, rig: DEFAULT_RIG });
  });
  $<HTMLInputElement>('rig-ref-load').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement, f = input.files?.[0];
    if (f) void editorStore.loadReference(f);
    input.value = '';
  });
  $('rig-ref-reset').addEventListener('click', () => {
    const img = editorStore.get().reference;
    if (img) store.commit({ ...store.doc(), reference: store.fitReference(img.w, img.h) });
  });
  refOpacity.addEventListener('input', () => store.transient({ ...store.doc(), reference: { ...store.doc().reference, opacity: Number(refOpacity.value) / 100 } }));
  refOpacity.addEventListener('change', () => store.endTransient());
  refMove.addEventListener('change', () => store.set({ tool: refMove.checked ? 'reference' : 'joint' }));
  refLock.addEventListener('change', () => {
    store.commit({ ...store.doc(), reference: { ...store.doc().reference, locked: refLock.checked } });
    if (refLock.checked) store.set({ tool: 'joint' });
  });
  const mirror = $<HTMLInputElement>('rig-mirror');
  mirror.addEventListener('change', () => {
    store.set({ mirrorArms: mirror.checked });
    // Turning it on snaps the right arm to mirror the left (one undo step).
    if (mirror.checked) store.commit({ ...store.doc(), rig: mirrorArmsFrom(store.doc().rig, 'L') });
  });
  charOpacity.addEventListener('input', () => store.set({ characterOpacity: Number(charOpacity.value) / 100 }));

  // Live preview (throttled), only while Edit rig is visible.
  let player: AnimationItem | null = null, previewTimer: ReturnType<typeof setTimeout> | null = null;
  const previewAnim = $<HTMLSelectElement>('rig-preview-anim'), preview = $('rig-preview');
  function renderPreview() {
    previewTimer = null;
    if (root.closest('[hidden]')) return;
    player?.destroy();
    preview.innerHTML = '';
    const anim = ANIMATIONS.find((a) => a.id === previewAnim.value) ?? ANIMATIONS[0];
    player = lottie.loadAnimation({ container: preview, renderer: 'svg', loop: true, autoplay: true,
      animationData: buildLottie(bus.get(), anim, { debug: false, rig: store.doc().rig }) });
  }
  const schedulePreview = () => { if (!previewTimer) previewTimer = setTimeout(renderPreview, 200); };
  previewAnim.addEventListener('change', renderPreview);
  bus.subscribe(schedulePreview);
  store.onDoc(schedulePreview);

  const idle = (el: HTMLInputElement) => document.activeElement !== el;
  function refresh() {
    const st = store.get(), d = store.doc(), r = d.reference, hasImg = !!editorStore.get().reference && r.hasImage;
    if (idle(nameIn)) nameIn.value = d.rig.name;
    const sel = st.selected;
    $('joint-readout').textContent = sel ? `${jointLabel(sel)} — ${d.rig.joints[sel].map((v) => Math.round(v * 10) / 10).join(', ')}` : 'None (click a joint)';
    refOpacity.value = String(Math.round(r.opacity * 100));
    refOpacity.disabled = refLock.disabled = !hasImg;
    refLock.checked = r.locked;
    refMove.checked = st.tool === 'reference';
    refMove.disabled = !hasImg || r.locked;
    ($('rig-ref-reset') as HTMLButtonElement).disabled = !hasImg;
    charOpacity.value = String(Math.round(st.characterOpacity * 100));
    mirror.checked = st.mirrorArms;
    $('rig-warnings').innerHTML = st.warnings.length
      ? `<h2>Warnings (${st.warnings.length})</h2><ul>${st.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`
      : '<p class="ok">No rig warnings.</p>';
  }
  store.subscribe(refresh);
  editorStore.subscribe(refresh);
  refresh();
  return { renderPreview, view };
}
