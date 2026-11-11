# Sheet Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An "Edit sheet" mode where you trace a character over a movable
reference image with ellipses, rectangles and Bézier paths (all rotatable),
producing a template SVG that the existing pipeline animates and exports.

**Architecture:** Pure, immutable editor documents (`src/editor/model.ts`) are
changed by commands. They are serialised to template SVG and fed through the
existing `loadSheet`, so preview and export are reused unchanged. A small
store drives an SVG canvas view, pluggable tools and a side panel. IndexedDB
autosaves the document and the reference image.

**Tech Stack:** TypeScript, Vite, plain DOM/SVG, Vitest + jsdom,
`fake-indexeddb` (unit tests only), Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-11-11-sheet-editor-design.md` (builds on `docs/superpowers/specs/2026-11-10-character-rig-design.md`)

## Global Constraints

- **Coordinates:** all editor coordinates are reference units, 0..1024.
- **Rotation:** degrees, positive clockwise, normalised to (−180, 180], about
  `centre(shape)` (the centre of the unrotated bounding box).
- **Documents:** never changed in place. Every command returns a new
  `EditorDoc`.
- **Serialised SVG** uses the template's root and layer attributes. Numbers
  are rounded to 3 decimal places. Strokes always have
  `stroke-linecap="round" stroke-linejoin="round"`.
- **Reference image:** never written to the SVG, and never sent anywhere.
- **No new runtime dependencies.** `fake-indexeddb` is a dev dependency only.
- **Limits:**
  - history: 200 steps
  - zoom: 25%–800%
  - reference image: up to 8000 px on its longest side
  - minimum shape: 2 units; minimum path: 2 points
  - autosave: 500 ms after the last change; preview rebuild: at most every
    200 ms
- **Shortcuts:** V, E, R, P, A, I; space to pan; Ctrl/Cmd+Z;
  Shift+Ctrl/Cmd+Z and Ctrl+Y; Delete/Backspace; arrow keys (1 unit, 10 with
  Shift). Shortcuts are ignored while focus is in an `input`, `select` or
  `textarea`.

## Review Focus

1. **Drawing while zoomed and panned:** shapes must land exactly under the
   pointer, including on high-density screens and when the canvas element
   isn't square. Test: Task 5 e2e "draws under the pointer at 200% zoom after
   panning".
2. **Typing in panel fields:** typing in the name or colour fields must not
   trigger tool shortcuts (for example "e" switching to Ellipse). Test:
   Task 5 e2e "shortcuts ignored while typing".
3. **Undo during an unfinished pen path:** Ctrl+Z should cancel the path in
   progress, not undo the previous shape. Test: Task 6 e2e "undo cancels an
   in-progress pen path".
4. **Autosave with a document but no reference image** (for example the image
   was cleared or failed to save): it must restore the shapes without an
   error. Test: Task 3 unit "restore without reference blob".
5. **Editing the current sheet when it has missing or empty parts:** those
   parts must be empty in the editor, with no crash. Test: Task 2 unit
   "import with missing parts".

---

### Task 1: Editor model, commands and history

**Files:** Create `src/editor/model.ts`, `src/editor/commands.ts`,
`src/editor/history.ts`. Test `tests/unit/editor/commands.test.ts` and
`tests/unit/editor/history.test.ts`.

**Interfaces:**
- **Produces, `model.ts`:**
  - the spec section 3 types, exactly: `Vec2`, `Paint`, `Style`,
    `EditorShape`, `EllipseShape`, `RectShape`, `PathShape`, `PathNode`,
    `ReferenceState`, `EditorDoc`, with `EditorDoc` extended by
    `nextId: number`
  - `emptyDoc(name: string): EditorDoc`: all 15 parts empty; reference
    `{x:0, y:0, scale:1, opacity:0.5, locked:false, hasImage:false}`
  - `DEFAULT_STYLE: Style`: fill `#cccccc` at 1, no stroke, width 4
  - `bounds(s): {x0, y0, x1, y1}` (unrotated; paths include their handles)
  - `centre(s): Vec2`
  - `toLocal(s, p: Vec2): Vec2` and `toWorld(s, p: Vec2): Vec2` (undo or
    apply the shape's rotation about its centre)
  - `orientedBox(s): [Vec2, Vec2, Vec2, Vec2]` (corners in screen order,
    starting top-left)
  - `normAngle(deg): number`
  - `findShape(doc, id): { part: PartId; index: number; shape: EditorShape } | null`
- **Produces, `commands.ts`** (each returns a new `EditorDoc`):
  - `addShape(doc, part, shape: Omit<EditorShape, 'id'>): { doc; id }`
  - `updateShape(doc, id, patch: Partial<EditorShape>)`
  - `deleteShapes(doc, ids)`
  - `reorder(doc, id, dir: 'forward' | 'backward')`
  - `moveShapes(doc, ids, dx, dy)`
  - `resizeShape(doc, id, handle: Handle, point: Vec2, keepRatio: boolean)`,
    where `Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'`
  - `resizeSelection(doc, ids, from: Box, to: Box)`, only for unrotated
    shapes; `Box = {x0, y0, x1, y1}`
  - `rotateShapes(doc, ids, angle, about: Vec2)`
  - `setReference(doc, patch: Partial<ReferenceState>)`
  - `partForPoint(p: Vec2, active: PartId): PartId`, using `AREAS` from
    `src/sheet/layout.ts`
- **Produces, `history.ts`:**
  - `History = { past: EditorDoc[]; present: EditorDoc; future: EditorDoc[] }`
  - `createHistory(doc)`, `push(h, doc)` (capped at 200 past entries),
    `undo(h)`, `redo(h)`, `canUndo(h)`, `canRedo(h)`

Steps:
- [ ] **Write the failing tests:**
  - `addShape` gives IDs `s1`, `s2` and doesn't change the old document
    (deep-frozen input).
  - `updateShape`, `deleteShapes` and `moveShapes` move an ellipse, a rect and
    a path (path points and handles shift together).
  - `reorder` forward on the last shape and backward on the first shape leave
    the order unchanged.
  - **Rotated resize:** for a rect `{x:100, y:100, w:100, h:50, rotation:30}`,
    after `resizeShape(..., 'se', toWorld(newLocalCorner))` the world position
    of the old `nw` corner is unchanged (within 0.01) and the rotation is
    still 30.
  - **Path resize:** resizing a path's `se` handle from a 100×100 box to
    200×100 doubles every point's and handle's x offset from the `nw` corner.
  - **Rotate around a point:** `rotateShapes` by 90° around `[0, 0]` moves the
    centre `[10, 0]` to `[0, 10]` and adds 90 to the rotation; 190 normalises
    to −170.
  - **Part for point:** `partForPoint([100, 100], 'torso')` is `head`, and
    `partForPoint([10, 1000], 'torso')` is `torso`.
  - **History:** undo/redo give the same objects back; a push after undo
    clears `future`; pushing 205 times leaves 200 in `past`.
- [ ] Run `npx vitest run tests/unit/editor` → FAIL (modules missing).
- [ ] **Implement.** The resize approach for a rotated shape:
  1. convert the pointer to the shape's local frame
  2. build the new local box with the opposite edge or corner fixed
  3. work out the new centre in the world frame from the fixed corner's
     original world position
  4. write the geometry in the unrotated frame around that centre
- [ ] Run → PASS. `npx tsc --noEmit` is clean. Commit
  `feat(editor): add document model, commands and history`.

### Task 2: Serialise and import

**Files:** Create `src/editor/serialize.ts`, `src/editor/import.ts`,
`tests/fixtures/editor.svg`. Test `tests/unit/editor/serialize.test.ts` and
`tests/unit/editor/import.test.ts`. Modify `tests/e2e/fidelity.spec.ts` (add
the `editor.svg` entry).

**Interfaces:**
- **Consumes:** Task 1 types; `loadSheet` and `LoadedSheet` from
  `src/sheet/load.ts`; `AREAS`, `PART_IDS`, `LEGEND_Y` from
  `src/sheet/layout.ts`.
- **Produces:**
  - `serialize(doc: EditorDoc): string`
  - `guidesLayer(): string`, moved out of `src/sheet/template.ts` (exported
    from there and reused, so both outputs have the same guides)
  - `importSheet(sheet: LoadedSheet): { doc: EditorDoc; warnings: { part: PartId; message: string }[] }`

Steps:
- [ ] **Write the failing tests:**
  - **Serialise round trip:** a test document with an ellipse (rotation 20,
    fill and stroke), a rect (r 12, rotation −45, fill only, opacity 0.5), a
    closed path with curved handles and an open stroked path, spread across 4
    parts. Loading the output with `loadSheet`:
    - gives no warnings except "empty" ones for the 11 unused parts
    - each part's `shapesBBox` matches the model's world bounding box within
      0.01 (sample the rotated ellipse at 64 points for its expected box)
    - colours and opacities come through
  - The output contains `data-character-name="<name>"` and one
    `<g id="<part>" inkscape:groupmode="layer"` per part.
  - **Import round trip:** `importSheet(loadSheet(templateSvg(), 't.svg'))`,
    then `serialize`, then `loadSheet`. Every part's bounding box is within
    0.5 units of the original's, and the warnings include `{ part: 'head',
    message: 'gradient flattened to its first colour' }`.
  - **Dashes and holes:** importing the `features.svg` fixture warns "dashes
    removed" for head and "shape with holes may fill its holes" for head.
  - **Import with missing parts:** a sheet with only `head` gives a document
    whose other 14 parts are `[]`, with no error.
- [ ] Run → FAIL.
- [ ] **Implement.**
  - Path `d`: `M p0`, then a `C` from each node's `out` to the next node's
    `in` and point, plus a closing `C` and `Z` when closed. Rotation becomes
    `transform="rotate(a cx cy)"` only when it isn't zero.
  - Import: each `gr` group becomes one shape per `sh` item, with handles
    converted to absolute (`p + i`, `p + o`). The style comes from the group's
    `fl`/`gf` and `st`/`gs`: colour from `c.k` or from the first stop of
    `g.k.k`, and opacity from `o.k / 100`.
- [ ] Write `tests/fixtures/editor.svg` by running `serialize` on the
  round-trip test document. Write it once from a small script and check it
  in. Add `['editor.svg', () => fx('editor.svg')]` to `FILES` in the fidelity
  test.
- [ ] Run `npx vitest run`, then `npx playwright test --trace off
  tests/e2e/fidelity.spec.ts` → PASS. Commit
  `feat(editor): serialise documents to template SVG and import sheets`.

### Task 3: Viewport, persistence and eyedropper maths

**Files:** Create `src/editor/viewport.ts`, `src/editor/persist.ts`,
`src/editor/eyedropper-math.ts`. Test `tests/unit/editor/viewport.test.ts`,
`tests/unit/editor/persist.test.ts` and
`tests/unit/editor/eyedropper.test.ts`. Dev dependency: `fake-indexeddb`.

**Interfaces:**
- **Produces, `viewport.ts`:**
  - `Viewport = { x: number; y: number; zoom: number }`: the sheet point
    shown at the canvas's top-left, and pixels per unit
  - `screenToSheet(v, p: Vec2): Vec2` and `sheetToScreen(v, p: Vec2): Vec2`,
    where `p` is relative to the canvas element in CSS pixels
  - `zoomAt(v, screenP, factor): Viewport`, clamped to 0.25–8 relative to
    `fitZoom`
  - `fitViewport(canvasW, canvasH, box?: Box): Viewport`, which fits the
    whole sheet or `box` with 24 px padding
- **Produces, `persist.ts`:**
  - `validateDoc(x: unknown): EditorDoc | null`
  - `saveDoc(doc): Promise<void>`
  - `saveReference(blob: Blob | null): Promise<void>`
  - `loadSaved(): Promise<{ doc: EditorDoc | null; reference: Blob | null; corrupt: boolean }>`
  - `persistenceAvailable(): Promise<boolean>`
  - Database `character-rig`, store `editor`, keys `doc` and `reference`.
    Corrupt documents are copied to `doc-corrupt-<Date.now()>`.
- **Produces, `eyedropper-math.ts`:**
  `sheetToImagePixel(ref: ReferenceState, imgW, imgH, p: Vec2): [number, number] | null`.
  The image is drawn at `(ref.x, ref.y)` with size `imgW*ref.scale ×
  imgH*ref.scale` in sheet units.

Steps:
- [ ] **Write the failing tests:**
  - **Viewport:**
    - `screenToSheet` reverses `sheetToScreen` for zoom 0.5, 1 and 3.7 and
      offsets `(±200, ±50)`
    - `zoomAt` keeps the sheet point under `screenP` fixed (within 1e-9)
    - zoom is clamped at 0.25× and 8× fit
  - **Persistence** (with `fake-indexeddb/auto`):
    - save and load round-trip the document and blob
    - **restore without reference blob:** saving a document only gives
      `reference: null` with no error
    - a stored `{version: 2}` gives `doc: null, corrupt: true` and a
      `doc-corrupt-*` key exists
    - `validateDoc` rejects an unknown shape kind or a missing part key
  - **Eyedropper:** with `ref {x:100, y:50, scale:0.5}` and a 400×200 image,
    sheet `[100, 50]` maps to `[0, 0]`, `[299.9, 149.9]` maps to `[399, 199]`,
    and `[99, 50]` maps to `null`.
- [ ] Run → FAIL. Install with `npm i -D fake-indexeddb`.
- [ ] Implement and run → PASS. Commit
  `feat(editor): add viewport maths, persistence and eyedropper mapping`.

### Task 4: Split the app into a mode shell and the Animate screen

**Files:** Create `src/ui/animate.ts` and `src/ui/sheet-bus.ts`. Modify
`src/ui/app.ts` and `src/ui/styles.css`.

**Interfaces:**
- **Produces, `sheet-bus.ts`:**
  `SheetBus = { get(): LoadedSheet; set(sheet: LoadedSheet, origin: 'animate' | 'editor'): void; subscribe(fn: (s: LoadedSheet, origin) => void): () => void }`
  and `createSheetBus(initial)`.
- **Produces, `animate.ts`:**
  `mountAnimate(el: HTMLElement, bus: SheetBus): { show(): void; hide(): void }`.
  This is today's `startApp` body. Loading a file calls
  `bus.set(sheet, 'animate')`, and it re-renders whenever the bus changes.
- **Produces, `app.ts`:** `startApp(root)` renders a top bar with an
  Animate | Edit sheet radio group (`role="radio"`, `data-mode`) and two mount
  points. Edit sheet mounts the editor from Task 5 (until then a placeholder
  `<div data-id="editor-root">`).

Steps:
- [ ] Run the existing `npx playwright test --trace off
  tests/e2e/app.spec.ts` → PASS (baseline).
- [ ] Move the code over without changing behaviour. The selectors used by
  `app.spec.ts` stay the same.
- [ ] Run the e2e and unit tests → PASS. Add an e2e test: the mode switch
  shows `[data-id="editor-root"]` and hides the stage, and switching back
  keeps the same frame position. Commit
  `refactor(ui): split Animate screen behind a mode switch`.

### Task 5: Store, canvas view, Select / Ellipse / Rectangle tools and panel

**Files:**
- Create: `src/editor/store.ts`, `src/editor/view.ts`, `src/editor/panel.ts`,
  `src/editor/tools/types.ts`, `src/editor/tools/select.ts`,
  `src/editor/tools/shape.ts`, `src/editor/mount.ts`, `src/ui/editor.css`
- Modify: `src/ui/app.ts` (mount the editor)
- Test: `tests/e2e/editor.spec.ts`

**Interfaces:**
- **Consumes:** Tasks 1–4.
- **Produces, `store.ts`:** `createStore(bus: SheetBus, initial: EditorDoc)`
  returning:
  - state: `{ history, selection: string[], active: PartId, tool: ToolId,
    style: Style, viewport, hidden: Set<PartId>, reference: { url, bitmap,
    w, h } | null, dirty: boolean, autosave: 'on' | 'off' }`
  - `get()`, `subscribe(fn)`, `commit(doc)` (pushes history, sets dirty,
    schedules the preview and autosave), `transient(doc)` (updates the
    present document without a history entry, used during drags),
    `endTransient()` (pushes the pre-drag document as one history step),
    `undo()`, `redo()`, `setTool(t)`, `select(ids)`, `setActive(p)`,
    `setViewport(v)`
  - the preview: a 200 ms throttled `bus.set(loadSheet(serialize(doc),
    name + '.svg'), 'editor')`
- **Produces, `tools/types.ts`:**
  `ToolId = 'select' | 'ellipse' | 'rect' | 'pen' | 'points' | 'eyedropper' | 'reference'`
  and
  `Tool { id: ToolId; cursor: string; down(e: PointerEvent, ctx: ToolCtx): void; move(e, ctx): void; up(e, ctx): void; key?(e: KeyboardEvent, ctx): boolean; cancel?(ctx): void }`,
  with
  `ToolCtx { store; toSheet(e: PointerEvent): Vec2; shapeIdAt(e): string | null; overlay: SVGGElement }`.
- **Produces, `mount.ts`:** `mountEditor(el, bus): { show(); hide() }`.

**Canvas DOM:** one `<svg data-id="canvas">` whose viewBox comes from the
viewport and the element's size, containing these groups:
- `<image data-id="reference">`
- `<g data-id="shapes">`, whose elements carry `data-shape-id` and
  `data-part`
- `<g data-id="guides">` (`guidesLayer()`, with pointer-events none)
- `<g data-id="overlay">`

**Panel test hooks:**
- `data-id`: `sheet-name`, `parts`, `fill`, `fill-opacity`, `fill-none`,
  `stroke`, `stroke-none`, `stroke-width`, `radius`, `rotation`, `forward`,
  `backward`, `delete`, `preview`, `warnings`
- `data-part-count="<part>"` for each part's shape count
- toolbar buttons `data-tool="<id>"`

Steps:
- [ ] **Write the failing e2e tests:**
  - **Draw shapes:** in Edit sheet, choose ellipse and drag inside the head
    box, then rect and drag inside the torso box. `data-part-count="head"`
    shows 1 and torso shows 1. The preview contains an SVG with paths.
    Switching to Animate shows "Sheet: my-character".
  - **Draws under the pointer at 200% zoom after panning:** zoom with the
    wheel, pan with a middle-button drag, draw an ellipse from screen A to B.
    The ellipse element's bounding client rect matches the A–B box within
    1 px.
  - **Select, move and rotate:** click the rect, then drag the rotate handle
    with Shift held. The `rotation` field reads a multiple of 15. Ctrl+Z
    resets it to 0.
  - **Resize keeps the shape rotated:** after rotating, dragging the `se`
    handle leaves the rotation unchanged.
  - **Shortcuts ignored while typing:** focus `sheet-name` and type "e"; the
    tool is still `select` and the name ends in "e".
  - **Style:** with the ellipse selected, setting `fill` to `#ff0000` gives a
    shape element with `fill="#ff0000"`.
  - **Parts list:** hiding `head` removes its shape element from the canvas.
    Clicking the `torso` row makes torso active, and the next ellipse drawn
    outside every box lands in torso.
