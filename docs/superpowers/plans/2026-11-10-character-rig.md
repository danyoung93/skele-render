# Character Rig Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser tool that loads an SVG sprite sheet, rigs it to a built-in
bone skeleton, previews Idle, Talking and Listening with lottie-web, and
exports vector-only Lottie JSON.

**Architecture:** The pipeline is SVG text → `loadSheet` (parse, find part
layers, convert to Lottie shape items) → `buildLottie(sheet, anim, {debug})` →
lottie-web preview or JSON download. Everything except the UI is pure
TypeScript, unit-tested in Node with jsdom.

**Tech Stack:** Vite, TypeScript (strict), lottie-web, Vitest + jsdom,
@playwright/test 1.63.0 (to match the preinstalled Chromium), pixelmatch +
pngjs.

**Spec:** `docs/superpowers/specs/2026-11-10-character-rig-design.md`

## Global Constraints

- Composition 512×512 at 30 fps, `v: "5.7.0"`, `assets: []`.
- Reference sheet space 1024×1024; part scale 50%.
- Layer and item types are limited to null and shape layers, and `gr`, `sh`,
  `fl`, `st`, `gf`, `gs` and `tr` items (spec section 7.4).
- Area, pivot, bone and animation values are copied from spec sections 3.2,
  4 and 5.2.
- L/R = side of screen.
- Loaded SVG is never inserted into the live page DOM.

## Review Focus

1. A sheet exported at a different scale (viewBox 0 0 2048 2048, or a
   non-zero origin): the parts must land in the same places. Test:
   `load.test.ts` "scaled viewBox".
2. A part drawn with `<use>` that points to a `<symbol>` in `<defs>`
   (Illustrator and Figma symbols): it must render. Test: `convert.test.ts`
   "use symbol".
3. A sheet with only some parts (an artist who has drawn only the head): it
   must still animate, without crashing. Test: `build.test.ts` "partial
   sheet".
4. The same file loaded twice, or a bad file loaded after a good one: the
   previous sheet must stay. Test: e2e "keeps previous sheet on error".
5. Arc flags and relative commands in Inkscape-style paths: the shape must
   stay correct. Test: `geometry.test.ts` arc sampling.

---

### Task 1: Scaffold, layout and rig data

**Files:** `package.json`, `tsconfig.json`, `vite.config.ts`,
`vitest.config.ts`, `index.html`, `src/sheet/layout.ts`, `src/rig/rig.ts`,
`tests/unit/layout.test.ts`, `tests/unit/rig.test.ts`

**Produces:**
- `PART_IDS: readonly PartId[]`
- `AREAS: Record<PartId, {x,y,w,h,pivot:[number,number]}>`
- `REF_SIZE = 1024`, `PART_SCALE = 50`
- `BONES: {id: BoneId; parent: BoneId|null; offset: Vec2; rotation: number}[]`
- `ATTACH: Record<PartId, {bone: BoneId; offset: Vec2}>`
- `DRAW_ORDER: PartId[]` (back to front)
- `SWAP_GROUPS: {eyes: PartId[]; mouth: PartId[]}`
- `SWAP_DEFAULT`

- [ ] Tests:
  - every area is inside 1024
  - no two areas overlap, and gaps are ≥ 32
  - every pivot is inside its area
  - every bone parent exists, with no loops
  - every attachment bone exists
  - draw order is a permutation of `PART_IDS`
- [ ] Implement the data from the spec tables. Run `npx vitest run` → PASS.
  Commit.

### Task 2: SVG converter

**Files:** `src/svg/colors.ts`, `src/svg/style.ts`, `src/svg/geometry.ts`,
`src/svg/paint.ts`, `src/svg/convert.ts`, `src/lottie/types.ts`,
`tests/unit/svg/*.test.ts`

**Produces:**
- `parseColor(s): {r,g,b,a}|null`. Components are 0..1; `currentColor` is
  resolved by the caller.
- `type Mat = [a,b,c,d,e,f]`, `parseTransform(s): Mat`, `mul(m1,m2)`
- `parsePathData(d): Subpath[]`, where
  `Subpath = {v:Vec2[]; i:Vec2[]; o:Vec2[]; c:boolean}`. Tangents are
  relative to their vertex, as in Lottie.
- `elementToSubpaths(el): Subpath[] | null`
- `transformSubpath(sp, m)`
- `createStyleResolver(doc): (el, parentStyle) => ComputedStyle`
- `convertPart(group, ctx): {shapes: ShapeItem[]; warnings: string[]}`
- `ConvertContext = {doc: Document; matrix: Mat; inheritedStyle: ComputedStyle; resolve: StyleResolver}`

