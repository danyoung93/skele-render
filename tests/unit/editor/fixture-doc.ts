import { addShape } from '../../../src/editor/commands';
import { emptyDoc, type EditorDoc } from '../../../src/editor/model';

/** Test document covering every shape kind and style option. */
export function fixtureDoc(): EditorDoc {
  let d = emptyDoc('test-character');
  const add = (part: Parameters<typeof addShape>[1], s: Parameters<typeof addShape>[2]) => { d = addShape(d, part, s).doc; };
  add('head', { kind: 'ellipse', cx: 192, cy: 182, rx: 120, ry: 90, rotation: 20,
    style: { fill: { color: '#f4b9a0', opacity: 1 }, stroke: { color: '#3b3b3d', opacity: 0.8 }, strokeWidth: 6 } });
  add('torso', { kind: 'rect', x: 420, y: 80, w: 240, h: 300, r: 12, rotation: 0,
    style: { fill: { color: '#6b8597', opacity: 0.5 }, stroke: null, strokeWidth: 4 } });
  add('hand_L', { kind: 'rect', x: 300, y: 640, w: 50, h: 40, r: 0, rotation: -45,
    style: { fill: { color: '#ff0000', opacity: 1 }, stroke: null, strokeWidth: 4 } });
  add('mouth_open', { kind: 'path', closed: true, rotation: 0,
    style: { fill: { color: '#4b2626', opacity: 1 }, stroke: null, strokeWidth: 4 },
    nodes: [
      { p: [764, 522], in: [764, 522], out: [764, 522] },
      { p: [820, 522], in: [820, 522], out: [820, 550] },
      { p: [792, 562], in: [808, 562], out: [776, 562] },
    ] });
  add('mouth_closed', { kind: 'path', closed: false, rotation: 0,
    style: { fill: null, stroke: { color: '#4b2626', opacity: 1 }, strokeWidth: 7 },
    nodes: [
      { p: [766, 420], in: [766, 420], out: [780, 432] },
      { p: [818, 420], in: [804, 432], out: [818, 420] },
    ] });
  return d;
}
