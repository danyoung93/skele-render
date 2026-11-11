# Trace Tool — Design Spec

Date: 2026-11-12
Status: Approved in conversation (built straight after writing, at the user's request)
Builds on: `2026-11-11-sheet-editor-design.md`

## 1. Purpose

Once the reference image is lined up under a part's box in Edit sheet, clicking
a patch of **flat colour** in it creates a smooth vector path matching that
patch, filled with its colour. Gradients, textures and photos are out of scope.

### Decisions

| Topic | Decision |
|---|---|
| What a click selects | The connected area of similar colour under the click (magic wand), not every patch of that colour |
| Areas inside the patch | Filled in: only the outer outline is traced, and later traces layer on top |
| Implementation | Our own tracer in TypeScript: flood fill, then marching squares, then Schneider curve fitting. No GPL code and no new dependencies |

## 2. Behaviour (Edit sheet)

- **Tool:** a **Trace** tool, shortcut **T**.
  - With no reference image loaded, a click shows "Load a reference image
    first".
  - A click outside the image does nothing.
- **Hover preview:** the area a click would pick up is outlined dashed, with a
  swatch of its colour. It's recomputed at most every 100 ms as the pointer
  moves.
- **Click:** adds a path to the part whose box contains the click
  (`partForPoint`).
  - **Fill:** the area's median colour, opacity 1, no stroke, rotation 0.
  - **Placement:** on top of that part's shapes. It becomes the selection.
  - **Undo:** one undo step.
  - **Mirrored arms:** clicking in a mirrored arm's generated side is refused
    with the same message as drawing.
- **Search limit:** the spread is limited to the clicked part's box plus 32
  units, converted into image pixels.
  - **Hitting the limit:** the shape is still created, with the note "This
    area ran into the edge of the box. Try a lower tolerance."
  - **Under 16 image pixels:** nothing is created, and the note says "That
    area is too small to trace."
- **Panel:** a **Trace** section is shown while the tool is active:
  - **Tolerance:** `trace-tolerance`, ΔE 1–50, default 12.
  - **Smoothness:** `trace-smoothness`, 0.25–4 image px, default 0.6.

## 3. Algorithm (`src/trace/`, pure functions on `{ width, height, data: Uint8ClampedArray }`)

1. **`region.ts`: `growRegion(img, seed, tol, limit) → { mask: Uint8Array, count, hitLimit, colour }`**
   - **Seed colour:** the median of the 3×3 around the seed. **Colour:** the
     median of the region's pixels.
   - **Distance:** CIE76 ΔE in Lab (sRGB, D65), always measured against the
     seed colour.
   - **Spreading:** 4-connected flood fill, restricted to the `limit`
     rectangle (in image px). `hitLimit` means the region touches that
     rectangle's edge, where the edge isn't the image edge.
   - **Tidy-up:** fill holes (non-region pixels not reachable from the limit
     border).
   - **Coverage field:** 1 for the region. Each antialiased edge pixel gets
     its coverage, from where its colour lies between the region colour and
     the most different neighbouring colour. Everything else is 0.
2. **`contour.ts`: `outerContour(mask, w, h) → Vec2[]`**
   - Run marching squares on the coverage field at level 0.35 with linear
     interpolation. That puts the outline about 0.2 px outside the true edge,
     so neighbouring traces overlap slightly instead of leaving hairline
     gaps.
   - Return the longest closed loop (the outer boundary), clockwise on screen,
     in pixel-centre coordinates (pixel (i, j) has its centre at
     (i + 0.5, j + 0.5)).
3. **`fit.ts`: `fitClosed(points, error) → PathNode[]`**
   - **Corners:** a point is a corner if the turn angle between the chords to
     the points k = 3 before and after exceeds 60°, keeping only local
     maxima.
   - **Fitting:** split at the corners and fit each run with Schneider's
     algorithm (chord-length parameters, Newton reparametrisation, splitting
     at the worst point when the error exceeds `error`). Handles meet at the
     shared nodes.
   - **No corners:** split the loop at its two furthest-apart points and give
     the joins smooth (collinear) tangents.
4. **`trace.ts`: `traceAt(img, seed, { tolerance, smoothness, limit }) → { nodes, colour, area, hitLimit } | { error: 'outside' | 'too-small' }`**
   - Points are in image pixels.
   - The tool maps them to the sheet with `sheet = ref.xy + px · ref.scale`.

## 4. Testing

### Unit (synthetic images, 4×4 supersampled antialiasing)

| Image | Expectation |
|---|---|
| Circle, r = 40 | Max radial error < 0.75 px; ≤ 10 nodes |
| Rounded rect 100 × 60, r 12 | Max distance < 0.75 px; no corner nodes on the straight edges |
| Square 80 × 80 | 4 corner nodes within 1 px of the true corners |
| Concave L-shape | IoU ≥ 0.98 against the true shape |
| Ring (annulus) | Traces the filled outer circle |
| Two colours ΔE ≈ 8 apart | Separate at tolerance 5, merged at tolerance 12 |
| Background reaching the limit | `hitLimit` |
| 10-pixel speck | `too-small` |
| Any traced shape | Median colour equals the flat colour exactly |
| 512 × 512 area | Traced in < 150 ms |

### Browser

- Using a synthetic reference PNG with flat shapes, the hover preview
  appears.
- A click creates a path in the right part, with the right fill, and it's
  selected; one undo removes it.
- A click outside the image does nothing.
- A speck shows the "too small" note.
- With no reference image, a click shows "Load a reference image first".
