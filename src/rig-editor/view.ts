/** Edit rig canvas: reference, assembled character at rest, draggable joints (rig editor spec §3.1–3.2). */
import type { ReferenceImage } from '../editor/store';
import { isTyping } from '../editor/view';
import { fitViewport, zoomAt, type Viewport } from '../editor/viewport';
import { shapeItemsToSvg } from '../lottie/to-svg';
import { restPose } from '../rig/pose';
import { DRAW_ORDER, SWAP_DEFAULT, swapGroupOf } from '../rig/rig';
import { moveJointMirrored } from '../rig/rig-edit';
import { CHAR_SIZE, JOINT_IDS, type JointId } from '../rig/rig-file';
import type { PartId, Vec2 } from '../sheet/layout';
import type { SheetBus } from '../ui/sheet-bus';
import type { RigDoc, RigStore } from './store';

const n = (v: number) => String(Math.round(v * 1000) / 1000);
const FACE: JointId[] = ['brows', 'eyes', 'mouth'];
const LINES: [JointId, JointId][] = [
  ['root', 'neck'], ['neck', 'brows'], ['root', 'shoulder_L'], ['shoulder_L', 'elbow_L'], ['elbow_L', 'wrist_L'],
  ['root', 'shoulder_R'], ['shoulder_R', 'elbow_R'], ['elbow_R', 'wrist_R'],
];
const LABEL: Record<JointId, string> = {
  root: 'Root (base of torso)', neck: 'Neck', brows: 'Brows', eyes: 'Eyes', mouth: 'Mouth',
  shoulder_L: 'Shoulder L', elbow_L: 'Elbow L', wrist_L: 'Wrist L', shoulder_R: 'Shoulder R', elbow_R: 'Elbow R', wrist_R: 'Wrist R',
};
export const jointLabel = (id: JointId) => LABEL[id];

export interface RigView { el: SVGSVGElement; render(): void; fit(): void; zoomBy(f: number): void; cancel(): boolean }

