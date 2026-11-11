# Character Rig — Design Spec

Date: 2026-11-10
Status: Draft for review (revision 2: SVG sprite sheets)

## 1. Purpose

A browser tool that animates a talking-head character for an app's "who is
currently speaking" indicator. The tool ships with a fixed bone rig and a fixed
set of looping animations. Artists supply an **SVG sprite sheet** that follows
a template, with one named layer per body part. The tool:

- converts each part's vector artwork into native Lottie shapes
- attaches each part to its bone
- plays the animation on screen
- exports it as a **Lottie** JSON file that the app plays with a standard
  Lottie player (lottie-web, lottie-ios, lottie-android)

Exported files contain **only native Lottie vector shapes**. No SVG or bitmap
is embedded.

The tool also generates a **template SVG** that shows where every part goes.
The template is itself a valid sheet with placeholder art, so it animates
straight away.

### Success criteria

- Loading the generated template, or any SVG sheet with the right layer names,
  shows the character animating with no further setup.
- Idle, Talking and Listening each loop seamlessly.
- An exported file plays in lottie-web and looks the same as the in-tool
  preview.
- Each converted part matches its source SVG closely (section 10.3).
- Exported files use only core Lottie features (section 7.4), so they play in
  lottie-ios and lottie-android too.

### Decisions made during brainstorming

| Topic | Decision |
|---|---|
| Who builds the rig and animations | Built into the tool. Fixed in code; not editable in the UI in v1 |
| Character type | Front-facing / three-quarter mascot: torso, arms and face. No legs |
| Talking | Generic looping animations, not driven by audio. Mouth sprites are kept separate so lip sync can be added later |
| Animations in v1 | Idle, Talking, Listening |
| Rendering approach | Lottie-first: one builder produces a Lottie document, and the on-screen preview plays it with lottie-web. There is no separate renderer |
| Sprite format | SVG in, native Lottie shapes out. Parts are found by layer name. Pivots come from the template |
| Drawing apps | The importer handles exports from Figma, Illustrator, Inkscape and Affinity Designer |

### Out of scope for v1

Editing bones or animations in the UI, audio-driven lip sync, more than one
skeleton, automatic left/right mirroring, an "export all" button, extra
animations (wave, thinking, happy), bitmap sprite sheets, and the `.lottie`
(dotLottie) container format.

## 2. Tech stack

- Vite + TypeScript (strict), with plain DOM for the user interface.
- `lottie-web` for the preview player (SVG renderer).
- Vitest for unit tests. The SVG tests use the `jsdom` environment so that
  `DOMParser` is available.
- Playwright with the preinstalled Chromium for browser tests, plus
  `pixelmatch` for image comparison.
- Everything runs in the browser, with no server. `npm run dev` runs the tool
  locally, and `npm run build` produces static files.

## 3. Sprite sheet template

### 3.1 Sheet format

- A single SVG file. The **reference coordinate space** is 1024 × 1024 units.
- **Coordinate system:** the sheet's coordinates come from its `viewBox`. If
  there is no viewBox, they come from numeric `width` and `height` (px or
  unitless), treated as `0 0 width height`.
  - The viewBox must be square: its width and height may differ by at most
    0.1%.
  - The sheet is mapped to reference units by translating by
    (−minX, −minY) and scaling by `1024 / viewBoxWidth`.
- **L and R mean the side of the screen a part appears on** (viewer's left and
  right), not the character's own left and right.

### 3.2 Areas and pivots

`src/sheet/layout.ts` is the single source of truth for these values. All
numbers are in reference units. The pivot is measured from the area's top-left
corner and is the point the part rotates around.

