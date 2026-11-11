/** App shell: Animate | Edit sheet mode switch around one shared sheet. */
import { loadSheet } from '../sheet/load';
import { templateSvg } from '../sheet/template';
import { mountEditor } from '../editor/mount';
import { mountAnimate, TEMPLATE_FILE } from './animate';
import './editor.css';
import { createSheetBus } from './sheet-bus';

export function startApp(root: HTMLElement) {
  root.innerHTML = `
  <nav class="modebar">
    <h1>Character Rig</h1>
    <div class="seg" role="radiogroup" aria-label="Mode">
      <button role="radio" aria-checked="true" data-mode="animate">Animate</button>
      <button role="radio" aria-checked="false" data-mode="editor">Edit sheet</button>
    </div>
  </nav>
  <div data-id="animate-root"></div>
  <div data-id="editor-root" class="editor-root" hidden></div>`;
  const bus = createSheetBus(loadSheet(templateSvg(), TEMPLATE_FILE));
  const animate = mountAnimate(root.querySelector('[data-id="animate-root"]')!, bus);
  const editorRoot = root.querySelector<HTMLElement>('[data-id="editor-root"]')!;
  const editor = mountEditor(editorRoot, bus);

  root.querySelector('nav')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
    if (!btn) return;
    root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    if (btn.dataset.mode === 'editor') { animate.hide(); editor.show(); } else { editor.hide(); animate.show(); }
  });
}
