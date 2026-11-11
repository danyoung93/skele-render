/** Click → traced outline (trace tool spec §3.4). */
import type { PathNode } from '../editor/model';
import { outerContour } from './contour';
import { fitClosed } from './fit';
import { growRegion, type Img, type Limit, type LimitEdges } from './region';

export const MIN_AREA = 16;
/** Outline level on the coverage field: slightly outside the true edge (~0.2 px) so neighbours overlap. */
export const OUTLINE_LEVEL = 0.35;
export const DEFAULT_TOLERANCE = 12;
export const DEFAULT_SMOOTHNESS = 0.6;
export type TraceResult =
  | { nodes: PathNode[]; colour: [number, number, number]; area: number; hitLimit: boolean }
  | { error: 'outside' | 'too-small' };

export function traceAt(img: Img, seed: [number, number], opts: { tolerance: number; smoothness: number; limit: Limit; edgesAreLimits?: LimitEdges }): TraceResult {
  const [x, y] = seed;
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return { error: 'outside' };
  const r = growRegion(img, seed, opts.tolerance, opts.limit, opts.edgesAreLimits);
  if (r.core < MIN_AREA) return { error: 'too-small' };
  const outline = outerContour(r.field, img.width, img.height, OUTLINE_LEVEL);
  if (outline.length < 3) return { error: 'too-small' };
  return { nodes: fitClosed(outline, opts.smoothness), colour: r.colour, area: r.count, hitLimit: r.hitLimit };
}
