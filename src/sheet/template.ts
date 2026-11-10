/** Generated template sheet (spec 3.3). Pure: returns SVG text. */
import { AREAS, LEGEND_Y, PART_IDS, REF_SIZE, type PartId } from './layout';

const SKIN = '#f2c29b', SKIN_DARK = '#d99c74', SHIRT = '#4a7bd0', SHIRT_DARK = '#3a63ad';
const INK = '#3b2a20', HAIR = '#5a3a26', MOUTH = '#6b1f2a', TONGUE = '#e0707a';

/** Placeholder art for each part, in area-local coordinates (0..w, 0..h). */
const ART: Record<PartId, string> = {
  head: `
    <circle cx="28" cy="160" r="22" fill="${SKIN_DARK}"/>
    <circle cx="292" cy="160" r="22" fill="${SKIN_DARK}"/>
    <circle cx="160" cy="150" r="140" fill="url(#cr-skin)"/>
    <path d="M24 140 C24 40 90 8 160 8 C230 8 296 40 296 140 C270 70 220 36 160 38 C100 36 50 70 24 140 Z" fill="${HAIR}"/>
    <ellipse cx="80" cy="200" rx="22" ry="12" fill="#f29b9b" opacity="0.6"/>
    <ellipse cx="240" cy="200" rx="22" ry="12" fill="#f29b9b" opacity="0.6"/>`,
  torso: `
    <rect x="128" y="0" width="64" height="80" rx="16" fill="${SKIN_DARK}"/>
    <path d="M24 64 C60 44 110 40 160 40 C210 40 260 44 296 64 C312 74 316 96 314 120 L300 416 L20 416 L6 120 C4 96 8 74 24 64 Z" fill="${SHIRT}"/>
    <path d="M124 42 L160 92 L196 42" fill="none" stroke="${SHIRT_DARK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="20" y="380" width="280" height="36" fill="${SHIRT_DARK}"/>`,
  eyes_open: `
    <ellipse cx="68" cy="48" rx="28" ry="34" fill="#fff" stroke="${INK}" stroke-width="4"/>
    <ellipse cx="188" cy="48" rx="28" ry="34" fill="#fff" stroke="${INK}" stroke-width="4"/>
    <circle cx="72" cy="52" r="13" fill="${INK}"/>
    <circle cx="192" cy="52" r="13" fill="${INK}"/>
    <circle cx="77" cy="46" r="4" fill="#fff"/>
    <circle cx="197" cy="46" r="4" fill="#fff"/>`,
  eyes_closed: `
    <path d="M42 50 Q68 70 94 50" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M162 50 Q188 70 214 50" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`,
  brows: `
    <rect x="36" y="24" width="64" height="14" rx="7" fill="${HAIR}" transform="rotate(-6 68 31)"/>
    <rect x="156" y="24" width="64" height="14" rx="7" fill="${HAIR}" transform="rotate(6 188 31)"/>`,
  mouth_closed: `
    <path d="M28 38 Q56 50 84 38" fill="none" stroke="${MOUTH}" stroke-width="7" stroke-linecap="round"/>`,
  mouth_half: `
    <ellipse cx="56" cy="40" rx="22" ry="11" fill="${MOUTH}"/>`,
  mouth_open: `
    <ellipse cx="56" cy="40" rx="26" ry="24" fill="${MOUTH}"/>
    <ellipse cx="56" cy="54" rx="15" ry="8" fill="${TONGUE}"/>`,
  mouth_wide: `
    <path d="M14 22 L98 22 C98 52 80 70 56 70 C32 70 14 52 14 22 Z" fill="${MOUTH}"/>
    <rect x="22" y="22" width="68" height="12" rx="3" fill="#fff"/>
    <ellipse cx="56" cy="60" rx="18" ry="7" fill="${TONGUE}"/>`,
  upper_arm_L: `<rect x="16" y="0" width="64" height="192" rx="32" fill="${SHIRT}"/>`,
  forearm_L: `<rect x="12" y="0" width="56" height="176" rx="28" fill="${SKIN}"/>`,
  hand_L: `
    <ellipse cx="30" cy="48" rx="14" ry="22" fill="${SKIN_DARK}" transform="rotate(25 30 48)"/>
    <circle cx="56" cy="60" r="40" fill="${SKIN}"/>`,
  upper_arm_R: `<rect x="16" y="0" width="64" height="192" rx="32" fill="${SHIRT}"/>`,
  forearm_R: `<rect x="12" y="0" width="56" height="176" rx="28" fill="${SKIN}"/>`,
  hand_R: `
    <ellipse cx="82" cy="48" rx="14" ry="22" fill="${SKIN_DARK}" transform="rotate(-25 82 48)"/>
    <circle cx="56" cy="60" r="40" fill="${SKIN}"/>`,
};

function guides(): string {
  const out: string[] = [];
  for (const id of PART_IDS) {
    const a = AREAS[id], [px, py] = a.pivot;
    out.push(`<rect x="${a.x - 4}" y="${a.y - 4}" width="${a.w + 8}" height="${a.h + 8}" fill="none" stroke="#8a94a6" stroke-width="1.5" stroke-dasharray="6 4"/>`);
    out.push(`<text x="${a.x}" y="${a.y - 10}" font-family="sans-serif" font-size="13" fill="#56607a">${id}</text>`);
    const X = a.x + px, Y = a.y + py, T = 7;
    out.push(`<path d="M${X - T / 2} ${a.y - 4 - T} L${X + T / 2} ${a.y - 4 - T} L${X} ${a.y - 5} Z" fill="#e0457b"/>`);
    out.push(`<path d="M${X - T / 2} ${a.y + a.h + 4 + T} L${X + T / 2} ${a.y + a.h + 4 + T} L${X} ${a.y + a.h + 5} Z" fill="#e0457b"/>`);
    out.push(`<path d="M${a.x - 4 - T} ${Y - T / 2} L${a.x - 4 - T} ${Y + T / 2} L${a.x - 5} ${Y} Z" fill="#e0457b"/>`);
    out.push(`<path d="M${a.x + a.w + 4 + T} ${Y - T / 2} L${a.x + a.w + 4 + T} ${Y + T / 2} L${a.x + a.w + 5} ${Y} Z" fill="#e0457b"/>`);
  }
  const lines = [
    'Character Rig template: draw each part inside its box, in the layer with the same name.',
    'Pink ticks mark pivots (the point each part rotates around). The guides layer is ignored.',
    'L/R = side of the screen. Use paths, shapes, fills, strokes and gradients; convert text to outlines.',
  ];
  lines.forEach((t, i) => out.push(
    `<text x="32" y="${LEGEND_Y + 40 + i * 26}" font-family="sans-serif" font-size="16" fill="#56607a">${t}</text>`));
  return out.join('\n    ');
}

export function templateSvg(): string {
  const layers = PART_IDS.map((id) => {
    const a = AREAS[id];
    return `  <g id="${id}" inkscape:groupmode="layer" inkscape:label="${id}">
    <g transform="translate(${a.x} ${a.y})">${ART[id]}
    </g>
  </g>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 ${REF_SIZE} ${REF_SIZE}" width="${REF_SIZE}" height="${REF_SIZE}">
  <defs>
    <radialGradient id="cr-skin" cx="0.42" cy="0.38" r="0.7">
      <stop offset="0" stop-color="#f8d4b4"/>
      <stop offset="1" stop-color="${SKIN}"/>
    </radialGradient>
  </defs>
${layers}
  <g id="guides" inkscape:groupmode="layer" inkscape:label="guides">
    ${guides()}
  </g>
</svg>
`;
}
