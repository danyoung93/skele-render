# Sheet Editor — Design Spec

Date: 2026-11-11
Status: Draft for review
Builds on: `2026-11-10-character-rig-design.md` (the "rig spec")

## 1. Purpose

The tool can animate any SVG sheet that follows the template, but making a
sheet currently needs an outside drawing app. This adds an **Edit sheet** mode
to the web tool: you load a character design as a **reference image**, move it
under the template's part boxes, and trace each part with vector shapes. The
result is a template SVG that the existing pipeline previews, animates and
exports to Lottie.

### Success criteria

- Starting from a blank sheet and a design image such as the bearded worker,
  you can trace every part in the browser and see it animate in the live
  preview, without leaving the app.
- The saved SVG loads through the existing `loadSheet` with no warnings, and
  exports to Lottie exactly like a hand-made sheet.
- A page reload loses no work.

### Decisions made during brainstorming

| Topic | Decision |
|---|---|
| Where you draw | On the sheet (the 15 part boxes). One reference image sits under the shapes and is moved and scaled independently, so you can line each part of the design up with its box |
| Drawing tools | Ellipse, rectangle (with rounded corners) and a Bézier pen, plus point editing for paths. Fill and stroke colour, with an eyedropper on the reference |
| Rotation | Every shape can be rotated in v1 |
| Gradients | Not in the editor. Solid colours only |
| Implementation | Our own small SVG editor. No drawing library |

### Out of scope for v1

Gradients, grouping, copy and paste between parts, snapping and alignment
guides, boolean operations, multiple reference images, and editing the rig or
the animations.

## 2. User experience

### 2.1 Modes