| Part | x | y | w | h | Pivot | Pivot meaning |
|---|---|---|---|---|---|---|
| head | 32 | 32 | 320 | 320 | (160, 300) | base of neck |
| torso | 384 | 32 | 320 | 416 | (160, 416) | bottom centre (root) |
| eyes_open | 736 | 32 | 256 | 96 | (128, 48) | centre |
| eyes_closed | 736 | 160 | 256 | 96 | (128, 48) | centre |
| brows | 736 | 288 | 256 | 64 | (128, 32) | centre |
| mouth_closed | 736 | 384 | 112 | 80 | (56, 40) | centre |
| mouth_half | 880 | 384 | 112 | 80 | (56, 40) | centre |
| mouth_open | 736 | 496 | 112 | 80 | (56, 40) | centre |
| mouth_wide | 880 | 496 | 112 | 80 | (56, 40) | centre |
| upper_arm_L | 32 | 608 | 96 | 192 | (48, 24) | shoulder |
| forearm_L | 160 | 608 | 80 | 176 | (40, 20) | elbow |
| hand_L | 272 | 608 | 112 | 112 | (56, 16) | wrist |
| upper_arm_R | 512 | 608 | 96 | 192 | (48, 24) | shoulder |
| forearm_R | 640 | 608 | 80 | 176 | (40, 20) | elbow |
| hand_R | 752 | 608 | 112 | 112 | (56, 16) | wrist |

Areas are at least 32 units apart, and that gap holds the guides. The strip
below y = 832 holds a short legend.

### 3.3 Generated template

`src/sheet/template.ts` is a pure function that returns the template as SVG
text.

- **Root:** `viewBox="0 0 1024 1024"`, `width="1024"`, `height="1024"`.
- **One group per part:** `<g id="<part>" inkscape:groupmode="layer"
  inkscape:label="<part>">`, so it shows up as a named layer in Inkscape and as
  a named group or layer in the other apps. Each group holds placeholder art
  inside its area, using only supported features (section 6.2):
  - head: skin-tone circle with a subtle radial gradient
  - torso: rounded shirt shape with a neck stub
  - eyes_open: two white ellipses with dark pupils
  - eyes_closed: two curved stroked paths
  - brows: two short dark rounded bars
  - mouth_closed: a stroked line
  - mouth_half: a small dark ellipse
  - mouth_open: a larger ellipse with a tongue
  - mouth_wide: a wide D-shaped path
  - upper arms and forearms: rounded capsules
  - hands: rounded mittens
- **A `guides` group,** placed last so it sits on top, holding:
  - a dashed outline 4 units outside each area's edge
  - the part's name as text above each area
  - pivot tick marks: small triangles outside the top and bottom edges at the
    pivot's x, and outside the left and right edges at the pivot's y
  - a legend in the bottom strip: "Draw each part inside its box, in the layer
    with the same name. Ticks mark pivots. The guides layer is ignored. L/R =
    side of screen."
- "Download template" saves it as `character-rig-template.svg`.
- When the app starts, it passes the template text through the same loader as
  an uploaded file (section 3.5) and uses it as the current sheet. This
  guarantees the template is a working sheet.

### 3.4 Finding parts by layer name (`src/sheet/names.ts`)

- **Candidates:** every `<g>` element anywhere in the document.
- **Names read:** `inkscape:label` (Inkscape), `serif:id` (Affinity),
  `data-name` (Illustrator) and `id` (all apps). A group matches a part if
  **any** of its names, after tidying, equals the part ID.
- **Tidying a name, in order:**
  1. Decode Illustrator's escaped characters (`_x5F_` → `_`, `_x20_` → space;
     in general `_xHH_` → the character with hex code HH).
  2. Trim, lower-case, and replace spaces and hyphens with `_`.
  3. Remove one trailing Illustrator suffix `_<digits>_` (`head_1_` →
     `head`).
  4. Remove one trailing duplicate suffix `_<digits>` (`head_2` → `head`).
     This is safe because no part ID ends in a digit.
  5. Compare with the part IDs, also lower-cased (`upper_arm_l`).
- **The guides layer:** a group whose tidied name is `guides` is skipped
  entirely, with everything inside it.
- **Duplicates:** if more than one group matches the same part, the first in
  document order is used, with a warning.
- **Nesting:** a part group inside another part's group counts as its own part
  and is left out of the outer part.
- **Near misses:** a group whose tidied name is within edit distance 2 of a
  part ID without matching it gets a warning: "Layer 'mouht_open' not
  recognised. Did you mean mouth_open?"
- **Stray artwork:** drawable elements outside every part group and outside
  `guides` are ignored, with one warning giving how many were ignored.

### 3.5 Loading a sheet (`src/sheet/load.ts`)

1. Read the file as text and parse it with `DOMParser` as `image/svg+xml`.
   - A parser error, or a root element that isn't `<svg>`, is an error. The
     previous sheet stays loaded.
