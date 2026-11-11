export function download(name: string, text: string | Blob, type: string) {
  const url = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Warnings list grouped by part, shared by Animate and the editor. */
export function warningsHtml(warnings: { part?: string; message: string }[]): string {
  if (!warnings.length) return '<p class="ok">No warnings. All parts loaded.</p>';
  const general = warnings.filter((w) => !w.part);
  const byPart = new Map<string, string[]>();
  for (const w of warnings) if (w.part) byPart.set(w.part, [...(byPart.get(w.part) ?? []), w.message]);
  return `<h2>Warnings (${warnings.length})</h2>
    ${general.length ? `<ul>${general.map((w) => `<li>${esc(w.message)}</li>`).join('')}</ul>` : ''}
    ${[...byPart].map(([part, ms]) => `<details open><summary>${esc(part)}</summary><ul>${ms.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></details>`).join('')}`;
}
