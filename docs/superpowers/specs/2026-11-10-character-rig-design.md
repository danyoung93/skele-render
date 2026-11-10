# Character Rig — Design Spec

Date: 2026-11-10
Status: Draft for review

## 1. Purpose

A browser tool that animates a talking-head character for an app's "who is
currently speaking" indicator. The tool ships with a fixed bone rig and a fixed
set of looping animations. Artists supply a **sprite sheet** that follows a
fixed template layout; the tool attaches each sprite to its bone, plays the
animation on screen, and exports it as a **Lottie** JSON file that the app plays
with a standard Lottie player (lottie-web, lottie-ios, lottie-android).

The tool also generates a **template sprite sheet** that shows where every part
goes. The template is itself a valid sheet with placeholder art, so it animates
straight away.

### Success criteria

- Loading the generated template, or any sheet that follows the layout, shows
  the character animating with no further setup.
- Idle, Talking and Listening each loop seamlessly.
- An exported file plays in lottie-web and looks the same as the in-tool
  preview.
- Exported files use only basic Lottie features (section 5.4), so they play in
  lottie-ios and lottie-android too.

### Decisions made during brainstorming

| Topic | Decision |
|---|---|
| Who builds the rig and animations | Built into the tool. Fixed in code; not editable in the UI in v1 |
| Character type | Front-facing / three-quarter mascot: torso, arms and face. No legs |
| Talking | Generic looping animations, not driven by audio. Mouth sprites are kept separate so lip sync can be added later |
| Animations in v1 | Idle, Talking, Listening |
| Rendering approach | Lottie-first: one builder produces a Lottie document, and the on-screen preview plays it with lottie-web. There is no separate renderer |

### Out of scope for v1

Editing bones or animations in the UI, audio-driven lip sync, more than one
skeleton, automatic left/right mirroring, an "export all" button, extra
animations (wave, thinking, happy), trimming transparent space from sprites,
and the `.lottie` (dotLottie) container format.

## 2. Tech stack

- Vite + TypeScript (strict), with plain DOM for the user interface.
- `lottie-web` for the preview player (SVG renderer).
- Vitest for unit tests.
- Playwright with the preinstalled Chromium for browser tests.
- Everything runs in the browser, with no server. `npm run dev` runs the tool
  locally, and `npm run build` produces static files.

## 3. Sprite sheet template

### 3.1 Sheet format

- The reference size is **1024 × 1024 px**. Any square sheet is accepted (for
  example 2048 × 2048). Its areas scale by `k = width / 1024`, rounded to whole
  pixels.
- PNG with transparency is expected. JPEG and WebP decode too, but JPEG has no
  transparency.
- **L and R mean the side of the screen a part appears on** (viewer's left and
  right), not the character's own left and right. This keeps the template easy
  to read: a part drawn on the left of the sheet appears on the left of the
  character.

### 3.2 Areas and pivots

`src/sheet/layout.ts` is the single source of truth for these values. All
numbers are in reference-sheet pixels. The pivot is measured from the area's
top-left corner and is the point the sprite rotates around.

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

Areas are at least 32 px apart, and that gap is used for guides. The strip
below y = 832 holds a short legend.

### 3.3 Generated template

`src/sheet/template.ts` draws the template on a 1024 × 1024 canvas.

- **Inside each area: placeholder art only.**
  - head: skin-tone circle
  - torso: rounded shirt shape with a neck stub
  - eyes_open: two white ovals with pupils
  - eyes_closed: two curved lines
  - brows: two short dark bars
  - mouth_closed: a line
  - mouth_half: a small dark oval
  - mouth_open: a larger oval with a tongue
  - mouth_wide: a wide D shape
  - upper arms and forearms: rounded capsules
  - hands: rounded mittens
- **In the gaps only:**
  - an outline 4 px outside each area's edge
  - the part's name above the area
  - pivot tick marks: small triangles outside the top and bottom edges at the
    pivot's x, and outside the left and right edges at the pivot's y
  - a legend in the bottom strip: "Draw inside the boxes. Ticks mark pivots.
    Leave the gaps alone. L/R = side of screen."