Tests:
- [ ] **Colours:** hex 3/4/6/8 digits, `rgb()` with numbers and %, named
  colours, `none`, `transparent`.
- [ ] **Transforms:** each function, and nested ones.
- [ ] **Paths:** absolute and relative commands. Arcs: points sampled from
  the converted curves lie within 0.5 units of the true ellipse, for all four
  flag combinations.
- [ ] **Shapes:** rect, rounded rect, circle, ellipse, line, polyline and
  polygon give the expected vertices.
- [ ] **Styles:** inline > `<style>` > attribute > inherited; specificity;
  unsupported selectors warn.
- [ ] **Convert:**
  - fill and stroke emitted with the stroke before the fill
  - reverse document order
  - group opacity multiplied in
  - linear and radial gradients give Lottie `g.k` arrays (colour stops, then
    opacity stops)
  - `use` and `symbol` expand; cycles stop at depth 10
  - `display:none` is skipped
  - unsupported elements and properties warn
- [ ] Implement, run, commit.

### Task 3: Names, template and loader

**Files:** `src/sheet/names.ts`, `src/sheet/template.ts`, `src/sheet/load.ts`,
`tests/unit/names.test.ts`, `tests/unit/template.test.ts`,
`tests/unit/load.test.ts`, `tests/fixtures/*.svg`

**Produces:**
- `tidyName(s): string`
- `groupNames(el): string[]`
- `findParts(doc): {parts: Map<PartId, Element>; warnings}`
- `templateSvg(): string`
- `loadSheet(text: string, fileName: string): LoadedSheet`, which throws
  `SheetError` on fatal errors
- `LoadedSheet` exactly as in spec section 3.5

Tests:
- [ ] **Names:** the variants table from spec 10.1.
- [ ] **Template:** it parses; it has every part group plus `guides`; loading
  it gives no warnings; every part's bounding box is inside its area.
- [ ] **Loader:**
  - non-square, missing viewBox and no-parts errors
  - scaled viewBox (Review Focus 1)
  - drawn-outside-box warning
  - the fixtures load with the expected warnings
- [ ] Implement, run, commit.

### Task 4: Animations and Lottie build

**Files:** `src/anim/{types,idle,talking,listening,index}.ts`,
`src/lottie/build.ts`, `tests/unit/anim.test.ts`, `tests/unit/build.test.ts`,
`tests/unit/pose.test.ts`

**Produces:**
- `ANIMATIONS: Animation[]`
- `buildLottie(sheet, anim, {debug}): LottieDoc`
- `buildPartPreview(shapes, area): LottieDoc`, used by the fidelity page

Tests:
- [ ] **Animations:** loop rule; keys in order and in range; swap sprites
  belong to their group.
- [ ] **Build:**
  - every parent resolves, and `ind` values are unique
  - `assets` is empty
  - exactly one swap member is visible on each frame
  - debug layers only when `debug` is true
  - only allowed types are used
  - partial sheet (Review Focus 3)
- [ ] **Pose:** wrists are below elbows, elbows below shoulders; L is left of
  R; the head is above the root; every joint is inside 512.
- [ ] Implement, run, commit.

### Task 5: UI

**Files:** `src/main.ts`, `src/ui/app.ts`, `src/ui/styles.css`, `index.html`

**Consumes:** `loadSheet`, `templateSvg`, `ANIMATIONS`, `buildLottie`,
lottie-web `loadAnimation({renderer:'svg', loop:true, animationData})`.

- [ ] Toolbar, main view and side panel as in spec section 8. Errors keep the
  previous sheet.
- [ ] `npm run build` succeeds. Commit.

### Task 6: Browser tests

**Files:** `playwright.config.ts`, `tests/e2e/app.spec.ts`,
`tests/e2e/fidelity.spec.ts`, `tests/e2e/fidelity.html`,
`tests/e2e/fidelity.ts`

- [ ] **App tests:**
  - the app loads and the preview has paths
  - the template round-trips without warnings
  - the exported JSON loads into lottie-web
  - keeps previous sheet on error (Review Focus 4)
  - the `unsupported.svg` script flag stays unset
- [ ] **Fidelity:** for each part of each fixture and the template,
  screenshots of the original SVG and the lottie-web render, compared with
  pixelmatch; at most 1% of pixels may differ.
- [ ] Run `npx playwright test --trace off` → PASS. Commit.