2. Work out the coordinate mapping (section 3.1). A missing or non-square
   viewBox is an error, and the previous sheet stays loaded.
3. Find the part groups (section 3.4). If no part matches, show the error "No
   part layers found. Is this based on the template?" The previous sheet stays
   loaded.
4. Convert each part group to Lottie shape items (section 6), in reference
   units.
5. A part whose group is missing, or converts to no shapes, is **empty**: it
   gets a warning and is hidden.
6. If a part's bounding box (worked out from path points and control points)
   extends more than 32 units past its area, warn that it is "drawn outside its
   box". The part is still used.
7. Result:
   ```ts
   type LoadedSheet = {
     name: string;      // file name without extension, lower-cased,
                        // non-[a-z0-9-] replaced by '-'; template = 'template'
     svgText: string;   // original text, used for the thumbnail
     parts: Record<PartId, ShapeItem[] | null>; // null = empty
     warnings: { part?: PartId; message: string }[];
   };
   ```

**Safety:** loaded SVG is only ever parsed into a detached document and read
as data. It is never inserted into the page. Scripts and event handlers are
never run, and external references (`http(s):` hrefs, CSS `@import`,
`url(http…)`) are never fetched. Each one is ignored with a warning.

## 4. Rig

`src/rig/rig.ts`. Coordinates are in composition pixels: 512 × 512, origin at
the top left, y pointing down. Rotation is in degrees, and positive means
clockwise on screen, as in Lottie.

### 4.1 Bones

Each bone's offset is measured from its parent's joint, in the parent's space.
The numbers are starting values that will be adjusted visually during
implementation. Tests check how bones sit relative to each other, not exact
positions.

| Bone | Parent | Bind offset | Bind rotation |
|---|---|---|---|
| root | — | (256, 440) | 0 |
| torso | root | (0, 0) | 0 |
| neck | torso | (0, -200) | 0 |
| head | neck | (0, 0) | 0 |
| brows | head | (0, -115) | 0 |
| shoulder_L | torso | (-72, -180) | +10 |
| elbow_L | shoulder_L | (0, 84) | 0 |
| wrist_L | elbow_L | (0, 76) | 0 |
| shoulder_R | torso | (72, -180) | -10 |
| elbow_R | shoulder_R | (0, 84) | 0 |
| wrist_R | elbow_R | (0, 76) | 0 |

The bind rotations angle both arms slightly outwards. With these values the
head's top is near y = 90 and the hands end near y = 470, so the whole
character fits inside the composition.

### 4.2 Attachments

- Each part sits on one bone, with its pivot on the bone's joint plus an
  optional attach offset.
- Parts are drawn at **50% scale**: 1 reference unit becomes 0.5 composition
  px. A 320-unit head is therefore 160 px across.

| Part(s) | Bone | Attach offset |
|---|---|---|
| torso | torso | (0, 0) |
| head | head | (0, 0) |
| eyes_open, eyes_closed (swap group `eyes`) | head | (0, -85) |
| brows | brows | (0, 0) |
| mouth_closed, mouth_half, mouth_open, mouth_wide (swap group `mouth`) | head | (0, -40) |
| upper_arm_L / forearm_L / hand_L | shoulder_L / elbow_L / wrist_L | (0, 0) |
| upper_arm_R / forearm_R / hand_R | shoulder_R / elbow_R / wrist_R | (0, 0) |

### 4.3 Draw order (back to front)

torso → upper_arm_L → hand_L → forearm_L → upper_arm_R → hand_R → forearm_R →
head → eyes_open → eyes_closed → brows → mouth_closed → mouth_half → mouth_open
→ mouth_wide

### 4.4 Swap groups

| Group | Members | Default |
|---|---|---|
| eyes | eyes_open, eyes_closed | eyes_open |
| mouth | mouth_closed, mouth_half, mouth_open, mouth_wide | mouth_closed |

Exactly one member of each group is visible on every frame.

## 5. Animations

### 5.1 Data model (`src/anim/types.ts`)

