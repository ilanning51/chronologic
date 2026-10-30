# Chronologic v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first version of Chronologic, an installable web app where you plan on an infinite plane, draw a colored line through tasks for a stretch of time, and watch the color run out at capacity.

**Architecture:** Pure TypeScript modules hold every rule (sizes, capacity, line fit, camera math, gesture recognition, routing) and are tested without a browser. One reducer owns the persisted world, one small external store wraps it for React. The React layer is thin: a world layer under a CSS transform, an SVG line, station buttons, and a four-corner HUD in screen space.

**Tech Stack:** React 18, TypeScript 5, Vite 5, Vitest 2 with jsdom, @testing-library/react 16. No other runtime dependencies.

**Spec:** `design/chronologic-design.md` (read it whole before any task), with `design/flow-conditions.md` and `design/nyc-subway-principles.md` beside it.

## Global Constraints

- Opaque colors only. No outlines, no thin strokes, no transparency, no shadows, no gradients except the hard stop pie (`conic-gradient` with two stops).
- Tokens, verbatim: Paper `#EEEBE5`, Ink `#2B2420`, Muted `#6B635C`, Deep `#2440A4`, Shallow `#A67C00`, Body `#1F7A3A`, Out `#C4251F`.
- Sizes at default zoom in CSS px: line 10, circle 22, triangle 24 by 22, square 20, done dot 10, train 30 by 20, terminus bar 10 by 26, bullet 28 in a 44 hit area, clock 36 in a 44 hit area, add button 56, chip 36 tall. HUD sizes are written in rem (16px base); world sizes are world units, which equal CSS px at scale 1.
- Type: `'Helvetica Neue', Helvetica, Arial, sans-serif`, two weights only (400, 700). Name 22 bold, subtitle 15 muted, labels 13 at default zoom and 17 zoomed in, done labels muted.
- Shape is size (circle 20 min, triangle 45, square 90). Color is kind. Dot is done. Position is order. Color never carries meaning alone: every bullet holds its initial, the subtitle names the kind in words.
- The clock carries no digits anywhere. No counts, scores, streaks, history, percentages, or "overdue" states exist.
- The HUD is four corner stickers and nothing else is ever pinned to the screen. No settings screen, no toggles, no notifications, no confirm dialogs, no sheets.
- Focus and press are shown as the shape filling with the line color, never a ring.
- Motion follows `prefers-reduced-motion`. Sound uses Web Audio and nothing works around the phone's silent switch.
- Every station stores `z: 0`; nothing draws in depth. Three-finger input is ignored.
- Commits go on branch `build/v1`, one per task, never pushed, never on `main` except the root commit of the docs in Task 1. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Corrupt, missing or older localStorage: the app opens on an empty plane rather than a blank screen. Test in Task 5.
2. A line drawn through a done station or through the same station twice: each station appears once in the line, a done station keeps its cost, and the fit is computed over the deduplicated order. Test in Task 4.
3. A drag with no stations under it, or ending a stretch whose line has nothing pending: no stretch starts from an empty line, and ending slides nothing and crashes nothing. Test in Task 4.
4. The device sleeps through the end of a stretch: remaining time comes from the start timestamp and the current time, never from counted ticks, so the stretch ends correctly on wake. Test in Task 3.
5. A second finger lifts mid-pinch: the remaining finger continues as a pan from where it is, with no jump. Test in Task 7.

---

## File structure

```
index.html                      Vite entry, viewport and install meta tags
public/manifest.webmanifest     name, landscape, standalone, theme color, icons
public/icon.svg                 ink disc on paper
src/main.tsx                    mounts App
src/styles/tokens.css           color and size tokens, font stack, reduced motion rule
src/model/types.ts              Shape, Kind, Length, Station, Stretch, World
src/model/sizes.ts              SHAPE_MINUTES, LENGTH_MINUTES, LENGTH_WORDS, capacity()
src/model/kinds.ts              KINDS: word, initial, color, pitch
src/model/line.ts               fit(): which stations the color reaches
src/model/stretch.ts            defaultName(), remaining(), isOver()
src/model/slide.ts              slideToFront()
src/model/reducer.ts            Action union, reduce(), EMPTY
src/store/storage.ts            load()/save() with a versioned key
src/store/store.ts              createStore(), useWorld()
src/plane/geometry.ts           Point, distance()
src/plane/camera.ts             Camera, worldToScreen, screenToWorld, panBy, zoomAt, centerOn
src/plane/labels.ts             labelFontPx()
src/plane/gestures.ts           Recognizer: pointer samples in, gestures out
src/plane/routing.ts            routeThrough(), pointAlong(), terminusOf(), trainOn()
src/plane/placement.ts          placeClear()
src/feedback/sound.ts           pitchFor(), playTone(), playChord()
src/feedback/haptics.ts         buzz()
src/feedback/motion.ts          prefersReducedMotion()
src/ui/App.tsx                  owns camera and UI-only state, wires gestures to actions
src/ui/Plane.tsx                world layer under the camera transform
src/ui/Station.tsx              one station button
src/ui/Line.tsx                 SVG polyline, terminus bar, train
src/ui/Hud.tsx                  the four corners
src/ui/NameBlock.tsx            name and subtitle, rename on tap
src/ui/Clock.tsx                pie, tap and hold
src/ui/Bullets.tsx              four kind bullets and the length chips
src/ui/CaptureField.tsx         add button that opens into the capture pill
src/ui/StationEditor.tsx        long press editor
scripts/icon.mjs                writes public/apple-touch-icon.png with zlib only
```

Tests sit beside their module as `*.test.ts` or `*.test.tsx`.

---