export function createRigView(host: HTMLElement, store: RigStore, bus: SheetBus, image: () => ReferenceImage | null): RigView {
  host.innerHTML = `<svg data-id="rig-canvas" class="canvas" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet" tabindex="0">
    <rect class="char-area" x="0" y="0" width="${CHAR_SIZE}" height="${CHAR_SIZE}" pointer-events="none"/>
    <image data-id="rig-reference" preserveAspectRatio="none" pointer-events="none"/>
    <g data-id="rig-character" pointer-events="none"></g>
    <g data-id="rig-bones"></g>
  </svg>`;
  const el = host.querySelector<SVGSVGElement>('svg')!;
  const refImg = el.querySelector<SVGImageElement>('[data-id="rig-reference"]')!;
  const charG = el.querySelector<SVGGElement>('[data-id="rig-character"]')!;
  const bonesG = el.querySelector<SVGGElement>('[data-id="rig-bones"]')!;

  // Part artwork only changes with the sheet; joints only change transforms.
  let partSvg = new Map<PartId, string>();
  let partEls = new Map<PartId, SVGGElement>();
  function buildCharacter() {
    const sheet = bus.get();
    partSvg = new Map();
    for (const p of DRAW_ORDER) {
      const g = swapGroupOf(p);
      if (g && SWAP_DEFAULT[g] !== p) continue;
      const items = sheet.parts[p];
      if (items?.length) partSvg.set(p, shapeItemsToSvg(items, `rc-${p}-`));
    }
    charG.innerHTML = [...partSvg].map(([p, svg]) => `<g data-rig-part="${p}">${svg}</g>`).join('');
    partEls = new Map([...partSvg.keys()].map((p) => [p, charG.querySelector<SVGGElement>(`[data-rig-part="${p}"]`)!]));
  }

  const size = () => ({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
  const toSheet = (e: { clientX: number; clientY: number }): Vec2 => {
    const m = el.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const local = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  function render() {
    const st = store.get(), d = store.doc(), v = st.viewport, px = 1 / v.zoom;
    const { w, h } = size();
    el.setAttribute('viewBox', `${n(v.x)} ${n(v.y)} ${n(w / v.zoom)} ${n(h / v.zoom)}`);
    const img = image(), r = d.reference;
    if (img && r.hasImage) {
      refImg.setAttribute('href', img.url);
      refImg.setAttribute('x', n(r.x)); refImg.setAttribute('y', n(r.y));
      refImg.setAttribute('width', n(img.w * r.scale)); refImg.setAttribute('height', n(img.h * r.scale));
      refImg.setAttribute('opacity', n(r.opacity));
      refImg.style.display = '';
    } else refImg.style.display = 'none';
    const pose = restPose(d.rig);
    for (const [p, g] of partEls) g.setAttribute('transform', `matrix(${pose.part[p].map(n).join(' ')})`);
    charG.setAttribute('opacity', n(st.characterOpacity));
    const j = d.rig.joints, sel = st.selected;
    const lines = LINES.map(([a, b]) => `<line class="bone" x1="${n(j[a][0])}" y1="${n(j[a][1])}" x2="${n(j[b][0])}" y2="${n(j[b][1])}" stroke-width="${n(2 * px)}" pointer-events="none"/>`).join('');
    const marks = JOINT_IDS.map((id) => {
      const [x, y] = j[id], cls = `joint${id === sel ? ' sel' : ''}`;
      if (FACE.includes(id)) {
        const s = 7 * px;
        return `<path class="${cls} face" data-joint="${id}" d="M${n(x)} ${n(y - s)} L${n(x + s)} ${n(y)} L${n(x)} ${n(y + s)} L${n(x - s)} ${n(y)} Z" stroke-width="${n(1.5 * px)}"><title>${LABEL[id]}</title></path>`;
      }
      return `<circle class="${cls}" data-joint="${id}" cx="${n(x)}" cy="${n(y)}" r="${n(6 * px)}" stroke-width="${n(1.5 * px)}"><title>${LABEL[id]}</title></circle>`;
    }).join('');
    bonesG.innerHTML = lines + marks;
    el.style.cursor = st.tool === 'reference' ? 'move' : 'default';
  }

  // ---- Input ----
  type Drag =
    | { kind: 'joint'; id: JointId; start: Vec2; base: RigDoc; alone: boolean }
    | { kind: 'reference'; start: Vec2; base: RigDoc }
    | { kind: 'pan'; start: Vec2; v: Viewport };
  let drag: Drag | null = null, pointer: number | null = null, spaceDown = false;
  let wheelTimer: ReturnType<typeof setTimeout> | null = null;

  el.addEventListener('dragstart', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    el.focus({ preventScroll: true });
    const st = store.get(), d = store.doc();
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      drag = { kind: 'pan', start: local(e), v: st.viewport };
    } else if (e.button !== 0) return;
    else {
      const joint = (e.target as Element).closest?.('[data-joint]')?.getAttribute('data-joint') as JointId | null;
      if (joint) {
        store.set({ selected: joint, tool: 'joint' });
        drag = { kind: 'joint', id: joint, start: toSheet(e), base: d, alone: e.altKey };
      } else if (st.tool === 'reference' && d.reference.hasImage && !d.reference.locked) {
        drag = { kind: 'reference', start: toSheet(e), base: d };
      } else { store.set({ selected: null }); return; }
    }
    pointer = e.pointerId;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== pointer) return;
    if (drag.kind === 'pan') {
      const p = local(e);
      store.set({ viewport: { ...drag.v, x: drag.v.x - (p[0] - drag.start[0]) / drag.v.zoom, y: drag.v.y - (p[1] - drag.start[1]) / drag.v.zoom } });
      return;
    }
    const p = toSheet(e), dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
    if (drag.kind === 'joint') store.transient({ ...drag.base, rig: moveJointMirrored(drag.base.rig, drag.id, [dx, dy], drag.alone, store.get().mirrorArms) });
    else store.transient({ ...drag.base, reference: { ...drag.base.reference, x: drag.base.reference.x + dx, y: drag.base.reference.y + dy } });
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    const d = drag;
    drag = null;
    if (d && d.kind !== 'pan') store.endTransient();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', (e) => { if (e.pointerId === pointer) { pointer = null; if (drag && drag.kind !== 'pan') store.abortTransient(); drag = null; } });
  el.addEventListener('auxclick', (e) => e.preventDefault());
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const st = store.get(), d = store.doc();
    if (!e.ctrlKey && st.tool === 'reference' && d.reference.hasImage && !d.reference.locked) {
      const p = toSheet(e), f = Math.exp(-e.deltaY * 0.0015), r = d.reference;
      store.transient({ ...d, reference: { ...r, scale: r.scale * f, x: p[0] - (p[0] - r.x) * f, y: p[1] - (p[1] - r.y) * f } });
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelTimer = null; store.endTransient(); }, 300);
      return;
    }
    store.set({ viewport: zoomAt(st.viewport, local(e), Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))) });
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || !el.getClientRects().length || isTyping(e) || (e.target as HTMLElement)?.tagName === 'BUTTON') return;
    spaceDown = true; e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
  window.addEventListener('blur', () => { spaceDown = false; });

  let fitted = false;
  const fit = () => { const { w, h } = size(); store.set({ viewport: fitViewport(w, h, { x0: 0, y0: 0, x1: CHAR_SIZE, y1: CHAR_SIZE }) }); };
  new ResizeObserver(() => { if (!el.clientWidth) return; if (!fitted) { fitted = true; fit(); } else render(); }).observe(el);
  buildCharacter();
  bus.subscribe(() => { buildCharacter(); render(); });
  store.subscribe(render);
  return {
    el, render, fit,
    zoomBy(f) { const { w, h } = size(); store.set({ viewport: zoomAt(store.get().viewport, [w / 2, h / 2], f) }); },
    cancel() {
      if (!drag || drag.kind === 'pan') return false;
      drag = null; pointer = null;
      store.abortTransient();
      return true;
    },
  };
}
