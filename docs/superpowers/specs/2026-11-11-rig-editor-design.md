# Rig Editor — Design Spec

Date: 2026-11-11
Status: Draft for review
Builds on: `2026-11-10-character-rig-design.md` (the "rig spec") and
`2026-11-11-sheet-editor-design.md` (the "sheet editor spec")

## 1. Purpose

The skeleton is currently fixed in code, so a character whose proportions
differ from the default (for example a big head and short, chunky arms) never
lines up with its bones. This feature makes the skeleton a **separate,
editable rig file**. The tool becomes a composer: a **sprite sheet** (artwork)
plus a **rig** (skeleton) makes an animated character.

- **Reuse:** one rig can drive many sheets, and one sheet can be tried against
  different rigs.
- **Clean artwork:** sheet SVGs stay pure artwork, with no rig data inside.
- **Editing:** a new **Edit rig** mode shows the user's reference design
  behind the assembled character, and the user drags the joints onto the
  design.

### Success criteria

- Using the default rig, every existing sheet looks and animates exactly as
  before. The exported Lottie is unchanged.
- In Edit rig, dragging a joint immediately changes the assembled character,
  and the change carries through to the live previews and the Lottie export.
- In an exported Lottie, every joint at frame 0 sits exactly where the rig
  puts it.
- A rig saved to a file and loaded again is identical.
- A reload loses neither the rig nor the rig view's reference placement.

### Decisions made during brainstorming

| Topic | Decision |
|---|---|
| What is editable | Joint positions on the assembled character. Pivot points inside sheet boxes stay fixed (possible later work) |
| Where the rig lives | A separate `.rig.json` file. It's never written into the sheet SVG |
| Why separate | Both reuse (one rig, many sheets) and clean artwork files |
| How joints are edited | An Edit rig mode: drag joints over a faded reference design. No number fields |
| Architecture | The rig is a complete data object passed through the tool. Rig files store every joint in full, not differences from the default |

### Out of scope

Editing pivot points in sheet boxes, adding or removing bones, per-rig
animations, number fields for joints, detecting whether a sheet "fits" a rig,
and putting the rig inside the exported file name.

## 2. Rig file and data (`src/rig/rig-file.ts`)

### 2.1 File format

```json
{
  "format": "character-rig/rig",
  "version": 1,
  "name": "bearded-worker",
  "joints": {
    "root": [256, 440], "neck": [256, 240],
    "brows": [256, 132], "eyes": [256, 155], "mouth": [256, 200],
    "shoulder_L": [184, 260], "elbow_L": [169.414, 342.724], "wrist_L": [156.217, 417.569],
    "shoulder_R": [328, 260], "elbow_R": [342.586, 342.724], "wrist_R": [355.783, 417.569]
  }
}
```

- Positions are in **character space**: 512 × 512 px, origin at the top left,
  y pointing down. This is the Lottie composition's space.
- **`JOINT_IDS`**, in this order:
  - root, neck
  - shoulder_L, elbow_L, wrist_L, shoulder_R, elbow_R, wrist_R
  - brows, eyes, mouth
- Numbers are written rounded to 3 decimal places. The file is written with
  2-space indentation and named `<name>.rig.json`.
- **`name`:** lower-case `[a-z0-9-]`, as for sheet names. The default rig's
  name is `default`.

```ts
type JointId = 'root' | 'neck' | 'shoulder_L' | 'elbow_L' | 'wrist_L'
  | 'shoulder_R' | 'elbow_R' | 'wrist_R' | 'brows' | 'eyes' | 'mouth';
interface Rig { name: string; joints: Record<JointId, Vec2> }
```

### 2.2 Rig → skeleton (`rigToSkeleton(rig): { bones: Bone[]; attach: Record<PartId, { bone; offset }>; warnings: string[] }`)

The bone tree and the part-to-bone mapping are unchanged (rig spec §4). Only
each bone's offset and rest rotation come from the rig.

**World rest angles.** These are clockwise degrees, with 0 meaning "pointing
straight down".

| Bone | World rest angle |
|---|---|
| root, torso, neck, head, brows | 0 |
| shoulder_X (upper arm) | `angleDown(elbow_X − shoulder_X)` |
| elbow_X (forearm) | `angleDown(wrist_X − elbow_X)` |
| wrist_X (hand) | Same as elbow_X: the hand continues the forearm |

