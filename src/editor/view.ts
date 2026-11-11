/** Canvas: renders the document, routes pointer input to tools, pans and zooms (sheet editor spec §5). */
import { AREAS, PART_IDS } from '../sheet/layout';
import { guidesLayer } from '../sheet/template';
import type { Vec2 } from './model';
import { selectionFrame } from './selection';
import { shapeSvg } from './serialize';
import type { Store } from './store';
import type { Tool, ToolCtx } from './tools/types';
import { fitViewport, zoomAt, type Viewport } from './viewport';

const SVGNS = 'http://www.w3.org/2000/svg';
const n = (v: number) => String(Math.round(v * 1000) / 1000);

export interface CanvasView {
  el: SVGSVGElement;
  ctx: ToolCtx;
  render(): void;
  fit(box?: { x0: number; y0: number; x1: number; y1: number }): void;
  zoomBy(factor: number): void;
  /** Called by the tool host when the tool changes. */
  setTool(tool: Tool): void;
}

export function createCanvasView(host: HTMLElement, store: Store): CanvasView {
  host.innerHTML = `<svg data-id="canvas" class="canvas" xmlns="${SVGNS}" preserveAspectRatio="xMinYMin meet" tabindex="0">
    <image data-id="reference" preserveAspectRatio="none" pointer-events="none"/>
    <g data-id="shapes"></g>
    <g data-id="guides" pointer-events="none">${guidesLayer()}</g>
    <g data-id="overlay"><g data-id="active-box" pointer-events="none"></g><g data-id="selection"></g><g data-id="tool-layer"></g></g>
  </svg>`;
  const el = host.querySelector<SVGSVGElement>('svg')!;
  const q = <T extends Element>(id: string) => el.querySelector<T>(`[data-id="${id}"]`)!;
  const shapesG = q<SVGGElement>('shapes'), selG = q<SVGGElement>('selection'), activeG = q<SVGGElement>('active-box');
  const toolLayer = q<SVGGElement>('tool-layer'), refImg = q<SVGImageElement>('reference');
  let tool: Tool | null = null;
  let fitted = false;

  const size = () => ({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
  const ctx: ToolCtx = {
    store,
    toSheet(e) {
      const m = el.getScreenCTM();
      if (!m) return [0, 0];
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      return [p.x, p.y];
    },
    target: (e) => (e.target instanceof Element ? e.target : null),
    shapeIdAt: (e) => (e.target instanceof Element ? e.target.closest('[data-shape-id]')?.getAttribute('data-shape-id') ?? null : null),
    layer: toolLayer,
    px: () => 1 / store.get().viewport.zoom,
  };

  function setViewBox(v: Viewport) {
    const { w, h } = size();
    el.setAttribute('viewBox', `${n(v.x)} ${n(v.y)} ${n(w / v.zoom)} ${n(h / v.zoom)}`);
  }

  function render() {
    const st = store.get(), doc = store.doc(), px = 1 / st.viewport.zoom;
    setViewBox(st.viewport);
    // Reference
    const ref = st.reference, r = doc.reference;
    if (ref && r.hasImage) {
      refImg.setAttribute('href', ref.url);
      refImg.setAttribute('x', n(r.x)); refImg.setAttribute('y', n(r.y));
      refImg.setAttribute('width', n(ref.w * r.scale)); refImg.setAttribute('height', n(ref.h * r.scale));
      refImg.setAttribute('opacity', n(r.opacity));
      refImg.style.display = '';
    } else refImg.style.display = 'none';
    // Shapes
    shapesG.innerHTML = PART_IDS.filter((p) => !st.hidden.has(p))
      .map((p) => doc.parts[p].map((s) => shapeSvg(s, ` data-shape-id="${s.id}" data-part="${p}"`)).join('')).join('');
    // Active part box
    const a = AREAS[st.active];
    activeG.innerHTML = `<rect class="active-box" x="${a.x - 4}" y="${a.y - 4}" width="${a.w + 8}" height="${a.h + 8}" stroke-width="${n(2 * px)}"/>`;
    // Selection frame
    const frame = selectionFrame(doc, st.selection.filter((id) => {
      const part = PART_IDS.find((p) => doc.parts[p].some((s) => s.id === id));
      return part && !st.hidden.has(part);
    }));
    if (!frame || st.tool !== 'select') selG.innerHTML = '';
    else {
      const hs = 8 * px, sw = 1.5 * px;
      const poly = frame.corners.map((c) => `${n(c[0])},${n(c[1])}`).join(' ');
      const rot = frame.rotateAt(px);
      const topMid: Vec2 = [(frame.corners[0][0] + frame.corners[1][0]) / 2, (frame.corners[0][1] + frame.corners[1][1]) / 2];
      selG.innerHTML = `<polygon class="sel-box" points="${poly}" stroke-width="${n(sw)}" pointer-events="none"/>
        <line class="sel-box" x1="${n(topMid[0])}" y1="${n(topMid[1])}" x2="${n(rot[0])}" y2="${n(rot[1])}" stroke-width="${n(sw)}" pointer-events="none"/>
        ${frame.handles.map((h) => `<rect class="handle" data-handle="${h.id}" x="${n(h.at[0] - hs / 2)}" y="${n(h.at[1] - hs / 2)}" width="${n(hs)}" height="${n(hs)}" stroke-width="${n(sw)}"/>`).join('')}
        <circle class="handle rotate" data-handle="rotate" cx="${n(rot[0])}" cy="${n(rot[1])}" r="${n(hs * 0.6)}" stroke-width="${n(sw)}"/>`;
    }
    tool?.draw?.(ctx);
    el.style.cursor = tool?.cursor ?? 'default';
  }

  function fit(box?: { x0: number; y0: number; x1: number; y1: number }) {
    const { w, h } = size();
    store.setViewport(fitViewport(w, h, box));
  }

  // ---- Input routing: pan (space/middle/two fingers), wheel zoom, then the active tool ----
  let spaceDown = false;
  let pan: { start: Vec2; v: Viewport; pointer: number } | null = null;
  const touches = new Map<number, Vec2>();
  let pinch: { dist: number; mid: Vec2; v: Viewport } | null = null;
  let toolPointer: number | null = null;
  let lastDown: { t: number; x: number; y: number } | null = null;
  const local = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  // Without this, a text selection elsewhere on the page turns a canvas drag into a native
  // drag-and-drop, which cancels the pointer stream mid-gesture.
  el.addEventListener('dragstart', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    el.focus({ preventScroll: true });
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, local(e));
      if (touches.size === 2) {
        if (toolPointer !== null) { tool?.cancel?.(ctx); toolPointer = null; }
        const [a, b] = [...touches.values()];
        pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v: store.get().viewport };
        return;
      }
    }
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      pan = { start: local(e), v: store.get().viewport, pointer: e.pointerId };
      el.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0 || !tool) return;
    toolPointer = e.pointerId;
    el.setPointerCapture(e.pointerId);
    // Native dblclick is unreliable here: re-rendering replaces the pressed element, so the
    // browser drops click/dblclick. Detect double presses ourselves.
    const now = performance.now();
    const isDouble = lastDown && now - lastDown.t < 400 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 5;
    lastDown = isDouble ? null : { t: now, x: e.clientX, y: e.clientY };
    tool.down(e, ctx);
    if (isDouble) tool.dblclick?.(e, ctx);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, local(e));
      if (pinch && touches.size === 2) {
        const [a, b] = [...touches.values()];
        const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const v = zoomAt(pinch.v, pinch.mid, Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.dist);
        store.setViewport({ ...v, x: v.x - (mid[0] - pinch.mid[0]) / v.zoom, y: v.y - (mid[1] - pinch.mid[1]) / v.zoom });
        return;
      }
    }
    if (pan && e.pointerId === pan.pointer) {
      const p = local(e);
      store.setViewport({ ...pan.v, x: pan.v.x - (p[0] - pan.start[0]) / pan.v.zoom, y: pan.v.y - (p[1] - pan.start[1]) / pan.v.zoom });
      return;
    }
    if (tool && (toolPointer === null || toolPointer === e.pointerId)) tool.move(e, ctx);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerType === 'touch') { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; }
    if (pan && e.pointerId === pan.pointer) { pan = null; return; }
    if (toolPointer === e.pointerId) { toolPointer = null; tool?.up(e, ctx); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); pinch = null; pan = null; if (toolPointer === e.pointerId) { toolPointer = null; tool?.cancel?.(ctx); } });
  el.addEventListener('auxclick', (e) => e.preventDefault());
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!e.ctrlKey && tool?.wheel?.(e, ctx)) return;
    store.setViewport(zoomAt(store.get().viewport, local(e), Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
  }, { passive: false });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTyping(e)) { spaceDown = true; if (!isTyping(e)) e.preventDefault(); } });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
  new ResizeObserver(() => {
    if (!el.clientWidth) return;
    if (!fitted) { fitted = true; fit(); } else render();
  }).observe(el);

  store.subscribe(render);
  return {
    el, ctx, render, fit,
    zoomBy(f) { const { w, h } = size(); store.setViewport(zoomAt(store.get().viewport, [w / 2, h / 2], f)); },
    setTool(t) { if (tool && tool !== t) { tool.cancel?.(ctx); toolLayer.innerHTML = ''; } tool = t; render(); },
  };
}

const TEXT_INPUTS = new Set(['text', 'number', 'search', 'email', 'url', 'password', 'tel']);

/** True when keys should go to a form field instead of editor shortcuts. */
export function isTyping(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t instanceof HTMLInputElement) return TEXT_INPUTS.has(t.type);
  return t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}
