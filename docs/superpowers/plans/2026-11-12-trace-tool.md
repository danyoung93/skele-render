# Trace Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Edit sheet, clicking a flat-colour area of the reference image
creates a smooth vector path matching that area.

**Architecture:** Pure image functions in `src/trace/`: region, then contour,
then fit, then `traceAt`. A Trace tool in `src/editor/tools/trace.ts` maps
clicks and points between sheet and image pixels, using the reference image's
existing offscreen canvas (`store.get().reference.pixels`).

**Tech Stack:** TypeScript, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-12-trace-tool-design.md`

## Global Constraints

- Tolerance is ΔE CIE76, default 12. Smoothness is in image px, default 0.6.
- Search limit: the part's box + 32 units. Minimum area: 16 px. Outline level 0.35 on the coverage field.
- No new runtime dependencies.

## Review Focus

1. **A zoomed or panned canvas and a scaled or offset reference** must trace
   where clicked. Test: Task 3 e2e "trace lands on the shape after moving the
   reference".
2. **An image edge inside the box** isn't reported as `hitLimit`. Test: Task 1
   unit "image border is not the limit".
3. **A transparent reference** (PNG alpha) should treat fully transparent
   pixels as white. Test: Task 1 unit "transparent pixels count as white".
4. **A very thin shape** (a 2-px line) must not throw in fitting. Test: Task 2
   unit "thin line traces".
5. **Hover over the canvas without a reference** must not throw. Test: Task 3
   e2e "no reference hover is quiet".

### Task 1: Region growing (`src/trace/region.ts`, `src/trace/colour.ts`, `tests/unit/trace/region.test.ts`)

- [ ] **Failing tests:**
  - tolerance separation and merging
  - holes filled
  - dilate 1 px
  - median colour
  - `hitLimit` true when the region reaches the limit edge, and false at the
    image border
  - transparent pixels count as white
  - 4-connectivity: no diagonal leak
- [ ] Implement:
  - `rgbToLab`, `deltaE`
  - `growRegion(img, seed: [number, number], tol, limit: { x0, y0, x1, y1 })`
- [ ] Commit.

### Task 2: Contour, fitting, traceAt (`contour.ts`, `fit.ts`, `trace.ts`, plus tests)

- [ ] **Failing tests:** the table in spec §4 (unit rows), plus "thin line
  traces".
- [ ] Implement, run, and commit.

### Task 3: Trace tool and panel (`src/editor/tools/trace.ts`, `mount.ts`, `panel.ts`, `tests/e2e/trace.spec.ts`)

- [ ] **Failing e2e tests:** the spec §4 browser rows, plus "trace lands on
  the shape after moving the reference" and "no reference hover is quiet".
- [ ] Implement:
  - the tool, shortcut T, and the hover preview (throttled 100 ms) in the
    tool layer
  - panel sliders
  - messages through `store.set({ message })`
- [ ] Run all tests and the build, update the README, and commit.