- **`angleDown(v)`** is `atan2(−v.x, v.y)` in degrees. If `|v| < 0.001`, it is
  0 and a warning is added: "<joint> is on top of <child>; that arm segment
  points straight down".
- **Local rotation** = the bone's world angle − its parent's world angle.
- **Local offset** = `rotate(joint − parentJoint, −parentWorldAngle)`.
  - Joint positions per bone: root and torso use `root`; neck and head use
    `neck`; brows uses `brows`; and shoulder, elbow and wrist bones use their
    joints.

**Face attachments:**
- `eyes_open` / `eyes_closed`: attached to the head with offset
  `eyes − neck`.
- `mouth_*`: attached to the head with offset `mouth − neck`.
- All other attachments keep offset (0, 0).

**`DEFAULT_RIG`** is today's skeleton expressed as positions (the example
above). `rigToSkeleton(DEFAULT_RIG)` must reproduce today's `BONES` and
`ATTACH` within 1e-9.

**Bounds warnings:** any joint outside 0..512 on either axis adds "<joint> is
outside the 512 × 512 character area".

### 2.3 Parsing

`parseRig(text): { rig: Rig; warnings: string[] }`. It throws `RigError` with
one of these messages:

- "Not a rig file (not valid JSON)"
- "Not a rig file (format should be character-rig/rig)"
- "Unsupported rig version N"
- "Rig is missing joint <id>"
- "Joint <id> must be two finite numbers"

Unknown fields are ignored. A missing or invalid `name` becomes `rig`.

`serializeRig(rig): string` writes the format in §2.1.

`validateRig(x: unknown): Rig | null` is used for autosave restores.

### 2.4 Code changes

- **`buildLottie`:** `buildLottie(sheet, anim, opts: { debug: boolean; rig?: Rig })`
  uses `rigToSkeleton(opts.rig ?? DEFAULT_RIG)` for bone offsets, bone
  rotations, attachment offsets and debug bone lines, instead of the `BONES`
  and `ATTACH` constants. Layer `ind` values and order are unchanged.
- **`BONES` / `ATTACH`:** they stay exported as the default skeleton
  (`rigToSkeleton(DEFAULT_RIG)`). Existing tests keep passing.
- **Pose helper:** `restPose(rig): { bone: Record<BoneId, Mat>; part: Record<PartId, Mat> }`
  in `src/rig/pose.ts` gives the world matrices at rest. The Edit rig canvas
  uses it.
  - The bone matrix is the chain of `translate(offset) · rotate(rotation)`.
  - The part matrix is
    `bone · translate(attachOffset) · scale(0.5) · translate(−(areaOrigin + pivot))`.

## 3. Edit rig mode

### 3.1 Layout

- **Mode switch:** the top bar becomes **Animate | Edit sheet | Edit rig**.
- **Canvas:** the 512 × 512 character space, with the same pan and zoom
  behaviour as Edit sheet (space-drag, middle-drag, two-finger drag, wheel,
  and + / − / Fit). Layers, bottom to top:
  1. **Reference image:** the same decoded image as Edit sheet (loading an
     image in either mode replaces it for both), with its **own placement**
     `{x, y, scale, opacity, locked}` in character space.
  2. **Assembled character at rest:** each part's shapes are drawn as SVG
     with `restPose(rig).part[part]` as the transform. It's rendered by
     `src/lottie/to-svg.ts` (`shapeItemsToSvg(items, idPrefix)`), which
     supports `sh`, `fl`, `st`, `gf`, `gs` and dashes, so gradients look as
     in the preview.
     - Draw order follows rig spec §4.3.
     - Swap groups show their default member (eyes_open, mouth_closed).
     - A **Character opacity** slider (0–100%, default 80%) applies to this
       layer.
  3. **Bones:**
     - **lines:** root→neck, neck→brows, root→shoulder_X, shoulder_X→elbow_X
       and elbow_X→wrist_X
     - **joints:** a 6 px circle on each skeleton joint
     - **face anchors:** a 7 px diamond for brows, eyes and mouth
     - Each marker carries `data-joint="<id>"` and a `<title>` with its name.
       The selected joint is filled.
