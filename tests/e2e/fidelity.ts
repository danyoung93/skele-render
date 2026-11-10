/** Test-only page: renders a part as original SVG and as Lottie side by side (spec 10.3). */
import lottie from 'lottie-web/build/player/lottie_light';
import { loadSheet } from '../../src/sheet/load';
import { templateSvg } from '../../src/sheet/template';
import { buildPartPreview } from '../../src/lottie/build';
import { AREAS, type PartId } from '../../src/sheet/layout';
import { findParts } from '../../src/sheet/names';
import { sheetMapping, parseSvg } from '../../src/sheet/load';
import type { LottieDoc } from '../../src/lottie/types';

const out = document.getElementById('out')!;

/** The source sheet cut down to one part group, framed to the part's area in reference units. */
function isolatedSvg(text: string, part: PartId): string {
  const doc = parseSvg(text);
  const root = doc.documentElement;
  const { matrix } = sheetMapping(root);
  const keep = findParts(doc).parts.get(part)!;
  // Remove every rendered element that is not the part group, an ancestor of it, or a descendant of it.
  const keepSet = new Set<Element>();
  for (let e: Element | null = keep; e; e = e.parentElement) keepSet.add(e);
  const prune = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (keepSet.has(c)) { if (c !== keep) prune(c); continue; }
      if (['defs', 'style'].includes(c.localName)) continue;
      c.remove();
    }
  };
  prune(root);
  const a = AREAS[part];
  // matrix = scale(s) · translate(-x0, -y0), so user = ref / s + origin.
  const sc = matrix[0], x0 = -matrix[4] / sc, y0 = -matrix[5] / sc;
  root.setAttribute('viewBox', `${a.x / sc + x0} ${a.y / sc + y0} ${a.w / sc} ${a.h / sc}`);
  root.setAttribute('width', String(a.w));
  root.setAttribute('height', String(a.h));
  return new XMLSerializer().serializeToString(root);
}

declare global {
  interface Window {
    renderPart(text: string, part: PartId): Promise<void>;
    renderDoc(doc: LottieDoc): Promise<void>;
    templateText: string;
  }
}

window.templateText = templateSvg();

window.renderDoc = async (doc: LottieDoc) => {
  out.innerHTML = '<div class="cell" id="lottie"></div>';
  const el = document.getElementById('lottie')!;
  el.style.width = `${doc.w}px`; el.style.height = `${doc.h}px`;
  const anim = lottie.loadAnimation({ container: el, renderer: 'svg', loop: false, autoplay: false, animationData: doc });
  anim.goToAndStop(0, true);
};

window.renderPart = async (text: string, part: PartId) => {
  const sheet = loadSheet(text, 'fixture.svg');
  const shapes = sheet.parts[part];
  if (!shapes) throw new Error(`part ${part} empty`);
  const a = AREAS[part];
  out.innerHTML = `<div class="cell" id="src" style="width:${a.w}px;height:${a.h}px"></div><div class="cell" id="lottie" style="width:${a.w}px;height:${a.h}px"></div>`;
  const img = new Image(a.w, a.h);
  img.src = URL.createObjectURL(new Blob([isolatedSvg(text, part)], { type: 'image/svg+xml' }));
  await img.decode();
  document.getElementById('src')!.appendChild(img);
  const anim = lottie.loadAnimation({
    container: document.getElementById('lottie')!, renderer: 'svg', loop: false, autoplay: false,
    animationData: buildPartPreview(shapes, a),
  });
  anim.goToAndStop(0, true);
};