### Task 1: Scaffold, tokens, shapes, kinds and capacity

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/styles/tokens.css`, `src/ui/App.tsx` (placeholder that renders an empty paper plane), `src/model/types.ts`, `src/model/sizes.ts`, `src/model/kinds.ts`
- Test: `src/model/sizes.test.ts`, `src/model/kinds.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Shape = 'circle' | 'triangle' | 'square';
  export type Kind = 'deep' | 'shallow' | 'body' | 'out';
  export type Length = 'hour' | 'couple' | 'half' | 'whole';
  export interface Station { id: string; title: string; shape: Shape; x: number; y: number; z: 0; done: boolean }
  export interface Stretch { kind: Kind; length: Length; name: string; startedAt: number; line: string[] }
  export interface World { stations: Station[]; stretch: Stretch | null; lastLength: Length }
  export const SHAPE_MINUTES: Record<Shape, number>;      // 20, 45, 90
  export const LENGTH_MINUTES: Record<Length, number>;    // 60, 120, 240, 480
  export const LENGTH_WORDS: Record<Length, string>;      // 'an hour', 'a couple of hours', 'half a day', 'the whole day'
  export const CAPACITY_RATIO = 0.8;
  export function capacity(length: Length): number;      // 48, 96, 192, 384
  export interface KindSpec { kind: Kind; word: string; initial: string; color: string; pitchHz: number }
  export const KINDS: Record<Kind, KindSpec>;             // Deep D #2440A4 262, Shallow S #A67C00 330, Body B #1F7A3A 392, Out O #C4251F 440
  export const KIND_ORDER: Kind[];                        // deep, shallow, body, out
  ```

- [x] **Step 1: Root commit of the docs on main, then the build branch**

```bash
git add design docs
git commit -m "docs: Chronologic design and v1 plan"
git checkout -b build/v1
```

- [x] **Step 2: Write the scaffold by hand**

`package.json` scripts: `dev` (vite), `build` (tsc -b && vite build), `preview`, `test` (vitest run), `test:watch` (vitest). Dependencies: react, react-dom. Dev: typescript, vite, @vitejs/plugin-react, vitest, jsdom, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, @types/react, @types/react-dom. `vite.config.ts` sets `test: { environment: 'jsdom', setupFiles: ['src/test-setup.ts'] }` and the setup file imports `@testing-library/jest-dom/vitest`. `tsconfig.json`: strict, `jsx: react-jsx`, `moduleResolution: bundler`, `types: ["vitest/globals"]` is not used, tests import from vitest. `index.html` sets `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, links `tokens.css` through `main.tsx`, and has `<div id="root">`.

`tokens.css` defines on `:root` the seven color tokens, the size tokens from Global Constraints (world sizes in px, HUD sizes in rem), the font stack, `background: var(--paper)` on `body`, `margin: 0`, `overflow: hidden`, `user-select: none`, and `@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important } }`.

- [x] **Step 3: Install and check the empty app builds**

Run: `npm install` then `npm run build`
Expected: a `dist/` folder and no TypeScript errors.

- [x] **Step 4: Write the failing tests**

```ts
// src/model/sizes.test.ts
import { capacity, SHAPE_MINUTES, LENGTH_MINUTES } from './sizes';
test('capacity is 80 percent of the declared length', () => {
  expect(capacity('hour')).toBe(48);
  expect(capacity('couple')).toBe(96);
  expect(capacity('half')).toBe(192);
  expect(capacity('whole')).toBe(384);
});
test('shapes and lengths carry the spec minutes', () => {
  expect(SHAPE_MINUTES).toEqual({ circle: 20, triangle: 45, square: 90 });
  expect(LENGTH_MINUTES).toEqual({ hour: 60, couple: 120, half: 240, whole: 480 });
});
// src/model/kinds.test.ts
test('every kind carries its initial, color and word', () => {
  for (const kind of KIND_ORDER) {
    expect(KINDS[kind].initial).toBe(KINDS[kind].word[0]);
    expect(KINDS[kind].color).toMatch(/^#[0-9A-F]{6}$/);
  }
  expect(KINDS.deep.color).toBe('#2440A4');
  expect(KINDS.shallow.color).toBe('#A67C00');
  expect(KINDS.body.color).toBe('#1F7A3A');
  expect(KINDS.out.color).toBe('#C4251F');
});
```

- [x] **Step 5: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL, modules not found.

- [x] **Step 6: Implement `types.ts`, `sizes.ts`, `kinds.ts`**