```ts
type Vec2 = [number, number];
// Bézier handles in Lottie's form: `o` = out-handle of this key,
// `i` = in-handle of the next key, both in 0..1 space.
type Easing = { o: Vec2; i: Vec2 };
// `ease` applies to the segment that starts at this key.
// Default: ease-in-out { o: [0.33, 0], i: [0.67, 1] }.
type Key<T> = { frame: number; value: T; ease?: Easing };

type BoneTrack = {
  rotation?: Key<number>[]; // degrees, added to the bind rotation
  position?: Key<Vec2>[];   // px, added to the bind offset
  scale?: Key<Vec2>[];      // percent, 100 = unchanged
};
type SwapKey = { frame: number; sprite: PartId }; // holds until the next key

type Animation = {
  id: 'idle' | 'talking' | 'listening';
  label: string;
  frames: number; // at 30 fps
  bones: Partial<Record<BoneId, BoneTrack>>;
  swaps: { eyes: SwapKey[]; mouth: SwapKey[] };
};
```

**Loop rule:** every track has a key at frame 0 and a key at frame `frames`
with the same value. Every swap track has a key at frame 0.

### 5.2 Built-in animations

| Animation | Frames (s) | Motion |
|---|---|---|
| Idle (`idle.ts`) | 120 (4 s) | Torso breathing (scale y 100 → 101.5 → 100). Head sways ±2°. One blink (eyes_closed for 4 frames around frame 70). Arms sway ±2° out of phase. Mouth closed |
| Talking (`talking.ts`) | 60 (2 s) | Irregular mouth sequence through closed, half, open and wide, changing every 3–5 frames. Head bobs (position y ±3) and tilts (±4°). Brows lift (position y −6) on two emphasis beats. R-arm gesture: the forearm swings up and inwards (elbow_R +25°) and the wrist tilts (wrist_R −10°), then both return |
| Listening (`listening.ts`) | 90 (3 s) | Mouth closed. One slow nod (head rotation 0 → 6° → 0 over about 30 frames, plus position y +4). One blink. Torso leans forward slightly (rotation 0 → 1.5° → 0) |

## 6. SVG → Lottie converter (`src/svg/`)

```ts
convertPart(group: Element, ctx: ConvertContext): { shapes: ShapeItem[]; warnings: string[] }
```

`ctx` holds the document (for resolving `href`s), the parsed stylesheet and
the sheet-to-reference transform. The output is Lottie shape items, with every
coordinate already in reference units.

### 6.1 Pipeline

1. **Styles (`style.ts`):** each element's computed value for every supported
   property (section 6.2), using CSS precedence:
   1. inline `style`
   2. `<style>` rules, by specificity, with later rules winning ties
   3. presentation attributes
   4. the value inherited from the parent
   5. the SVG initial value

   Supported selectors are `tag`, `.class`, `#id`, `tag.class` and
   comma-separated lists of these. Rules using other selectors are skipped
   with one warning.
2. **Geometry (`geometry.ts`):**
   - Each drawable element becomes one or more cubic Bézier subpaths.
   - The element's full transform (ancestor transforms × own `transform` ×
     sheet-to-reference transform) is **applied to every vertex and tangent**.
     Affine transforms keep cubic curves exact.
   - Arcs become cubic curves, using at most 90° per segment. Quadratic curves
     become cubic.
3. **Paint (`paint.ts`):** works out each fill and stroke as a solid colour or
   a gradient, applying the same transform to gradient geometry.
4. **Emit (`convert.ts`):** each drawable element becomes one Lottie group
   (`ty: "gr"`):
   - one `sh` item per subpath
   - then the stroke (`st` or `gs`), then the fill (`fl` or `gf`)
   - then an identity `tr`
   - The order of items is chosen so the stroke draws above the fill, as in
     SVG. The visual-match test (section 10.3) confirms it.
   - Elements are listed in reverse document order, because Lottie draws its
     first item on top.
   - SVG `<g>` hierarchy is flattened. Group opacity is multiplied into each
     descendant's fill and stroke opacity.

### 6.2 Supported features

