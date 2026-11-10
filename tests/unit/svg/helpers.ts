import { createStyleResolver } from '../../../src/svg/style';
import { convertPart } from '../../../src/svg/convert';
import { IDENTITY } from '../../../src/svg/matrix';
import type { Group, ShapeItem } from '../../../src/lottie/types';

export function doc(body: string): Document {
  const text = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024">${body}</svg>`;
  return new DOMParser().parseFromString(text, 'image/svg+xml');
}
export function convert(body: string, groupId = 'p') {
  const d = doc(body);
  const g = d.getElementById(groupId)!;
  return convertPart(g, { doc: d, styles: createStyleResolver(d), sheetMatrix: IDENTITY, viewport: 1024 });
}
export const groups = (items: ShapeItem[]) => items.filter((i): i is Group => i.ty === 'gr');
export const kinds = (g: Group) => g.it.map((i) => i.ty);