- "Download template" saves it as `character-rig-template.png`.
- When the app starts, it passes the generated template through the same
  loader as an uploaded file (section 3.4) and uses it as the current sheet.
  This guarantees the template is a working sheet.

### 3.4 Loading a sheet

`src/sheet/load.ts`:

1. Decode the file with `createImageBitmap`. If decoding fails, show an error
   and keep the previous sheet.
2. If width ≠ height, show the error "Sheet must be square (e.g. 1024 × 1024);
   got W × H" and keep the previous sheet.
3. If width < 1024, accept the sheet but show the warning "Sheet is smaller
   than 1024 × 1024 and may look blurry".
4. Cut each scaled area into its own canvas and encode it as a PNG data URI.
5. If every pixel in an area is fully transparent, mark that part empty. Its
   layer is left out of the build, and the side panel lists it as a warning.
6. Result: `{ name, size, sprites: Record<PartId, { dataUri, w, h } | null>,
   warnings }`. `name` is the file name without its extension, lower-cased, with
   anything other than `[a-z0-9-]` replaced by `-`. The template's name is `template`.

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
character fits inside the 512 × 512 composition.

### 4.2 Attachments

- Each sprite sits on one bone, with its pivot on the bone's joint plus an
  optional attach offset.
- Sprites are drawn at `scale = 0.5 × (1024 / sheetWidth)`. At reference size,
  a 320 px head therefore appears 160 px across in the composition.

| Sprite(s) | Bone | Attach offset |
|---|---|---|
| torso | torso | (0, 0) |
| head | head | (0, 0) |
| eyes_open, eyes_closed (swap group `eyes`) | head | (0, -85) |
| brows | brows | (0, 0) |
| mouth_closed, mouth_half, mouth_open, mouth_wide (swap group `mouth`) | head | (0, -40) |
| upper_arm_L / forearm_L / hand_L | shoulder_L / elbow_L / wrist_L | (0, 0) |
| upper_arm_R / forearm_R / hand_R | shoulder_R / elbow_R / wrist_R | (0, 0) |

### 4.3 Draw order (back to front)

torso → upper_arm_L → forearm_L → hand_L → upper_arm_R → forearm_R → hand_R →
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

## 6. Lottie build

`src/lottie/build.ts`:

```ts
buildLottie(sheet: LoadedSheet, anim: Animation, opts: { debug: boolean }): LottieDoc
```

The preview (`debug` true or false, following the Show bones toggle) and the
export (`debug` always false) both call this one pure function.

### 6.1 Document

- `v: "5.7.0"`, `fr: 30`, `ip: 0`, `op: anim.frames`, `w: 512`, `h: 512`.
- No background layer, so the background is transparent.
- **Assets:** one image asset per non-empty sprite: `{ id, w, h, u: "", p:
  dataUri, e: 1 }`. Images are embedded at the sheet's full resolution.

### 6.2 Layers

- **Bones become null layers** (`ty: 3`), one per bone, with a unique `ind`.
  `parent` is the parent bone's `ind`, and the root has no parent. Their `ks`
  (transform) values:
  - anchor `a`: [0, 0]
  - position `p`: bind offset + position track
  - rotation `r`: bind rotation + rotation track
  - scale `s`: scale track, or a fixed [100, 100]
  - Animated properties use keyframes with `i`/`o` taken from the easing.
  - Properties without a track are fixed values.
- **Sprites become image layers** (`ty: 2`), one per non-empty sprite:
  - `refId`: the sprite's asset
  - `parent`: the `ind` of the sprite's bone null
  - anchor `a`: the sprite's pivot in asset pixels
  - position `p`: the attach offset
  - scale `s`: the sprite scale from section 4.2, as a percentage
- **Swap group members** get opacity keyframes with hold (`h: 1`) that switch
  between 0 and 100. They are worked out from the swap track, so exactly one
  member is visible at a time.