- [ ] Run → FAIL.
- [ ] **Implement:**
  - **View:** re-render all shapes on each store change (keyed by ID).
    Convert pointer positions with `getScreenCTM().inverse()`, not
    hand-written maths, so CSS size and device pixel ratio don't matter.
  - **Shape tool:** Shift gives a circle or square, Alt draws from the
    centre, and drags shorter than 2 units are discarded.
  - **Select tool:** click and Shift-click to select, drag to move, arrow
    keys to nudge, 8 handles using `resizeShape`, a rotate handle 24 screen
    px above the box using `rotateShapes`, and Delete.
  - **Multi-selection with any rotated shape** hides the resize handles.
  - **Parts list:** each row has a visibility toggle (`data-part-visible="<part>"`; hidden parts aren't rendered or hit-tested). Clicking a row sets the active part and calls `fitViewport` on its box.
  - **View controls:** buttons `zoom-in`, `zoom-out` and `zoom-fit` (factor 1.25). Pan with space+drag, a middle-button drag, or a two-finger touch drag; wheel zooms around the pointer.
  - **Warnings panel:** shows the bus sheet's warnings, grouped by part as in Animate.
  - Run every drag as one undo step through `transient` and `endTransient`.
- [ ] Run the e2e and unit tests → PASS. Commit
  `feat(editor): add canvas, select, ellipse and rectangle tools and panel`.

### Task 6: Pen and Edit points tools

**Files:** Create `src/editor/tools/pen.ts` and `src/editor/tools/points.ts`.
Modify `tests/e2e/editor.spec.ts`.

**Interfaces:**
- **Consumes:** Task 5's `Tool` and `ToolCtx`; Task 1's `toLocal`/`toWorld`
  and `updateShape`.
- **Produces:** the `pen` and `points` tools.

Steps:
- [ ] **Write the failing e2e tests:**
  - **Closed path:** draw in the mouth_open box: click, press-drag (a curve)
    and click, then click the first point. `mouth_open` count is 1, and the
    path's `d` contains `C` and ends with `Z`.
  - **Open path:** two clicks and Enter give an open path (no `Z`).
  - **Backspace** while drawing removes the last point.
  - **Undo cancels an in-progress pen path:** after drawing one shape, start
    a pen path with 2 points and press Ctrl+Z. The in-progress path is gone
    and the earlier shape is still there.
  - **Edit points:** select the path with A, drag point 1 by (10, 0); `d`
    changes. Double-clicking the middle of a segment adds a node (the number
    of `C` commands goes up by 1). Selecting a point and pressing Delete
    removes it.
  - **Edit points on a rotated path:** rotate the path by 90°, then drag a
    point to screen position X; the rendered point ends up at X within 1 px.
- [ ] Run → FAIL.
- [ ] **Implement:**
  - Pen: on press-drag the out-handle follows the pointer and the in-handle
    mirrors it. Alt-drag on a handle breaks the mirror.
  - Segment insertion uses de Casteljau subdivision at the nearest `t`,
    found by sampling 50 points.
- [ ] Run → PASS. Commit `feat(editor): add pen and point editing tools`.

### Task 7: Reference image, Move reference and Eyedropper

**Files:** Create `src/editor/tools/reference.ts` and
`src/editor/tools/eyedropper.ts`. Modify `src/editor/panel.ts` and
`src/editor/store.ts`. Create `tests/e2e/assets/reference.png` (a 400×200
PNG, left half `#3366cc`, right half `#f4b9a0`, generated in the test setup
with pngjs).

**Interfaces:**
- **Consumes:** `sheetToImagePixel` (Task 3), `setReference` (Task 1).
- **Produces:**
  - `store.loadReference(file: Blob): Promise<void>`:
    - decodes with `createImageBitmap`; if the longest side is over 8000 px,
      scales down to 8000 and shows the note "Reference scaled to 8000 px"
    - fits the image to the sheet (`scale = min(1024/w, 1024/h)`, centred)
    - keeps an offscreen canvas for sampling
    - on a decode error, shows "Could not read that image" and keeps the
      previous reference
  - Panel: `data-id` `ref-load`, `ref-opacity`, `ref-move`, `ref-lock`,
    `ref-reset`.

Steps:
- [ ] **Write the failing e2e tests:**
  - load the reference and check it's visible
  - with `ref-move` on, drag (100, 0): the image's x attribute increases and
    the shape elements are unchanged
  - turn on `ref-lock`, then drag: x is unchanged and `ref-move` is disabled
  - wheel with `ref-move` on: the image's width changes
  - **Eyedropper:** press I and click the left half of the image; the `fill`
    field is `#3366cc`. Shift-click the right half; `stroke` is `#f4b9a0`.
  - choosing the Ellipse tool turns `ref-move` off
  - loading a `.txt` renamed to `.png` shows the error and keeps the previous
    image
- [ ] Run → FAIL. Implement. Run → PASS. Commit
  `feat(editor): add movable reference image and eyedropper`.

### Task 8: Autosave, sheet actions, undo shortcuts and final checks

**Files:** Modify `src/editor/store.ts`, `src/editor/panel.ts` and
`src/editor/mount.ts`. Modify `tests/e2e/editor.spec.ts`. Modify `README.md`
(an "Edit sheet" section).

**Interfaces:**
- **Consumes:** `persist.ts` (Task 3), `importSheet` and `serialize`
  (Task 2), `bus` (Task 4).
- **Produces:**
  - **On mount:** `loadSaved()` then restore.
  - **Banners:** "Autosave is off. Download your sheet to keep it." and
    "Your saved work couldn't be read, so a blank sheet was started. The old
    copy was kept."
  - **Panel actions:**
    - `new-sheet` and `edit-current` call `confirm()` when dirty, and both can
      be undone
    - `download-svg` saves `<name>.svg` and clears dirty
  - **Keyboard:** Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl+Y.

Steps:
- [ ] **Write the failing e2e tests:**
  - **Autosave:** draw 2 shapes, load the reference and wait 700 ms, then
    reload. Both part counts and the reference image are restored.
  - **Edit current sheet:** with the template loaded in Animate, Edit current
    sheet gives `head` 6 shapes. The warnings panel shows the gradient
    message. Undo goes back to the previous document.
  - **Download:** Download SVG gives `my-character.svg`, and that file loaded
    in Animate shows no warnings for the drawn parts.
  - **Export:** Export Lottie after drawing gives JSON that loads in
    lottie-web (reuse the `app.spec.ts` pattern).
  - **Undo/redo shortcuts** across three shapes.
  - **Autosave off:** in a page where `indexedDB.open` is stubbed to throw
    (`addInitScript`), the banner text is visible and drawing still works.
- [ ] Run → FAIL. Implement. Run the whole suite: `npx vitest run`, then
  `npx playwright test --trace off`, then `npm run build` → all PASS.
- [ ] **Manual check:** trace the bearded worker's head from
  `/tmp/claude-0/-home-user-skele-render/4d972df5-e32d-56f0-8654-96a19c82e077/images/1.webp`, or any design, using the reference
  image. Screenshot the editor and the live preview.
- [ ] Commit `feat(editor): autosave, sheet actions and undo shortcuts`, then
  push.
