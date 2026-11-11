/** Edit sheet mode: toolbar, canvas, panel, keyboard (sheet editor spec §2). */
import type { SheetBus } from '../ui/sheet-bus';
import { emptyDoc } from './model';
import { createPanel } from './panel';
import { createStore, type Store } from './store';
import { createSelectTool } from './tools/select';
import { createShapeTool } from './tools/shape';
import type { Tool, ToolId } from './tools/types';
import { createCanvasView, isTyping, type CanvasView } from './view';

export interface ToolDef { id: ToolId; label: string; key: string; tool: Tool }

export function mountEditor(el: HTMLElement, bus: SheetBus): { show(): void; hide(): void; store: Store; view: CanvasView } {
  const store = createStore(bus, emptyDoc('my-character'));
  const tools: ToolDef[] = [
    { id: 'select', label: 'Select', key: 'v', tool: createSelectTool() },
    { id: 'ellipse', label: 'Ellipse', key: 'e', tool: createShapeTool('ellipse') },
    { id: 'rect', label: 'Rectangle', key: 'r', tool: createShapeTool('rect') },
  ];
  el.innerHTML = `
  <div class="editor">
    <div class="tools" role="toolbar" aria-label="Tools">
      ${tools.map((t) => `<button class="tool" data-tool="${t.id}" aria-pressed="false" title="${t.label} (${t.key.toUpperCase()})">${t.label}</button>`).join('')}
    </div>
    <div class="canvas-wrap">
      <div class="canvas-host" data-id="canvas-host"></div>
      <div class="zoom">
        <button class="btn" data-id="zoom-out" aria-label="Zoom out">−</button>
        <button class="btn" data-id="zoom-fit">Fit</button>
        <button class="btn" data-id="zoom-in" aria-label="Zoom in">+</button>
      </div>
      <div class="banner" data-id="banner" hidden></div>
    </div>
    <aside class="panel editor-panel" data-id="editor-panel"></aside>
  </div>`;
  const view = createCanvasView(el.querySelector('[data-id="canvas-host"]')!, store);
  createPanel(el.querySelector('[data-id="editor-panel"]')!, store, bus, view);

  let current: ToolId | null = null;
  function useTool(id: ToolId) {
    if (current === id) return;
    current = id;
    const def = tools.find((t) => t.id === id)!;
    view.setTool(def.tool);
    store.setTool(id);
    el.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-tool') === id)));
  }
  el.querySelector('.tools')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]');
    if (b) useTool(b.dataset.tool as ToolId);
  });
  el.querySelector('[data-id="zoom-in"]')!.addEventListener('click', () => view.zoomBy(1.25));
  el.querySelector('[data-id="zoom-out"]')!.addEventListener('click', () => view.zoomBy(1 / 1.25));
  el.querySelector('[data-id="zoom-fit"]')!.addEventListener('click', () => view.fit());

  let visible = false;
  window.addEventListener('keydown', (e) => {
    if (!visible || isTyping(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    const tool = tools.find((t) => t.id === current)!.tool;
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else if (!tool.cancel?.(view.ctx)) store.undo();
      return;
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); store.redo(); return; }
    if (mod || e.altKey) return;
    if (tool.key?.(e, view.ctx)) { e.preventDefault(); return; }
    if (e.key === 'Escape') { if (!tool.cancel?.(view.ctx)) store.select([]); return; }
    const def = tools.find((t) => t.key === e.key.toLowerCase());
    if (def) { e.preventDefault(); useTool(def.id); }
  });

  useTool('select');
  return {
    store, view,
    show() { visible = true; el.hidden = false; view.render(); },
    hide() { visible = false; el.hidden = true; },
  };
}