- **Debug layers** are only added when `debug` is true. They are shape layers
  (`ty: 4`) attached to each bone null: a 6 px circle at the joint, and a line
  from the joint to each child bone's bind offset. Lines follow the bone's
  rotation; they don't follow a child's animated position offset.
- **Layer array order** (Lottie draws the first entry in front): debug layers
  first, then image layers from front to back (section 4.3 reversed), then the
  null layers, which are invisible.
- Every layer has `ip: 0`, `op: anim.frames`, `st: 0`, `sr: 1`.

### 6.3 Empty parts

Empty sprites have no asset and no layer. Their bones are still built, because
other bones may depend on them.

### 6.4 Compatibility rules

Only null, image and shape layers are used, with parenting, transform
keyframes and opacity hold keyframes. There are no expressions, masks, mattes,
effects, text layers or time remapping.

## 7. User interface

`src/ui/app.ts` builds a single page.

- **Toolbar:**
  - Load sprite sheet (file input; a file can also be dropped anywhere on the
    page)
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
- **Side panel:** a thumbnail of the current sheet with areas outlined, the
  sheet name and size, and a list of warnings and errors.
- **Export:** builds with `debug: false` and downloads
  `<sheet-name>-<animation-id>.json`.

## 8. Error handling

| Situation | Behaviour |
|---|---|
| File is not an image, or can't be decoded | Error message. The previous sheet stays loaded |
| Sheet is not square | Error naming the expected and actual size. The previous sheet stays loaded |
| Sheet is smaller than 1024 px | Warning. The sheet is used |
| One or more areas are empty | Warning listing the parts. Playback and export still work without them |
| lottie-web throws while loading a document | Error message in the side panel. The toolbar stays usable |

## 9. Testing

### 9.1 Unit tests (Vitest, Node)

- **Layout**
  - Every area is inside the 1024 × 1024 sheet.
  - No two areas overlap, and they are at least 32 px apart.
  - Every pivot lies inside its area.
  - Every sprite the rig uses has an area.
  - Scaling an area by `k` gives the expected integers.
- **Rig**
  - Every parent exists and the bone tree has no loops.
  - Every attachment points to a real bone and sprite.
  - Draw order lists every sprite exactly once.
- **Animations**, for each built-in animation:
  - tracks point to real bones
  - keys are in increasing frame order, within 0..frames
  - the loop rule (section 5.1) holds
  - swap sprites belong to their group
- **Lottie build:**
  - every `parent` and `refId` resolves
  - `ind` values are unique
  - exactly one member of each swap group is visible on every frame from 0 to
    `frames` − 1
  - debug layers are present only when `debug` is true
  - empty sprites produce no asset or layer
  - The tests use a stub sheet whose sprites are fixed data URIs.
- **Pose sanity:** a small test helper works out each bone's world position
  from the built document at frame 0 by chaining parent transforms. It checks:
  - wrists are below elbows, and elbows are below shoulders
  - the L shoulder is left of the R shoulder
  - the head joint is above the torso root
  - every joint is inside the 512 × 512 composition

### 9.2 Browser tests (Playwright, Chromium)

- The app loads with the template sheet, and the preview contains an SVG with
  image elements.
- Download template produces a 1024 × 1024 PNG. Loading that PNG back in
  completes without errors or empty-part warnings.
- Export produces JSON. Loading that JSON into lottie-web in a fresh page
  renders without errors.
- Loading a non-square image shows the error and keeps the previous sheet.
- Cutting up the sheet (`load.ts`) is covered here, because it needs a real
  canvas.

## 10. Project layout

```
character-rig/
  index.html
  package.json, tsconfig.json, vite.config.ts, playwright.config.ts
  src/
    main.ts
    sheet/   layout.ts, template.ts, load.ts
    rig/     rig.ts
    anim/    types.ts, idle.ts, talking.ts, listening.ts
    lottie/  types.ts, build.ts
    ui/      app.ts, styles.css
  tests/
    unit/    layout.test.ts, rig.test.ts, anim.test.ts, build.test.ts, pose.test.ts
    e2e/     app.spec.ts
  docs/superpowers/specs/2026-11-10-character-rig-design.md
```
