/** Animate screen (rig spec §8): preview, animation picker, export. */
import lottie, { type AnimationItem } from 'lottie-web/build/player/lottie_light';
import { ANIMATIONS } from '../anim';
import type { Animation } from '../anim/types';
import { buildLottie } from '../lottie/build';
import { AREAS, PART_IDS, REF_SIZE } from '../sheet/layout';
import { loadSheet, SheetError, type LoadedSheet } from '../sheet/load';
import { templateSvg } from '../sheet/template';
import type { SheetBus } from './sheet-bus';
import { download, warningsHtml } from './util';

export const TEMPLATE_FILE = 'character-rig-template.svg';

export function mountAnimate(root: HTMLElement, bus: SheetBus): { show(): void; hide(): void } {
  root.innerHTML = `
  <header class="toolbar">
    <label class="btn" title="Load an SVG sprite sheet (or drop one anywhere)">
      Load sprite sheet <input type="file" accept=".svg,image/svg+xml" data-id="file" hidden />
    </label>
    <button class="btn" data-id="template">Download template</button>
    <div class="seg" role="radiogroup" aria-label="Animation" data-id="anims">
      ${ANIMATIONS.map((a, i) => `<button role="radio" aria-checked="${i === 0}" data-anim="${a.id}">${a.label}</button>`).join('')}
    </div>
    <button class="btn" data-id="play" aria-label="Pause">❚❚</button>
    <input type="range" min="0" value="0" step="1" data-id="scrub" aria-label="Frame" />
    <span class="frame" data-id="frame">0 / 0</span>
    <label class="toggle"><input type="checkbox" data-id="bones" /> Show bones</label>
    <button class="btn primary" data-id="export">Export Lottie</button>
  </header>
  <main class="layout">
    <section class="stage-wrap"><div class="stage" data-id="stage"></div></section>
    <aside class="panel">
      <div class="thumb">
        <img data-id="thumb" alt="Current sprite sheet" />
        <svg viewBox="0 0 ${REF_SIZE} ${REF_SIZE}" class="overlay" aria-hidden="true">
          ${PART_IDS.map((id) => { const a = AREAS[id]; return `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}"><title>${id}</title></rect>`; }).join('')}
        </svg>
      </div>
      <p class="sheet-name"><span data-id="name"></span> · <span data-id="rig-name"></span></p>
      <div data-id="error" class="error" role="alert" hidden></div>
      <div data-id="warnings" class="warnings"></div>
    </aside>
  </main>
  <div class="drop-hint" data-id="drop" hidden>Drop SVG sprite sheet</div>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-id="${id}"]`)!;
  const stage = $('stage'), scrub = $<HTMLInputElement>('scrub'), frameLabel = $('frame');
  const playBtn = $<HTMLButtonElement>('play'), errorBox = $('error');

  let sheet: LoadedSheet = bus.get();
  let visible = true;
  let anim: Animation = ANIMATIONS[0];
  let debug = false, playing = true;
  let player: AnimationItem | null = null;
  let thumbUrl: string | null = null;

  function showError(msg: string | null) {
    errorBox.hidden = !msg;
    errorBox.textContent = msg ?? '';
  }

  function render(keepFrame: boolean) {
    const frame = keepFrame && player ? Math.round(player.currentFrame) : 0;
    player?.destroy();
    stage.innerHTML = '';
    try {
      player = lottie.loadAnimation({
        container: stage, renderer: 'svg', loop: true, autoplay: false,
        animationData: buildLottie(sheet, anim, { debug, rig: bus.getRig() }),
      });
      player.addEventListener('enterFrame', () => updateFrame());
      scrub.max = String(anim.frames - 1);
      if (playing) player.goToAndPlay(frame, true); else player.goToAndStop(frame, true);
      updateFrame();
    } catch (e) {
      player = null;
      showError(`Preview failed: ${(e as Error).message}`);
    }
  }

  function updateFrame() {
    if (!player) return;
    const f = Math.floor(player.currentFrame);
    scrub.value = String(f);
    frameLabel.textContent = `${f} / ${anim.frames}`;
  }

  function renderPanel() {
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    thumbUrl = URL.createObjectURL(new Blob([sheet.svgText], { type: 'image/svg+xml' }));
    $<HTMLImageElement>('thumb').src = thumbUrl;
    $('name').textContent = `Sheet: ${sheet.name}`;
    $('rig-name').textContent = `Rig: ${bus.getRig().name}`;
    $('warnings').innerHTML = warningsHtml(sheet.warnings);
  }

  async function loadFile(file: File) {
    let text: string;
    try { text = await file.text(); } catch { showError(`Could not read ${file.name}`); return; }
    let next: LoadedSheet;
    try {
      next = loadSheet(text, file.name);
    } catch (e) {
      showError(e instanceof SheetError ? `${file.name}: ${e.message}. Kept the previous sheet.` : `Failed to load ${file.name}: ${(e as Error).message}`);
      return;
    }
    showError(null);
    bus.set(next, 'animate');
  }

  bus.subscribeRig(() => { renderPanel(); render(true); });
  bus.subscribe((s) => {
    sheet = s;
    renderPanel();
    render(true);
  });

  $<HTMLInputElement>('file').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) void loadFile(f);
    input.value = '';
  });
  const drop = $('drop');
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; drop.hidden = !visible; });
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; drop.hidden = true; } });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; drop.hidden = true;
    if (!visible) return;
    const f = e.dataTransfer?.files?.[0];
    // Rig files (.json) are handled by the app shell in every mode.
    if (f && !/\.json$/i.test(f.name)) void loadFile(f);
  });

  $('template').addEventListener('click', () => download(TEMPLATE_FILE, templateSvg(), 'image/svg+xml'));
  $('export').addEventListener('click', () => {
    const doc = buildLottie(sheet, anim, { debug: false, rig: bus.getRig() });
    download(`${sheet.name}-${anim.id}.json`, JSON.stringify(doc), 'application/json');
  });
  $('anims').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-anim]');
    if (!btn) return;
    anim = ANIMATIONS.find((a) => a.id === btn.dataset.anim)!;
    root.querySelectorAll('[data-anim]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    render(false);
  });
  playBtn.addEventListener('click', () => {
    playing = !playing;
    if (playing) player?.play(); else player?.pause();
    playBtn.textContent = playing ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  });
  scrub.addEventListener('input', () => {
    if (playing) playBtn.click();
    player?.goToAndStop(Number(scrub.value), true);
    updateFrame();
  });
  $<HTMLInputElement>('bones').addEventListener('change', (e) => {
    debug = (e.target as HTMLInputElement).checked;
    render(true);
  });

  renderPanel();
  render(false);
  return {
    show() { visible = true; root.hidden = false; },
    hide() { visible = false; root.hidden = true; },
  };
}
