import type { Vec2 } from '../model';
import type { Store } from '../store';

export type ToolId = 'select' | 'ellipse' | 'rect' | 'pen' | 'points' | 'eyedropper' | 'reference';

export interface ToolCtx {
  store: Store;
  toSheet(e: { clientX: number; clientY: number }): Vec2;
  shapeIdAt(e: Event): string | null;
  /** The element under the pointer (for handles, which carry data-handle / data-node). */
  target(e: Event): Element | null;
  /** A group the tool owns for previews; cleared when the tool changes. */
  layer: SVGGElement;
  /** Units per screen pixel at the current zoom. */
  px(): number;
}

export interface Tool {
  id: ToolId;
  cursor: string;
  down(e: PointerEvent, ctx: ToolCtx): void;
  move(e: PointerEvent, ctx: ToolCtx): void;
  up(e: PointerEvent, ctx: ToolCtx): void;
  /** Returns true when the key was handled. */
  key?(e: KeyboardEvent, ctx: ToolCtx): boolean;
  /** Abandon any in-progress action (tool change, Escape, undo). Returns true if something was cancelled. */
  cancel?(ctx: ToolCtx): boolean;
  /** Redraw the tool's own preview layer after store changes. */
  draw?(ctx: ToolCtx): void;
}
