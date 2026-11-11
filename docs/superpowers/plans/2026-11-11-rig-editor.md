# Rig Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the skeleton a separate, editable rig file. Add an Edit rig mode
where you drag joints over a faded reference design. The current sheet plus
the current rig make the animated character.

**Architecture:** A pure `Rig` (joint positions in 512² character space)
becomes bones and attachments via `rigToSkeleton`. `buildLottie` takes the
rig. A character bus shares `{sheet, rig}` between Animate, Edit sheet and the
new Edit rig mode. Edit rig has its own store, history and canvas, and draws
the rest pose by converting Lottie shape items to SVG.

**Tech Stack:** TypeScript, Vite, plain DOM/SVG, lottie-web, Vitest + jsdom
(+ fake-indexeddb), Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-11-11-rig-editor-design.md` (builds on
`2026-11-10-character-rig-design.md` and `2026-11-11-sheet-editor-design.md`)

## Global Constraints

- **Character space:** 512 × 512, y down. Angles are clockwise degrees, with
  0 meaning straight down for arm segments.
- **Joints:** `JOINT_IDS` = root, neck, shoulder_L, elbow_L, wrist_L,
  shoulder_R, elbow_R, wrist_R, brows, eyes, mouth.
- **Rig file:**
  - `{"format":"character-rig/rig","version":1,"name","joints"}`
  - numbers rounded to 3 decimal places, 2-space JSON indentation
  - file name `<name>.rig.json`
  - default name `default`
- **The default rig must reproduce today's output exactly:** `BONES` and
  `ATTACH` within 1e-9, and `buildLottie` deep-equal to the pre-change output.
- **Limits:**
  - history 200 steps per mode
  - autosave 500 ms after the last change, plus a `pagehide` stash in
    localStorage
  - preview rebuild at most every 200 ms
  - Character opacity defaults to 80%
- **Nothing outside the rig changes:** the bone tree, parts, animations, sheet
  format and template are unchanged.

## Review Focus

1. **Dragging a joint while zoomed or panned** must land exactly under the
   pointer. Test: Task 5 e2e "joint drag lands under the pointer at 200%".
2. **A rig changed from outside Edit rig** (dropped file, or remembered-pair
   **Use it**) must be one undo step in Edit rig and show at once there.
   Test: Task 6 e2e "dropped rig is undoable in Edit rig".
3. **Degenerate rigs** (a joint on top of its child, or every joint on one
   point) must never put NaN into the Lottie. Test: Task 2 unit "degenerate
   rig builds finite Lottie".
4. **Edit rig with a sheet missing parts** (an empty or partial sheet) must
   render without errors. Test: Task 5 e2e "Edit rig with an empty sheet".
5. **The remembered-pair banner** must not appear on first load, after an
   autosave restore, or when the remembered rig equals the current one. Test:
   Task 6 e2e "no banner when rigs match / on restore".

---

### Task 1: Rig file and skeleton conversion

**Files:**
- Create: `src/rig/rig-file.ts`
- Test: `tests/unit/rig/rig-file.test.ts`
- Create `tests/fixtures/default-template-idle.json` **first**: the current
  `buildLottie(loadSheet(templateSvg()), idle, {debug:false})` output, written
  by a one-off script before any build change.

**Produces:**
- `JointId`, `JOINT_IDS`
- `interface Rig { name: string; joints: Record<JointId, Vec2> }`
- `DEFAULT_RIG`
- `class RigError extends Error`
- `rigToSkeleton(rig): { bones: Bone[]; attach: Record<PartId, { bone: BoneId; offset: Vec2 }>; warnings: string[] }`
- `parseRig(text): { rig; warnings }`, `serializeRig(rig): string`,
  `validateRig(x): Rig | null`, `rigWarnings(rig): string[]`,
  `rigsEqual(a, b): boolean`

Steps:
- [ ] Write the fixture with the script, then commit it on its own:
  `test: capture default template build output`.
- [ ] **Failing tests:**
  - `rigToSkeleton(DEFAULT_RIG)` deep-equals `BONES`/`ATTACH` within 1e-9.
  - **Elbow moved** to `shoulder_L + (40, 60)`: the shoulder_L rotation is
    `deg(atan2(−40, 60))`, and the elbow_L offset is `[0, √5200]`.
  - **Degenerate arm** (wrist on elbow): rotation 0 plus the warning text from
    spec §2.2.
  - **Out of bounds:** the warning for an out-of-bounds joint.
  - **`parseRig`:** each `RigError` message from spec §2.3 exactly, unknown
    fields ignored, and the name fallback `rig`.
  - **Round trip:** `serializeRig` → `parseRig` returns the same rig, and the
    output has 2-space indentation.
  - **`validateRig`:** rejects NaN.
- [ ] Implement:
  - local offset = `rotate(joint − parentJoint, −parentWorld)`
  - world angles as in spec §2.2
  - attachments: eyes and mouth = anchor − neck
- [ ] Run `npx vitest run` → PASS. Commit
  `feat(rig): rig file format and skeleton conversion`.

### Task 2: Build with a rig, rest pose, no-change guarantee

**Files:**
- Modify: `src/lottie/build.ts`, `src/rig/rig.ts` (derive `BONES` and `ATTACH`
  from `DEFAULT_RIG`)
- Create: `src/rig/pose.ts`
- Test: `tests/unit/rig/pose.test.ts`, `tests/unit/build.test.ts` (extend)

**Consumes:** `rigToSkeleton`, `DEFAULT_RIG` (Task 1).

**Produces:**
- `buildLottie(sheet, anim, opts: { debug: boolean; rig?: Rig })`
- `restPose(rig): { bone: Record<BoneId, Mat>; part: Record<PartId, Mat> }`

Steps:
- [ ] **Failing tests:**
  - Default output deep-equals the fixture.
  - **Pose check:** for a custom rig with every joint moved (and arms
    re-angled), each `bone:<id>` null's world origin at frame 0 equals its
    rig joint within 1e-6, using the existing `tests/unit/pose.ts` helper. The
    eyes_open and mouth_closed layers' anchors map onto the eyes and mouth
    anchors.
  - **Degenerate rig builds finite Lottie:** a rig with every joint at
    (256, 256) gives JSON with no `null`, `NaN` or `Infinity`.
  - **`restPose`:** every part's pivot maps to its joint + attach offset.
- [ ] Implement:
  - `build.ts` calls `rigToSkeleton(opts.rig ?? DEFAULT_RIG)` once per build,
    for bone offsets and rotations, attachments and debug lines.
  - Keep `BONE_IND`, `PART_IND` and `DEBUG_IND` unchanged.
- [ ] Run → PASS (all existing tests too). Commit
  `feat(rig): build Lottie from a rig`.

### Task 3: Joint editing helpers and shape-to-SVG renderer

**Files:**
- Create: `src/rig/rig-edit.ts`, `src/lottie/to-svg.ts`
- Test: `tests/unit/rig/rig-edit.test.ts`, `tests/unit/lottie/to-svg.test.ts`

**Produces:**
- `DEPENDENTS`, `moveJoint(rig, id, delta, alone): Rig`
- `shapeItemsToSvg(items: ShapeItem[], idPrefix: string): string`. Items are
  listed front to back in Lottie; the output is in SVG back-to-front order,
  with gradient `<defs>` inline and ids prefixed.

Steps:
- [ ] **Failing tests:**
  - `moveJoint`: root moves all; neck moves the face; shoulder moves
    elbow + wrist; elbow moves wrist; alone moves one; the input is frozen
    and unchanged.
  - `shapeItemsToSvg` emits:
    - for `sh`: `d` (with `Z` when closed)
    - for `fl`: `fill`, `fill-opacity`, `fill-rule="evenodd"` for r=2
    - for `st`: `stroke`, `stroke-width`, `stroke-linecap`/`linejoin` mapped
      from 1/2/3, and `stroke-dasharray`/`dashoffset` from `d`
    - for `gf` type 1: `<linearGradient gradientUnits="userSpaceOnUse" x1…>`
      with stops; for type 2: `<radialGradient … r fx fy>`, opacity stops
      applied
  - Round trip: rendering the template head's items and rasterising them is
    covered in e2e. Unit tests check attributes only.
- [ ] Implement, run, and commit
  `feat(rig): joint editing helpers and shape-to-SVG renderer`.

### Task 4: Character bus, three modes, app banner, rig in Animate and Edit sheet

**Files:** Modify `src/ui/sheet-bus.ts`, `src/ui/app.ts`, `src/ui/animate.ts`,
`src/editor/panel.ts` (the preview uses the rig) and `src/ui/styles.css`. Test
`tests/e2e/modes.spec.ts` (extend) and `tests/e2e/app.spec.ts` (still
passing).

**Produces:**
- **Bus:** `getRig()`, `setRig(rig, origin: 'animate' | 'editor' | 'rig')`,
  `subscribeRig(fn)`.
- **App:**
  - the mode radio `data-mode="rig"` with label "Edit rig"
  - `<div data-id="rig-root">`, with a placeholder until Task 5
  - `showBanner({ text, kind, actions?: { id, label, run }[] })` rendering
    `data-id="app-banner"` (role alert for errors, status otherwise; a click
    on the text dismisses)
- **Animate:** `data-id="rig-name"` shows "Rig: <name>". It builds and exports
  with `bus.getRig()` and re-renders on `subscribeRig`.

Steps:
- [ ] **Failing e2e tests:**
  - the three-mode switch shows each root
  - Animate shows "Rig: default"
  - dropping a `.rig.json` file onto Animate updates "Rig: <name>" (no test
    hooks in production code)
  - dropping a broken `.json` shows the app banner with the parse message
- [ ] Implement:
  - dropped files ending in `.json` → `parseRig` → `bus.setRig`, or the app
    banner on `RigError`
  - `.svg` → the existing sheet load
- [ ] Run the e2e and unit tests → PASS. Commit
  `feat(ui): share the rig across modes and add Edit rig mode switch`.

### Task 5: Edit rig mode: store, canvas, joint drag, reference, panel

**Files:**
- Create: `src/rig-editor/store.ts`, `view.ts`, `panel.ts`, `mount.ts`,
  `tools.ts`, `src/ui/rig-editor.css`
- Modify: `src/ui/app.ts` (mount it), `src/editor/store.ts` (expose the
  reference image to share)
- Test: `tests/e2e/rig.spec.ts`

**Consumes:** Tasks 1–4; the sheet editor's `Viewport` helpers
(`viewport.ts`), `History` (`history.ts` is generic over `EditorDoc`; make it
generic `History<T>`) and the reference image from the editor store.

**Produces:**
- **Store:** `RigState { history: History<RigDoc>, selected: JointId | null,
  viewport, characterOpacity, tool: 'joint' | 'reference' }`, where
  `RigDoc = { rig: Rig; reference: ReferenceState }`.
  - Methods: `commit`, `transient`, `endTransient`, `abortTransient`, `undo`,
    `redo`, `reset`.
  - Commits call `bus.setRig(rig, 'rig')`, throttled to 200 ms for
    transients.
- **Rig changes from elsewhere** (`subscribeRig` with an origin other than
  `rig`) commit into this history.
- **DOM hooks:**
  - `[data-id="rig-canvas"]` with groups `reference`, `character`, `bones`
  - markers `[data-joint="<id>"]`
  - panel ids: `rig-name`, `rig-load`, `rig-download`, `rig-reset`,
    `joint-readout`, `char-opacity`, `rig-ref-load`, `rig-ref-opacity`,
    `rig-ref-move`, `rig-ref-lock`, `rig-ref-reset`, `rig-preview`,
    `rig-warnings`

Steps:
- [ ] **Failing e2e tests:**
  - **Joint drag lands under the pointer at 200%:** zoom with the wheel, pan
    with a middle-button drag, then drag `elbow_L`. The marker centre equals
    the pointer within 1 px.
  - Dragging `elbow_L` moves the `wrist_L` marker by the same delta; Alt+drag
    leaves `wrist_L` in place; dragging root moves every marker.
  - **Export check:** Export Lottie in Animate after an elbow drag gives a
    `bone:shoulder_L` rotation different from 10.
  - Undo/redo of a drag. Escape during a drag reverts it.
  - Download rig gives `default.rig.json`, or the typed name.
  - Load rig with a broken file shows the app banner, and the joints don't
    change.
  - Reset to default asks first, and Ctrl+Z restores.
  - **Shared reference:** a reference loaded in Edit sheet is visible in Edit
    rig. Move reference changes only Edit rig's placement; Edit sheet's image
    x is unchanged.
  - **Edit rig with an empty sheet:** after New blank sheet, Edit rig renders
    the bones with no page errors.
  - Changing Character opacity changes the `character` group's opacity.
- [ ] Implement:
  - The canvas follows the Edit sheet view pattern: `getScreenCTM` for
    pointers, `preventDefault` on pointerdown, dragstart blocked.
  - The character layer is
    `restPose(rig).part[p]` → `<g transform="matrix(...)">${shapeItemsToSvg(...)}</g>`,
    in rig spec §4.3 draw order. Swap groups show only the default member.
- [ ] Run the e2e and unit tests → PASS. Commit
  `feat(rig-editor): Edit rig mode with draggable joints`.

### Task 6: Autosave, remembered pairs, rig file drop

**Files:** Modify `src/editor/persist.ts` (generic `saveKey` / `loadKey` and
the stash), `src/rig-editor/mount.ts`, `src/ui/app.ts` and `src/ui/animate.ts`.
Test `tests/unit/editor/persist.test.ts` (extend) and `tests/e2e/rig.spec.ts`
(extend).

**Produces:**
- **Persistence:** keys `rig`, `rig-view`, `pairings`. Stash keys
  `character-rig:pending-rig` and `character-rig:pending-rig-view`.
- **Pairs:** `rememberPair(sheetName, rig)`, and a banner check when a sheet
  loads from a file.

Steps:
- [ ] **Failing tests:**
  - **Unit:** save/load of the rig keys round-trips; the stash wins and is
    cleared; invalid records give null.
  - **Autosave:** move a joint and the reference, then reload immediately.
    Both are restored, and Animate shows "Rig: <name>".
  - **Remembered pair:**
    1. load sheet A (a fixture SVG) with the default rig
    2. load a rig file Y
    3. load A again: the banner appears
    4. **Use it**: the rig is `default`, and the banner is gone
  - **No banner when rigs match / on restore:** load A twice with the same
    rig, and also reload the page. No banner either time.
  - **Dropped rig is undoable in Edit rig:** drop a rig file in Animate,
    switch to Edit rig and press Ctrl+Z. The previous rig is restored.
- [ ] Implement, run all tests and the build, and commit
  `feat(rig): autosave rigs and remember sheet/rig pairs`.

### Task 7: README and full verification

- [ ] **README:** add an "Edit the rig" section (workflow, dragging rules,
  Alt, the rig file, remembered pairs).
- [ ] **Full run:** `npx vitest run`, `npx playwright test --trace off` and
  `npm run build` all PASS.
- [ ] **Manual check:** load the bearded worker example sheet and the design
  reference, align the reference in Edit rig, drag the shoulders, elbows and
  wrists onto the design, and screenshot the rig editor and an Animate frame.
- [ ] Commit `docs: describe the rig editor`.