- **Panel (right):**
  - **Rig:** name field (`rig-name`), **Load rig** (`rig-load`, accepts
    `.json`), **Download rig** (`rig-download`), **Reset to default**
    (`rig-reset`, which asks first and can be undone).
  - **Selected joint:** its name and position, read-only (`joint-readout`).
  - **Reference:** Load image, opacity, Move reference, Lock, Reset. These
    use the same controls and behaviour as sheet editor spec §2.3, but drive
    this mode's placement.
  - **Character opacity** slider (`char-opacity`).
  - **Live preview:** the current sheet animated with the current rig, with an
    Idle / Talking / Listening picker.
  - **Warnings:** the rig's warnings (`rig-warnings`).

### 3.2 Interaction

- **Clicking a joint** selects it. Clicking empty canvas clears the selection.
- **Dragging a joint** moves it and its dependents by the same amount:

  | Joint | Also moves |
  |---|---|
  | root | Every other joint |
  | neck | brows, eyes, mouth |
  | shoulder_X | elbow_X, wrist_X |
  | elbow_X | wrist_X |
  | wrist_X, brows, eyes, mouth | Nothing |

  **Alt+drag** moves only the dragged joint.
- The canvas, the arms' angles and the live preview update during the drag.
  The preview rebuild is throttled to 200 ms.
- **Arrow keys** nudge the selected joint by 1 px (10 with Shift), with the
  same dependents rule (Alt+arrow moves only that joint).
- **Undo and redo** (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y) cover joint moves,
  rig name changes, Reset, Load and reference placement changes.
  - One drag (or one wheel burst) is one step. Escape or undo during a drag
    reverts it.
  - History is capped at 200 steps and is separate from Edit sheet's.
- Shortcuts are ignored while typing in text fields, as in Edit sheet.
- **Move reference / Lock** work as in Edit sheet: drag moves, the wheel
  scales around the pointer, and selecting a joint turns Move reference off.

### 3.3 Pure helpers (`src/rig/rig-edit.ts`)

- `DEPENDENTS: Record<JointId, JointId[]>`: the table in §3.2.
- `moveJoint(rig, id, delta: Vec2, alone: boolean): Rig`. It never changes
  its input.

## 4. Composing sheets and rigs

### 4.1 Shared state

- `src/ui/sheet-bus.ts` becomes a character bus holding `{ sheet, rig }`:
  - `getRig()`
  - `setRig(rig, origin)`
  - `subscribeRig(fn)`
  - The existing sheet methods are unchanged.
- **Animate** builds with the bus rig. A `data-id="rig-name"` element next to
  the sheet name shows "Rig: <name>". Animate re-renders when the rig
  changes.
- **Edit sheet's live preview** builds with the bus rig.
- **Export** uses the bus rig. File names are unchanged.

### 4.2 Loading rigs

- Use **Load rig** in Edit rig, or drop a file whose name ends in `.json`
  anywhere on the page, in any mode. A dropped `.svg` still loads a sheet
  (Animate) as today.
- **On success:** the rig becomes current, as one undo step in Edit rig. Its
  warnings show in the Edit rig panel.
- **On failure:** the current rig is kept. The `RigError` message appears in
  the app-level banner (`data-id="app-banner"`, `role="alert"`), which a click
  dismisses.

### 4.3 Remembered pairs

- **Storage:** the tool keeps a map from sheet name to the rig last used with
  it, as a full `Rig`.
- **Updated** whenever the rig changes while a sheet is current, and whenever
  a sheet becomes current (with the current rig).
- **The banner:** when a sheet becomes current from a **file load** (Animate's
  Load sheet or drop), the map has an entry for its name, and that entry
  differs from the current rig, the app banner shows: "This sheet was last
  used with the rig <name>." with buttons **Use it**
  (`data-id="pair-use"`) and **Keep current rig** (`data-id="pair-keep"`).
  - **Use it** sets that rig as current.
  - Either button dismisses the banner.
- **Bad entries:** an entry that fails `validateRig` is ignored.

### 4.4 Autosave

Records in the same IndexedDB store as the sheet editor:

| Key | Contents |
|---|---|
| `rig` | The current `Rig` |
| `rig-view` | `{ reference: {x, y, scale, opacity, locked}, characterOpacity }` |
| `pairings` | `Record<sheetName, Rig>` |