A switch at the top of the page selects **Animate** (today's screen, unchanged)
or **Edit sheet**. Both modes share one current sheet:

- shapes drawn in Edit sheet show up in Animate
- a sheet loaded in Animate can be opened for editing

### 2.2 Edit sheet layout

- **Canvas (centre):** the 1024 × 1024 sheet in reference units. Layers, bottom
  to top:
  1. the reference image
  2. the shapes
  3. guides (part boxes and pivot ticks, as in the template's guides layer)
  4. an editing overlay (selection, handles, pen preview)

  The box of the active part is highlighted.
- **Tools (left):**

  | Tool | Shortcut |
  |---|---|
  | Select | V |
  | Ellipse | E |
  | Rectangle | R |
  | Pen | P |
  | Edit points | A |
  | Eyedropper | I |

- **Panel (right):**
  - **Sheet:** name field (default `my-character`), New blank sheet, Edit
    current sheet, Download SVG.
  - **Parts list:** the 15 parts, each with a visibility toggle and its shape
    count. Clicking a part makes it active and zooms the view to its box.
  - **Shape** (when one is selected):
    - fill: colour, opacity, or none
    - stroke: colour, opacity, or none
    - stroke width
    - corner radius (rectangles only)
    - rotation in degrees
    - Bring forward, Send backward, Delete
  - **Reference:** Load image, opacity slider, Move reference toggle, Lock,
    Reset (fit the image to the sheet).
  - **Live preview:** a small looping preview of the current sheet, with an
    Idle / Talking / Listening picker.
  - **Warnings:** the loader's warnings for the current sheet, grouped by part.
- **View:**
  - Pan: space + drag, middle mouse button, or two-finger drag.
  - Zoom: wheel, pinch, or the + / − / fit buttons. Zoom ranges from 25% to
    800%.
  - Panning and zooming move the reference and the shapes together.

### 2.3 Drawing rules

- **Part assignment:** a new shape goes into the part whose box contains the
  point where you started drawing, and that part becomes active. If you start
  outside every box, the shape goes into the active part.
- **Ellipse and Rectangle:**
  - Drag from corner to corner. Shift keeps the shape a circle or square; Alt
    draws it from the centre.
  - The new shape uses the current fill and stroke style.
  - A drag shorter than 2 units on either axis is discarded.
- **Pen:**
  - Click to place a corner point. Press and drag to place a smooth point,
    with symmetric handles that follow the drag.
  - Clicking the first point closes the path. Enter or Escape finishes it as
    an open path.
  - A path with fewer than 2 points is discarded.
  - Backspace while drawing removes the last point.
- **Select:**
  - Click a shape to select it; Shift-click adds or removes it from the
    selection. Click empty canvas to clear the selection.
  - Drag to move. Arrow keys nudge by 1 unit, or 10 with Shift.
  - **Resize:** 8 handles on the selection box; Shift keeps the proportions.
    With one rotated shape selected, the box and resizing follow the shape's
    own axes.
  - **Rotate:** a round handle above the selection box. Drag to rotate around
    the selection's centre; Shift snaps to 15°.
  - Delete or Backspace removes the selected shapes.
- **Edit points** (paths only):
  - Drag a point or a curve handle.
  - Alt-drag a handle to move it on its own, breaking the smooth link.
  - Double-click a segment to insert a point. Select a point and press Delete
    to remove it; a path that would drop below 2 points is deleted instead.
- **Eyedropper:** click on the reference image to set the fill of the selected
  shapes, or the default fill if none are selected. Shift-click sets the
  stroke. Clicking outside the image does nothing.
- **Move reference:**
  - While the toggle is on, dragging moves the reference image and the wheel
    scales it around the pointer.
  - Choosing any drawing tool turns the toggle off.
  - While the reference is locked, the toggle is disabled.
- **Undo and redo:** Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z (also Ctrl+Y). History
  covers every change to shapes and the reference image's position, up to 200
  steps per session. View changes (pan, zoom) and selection are not undoable.

## 3. Data model (`src/editor/model.ts`)

All coordinates are in reference units (0..1024).

```ts
type Vec2 = [number, number];
interface Paint { color: string; opacity: number }      // color '#rrggbb', opacity 0..1
interface Style { fill: Paint | null; stroke: Paint | null; strokeWidth: number }

interface ShapeBase { id: string; rotation: number; style: Style } // rotation: degrees, about centre()
interface EllipseShape extends ShapeBase { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
interface RectShape extends ShapeBase { kind: 'rect'; x: number; y: number; w: number; h: number; r: number }
interface PathNode { p: Vec2; in: Vec2; out: Vec2 }     // absolute handle positions, unrotated
interface PathShape extends ShapeBase { kind: 'path'; nodes: PathNode[]; closed: boolean }
type EditorShape = EllipseShape | RectShape | PathShape;

interface ReferenceState { x: number; y: number; scale: number; opacity: number; locked: boolean; hasImage: boolean }
interface EditorDoc {
  version: 1;
  name: string;
  parts: Record<PartId, EditorShape[]>;   // back to front
  reference: ReferenceState;
}
```

- **Centre of a shape:** the centre of its unrotated bounding box (for paths,
  the bounding box of the points). Rotation turns the shape around that
  centre. For paths, rotation is stored, not applied to the points.
- **Immutability:** documents are never changed in place. Every command
  returns a new document, and unchanged parts and shapes are shared.
- **IDs:** shape IDs are unique within a document (`s1`, `s2`, …, from a
  counter stored with the document).

## 4. Logic modules (pure, unit-tested)

| Module | Responsibility |
|---|---|
| `editor/model.ts` | Types, `emptyDoc(name)`, `centre(shape)`, `bounds(shape)` (unrotated), `orientedBox(shape)` |
| `editor/commands.ts` | `addShape`, `updateShape`, `deleteShapes`, `reorder(forward or backward)`, `moveShapes(ids, dx, dy)`, `resizeShape(id, handle, point, keepRatio)`, `rotateShapes(ids, angle, about)`, `setReference(partial)`, `partForPoint(doc, point, activePart)` |
| `editor/history.ts` | `History { past, present, future }`, `push`, `undo`, `redo`, capped at 200 |
| `editor/serialize.ts` | `serialize(doc): string`: template-layout SVG, one layer per part, plus the guides layer |
| `editor/import.ts` | `importSheet(sheet: LoadedSheet): { doc: EditorDoc; warnings }` |
| `editor/viewport.ts` | `Viewport { x, y, zoom }`, `screenToSheet`, `sheetToScreen`, `zoomAt` |
| `editor/persist.ts` | Save and restore via IndexedDB; validates `version` and shape |

### 4.1 Serialisation

- The root and layer attributes match the generated template:
  - root: `viewBox="0 0 1024 1024"`
  - one `<g id="<part>" inkscape:groupmode="layer" inkscape:label="<part>">`
    per part, followed by the guides layer
- **Shapes:**
  - ellipses become `<ellipse>`, rectangles become `<rect … rx>`, paths become
    `<path d>` (`M`, `C`, and `Z` when closed)
  - attributes: `fill`, `fill-opacity`, `stroke`, `stroke-opacity`,
    `stroke-width`, `stroke-linecap="round"` and `stroke-linejoin="round"`
  - a non-zero rotation becomes `transform="rotate(a cx cy)"`
- **Numbers** are rounded to 3 decimal places.
- **Missing parts:** a part with no shapes is written as an empty layer, which
  the loader reports as empty.
- **Name:** stored as `data-character-name` on the root.
- **Reference image:** never written.

### 4.2 Import

`importSheet` reads the converter's output (Lottie shape items in reference
units):

- each `gr` group becomes one shape:
  - every `sh` becomes a `PathShape` with rotation 0, with handles converted
    from relative to absolute
  - a group with several `sh` items becomes one path per subpath, all with the
    same style
- `fl` becomes the fill, and `st` becomes the stroke and its width
- `gf` / `gs` become the colour of their first stop, with the warning
  "gradient flattened to its first colour"
- dashes are dropped, with the warning "dashes removed"
- `fill-rule` evenodd is dropped. A shape with a hole imports as two filled
  paths, with the warning "shape with holes may fill its holes"
- **Name:** the doc name is the sheet's name.

### 4.3 Persistence

- **Where:** IndexedDB database `character-rig`, store `editor`. It holds two
  records:
  - `doc`: the `EditorDoc` as JSON
  - `reference`: the image `Blob`
- **When:** autosave runs 500 ms after the last change. A restore happens on
  page load.
- **Bad data:** a record that fails validation (wrong `version`, unknown
  shape kinds, or a missing part key) is moved to `doc-corrupt-<timestamp>`.
  The editor then starts blank and shows a message.
- **Unavailable storage:** if IndexedDB is unavailable or a write fails, a
  banner says "Autosave is off. Download your sheet to keep it." Editing
  continues.

## 5. Runtime components (browser)

- **`editor/store.ts`:** holds the history, selection (shape IDs), active part,
  current tool, default style, the reference image (object URL plus decoded
  bitmap) and viewport. `subscribe(listener)` is called after every change.
  After document changes it also:
  - rebuilds the live sheet, at most every 200 ms:
    `loadSheet(serialize(doc), name + '.svg')`
  - schedules an autosave
- **`editor/view.ts`:** renders the canvas SVG from the store.
  - The viewBox follows the viewport.
  - Each shape element carries `data-shape-id` and `data-part`, so hit-testing
    uses the browser's own event target.
  - Hidden parts are not rendered.
  - The overlay draws the selection's oriented box, the 8 resize handles, the
    rotate handle, the pen preview and, in Edit points, the points and
    handles.
- **`editor/tools/*.ts`:** one module per tool, all implementing
  `Tool { cursor; down(e, ctx); move(e, ctx); up(e, ctx); key?(e, ctx) }`.
  `ctx` provides the store, `toSheet(event): Vec2` and the element under the
  pointer.
  - **Pan:** space, middle button or two fingers. It's handled by the view,
    above all tools.
  - **Eyedropper:** reads from an offscreen canvas holding the decoded
    reference image at up to 8000 px on its longest side. It maps the sheet
    point to an image pixel using the reference's x, y and scale.
- **`editor/panel.ts`:** builds the right-hand panel from the store.
- **`ui/animate.ts`:** today's Animate screen, moved out of `ui/app.ts`
  unchanged, but now taking its sheet from a shared `setSheet` / `onSheet`
  hook.
- **`ui/app.ts`:** the mode switch; it owns the shared current sheet.
  - **Edit current sheet** imports the Animate sheet.
  - Edits replace the shared sheet, so Animate always shows the latest
    drawing.

## 6. Rotation details

- **Stored value:** `rotation` is in degrees, positive clockwise on screen, and
  normalised to (−180, 180].
- **Rotating a selection** of several shapes turns each shape's centre around
  the selection's centre, and adds the same angle to each shape's rotation.
- **Resizing a rotated shape:**
  - the pointer is converted into the shape's unrotated frame
  - the handle moves in that frame while the opposite handle stays fixed
  - the shape's geometry is updated so that the opposite corner stays in the
    same place on screen
- **Resizing a multi-shape selection** uses the selection's axis-aligned box,
  and only when every selected shape has rotation 0. Otherwise the resize
  handles are hidden and only move and rotate are offered.
- **Edit points** converts pointer positions into the path's unrotated frame,
  so points land where you click.

## 7. Error handling

| Situation | Behaviour |
|---|---|
| Reference image can't be decoded | Error message. The previous reference stays |
| Reference image larger than 8000 px on its longest side | Accepted. Displayed and sampled at 8000 px, with a note |
| Shape too small (see 2.3) | Discarded silently |
| Shape drawn more than 32 units outside its part's box | Loader warning in the panel. The shape is kept |
| Import loses gradients, dashes or holes | Imports anyway, with one warning per affected part |
| IndexedDB unavailable or a write fails | "Autosave is off" banner. Editing continues |
| Saved data fails validation | Moved aside, start blank, with a message |
| New blank sheet or Edit current sheet with unsaved changes | Confirmation dialog. The replacement can also be undone |

"Unsaved changes" means changes since the last Download SVG, or since the
document was created.

## 8. Testing

### 8.1 Unit tests (Vitest, jsdom)

- **Serialisation round trip:** a document with every shape kind, both paints,
  opacity, rounded corners, an open and a closed path, and non-zero rotations
  is written, then loaded with `loadSheet`. The result:
  - has no warnings for the parts that have shapes
  - converts to geometry matching the model within 0.01 units
  - keeps colours and opacities
- **Import round trip:** `importSheet(loadSheet(templateSvg()))`, then
  `serialize`, then `loadSheet` again:
  - every part's control-point bounding box stays within 0.5 units
  - the head reports its flattened-gradient warning
- **Commands:**
  - each returns a new document without changing the old one
  - resizing a rotated rectangle by its corner handle keeps the rotation and
    the opposite corner's position on screen, within 0.01
  - resizing a path scales its points and handles
  - rotating several shapes turns their centres around the selection's centre
  - reorder keeps the order at the ends
  - `partForPoint` picks the box under the start point, otherwise the active
    part
- **History:**
  - undo and redo restore exact earlier states
  - a new change after undo clears the redo list
  - history is capped at 200
- **Viewport:** `screenToSheet` reverses `sheetToScreen` for several pan and
  zoom values. `zoomAt` keeps the point under the pointer fixed.
- **Persistence validation:** valid documents pass. A wrong version, an unknown
  shape kind or a missing part are rejected.
- **Eyedropper mapping:** a sheet point maps to the right image pixel for a
  given reference x, y and scale, and points outside the image give null.

### 8.2 Browser tests (Playwright)

- **Drawing:**
  - switch to Edit sheet and start a blank sheet
  - draw an ellipse in the head box and a rectangle in the torso box
  - draw a closed pen path with one dragged (curved) point in the mouth_open
    box

  Each shape appears in the right part's count. The live preview and Animate
  mode both render them.
- **Rotation:** rotate a selected rectangle with Shift held; the rotation
  field shows a multiple of 15. Undo restores 0.
- **Reference:**
  - load a test PNG, turn on Move reference and drag: the image moves and the
    shapes don't
  - lock it and drag again: it doesn't move
- **Eyedropper:** a test PNG with a known colour block; clicking it sets the
  fill field to that colour.
- **Edit points:** dragging a point changes the path's `d`. Double-clicking a
  segment adds a point.
- **Undo and redo** after drawing three shapes.
- **Autosave:** reload the page; the shapes and the reference image are back.
- **Export:** after drawing, Export Lottie in Animate gives JSON that loads in
  lottie-web.
- **Visual match:** an editor-made SVG fixture (`tests/fixtures/editor.svg`,
  produced by `serialize` from a test document) is added to the existing
  pixel-comparison test.

## 9. Project layout changes

```
src/editor/   model.ts, commands.ts, history.ts, serialize.ts, import.ts,
              viewport.ts, persist.ts, store.ts, view.ts, panel.ts
src/editor/tools/  select.ts, shape.ts (ellipse and rect), pen.ts, points.ts,
                   eyedropper.ts, reference.ts
src/ui/       app.ts (mode switch), animate.ts (moved from app.ts), editor.css
tests/unit/editor/  serialize, import, commands, history, viewport, persist, eyedropper tests
tests/e2e/    editor.spec.ts, fixtures for reference images
tests/fixtures/editor.svg
```
