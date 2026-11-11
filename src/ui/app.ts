/** App shell: Animate | Edit sheet | Edit rig around one shared character (sheet + rig). */
import { mountEditor } from '../editor/mount';
import { mountRigEditor } from '../rig-editor/mount';
import { parseRig, RigError } from '../rig/rig-file';
import { loadSheet } from '../sheet/load';
import { templateSvg } from '../sheet/template';
import { mountAnimate, TEMPLATE_FILE } from './animate';
import { createSheetBus, type SheetBus } from './sheet-bus';
import './editor.css';

export interface BannerAction { id: string; label: string; run(): void }
export interface AppBanner { show(text: string, kind: 'info' | 'error', actions?: BannerAction[]): void; hide(): void }

function createBanner(el: HTMLElement): AppBanner {
  const hide = () => { el.hidden = true; el.innerHTML = ''; };
  return {
    hide,
    show(text, kind, actions = []) {
      el.hidden = false;
      el.className = `app-banner${kind === 'error' ? ' error' : ''}`;
      el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      el.innerHTML = '';
      const msg = document.createElement('span');
      msg.textContent = text;
      el.appendChild(msg);
      for (const a of actions) {
        const b = document.createElement('button');
        b.className = 'btn'; b.dataset.id = a.id; b.textContent = a.label;
        b.addEventListener('click', (e) => { e.stopPropagation(); hide(); a.run(); });
        el.appendChild(b);
      }
    },
  };
}

/** Loads a dropped or chosen rig file into the bus, or explains why it can't. */
export async function loadRigFile(file: File, bus: SheetBus, banner: AppBanner, origin: 'animate' | 'rig') {
  try {
    const { rig } = parseRig(await file.text());
    bus.setRig(rig, origin);
    banner.hide();
  } catch (e) {
    banner.show(e instanceof RigError ? `${file.name}: ${e.message}. Kept the current rig.` : `Could not read ${file.name}`, 'error');
  }
}

export function startApp(root: HTMLElement) {
  root.innerHTML = `
  <nav class="modebar">
    <h1>Character Rig</h1>
    <div class="seg" role="radiogroup" aria-label="Mode">
      <button role="radio" aria-checked="true" data-mode="animate">Animate</button>
      <button role="radio" aria-checked="false" data-mode="editor">Edit sheet</button>
      <button role="radio" aria-checked="false" data-mode="rig">Edit rig</button>
    </div>
  </nav>
  <div data-id="app-banner" class="app-banner" hidden></div>
  <div data-id="animate-root"></div>
  <div data-id="editor-root" class="editor-root" hidden></div>
  <div data-id="rig-root" class="editor-root" hidden></div>`;
  const bus = createSheetBus(loadSheet(templateSvg(), TEMPLATE_FILE));
  const bannerEl = root.querySelector<HTMLElement>('[data-id="app-banner"]')!;
  const banner = createBanner(bannerEl);
  bannerEl.addEventListener('click', () => banner.hide());
  const animate = mountAnimate(root.querySelector('[data-id="animate-root"]')!, bus);
  const editor = mountEditor(root.querySelector<HTMLElement>('[data-id="editor-root"]')!, bus);
  const rigMode = mountRigEditor(root.querySelector<HTMLElement>('[data-id="rig-root"]')!, bus, editor.store, banner);
  const modes = { animate, editor, rig: rigMode } as const;

  root.querySelector('nav')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
    if (!btn) return;
    root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    const mode = btn.dataset.mode as keyof typeof modes;
    for (const [k, m] of Object.entries(modes)) if (k !== mode) m.hide();
    modes[mode].show();
  });

  // Rig files can be dropped in any mode.
  document.addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f && /\.json$/i.test(f.name)) { e.preventDefault(); void loadRigFile(f, bus, banner, 'animate'); }
  });
}
