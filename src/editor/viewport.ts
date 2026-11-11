/** View transform: (x, y) is the sheet point at the canvas's top-left; zoom is CSS px per unit. */
import type { Box, Vec2 } from './model';
import { REF_SIZE } from '../sheet/layout';

export interface Viewport { x: number; y: number; zoom: number }
export const MIN_ZOOM = 0.25, MAX_ZOOM = 8;
const PAD = 24;

export const screenToSheet = (v: Viewport, p: Vec2): Vec2 => [v.x + p[0] / v.zoom, v.y + p[1] / v.zoom];
export const sheetToScreen = (v: Viewport, p: Vec2): Vec2 => [(p[0] - v.x) * v.zoom, (p[1] - v.y) * v.zoom];
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function zoomAt(v: Viewport, screenP: Vec2, factor: number): Viewport {
  const zoom = clampZoom(v.zoom * factor);
  const s = screenToSheet(v, screenP);
  return { zoom, x: s[0] - screenP[0] / zoom, y: s[1] - screenP[1] / zoom };
}

export function fitViewport(w: number, h: number, box: Box = { x0: 0, y0: 0, x1: REF_SIZE, y1: REF_SIZE }): Viewport {
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const zoom = clampZoom(Math.min((w - 2 * PAD) / bw, (h - 2 * PAD) / bh));
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  return { zoom, x: cx - w / 2 / zoom, y: cy - h / 2 / zoom };
}