| SVG | Lottie |
|---|---|
| `path` (M, L, H, V, C, S, Q, T, A, Z; absolute and relative) | `sh` paths (closed flag from Z) |
| `rect` (including `rx`/`ry`), `circle`, `ellipse`, `line`, `polyline`, `polygon` | `sh` paths (circles and ellipses as 4 cubic curves) |
| `fill-rule` (nonzero, evenodd) | `fl.r` 1 or 2 |
| `fill`, `stroke`: `none`, `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` (numbers or %), CSS named colours, `transparent`, `currentColor` (from `color`, default black) | `fl` / `st` colour |
| `fill-opacity`, `stroke-opacity`, `opacity` | Multiplied into the fill and stroke `o` |
| `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit` | `st.w`, `lc`, `lj`, `ml` |
| `stroke-dasharray`, `stroke-dashoffset` | `st.d` dash, gap and offset entries |
| `linearGradient`, `radialGradient` (stops with `stop-color`/`stop-opacity`, `gradientUnits` both modes, `gradientTransform`, `fx`/`fy`, `href`/`xlink:href` inheritance of stops and attributes) | `gf` / `gs` (type 1 or 2, colour and opacity stops, highlight length and angle from the focal point) |
| `transform` attribute: matrix, translate, scale, rotate (with centre), skewX, skewY | Applied to the points |
| `<use>` (`href`/`xlink:href` to any element or `<symbol>`, with `x`/`y`; a symbol's `viewBox` mapped to the use's `width`/`height`) | Expanded inline. Expansion stops at a depth of 10 to break cycles |
| `display="none"`, `visibility="hidden"` | Element skipped |
| Lengths that are unitless or in `px` | Used as-is |

Silently ignored: `title`, `desc`, `metadata`, `sodipodi:namedview` and editor
namespace attributes. `defs` content is only used as the target of
references.

### 6.3 Approximations

- **Group opacity:** each child is faded separately rather than as a whole
  group, so overlapping shapes in a half-transparent group look slightly
  different.
- **Strokes under non-uniform scale or skew:** width = original width ×
  √|det(transform)|.
- **Gradients under non-uniform scale or skew:**
  - Linear gradients keep their transformed start and end points, but the
    gradient lines stay perpendicular to the direction between them.
  - Radial gradients use the average of the transformed radii. Lottie can't
    make elliptical radial gradients.
- **`spreadMethod`:** only `pad` is supported. `reflect` and `repeat` fall back
  to `pad`, with a warning.

### 6.4 Unsupported (skipped, with a warning naming the part and feature)

`clip-path` inside a part group (ignored: the content draws unclipped),
`mask`, `filter`, pattern
fills (`url(#pattern)` falls back to no paint), `<image>`, `<text>` (convert
text to outlines in the drawing app first), `<foreignObject>`, `<script>`,
lengths in units other than px (`em`, `%`, `mm` and so on), CSS `transform`
properties, and `vector-effect`.

A `clip-path` on an element outside every part group is ignored without a
warning. That is almost always the frame clip that Figma and other apps wrap
around the whole drawing.

## 7. Lottie build

`src/lottie/build.ts`:

```ts
buildLottie(sheet: LoadedSheet, anim: Animation, opts: { debug: boolean }): LottieDoc
```

The preview (`debug` true or false, following the Show bones toggle) and the
export (`debug` always false) both call this one pure function. It only
assembles layers; SVG conversion has already happened once, when the sheet was
loaded.

### 7.1 Document

- `v: "5.7.0"`, `fr: 30`, `ip: 0`, `op: anim.frames`, `w: 512`, `h: 512`.
- `assets: []`. No background layer, so the background is transparent.

### 7.2 Layers

- **Bones become null layers** (`ty: 3`), one per bone, with a unique `ind`.
  `parent` is the parent bone's `ind`, and the root has no parent. Their `ks`
  (transform) values:
  - anchor `a`: [0, 0]
  - position `p`: bind offset + position track
  - rotation `r`: bind rotation + rotation track
  - scale `s`: scale track, or a fixed [100, 100]
  - Animated properties use keyframes with `i`/`o` taken from the easing.
  - Properties without a track are fixed values.
- **Parts become shape layers** (`ty: 4`), one per non-empty part:
  - `shapes`: the converted items
  - `parent`: the `ind` of the part's bone null
  - anchor `a`: area origin + pivot, in reference units (the shapes are
    already in reference units)
  - position `p`: the attach offset
  - scale `s`: [50, 50]
- **Swap group members** get opacity keyframes with hold (`h: 1`) that switch
  between 0 and 100. They are worked out from the swap track, so exactly one
  member is visible at a time.
- **Debug layers** are only added when `debug` is true. They are shape layers
  attached to each bone null: a 6 px circle at the joint, and a line from the
  joint to each child bone's bind offset. Lines follow the bone's rotation;
  they don't follow a child's animated position offset.