- **Saving:** these are written 500 ms after the last change. They're also
  stashed synchronously in localStorage on `pagehide`, under
  `character-rig:pending-rig` and `character-rig:pending-rig-view`, using the
  same pattern as the sheet editor's document stash.
- **Restoring:** on load these are restored before Animate first renders, so
  Animate shows the restored rig.
- **Bad records:** a record that fails validation is ignored, and defaults
  are used.
- **Unavailable storage:** if storage is unavailable, the existing "Autosave
  is off" behaviour applies, also shown in Edit rig.

## 5. Error handling

| Situation | Behaviour |
|---|---|
| Rig file invalid (§2.3) | App banner with the message. The current rig stays |
| Joint outside 512 × 512 | Warning in the Edit rig panel. The rig is used |
| A joint on top of its child | Warning. That segment points straight down |
| Remembered pair or autosaved rig invalid | Ignored. Defaults are used |
| Storage unavailable | "Autosave is off" banner. Editing still works |
| Reset to default with changes | Confirmation dialog. Can be undone |

## 6. Testing

### 6.1 Unit (Vitest)

- `rigToSkeleton(DEFAULT_RIG)` equals today's `BONES` and `ATTACH` within
  1e-9.
- A rig with `elbow_L` moved to `shoulder_L + (40, 60)`:
  - the upper-arm world angle is `atan2(−40, 60)`
  - the elbow local offset is `(0, √(40² + 60²))`
- **Degenerate arm:** a wrist on its elbow gives rotation 0 plus the warning.
  An out-of-bounds joint gives the warning.
- **`parseRig`:** each `RigError` case, unknown fields ignored, and the name
  fallback. `serializeRig` → `parseRig` round-trips exactly (3-decimal
  values).
- **`moveJoint`:** dependents move and others stay. Alt moves the joint alone.
  The input is unchanged.
- **Pose check:** for a custom rig with every joint moved, `buildLottie` at
  frame 0 puts each bone null's world origin on its rig joint (within 1e-6).
  The eyes and mouth layers' anchor points land on the eyes and mouth anchors.
- With the default rig, `buildLottie` output is deep-equal to the output
  before this change, using a stored fixture of the current template export.
- **`shapeItemsToSvg`:** paths, fills, strokes, a linear and a radial
  gradient, and dashes give the expected SVG attributes.
- **`restPose`:** each part's pivot maps onto its bone joint plus attach
  offset.
- Existing animation and build tests still pass.

### 6.2 Browser (Playwright)

- **Elbow drag:** in Edit rig, dragging `elbow_L` moves its marker and the
  `wrist_L` marker. The exported Lottie (Animate → Export) has the shoulder
  null's rotation changed accordingly.
- **Alt+drag** on `elbow_L` leaves `wrist_L` in place.
- **Root drag** moves every marker.
- **Download / load:** Download rig gives `<name>.rig.json`. Loading it back
  after Reset restores the joints. Loading a broken file shows the app banner
  and keeps the rig.
- **Undo / redo** of a joint drag. Escape during a drag reverts it.
- **Autosave:** after moving a joint and the reference, then reloading, both
  are restored. Animate shows "Rig: <name>".
- **Remembered pairs:** load sheet A with rig X, switch to rig Y, then load A
  again. The banner appears, and **Use it** restores X.
- **Drop:** dropping a `.rig.json` on the page loads it.
- **Shared reference:** the reference image loaded in Edit sheet appears in
  Edit rig, with its own placement.

## 7. Project layout changes

```
src/rig/       rig-file.ts (Rig, DEFAULT_RIG, rigToSkeleton, parseRig, serializeRig, validateRig),
               rig-edit.ts (DEPENDENTS, moveJoint), pose.ts (restPose)
src/lottie/    to-svg.ts (shapeItemsToSvg); build.ts takes opts.rig
src/rig-editor/  store.ts, view.ts, panel.ts, mount.ts, tools (joint drag, reference)
src/ui/        sheet-bus.ts (character bus), app.ts (3 modes, app banner, rig drop),
               animate.ts (rig name, uses bus rig)
src/editor/    panel preview uses the bus rig; the reference image is shared with Edit rig
tests/unit/rig/  rig-file, rig-edit, pose, skeleton tests; tests/unit/lottie/to-svg.test.ts
tests/e2e/     rig.spec.ts
tests/fixtures/  default-template-idle.json (pre-change build output, for the no-change test)
```
