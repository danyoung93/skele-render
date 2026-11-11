# Character Rig

Animate a talking-head character from an SVG sprite sheet and export it as a
vector-only Lottie file, for "who's speaking" indicators in an app.

## Run it

```bash
npm install
npm run dev        # open http://localhost:5173
```

1. **Download template** to get `character-rig-template.svg`. It has one named
   layer per body part, placeholder art, and guides showing each part's box
   and pivot.
2. Draw over each part in Figma, Illustrator, Inkscape or Affinity. Keep the
   layer names and keep each part inside its box.
3. **Load sprite sheet** (or drag the SVG onto the page). The side panel lists
   anything the converter had to skip.
4. Choose **Idle**, **Talking** or **Listening**, then **Export Lottie** to
   download `<sheet>-<animation>.json`.

## Draw a sheet in the browser (Edit sheet)

1. Switch to **Edit sheet**. Choose **Load image** under *Reference image* to bring in your character design.
2. Tick **Move reference**: drag to move the design, and scroll to scale it, so the part you want sits in its box. **Lock** it when it's in place.
3. Trace with **Ellipse (E)**, **Rectangle (R)** and **Pen (P)**. A shape goes into the part whose box you start drawing in.
   - **Eyedropper (I)** picks a fill colour from the design; Shift-click picks a stroke colour.
   - **Select (V)** moves, resizes and rotates shapes. Hold Shift to snap rotation to 15°, or to keep proportions
     on any resize handle. The panel's **W** and **H** fields set an exact size, and **Keep proportions** makes
     both the fields and the handles scale evenly.
   - **Duplicate** (Ctrl/Cmd+D, or the panel button) copies the selection 10 units down and right.
   - **Flip horizontally / vertically** mirror the selection (a group flips around its own centre).
   - Drag on empty canvas with **Select** to select every shape the box touches (Shift+drag adds to the selection).
   - **Edit points (A)** drags points and curve handles; double-click an edge to add a point; Delete removes one.
4. The **Live preview** animates as you draw, and **Animate** shows the same sheet. **Download SVG** saves it.

Your work is saved in the browser automatically, so a reload doesn't lose anything. **Edit current sheet** turns
the sheet shown in Animate (for example one from Figma) into editable shapes. Gradients become solid colours.

Shortcuts: Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z or Ctrl+Y redo, Escape deselect, arrow keys nudge (Shift ×10),
space+drag or middle-drag to pan, scroll to zoom.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Browser tests and the SVG vs Lottie visual-match test (Playwright) |
| `npm run build` | Type-check and build static files into `dist/` |

## Supported SVG

Paths, basic shapes, solid and gradient fills and strokes, dashes, opacity,
transforms, `<use>`/`<symbol>` and `<style>` classes. Clip paths, masks,
filters, patterns, images and text are skipped with a warning. Convert text to
outlines first.

Design: `docs/superpowers/specs/2026-11-10-character-rig-design.md`