- **Layer array order** (Lottie draws the first entry in front): debug layers
  first, then part layers from front to back (section 4.3 reversed), then the
  null layers, which are invisible.
- Every layer has `ip: 0`, `op: anim.frames`, `st: 0`, `sr: 1`.

### 7.3 Empty parts

Empty parts get no layer. Their bones are still built, because other bones may
depend on them.

### 7.4 Compatibility rules

Only null and shape layers are used, with parenting, transform keyframes and
opacity hold keyframes. Inside shape layers, only `gr`, `sh`, `fl`, `st`, `gf`,
`gs` and `tr` items are used. There are no expressions, masks, mattes,
effects, images, text layers or time remapping.

## 8. User interface

`src/ui/app.ts` builds a single page.

- **Toolbar:**
  - Load sprite sheet (file input accepting `.svg`; an SVG file can also be
    dropped anywhere on the page)
  - Download template
  - Animation picker: Idle, Talking, Listening
  - Play/pause
  - Frame slider and "frame N / total" readout
  - Show bones toggle
  - Export Lottie
- **Main view:** a lottie-web player (SVG renderer, looping) on a checkerboard
  background.
  - Changing the sheet, animation or bones toggle rebuilds the document and
    reloads the player.
  - Dragging the slider pauses playback and jumps to that frame.
- **Side panel:**
  - The sheet thumbnail, drawn by an `<img>` whose source is a blob URL of the
    SVG text. Images loaded this way can't run scripts.
  - A generated overlay outlining each area.
  - The sheet name.
  - Errors, and warnings grouped by part.
- **Export:** builds with `debug: false` and downloads
  `<sheet-name>-<animation-id>.json`.

## 9. Error handling

| Situation | Behaviour |
|---|---|
| Not valid XML or SVG | Error with the parser's message. The previous sheet stays loaded |
| No usable viewBox, or not square | Error giving the actual size. The previous sheet stays loaded |
| No part layers recognised | Error: "No part layers found. Is this based on the template?" The previous sheet stays loaded |
| Missing or empty part | Warning. That part is hidden |
| Duplicate part layer | Warning. The first one is used |
| Layer name close to a part name | Warning with a "did you mean" suggestion |
| Artwork outside every part layer | One warning giving how many elements were ignored |
| Unsupported feature or CSS selector | Warning per part. The feature is skipped |
| Part drawn more than 32 units outside its box | Warning. The part is still used |
| External reference | Ignored, with a warning |
| lottie-web fails to load the document | Error in the side panel. The toolbar stays usable |

## 10. Testing

### 10.1 Unit tests (Vitest)

These run in Node. The SVG tests use the `jsdom` environment.

- **Layout**
  - Every area is inside 1024 × 1024.
  - No two areas overlap, and they are at least 32 units apart.
  - Every pivot lies inside its area.
  - Every part the rig uses has an area.
- **Rig**
  - Every parent exists and the bone tree has no loops.
  - Every attachment points to a real bone and part.
  - Draw order lists every part exactly once.
- **Animations**, for each built-in animation:
  - tracks point to real bones
  - keys are in increasing frame order, within 0..frames
  - the loop rule (section 5.1) holds
  - swap sprites belong to their group
- **Template**
  - The output parses as SVG.
  - It contains one group per part with the exact part ID, plus `guides`.
  - Loading it gives no errors and no warnings.
  - Every part converts to at least one shape.
  - Every part's bounding box lies inside its area.
- **Names:** a table of variants checks that each maps to the right part:
  - `head`, `Head`, `HEAD`, `head_1_`, `head_2`
  - `upper_x5F_arm_x5F_L`, `upper arm L`, `upper-arm-L`
  - `data-name`, `inkscape:label` and `serif:id` attributes
  - near misses get "did you mean", and `guides` is skipped
  - duplicates and nested part groups are handled as in section 3.4
- **Styles:**
  - precedence (inline over `<style>` over attributes over inherited values)
  - specificity and later-rule ties
  - unsupported selectors produce a warning
- **Geometry**
  - Each element type gives the expected vertices.
  - Every path command works in both absolute and relative form.
  - Arcs: points sampled along the converted curves are within 0.5 units of
    the true ellipse, including the large-arc and sweep flags.
  - Every transform function works, alone and nested.
  - `<use>` and `<symbol>` expand, and cycles are stopped.
