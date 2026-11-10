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