- [x] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 3 tests.

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold, tokens, shapes, kinds and capacity"
```

---

### Task 2: The line fit rule

**Files:**
- Create: `src/model/line.ts`
- Test: `src/model/line.test.ts`

**Interfaces:**
- Consumes: `Station`, `Shape`, `SHAPE_MINUTES` from Task 1.
- Produces:
  ```ts
  export interface Fit { reached: string[]; beyond: string[]; spent: number }
  export function fit(order: Station[], cap: number): Fit;
  ```
  A station fits when the running total of sizes up to and including it is at most `cap`. The first that does not fit and everything after it is beyond. Done stations cost their size like any other.

- [x] **Step 1: Write the failing test with the spec's worked example**

```ts
const s = (id: string, shape: Shape, done = false): Station => ({ id, title: id, shape, x: 0, y: 0, z: 0, done });
test('the color runs out at capacity', () => {
  const r = fit([s('a','circle'), s('b','triangle'), s('c','square'), s('d','circle'), s('e','circle')], 96);
  expect(r.reached).toEqual(['a','b']);
  expect(r.beyond).toEqual(['c','d','e']);
  expect(r.spent).toBe(65);
});
test('reordering gains a station', () => {
  const r = fit([s('a','circle'), s('b','triangle'), s('d','circle'), s('e','circle'), s('c','square')], 96);
  expect(r.reached).toEqual(['a','b','d']);
  expect(r.beyond).toEqual(['e','c']);
  expect(r.spent).toBe(85);
});
test('done stations still cost their size', () => {
  expect(fit([s('a','square', true), s('b','circle')], 96).reached).toEqual(['a']);
});
test('an empty order fits nothing and spends nothing', () => {
  expect(fit([], 96)).toEqual({ reached: [], beyond: [], spent: 0 });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/model/line.test.ts`
Expected: FAIL, `fit` not found.

- [x] **Step 3: Implement `fit` in `src/model/line.ts`**

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run src/model/line.test.ts`
Expected: PASS, 4 tests.

- [x] **Step 5: Commit**

```bash
git add src/model/line.ts src/model/line.test.ts
git commit -m "feat: line fit rule"
```

---

### Task 3: Stretch time rules

**Files:**
- Create: `src/model/stretch.ts`
- Test: `src/model/stretch.test.ts`

**Interfaces:**
- Consumes: `Stretch`, `LENGTH_MINUTES`.
- Produces:
  ```ts
  export function defaultName(hour: number): 'Morning' | 'Afternoon' | 'Evening'; // 0..11 Morning, 12..17 Afternoon, 18..23 Evening
  export function remaining(stretch: Stretch, now: number): number;   // fraction of the length left, clamped to 0..1, from startedAt and now in ms
  export function isOver(stretch: Stretch, now: number): boolean;     // remaining is 0
  ```

- [x] **Step 1: Write the failing tests**

```ts
test('the name follows the hour', () => {
  expect(defaultName(6)).toBe('Morning');
  expect(defaultName(11)).toBe('Morning');
  expect(defaultName(12)).toBe('Afternoon');
  expect(defaultName(17)).toBe('Afternoon');
  expect(defaultName(18)).toBe('Evening');
  expect(defaultName(23)).toBe('Evening');
});
const st: Stretch = { kind: 'deep', length: 'couple', name: 'Afternoon', startedAt: 1_000_000, line: [] };
test('remaining is read from the clock, not counted', () => {
  expect(remaining(st, 1_000_000)).toBe(1);
  expect(remaining(st, 1_000_000 + 60 * 60_000)).toBe(0.5);
  expect(remaining(st, 1_000_000 + 10 * 60 * 60_000)).toBe(0);  // slept through the end
  expect(isOver(st, 1_000_000 + 120 * 60_000)).toBe(true);
  expect(isOver(st, 1_000_000 + 119 * 60_000)).toBe(false);
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/model/stretch.test.ts`
Expected: FAIL.

- [x] **Step 3: Implement `src/model/stretch.ts`**

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run src/model/stretch.test.ts`
Expected: PASS, 2 tests.

- [x] **Step 5: Commit**

```bash
git add src/model/stretch.ts src/model/stretch.test.ts
git commit -m "feat: stretch name and remaining time"
```

---

### Task 4: The reducer, with the slide to the front

**Files:**
- Create: `src/model/slide.ts`, `src/model/reducer.ts`
- Test: `src/model/slide.test.ts`, `src/model/reducer.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces:
  ```ts
  export const STATION_GAP = 64;
  export const SPLIT_PIECES: Record<Shape, number> = { circle: 1, triangle: 2, square: 4 };
  export function slideToFront(stations: Station[], ids: string[]): Station[];
  // Every station in ids gets x = (min x of the stations not in ids) - STATION_GAP * (ids.length - index), y unchanged, order of ids kept.
  // With no other stations, min x is 0.

  export type Action =
    | { type: 'add'; id: string; title: string; shape: Shape; x: number; y: number }
    | { type: 'move'; id: string; x: number; y: number }
    | { type: 'edit'; id: string; title?: string; shape?: Shape }
    | { type: 'split'; id: string; ids: string[] }      // ids.length must equal SPLIT_PIECES[shape]; circles sit at x + 48 * i, same y, titles "<title> 1".."<title> n"; they take the original's place in the line
    | { type: 'delete'; id: string }                    // also removed from the line
    | { type: 'start'; kind: Kind; length: Length; line: string[]; now: number; hour: number }  // ignored when the deduplicated line is empty; name = defaultName(hour); sets lastLength
    | { type: 'redraw'; kind: Kind; line: string[] }    // replaces the line and the kind, keeps name, length, startedAt; ignored with no stretch or an empty line
    | { type: 'complete'; id: string }                  // only for a station on the current line; when every station on the line is done the stretch ends
    | { type: 'restore'; id: string }                   // any done station
    | { type: 'rename'; name: string }
    | { type: 'end' };                                  // pending stations on the line slide to the front, stretch becomes null
  export const EMPTY: World = { stations: [], stretch: null, lastLength: 'couple' };
  export function reduce(world: World, action: Action): World;   // pure; unknown ids are ignored; the line is deduplicated keeping first occurrence and dropping ids that are not stations
  ```

- [x] **Step 1: Write the failing slide test**

```ts
const at = (id: string, x: number): Station => ({ id, title: id, shape: 'circle', x, y: 10, z: 0, done: false });
test('unreached stations slide to the front in line order', () => {
  const out = slideToFront([at('k', 100), at('a', 300), at('b', 500)], ['a', 'b']);
  expect(out.find(s => s.id === 'a')).toMatchObject({ x: -28, y: 10 });
  expect(out.find(s => s.id === 'b')).toMatchObject({ x: 36, y: 10 });
  expect(out.find(s => s.id === 'k')).toMatchObject({ x: 100 });
});
test('with nothing else on the plane the front is left of zero', () => {
  expect(slideToFront([at('a', 300)], ['a'])[0].x).toBe(-64);
});
```

- [x] **Step 2: Run to verify it fails, implement `slide.ts`, run to verify it passes**

Run: `npx vitest run src/model/slide.test.ts`

- [x] **Step 3: Write the failing reducer tests**

```ts
test('add, move, edit, delete', () => { /* add a circle at (10,20) → stations has it with z 0 and done false; move → x,y change; edit shape → changes; delete → gone */ });
test('start fits the line and names the stretch', () => {
  // three stations circle/triangle/square, start deep couple at hour 15 → stretch.name 'Afternoon', stretch.line all three ids, lastLength 'couple'
});
test('start with an empty or unknown line is ignored', () => {
  expect(reduce(w, { type: 'start', kind: 'deep', length: 'hour', line: [], now: 0, hour: 9 }).stretch).toBeNull();
  expect(reduce(w, { type: 'start', kind: 'deep', length: 'hour', line: ['nope'], now: 0, hour: 9 }).stretch).toBeNull();
});
test('a line never holds the same station twice', () => {
  // start with line ['a','a','b'] → stretch.line ['a','b']
});
test('complete only works on the line, restore works anywhere', () => {
  // complete an off-line station → unchanged; complete 'a' on the line → done true; restore → done false
});
test('completing the last pending station ends the stretch', () => { /* stretch null afterwards, stations keep done true */ });
test('split replaces a square with four circles in the line', () => {
  // square 'q' at (100, 50) in line ['p','q','r']; split ids ['q1','q2','q3','q4'] → circles at x 100,148,196,244, y 50, titles 'Taxes 1'..'Taxes 4'; line ['p','q1','q2','q3','q4','r']
});
test('end slides pending line stations to the front and keeps done ones', () => {
  // line ['a','b','c'] with 'a' done; end → stretch null; 'b' and 'c' moved left of every other station; 'a' untouched and still done
});
test('end with nothing pending changes no positions', () => { /* all done, end → positions equal */ });
test('redraw keeps the start time and replaces the line and kind', () => { /* startedAt equal, line replaced, kind 'body' */ });
```

Write each as a real test with exact ids and coordinates.

- [x] **Step 4: Run to verify they fail**

Run: `npx vitest run src/model/reducer.test.ts`
Expected: FAIL.

- [x] **Step 5: Implement `src/model/reducer.ts`**

- [x] **Step 6: Run to verify all tests pass**

Run: `npm test`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/model
git commit -m "feat: world reducer with the slide to the front"
```

---

### Task 5: Persistence and the store

**Files:**
- Create: `src/store/storage.ts`, `src/store/store.ts`
- Test: `src/store/storage.test.ts`, `src/store/store.test.ts`

**Interfaces:**
- Consumes: `World`, `EMPTY`, `reduce`, `Action`.
- Produces:
  ```ts
  export const STORAGE_KEY = 'chronologic.v1';
  export function load(storage: Pick<Storage, 'getItem'>): World;          // EMPTY when missing, unparsable, or not shaped like a World
  export function save(storage: Pick<Storage, 'setItem'>, world: World): void;
  export interface Store { getState(): World; dispatch(a: Action): void; subscribe(fn: () => void): () => void }
  export function createStore(initial: World): Store;
  export function persist(store: Store, storage: Pick<Storage, 'setItem'>): () => void;   // saves on every change
  export function useWorld(store: Store): World;                             // useSyncExternalStore
  ```

- [x] **Step 1: Write the failing tests**

```ts
test('load returns EMPTY for missing, corrupt and wrongly shaped data', () => {
  expect(load({ getItem: () => null })).toEqual(EMPTY);
  expect(load({ getItem: () => '{not json' })).toEqual(EMPTY);
  expect(load({ getItem: () => JSON.stringify({ stations: 'no' }) })).toEqual(EMPTY);
});
test('save then load round-trips a world', () => { /* use a Map-backed fake storage */ });
test('the store reduces and notifies, and persist writes every change', () => { /* subscribe, dispatch add, expect state and one setItem call */ });
```

- [x] **Step 2: Run to verify they fail, implement, run to verify they pass**

Run: `npx vitest run src/store`
Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add src/store
git commit -m "feat: persisted store"
```

---

### Task 6: Camera math and the label rule

**Files:**
- Create: `src/plane/geometry.ts`, `src/plane/camera.ts`, `src/plane/labels.ts`
- Test: `src/plane/camera.test.ts`, `src/plane/labels.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Point { x: number; y: number }
  export function distance(a: Point, b: Point): number;
  export interface Camera { x: number; y: number; scale: number }   // screen = world * scale + (x, y)
  export const MIN_SCALE = 0.25, MAX_SCALE = 4, DEFAULT_ZOOM = 1, STRETCH_ZOOM = 1.6;
  export const HOME: Camera = { x: 0, y: 0, scale: 1 };
  export function worldToScreen(c: Camera, p: Point): Point;
  export function screenToWorld(c: Camera, p: Point): Point;
  export function panBy(c: Camera, dx: number, dy: number): Camera;
  export function zoomAt(c: Camera, screen: Point, factor: number): Camera;   // the world point under `screen` stays under it; scale clamped
  export function centerOn(c: Camera, world: Point, viewport: { w: number; h: number }, scale: number): Camera;
  export function cssTransform(c: Camera): string;    // `translate(${x}px, ${y}px) scale(${scale})`
  export const LABEL_HIDE_BELOW = 0.5;
  export function labelFontPx(scale: number): number | null;   // null below LABEL_HIDE_BELOW, else min(17, max(13, 13 * scale)) in screen px
  ```

- [x] **Step 1: Write the failing tests**

```ts
test('screen and world round-trip', () => {
  const c = { x: 100, y: 50, scale: 2 };
  expect(worldToScreen(c, { x: 10, y: 10 })).toEqual({ x: 120, y: 70 });
  expect(screenToWorld(c, worldToScreen(c, { x: 3, y: 4 }))).toEqual({ x: 3, y: 4 });
});
test('zoomAt keeps the point under the finger still', () => {
  const c = HOME; const finger = { x: 300, y: 200 };
  const before = screenToWorld(c, finger);
  const after = zoomAt(c, finger, 1.5);
  expect(screenToWorld(after, finger).x).toBeCloseTo(before.x);
  expect(after.scale).toBe(1.5);
});
test('zoomAt clamps the scale', () => {
  expect(zoomAt(HOME, { x: 0, y: 0 }, 100).scale).toBe(MAX_SCALE);
  expect(zoomAt(HOME, { x: 0, y: 0 }, 0.001).scale).toBe(MIN_SCALE);
});
test('centerOn puts the world point in the middle of the viewport', () => {
  const c = centerOn(HOME, { x: 500, y: 300 }, { w: 800, h: 400 }, STRETCH_ZOOM);
  expect(worldToScreen(c, { x: 500, y: 300 })).toEqual({ x: 400, y: 200 });
});
test('labels hold 13 px, grow to 17, then hide', () => {
  expect(labelFontPx(1)).toBe(13);
  expect(labelFontPx(0.7)).toBe(13);
  expect(labelFontPx(1.6)).toBe(17);
  expect(labelFontPx(0.4)).toBeNull();
});
```

- [x] **Step 2: Run to verify they fail, implement, run to verify they pass**

Run: `npx vitest run src/plane`

- [x] **Step 3: Commit**

```bash
git add src/plane
git commit -m "feat: camera math and label rule"
```

---

### Task 7: The gesture recognizer

**Files:**
- Create: `src/plane/gestures.ts`
- Test: `src/plane/gestures.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Target =
    | { kind: 'paper' } | { kind: 'station'; id: string } | { kind: 'bullet'; line: Kind } | { kind: 'clock' } | { kind: 'hud' };
  export interface Sample { id: number; x: number; y: number; t: number }   // screen px and ms
  export type Gesture =
    | { type: 'pan'; dx: number; dy: number }
    | { type: 'pinch'; center: Point; factor: number; dx: number; dy: number }
    | { type: 'tap'; target: Target; at: Point }
    | { type: 'longPress'; target: Target; at: Point }
    | { type: 'dragStart'; target: Target; at: Point } | { type: 'dragMove'; target: Target; at: Point } | { type: 'dragEnd'; target: Target; at: Point }
    | { type: 'holdStart'; target: Target } | { type: 'holdEnd'; target: Target; completed: boolean };
  export const TAP_SLOP = 10, LONG_PRESS_MS = 500, HOLD_MS = 600;
  export class Recognizer {
    constructor(emit: (g: Gesture) => void);
    down(s: Sample, target: Target): void;
    move(s: Sample): void;
    up(s: Sample): void;
    cancel(id: number): void;
    tick(t: number): void;     // fires longPress and completed holds once their time has passed
  }
  ```
  Rules: one pointer on paper pans once it moves past TAP_SLOP, otherwise it is a tap on up. One pointer on a station or bullet becomes a drag past TAP_SLOP, a tap on a quick up, and a longPress (station only) once LONG_PRESS_MS pass within the slop, after which up emits nothing. On the clock, down emits holdStart at once, up before HOLD_MS emits tap then holdEnd completed false, and tick past HOLD_MS emits holdEnd completed true. Two pointers emit pinch with factor = current distance over previous distance and the movement of the midpoint as dx, dy, and no pan. A third pointer is ignored. When one of two pointers lifts, the one left pans from its current position with no jump. `cancel` drops a pointer and emits a dragEnd at its last position if it was dragging.

- [x] **Step 1: Write the failing tests**

```ts
test('a short press on paper is a tap, a longer move is a pan', () => { /* down (0,0) t0; up (3,3) t100 → one tap on paper; down, move (20,0) → pan dx 20; further move → more pan; no tap on up */ });
test('a station becomes a drag only past the slop', () => { /* move 9 px → nothing; 11 px → dragStart then dragMove; up → dragEnd */ });
test('holding a station fires a long press and swallows the tap', () => { /* down t0; tick t499 → nothing; tick t500 → longPress; up t600 → nothing */ });
test('the clock taps on a quick release and completes on a hold', () => { /* down → holdStart; up t200 → tap, holdEnd false. down; tick t600 → holdEnd true; up → nothing */ });
test('two pointers pinch about their midpoint', () => { /* a (0,0), b (100,0); move b to (200,0) → pinch factor 2 center (100,0); no pan emitted */ });
test('losing one of two fingers continues as a pan with no jump', () => { /* after a pinch, up on a; move b by (10,10) → pan dx 10 dy 10 exactly */ });
test('a third pointer is ignored', () => { /* with a and b down, down c and move c → no gestures */ });
```

Write each as a real test with an `emit` spy and exact samples.

- [x] **Step 2: Run to verify they fail, implement `Recognizer`, run to verify they pass**

Run: `npx vitest run src/plane/gestures.test.ts`
Expected: PASS, 7 tests.

- [x] **Step 3: Commit**

```bash
git add src/plane/gestures.ts src/plane/gestures.test.ts
git commit -m "feat: gesture recognizer"
```

---

### Task 8: The plane, the camera and the HUD on screen

**Files:**
- Create: `src/ui/Plane.tsx`, `src/ui/Station.tsx`, `src/ui/Hud.tsx`, `src/ui/NameBlock.tsx`, `src/ui/Clock.tsx`, `src/ui/Bullets.tsx`, `src/ui/CaptureField.tsx` (add button only for now)
- Modify: `src/ui/App.tsx`, `src/main.tsx`
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: store (Task 5), camera and labels (Task 6), `Recognizer` (Task 7).
- Produces: `App({ store, now }: { store: Store; now?: () => number })`. `Plane` renders a full-screen element with `touch-action: none` and a child world layer whose `style.transform` is `cssTransform(camera)`; it attaches pointer handlers that build `Sample`s and read the `Target` from the nearest `[data-target]` ancestor (`data-target="station" data-id=...`, `data-target="bullet" data-line=...`, `data-target="clock"`, otherwise paper; anything inside the HUD that is not a bullet or the clock is `hud`). `Station` is a `<button>` at `left: x px; top: y px` centered by a translate, with a shape span sized from the tokens and a label below in `labelFontPx(scale) / scale` px, or no label when null. `Hud` is four absolutely positioned corner groups in screen space with 44 px hit areas.

- [x] **Step 1: Run `ui-consistency:finding-patterns` and record what it settles in `docs/ui-checklist.md`** (the spec and the four mockup boards are the only pages, so the checklist is the Global Constraints plus the HUD positions from the mockups: name at 44 px from the left and 20 px from the top, clock 40 px from the right and 16 px from the top, bullets 36 px from the left and 12 px from the bottom, add 40 px from the right and 16 px from the bottom)

- [x] **Step 2: Write the failing component test**

```tsx
test('the plane shows stations as shapes with labels and four HUD corners', () => {
  const store = createStore({ ...EMPTY, stations: [{ id: 'a', title: 'Dentist', shape: 'circle', x: 100, y: 100, z: 0, done: false }] });
  render(<App store={store} />);
  expect(screen.getByRole('button', { name: /Dentist/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Deep line. Starts a new stretch.' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add a station' })).toBeInTheDocument();
});
test('the world layer carries the camera transform', () => { /* initial transform is translate(0px, 0px) scale(1) */ });
```

- [x] **Step 3: Run to verify it fails, implement the components, run to verify it passes**

Run: `npx vitest run src/ui`

- [x] **Step 4: Wire pan and pinch**

In `App`, hold `camera` in state; on `pan` apply `panBy`, on `pinch` apply `zoomAt(camera, center, factor)` then `panBy(dx, dy)`; also handle the `wheel` event on the plane as `zoomAt(camera, pointer, Math.exp(-deltaY / 500))`.

- [x] **Step 5: Look at it**

Run: `npm run dev`, open it in the built-in browser, drag the paper and zoom with the wheel. Expected: stations move with the paper, labels hide below half scale, the HUD stays put.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: plane, camera and HUD"
```

---

### Task 9: Capture

**Files:**
- Create: `src/plane/placement.ts`
- Modify: `src/ui/CaptureField.tsx`, `src/ui/App.tsx`
- Test: `src/plane/placement.test.ts`, `src/ui/CaptureField.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export const CLEAR_RADIUS = 48;
  export function placeClear(center: Point, taken: Point[]): Point;   // center if nothing taken is within CLEAR_RADIUS, else step right by CLEAR_RADIUS until clear
  ```
  `CaptureField({ onAdd, lineColor })`: the add button (56, ink, paper plus). Tapping it opens the pill in place: ink background, a text input with paper text at 17 px and `aria-label="Station title"`, then three shape buttons in paper named "Add as a small station", "Add as a medium station", "Add as a large station". A shape button calls `onAdd(title, shape)` with a non-empty trimmed title and closes; an empty title does nothing. Return adds a circle, Escape closes. The input is focused when the pill opens. `App` places the station at `placeClear(screenToWorld(camera, viewport center), stations)`.

- [x] **Step 1: Write the failing tests**

```ts
test('placeClear nudges right until clear', () => {
  expect(placeClear({ x: 0, y: 0 }, [])).toEqual({ x: 0, y: 0 });
  expect(placeClear({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toEqual({ x: 48, y: 0 });
  expect(placeClear({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 48, y: 0 }])).toEqual({ x: 96, y: 0 });
  expect(placeClear({ x: 0, y: 0 }, [{ x: 10, y: 10 }])).toEqual({ x: 96, y: 0 }); // (48, 0) is still within a radius of (10, 10)
});
test('capture adds a station from a title and a shape', async () => { /* click Add a station, type 'Fix the printer', click medium → onAdd('Fix the printer', 'triangle'); pill closed */ });
test('an empty title adds nothing and Return adds a circle', async () => { /* click medium with empty → onAdd not called; type 'x', press Enter → onAdd('x', 'circle') */ });
```

- [x] **Step 2: Run to verify they fail, implement, run to verify they pass**

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: capture in the HUD"
```

---

### Task 10: Moving and editing stations

**Files:**
- Create: `src/ui/StationEditor.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/Station.tsx`
- Test: `src/ui/StationEditor.test.tsx`

**Interfaces:**
- `App` maps `dragStart/dragMove/dragEnd` on a station to `move` actions with `screenToWorld` positions, and `longPress` on a station to `editing = id`. `StationEditor({ station, onEdit, onSplit, onDelete, onClose })` is an ink pill centered at the bottom of the HUD, above the bullets: a title input (`aria-label="Station title"`), three paper shape buttons named "Small", "Medium", "Large" with the current one filled in the line color, "Split into N circles" only for triangle and square, and "Delete" which on first tap becomes "Delete, tap again" and on the second tap calls `onDelete`. Tap on paper closes it. `onSplit` is called with fresh ids from `crypto.randomUUID()`.

- [x] **Step 1: Write the failing tests**

```ts
test('the editor renames and resizes', async () => { /* type a new title → onEdit({ title }); click Large → onEdit({ shape: 'square' }) */ });
test('split is offered for a square and not a circle', () => { /* square → button 'Split into 4 circles'; circle → no split button */ });
test('delete asks for a second tap', async () => { /* first click → onDelete not called, button text 'Delete, tap again'; second → called */ });
```

- [x] **Step 2: Run to verify they fail, implement, run to verify they pass**

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: move and edit stations"
```

---

### Task 11: Routing, terminus and train geometry

**Files:**
- Create: `src/plane/routing.ts`
- Test: `src/plane/routing.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const LEAD = 40, TERMINUS_OVERRUN = 32;
  export interface Route { vertices: Point[]; stationAt: number[] }   // stationAt[i] is the vertex index of station i
  export function routeThrough(points: Point[]): Route;
  // Starts LEAD units left of the first station. Between consecutive stations: a 45 degree segment covering min(|dx|, |dy|) in both axes first, then a horizontal or vertical segment for the rest. Collinear vertices are not merged.
  export function pointAlong(vertices: Point[], from: number, to: number, fraction: number): { at: Point; angle: number };   // angle in degrees of the segment the point sits on
  export function terminusOf(route: Route): { at: Point; angle: number };   // TERMINUS_OVERRUN past the last station, continuing the last segment's direction; horizontal for a single station
  export function trainOn(route: Route, nextIndex: number): { at: Point; angle: number };   // midpoint of the route between station nextIndex-1 and nextIndex; for 0, the midpoint of the lead
  ```

- [x] **Step 1: Write the failing tests**

```ts
test('routes with a diagonal first then a straight run', () => {
  const r = routeThrough([{ x: 0, y: 0 }, { x: 100, y: 60 }]);
  expect(r.vertices).toEqual([{ x: -40, y: 0 }, { x: 0, y: 0 }, { x: 60, y: 60 }, { x: 100, y: 60 }]);
  expect(r.stationAt).toEqual([1, 3]);
});
test('terminus continues the last segment', () => {
  const r = routeThrough([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  expect(terminusOf(r)).toEqual({ at: { x: 132, y: 0 }, angle: 0 });
});
test('the train waits on the lead before the first station', () => {
  const r = routeThrough([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  expect(trainOn(r, 0).at).toEqual({ x: -20, y: 0 });
  expect(trainOn(r, 1).at).toEqual({ x: 50, y: 0 });
});
```

- [x] **Step 2: Run to verify they fail, implement, run to verify they pass**

- [x] **Step 3: Commit**

```bash
git add src/plane/routing.ts src/plane/routing.test.ts
git commit -m "feat: line routing, terminus and train geometry"
```

---

### Task 12: Drawing the line from a bullet

**Files:**
- Create: `src/ui/Line.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/Bullets.tsx`, `src/ui/Plane.tsx`
- Test: `src/ui/Line.test.tsx`, `src/ui/App.test.tsx`

**Interfaces:**
- `Line({ route, color, reachedCount, nextIndex, width })` renders one SVG `polyline` with `stroke-width` 10 world units, round caps and joins, through the route up to the last reached station plus the terminus overrun, the terminus bar (10 by 26, rotated to the segment angle, centered at `terminusOf`) and the train (30 by 20 pill at `trainOn`, rotated to its angle). While drawing, `App` keeps `draft: { kind, ids: string[] }` in state: on `dragStart` from a bullet it starts a draft, on each `dragMove` it appends any pending station within `HIT_RADIUS = 22` world units of the pointer that is not yet in the draft, and the route is drawn through the draft plus the pointer. On `dragEnd` with a non-empty draft it dispatches `start` (no stretch running, with `pendingLength ?? lastLength`, `now: Date.now()`, `hour: new Date().getHours()`) or `redraw` (stretch running). The line's stations are `fit(lineStations, capacity(length))`; beyond stations are drawn like any pending station and the line does not reach them.

- [x] **Step 1: Write the failing tests**

```tsx
test('the line is drawn in the kind color and ends in a terminus', () => { /* render Line; polyline stroke equals '#2440A4'; a terminus bar element exists with data-terminus */ });
test('a drag from a bullet through two stations starts a stretch', () => { /* App with two stations; pointerdown on the Deep bullet, pointermove over each station's screen position, pointerup → store.getState().stretch.line equals both ids and kind 'deep' */ });
```

- [x] **Step 2: Run to verify they fail, implement, run to verify they pass**

- [x] **Step 3: Look at it**

Run: `npm run dev`, draw a line through five stations of mixed sizes with "a couple of hours". Expected: the color stops after the stations that fit, the terminus bar sits after the last one, the rest stand on paper with no line.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: draw a line from a bullet"
```

---

### Task 13: The clock, completing, the train and ending

**Files:**
- Modify: `src/ui/Clock.tsx`, `src/ui/Station.tsx`, `src/ui/App.tsx`
- Test: `src/ui/Clock.test.tsx`, `src/ui/App.test.tsx`

**Interfaces:**
- `Clock({ fraction, color, holding, onTap, onHold })`: a 44 px button named "Stretch clock. Tap to find the train, hold to end the stretch." whose 36 px disc is `conic-gradient(color 0 P%, var(--paper) P% 100%)` with `P = fraction * 100`; while `holding`, the disc scales down over `HOLD_MS` with a CSS transition. `App` ticks `now` once a second while a stretch runs and dispatches `end` when `isOver`. `tap` on a station on the current line dispatches `complete`, on a done station `restore`. The station shrinks to the 10 px dot with a 150 ms transition, and the train moves to `trainOn(route, firstPendingIndex)` with a 150 ms transition. `tap` on the clock sets the camera to `centerOn(camera, train.at, viewport, STRETCH_ZOOM)`; `holdEnd completed` dispatches `end`.

- [x] **Step 1: Write the failing tests**

```tsx
test('the pie shows the remaining fraction with no digits', () => { /* render Clock fraction 0.64 → disc style contains 'conic-gradient' and '64%'; button text content is '' */ });
test('tapping a station on the line completes it and the train moves on', () => { /* App with a running stretch over a, b; pointerdown/up on a → a done; train data-next equals 'b' */ });
test('the stretch ends by itself when the clock runs out', () => { /* fake timers; App with now() returning past the end after one tick → stretch null */ });
```

- [x] **Step 2: Run to verify they fail, implement, run to verify they pass**

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: clock, completing, train and ending"
```

---

### Task 14: Length chips, the default name and renaming

**Files:**
- Modify: `src/ui/Bullets.tsx`, `src/ui/NameBlock.tsx`, `src/ui/App.tsx`
- Test: `src/ui/Bullets.test.tsx`, `src/ui/NameBlock.test.tsx`

**Interfaces:**
- `Bullets({ pendingKind, pendingLength, onPickLength, lineColor })`: a `tap` on a bullet sets `pendingKind` and shows the four chips to the right of the bullets, with `LENGTH_WORDS`, the chosen one filled in the kind color with paper bold text and the others plain ink text, 36 px tall, no border. `NameBlock({ stretch, onRename })` shows the name in 22 bold and `"${KINDS[kind].word}, ${LENGTH_WORDS[length]}"` in 15 muted; a tap on the name turns it into an input that commits on blur or Return. With no stretch, the block is empty.

- [x] **Step 1: Write the failing tests**

```tsx
test('tapping a bullet shows the chips and picking one marks it', async () => { /* click Deep bullet → four chips; click 'half a day' → onPickLength('half'); chip aria-pressed true */ });
test('the name block names the kind and length in words and renames on tap', async () => { /* 'Afternoon' and 'Deep, a couple of hours' visible; click name, type 'Writing', Enter → onRename('Writing') */ });
```

- [x] **Step 2: Run to verify they fail, implement, run to verify they pass**

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: length chips, default name and renaming"
```

---

### Task 15: Sound, motion, the opening fly-to and install

**Files:**
- Create: `src/feedback/sound.ts`, `src/feedback/haptics.ts`, `public/manifest.webmanifest`, `public/icon.svg`, `scripts/icon.mjs`
- Modify: `src/ui/App.tsx`, `index.html`, `package.json` (script `icon`)
- Test: `src/feedback/sound.test.ts`, `src/ui/App.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function pitchFor(kind: Kind): number;                        // KINDS[kind].pitchHz
  export function playTone(ctx: AudioContext, hz: number): void;       // sine, 120 ms, gain 0.2 with a 20 ms ramp out
  export function playChord(ctx: AudioContext): void;                  // three sines at 262, 330, 392 Hz, 600 ms, gain 0.15
  export function buzz(): void;                                        // navigator.vibrate?.(30)
  ```
  Note from the build: no `motion.ts` was written, as the `prefers-reduced-motion` rule in `tokens.css` already removes every transition and animation, and nothing in the app needs to ask in code.
  `App` creates the `AudioContext` lazily on the first gesture, plays `pitchFor(stretch.kind)` on `complete`, and `playChord` plus `buzz` when `isOver` ends the stretch. On mount, if a stretch is running, the camera is set to `centerOn(HOME, trainOn(route, firstPending).at, viewport, STRETCH_ZOOM)`; the world layer's transform has a 400 ms transition that the reduced motion rule removes. The manifest has `name: "Chronologic"`, `display: "standalone"`, `orientation: "landscape"`, `background_color` and `theme_color` `#EEEBE5`, and icons `icon.svg` (any size) and `apple-touch-icon.png` (180). `index.html` links the manifest, sets `theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` `default` and the apple touch icon. `scripts/icon.mjs` writes a 180 by 180 PNG of an ink disc on paper using only `zlib` (deflate, CRC32 written by hand).

- [x] **Step 1: Write the failing tests**

```ts
test('each kind has its own pitch', () => { expect(new Set(KIND_ORDER.map(pitchFor)).size).toBe(4); });
test('opening on a running stretch centers the train at the stretch zoom', () => { /* App with a running stretch; world layer transform ends in 'scale(1.6)' */ });
```

- [x] **Step 2: Run to verify they fail, implement, run `node scripts/icon.mjs`, run to verify they pass**

- [x] **Step 3: Check the build and the install metadata**

Run: `npm run build` then `npm run preview`, open it in the built-in browser. Expected: no console errors, the manifest loads, the plane opens on the train when a stretch is running.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: sound, motion, opening fly-to and install"
```

---

### Task 16: Whole-plan check

- [ ] **Step 1: Run everything**

Run: `npm test` then `npm run build`
Expected: every test passes, the build is clean.

- [ ] **Step 2: Walk the friction rule in the running app**

Run: `npm run dev`. Open with a running stretch: the train and next station are on screen with no gesture. Capture: one tap, a few words, one tap. Start a stretch: a bullet, a chip, a drag. Expected: no extra gesture on any of the three.

- [ ] **Step 3: Review the diff of the whole branch against the spec's Rules that never bend**

Run: `git diff main...build/v1 --stat` and read every `src/ui` file for outlines, borders, box shadows, opacity, gradients other than the pie, digits in the clock, and anything pinned to the screen beyond the four corners. Fix and commit anything found.

---

## UI checklist (Task 8, step 1: ui-consistency finding-patterns)

Sized as a new page, the whole phase. No page exists in the repository, so there is no family, no reference and no count: 0 members of 0 candidates in `src/ui`, read 2026-10-29. The shape was agreed in words in `design/chronologic-design.md` and in the four mockup boards (Plane, Zoomed in on the stretch, Choosing a length, Capturing a station), which the request names as the design. The theme is `src/styles/tokens.css`, custom properties written from the design's token tables. Everything below is therefore a proposal from the design, not what the project does, and each role is written as the element whose meaning it has, as nothing in the project is written yet (decisions, *What this does not decide*). Every component is a new piece; the design's stack section names them (world layer under a transform, line as SVG, stations as plain elements, HUD in screen space), so none is asked about.

- [ ] page holder — `<main class="plane">`, full viewport, paper background, `touch-action: none`, attaches the pointer handlers — the design, as asked
- [ ] world layer — a `<div>` whose `style.transform` is `cssTransform(camera)` with origin 0 0, nothing else styled — the design (camera section)
- [ ] station — `<button data-target="station" data-id>` at `left: x px; top: y px` centered by a translate; a shape `<span>` sized `var(--circle)`, `var(--triangle-w)` by `var(--triangle-h)` with the clip-path triangle, or `var(--square)`, filled `var(--ink)`; done = `var(--dot)` disc and the label in `var(--muted)`; label a `<span>` below the shape, font size `labelFontPx(scale) / scale` world px, absent when null; accessible name "title, small/medium/large[, done][, next]" — the mockups, matched to the theme
- [ ] line — one `<svg>` in the world layer, a `<polyline>` with `stroke-width` 10 world units, round caps and joins, stroke `KINDS[kind].color`; terminus bar `var(--terminus-w)` by `var(--terminus-l)` rotated to the segment; train `var(--train-l)` by `var(--train-w)` pill — the mockups
- [ ] HUD holder — four absolutely positioned corner groups in screen space, nothing else pinned: name 44 px from the left and 20 px from the top; clock 40 px from the right and 16 px from the top; bullets 36 px from the left and 12 px from the bottom; add 40 px from the right and 16 px from the bottom — the mockups (all three boards agree)
- [ ] name block — `<h1>` at `var(--name)` weight 700, `<p>` subtitle at `var(--subtitle)` in `var(--muted)` reading "Kind, length words"; empty with no stretch — the mockups
- [ ] clock — `<button data-target="clock">` `var(--hit)` square with a `var(--clock)` disc, background a two stop `conic-gradient`, no text content, accessible name says tap and hold — the mockups; the design's no digits rule
- [ ] bullets and chips — four `<button data-target="bullet" data-line>` of `var(--hit)` holding a `var(--bullet)` disc in the kind color with the initial in paper at 15 px weight 700; chips `var(--chip)` tall, selected = kind fill with paper bold text, others plain ink text, no border — the mockups (Choosing a length)
- [ ] add and capture — `<button>` `var(--add)` ink disc with a paper plus; open, an ink pill of the same height holding an `<input aria-label="Station title">` in paper at 17 px and three paper shape buttons — the mockups (Capturing a station)
- [ ] editor — an ink pill centered at the bottom of the HUD above the bullets, same height as the capture pill — the design (touch grammar), no mockup
- [ ] values through the theme: every color and size a `var(--…)`; no literal hex or px in `src/ui` except world geometry; no `border`, `outline`, `box-shadow`, `opacity`, `filter` or gradient other than the pie; focus and press = the shape filled with the line color — the design's rules that never bend
- [ ] not copied from the mockups: the fixed pixel positions of the sample stations, the 16 px line and 36 px circle of the zoomed board (the camera scales the world instead), the `<a href>` links between boards, the `{{line}}` prop hole