- **Paint**
  - Every colour format, and opacity multiplication.
  - Gradient stop arrays in Lottie's layout (colour stops, then opacity stops).
  - `objectBoundingBox` gradients map correctly.
  - `href` inheritance works.
  - The focal point maps to highlight length and angle.
- **Unsupported features:** each item in section 6.4 produces its warning and
  its content is skipped.
- **Safety:** scripts, event handlers and external hrefs are never executed or
  fetched, and they produce warnings.
- **Lottie build:**
  - every `parent` resolves
  - `ind` values are unique
  - `assets` is empty
  - there is one shape layer per non-empty part
  - exactly one member of each swap group is visible on every frame from 0 to
    `frames` − 1
  - debug layers are present only when `debug` is true
  - only the item and layer types listed in section 7.4 are used
- **Pose sanity:** a test helper works out each bone's world position at frame
  0 by chaining parent transforms through the built document. It checks:
  - wrists are below elbows, and elbows are below shoulders
  - the L shoulder is left of the R shoulder
  - the head joint is above the torso root
  - every joint is inside 512 × 512

### 10.2 Test SVG files (`tests/fixtures/`)

Hand-written files that copy each app's export style. They are used by the
unit tests and the visual-match test.

| File | Copies |
|---|---|
| `figma.svg` | Ids as layer names, `_2` duplicates, a `clip-path` wrapper group, `fill-rule="evenodd"` |
| `illustrator.svg` | `<style>` with `.cls-N` classes, `_1_` and `_x5F_` ids, `data-name`, `xlink:href` gradients |
| `inkscape.svg` | `inkscape:label` layers with auto ids (`g123`), nested `transform`s, `sodipodi:namedview`, inline `style` |
| `affinity.svg` | `serif:id`, nested groups with matrix transforms |
| `features.svg` | Every feature in section 6.2 at least once |
| `unsupported.svg` | Every item in section 6.4, plus `<script>` and `onload` |

Real exports from the artists' drawing app will be added as fixtures when
available.

### 10.3 Browser tests (Playwright, Chromium)

- **App:**
  - The app loads with the template, and the preview contains an SVG with
    paths.
  - Download template gives SVG text that loads back in without warnings.
  - Export gives JSON that loads into lottie-web on a fresh page without
    errors.
  - Loading a non-square SVG shows the error and keeps the previous sheet.
- **Visual match (`fidelity.spec.ts`):** for every part of the template and of
  the `figma`, `illustrator`, `inkscape`, `affinity` and `features` fixtures, a
  test-only page shows two things side by side at the same size:
  - (a) the source SVG cut down to that part's group, with `<defs>` and
    `<style>` kept and the viewBox set to the part's area
  - (b) a static Lottie document whose composition is the size of the part's
    area, holding only that part's shape layer (anchor at the area's top-left
    corner, position (0, 0), scale 100%), rendered by lottie-web

  Playwright screenshots both and compares them with `pixelmatch` (threshold
  0.1). The test fails if more than 1% of pixels differ. Parts that use
  approximated features (section 6.3) may have a looser limit, set for each
  file in the test.
- **Safety:** loading `unsupported.svg` leaves a global flag untouched. Its
  `<script>` and `onload` both try to set that flag.

## 11. Project layout

```
character-rig/
  index.html
  package.json, tsconfig.json, vite.config.ts, vitest.config.ts, playwright.config.ts
  src/
    main.ts
    sheet/   layout.ts, template.ts, names.ts, load.ts
    svg/     parse.ts, style.ts, geometry.ts, paint.ts, convert.ts, colors.ts
    rig/     rig.ts
    anim/    types.ts, idle.ts, talking.ts, listening.ts
    lottie/  types.ts, build.ts
    ui/      app.ts, styles.css
  tests/
    unit/      layout, rig, anim, template, names, build, pose tests
    unit/svg/  style, geometry, paint, convert, unsupported, safety tests
    fixtures/  figma.svg, illustrator.svg, inkscape.svg, affinity.svg,
               features.svg, unsupported.svg
    e2e/       app.spec.ts, fidelity.spec.ts, fidelity.html
  docs/superpowers/specs/2026-11-10-character-rig-design.md
```
