# Chronologic v2: Tracks and Trains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1 stretch-and-budget model with projects drawn as subway tracks on one plane, each ridden in real time by a train that accelerates, cruises, brakes into every stop and waits there for a tap.

**Architecture:** Pure TypeScript modules hold every rule (routing, the motion profile, train state, the reducer with its train-position invariant, camera, layout, clipping, snapping, bubbles) and are tested without a browser. One reducer owns the persisted world; the v1 store and recognizer patterns are kept. The React layer is thin and draws everything in screen space: world units are seconds, so there is no CSS-scaled world layer; a pure layout function turns a track, the camera and the clock into screen coordinates and components only paint them.

**Tech Stack:** React 18, TypeScript 5, Vite 5, Vitest 2 with jsdom, @testing-library/react 16. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-tracks-design.md` (read it whole before any task), with `design/flow-conditions.md` and `design/nyc-subway-principles.md` beside it. `design/chronologic-design.md` is v1 history; where it disagrees, the spec wins.

## Global Constraints

- One world unit is one second. A leg's planned time is the routed path length between its two stops. Default goal distance: 30 days = `2_592_000` seconds to the right of the origin.
- Motion profile: accelerate for the first fifth, cruise the middle three fifths at `V = 1.25` leg-lengths per leg-time, brake the last fifth. `F = 0.2`.
- Only positions scale with zoom. Track width, stop shapes, train, dot, labels and bubbles are constant screen pixels. Zoom is logarithmic: wheel and pinch multiply the scale.
- Shape is rank (circle step, triangle sub-goal, square goal, exactly one square per track, always last). Size is effort (small, medium, large). Dot is done.
- Only the next stop can be completed. The train never passes a stop on its own; it waits. Nothing is ever overdue; no red, no counts, no numbers for time anywhere on the plane.
- The one confirm in the app is hold-to-confirm on deleting a track. No settings screen; the bubble target is set by tapping the bubble.
- Colours opaque only; no outlines, thin strokes, transparency, shadows or gradients. Paper `#EEEBE5`, Ink `#2B2420`, Muted `#6B635C`. Track palette, eight, in order: `#2440A4`, `#A67C00`, `#1F7A3A`, `#C4251F`, `#6B2D8B`, `#0F6E7A`, `#B5500F`, `#3D4F63`. Font `'Helvetica Neue', Helvetica, Arial, sans-serif`, weights 400 and 700 only.
- Screen sizes: track width 10; circle 14 / 22 / 30; triangle 16x14 / 24x22 / 32x30; square 13 / 20 / 28 (small / medium / large); dot 10; train 30x20 with 6 radius; label 13 px; every tappable thing has at least a 44 px hit area.
- Completing shrinks the shape to a dot over 150 ms and plays one short tone. Completing the goal adds one quiet chord and one 30 ms haptic. Reduced motion turns off eases only; trains keep moving.
- Storage key `chronologic.v2`. A v1 world under `chronologic.v1` is ignored and left in place.
- Commits go on branch `build/v2`, one per task, never pushed, never on `main`. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. The global git user.name on this machine is "Claude Haiku 4.5"; leave it.

## Review Focus

1. A v1 world (or garbage) in localStorage: the app opens on an empty plane, never a blank screen. Test in Task 6.
2. The device sleeps for a week mid-leg: on waking the train is at the stop and waiting, drawn at the platform, with no state past the stop. Test in Task 4.
3. A zero-length leg (a stop dropped on top of its neighbour, or the goal dragged onto the train): no division by zero, the train is waiting at once. Test in Task 4.
4. Coordinates in the hundreds of millions of pixels at maximum zoom: segments off screen are dropped or clipped to the viewport margin and no NaN reaches the DOM. Test in Task 7.
5. A tray drop with no track near, behind a train, or past a goal: nothing is added and nothing throws. Test in Task 13.

---

## File structure

```
src/model/types.ts          Shape, Size, BubbleTarget, Stop, Train, Track, World          (rewrite)
src/model/palette.ts        PALETTE: eight colours with pitches; colorVar()          (new)
src/model/motion.ts         F, V, progress(), invertProgress()                       (new)
src/model/train.ts          trackRoute(), legSeconds(), trainState(), rebase(), targetIndex()  (new)
src/model/reducer.ts        Action union, reduce(), EMPTY                            (rewrite)
src/model/ids.ts            newId()                                                  (keep)
src/store/storage.ts        load()/save() under chronologic.v2                       (rewrite)
src/store/store.ts          createStore(), persist(), useWorld()                     (keep)
src/plane/geometry.ts       Point, distance()                                        (keep)
src/plane/routing.ts        routeThrough() without lead, pointAlong(), pathLength(), nearestOnRoute()  (rewrite)
src/plane/camera.ts         Camera math, new scale range, fitLeg(), interpolate()    (modify)
src/plane/clip.ts           clipSegment() Liang-Barsky                               (new)
src/plane/layout.ts         layoutTrack(): screen-space view of one track            (new)
src/plane/labels.ts         labelsWithRoom()                                         (rewrite)
src/plane/tick.ts           tickMsFor(scale)                                         (new)
src/plane/snap.ts           snapToTracks()                                           (new)
src/plane/bubbles.ts        bubbleFor()                                              (new)
src/plane/opening.ts        openingCamera()                                          (new)
src/plane/placement.ts      placeClear(center, taken, radius)                        (modify)
src/plane/gestures.ts       Recognizer with the v2 Target union                      (modify)
src/plane/world.ts          screen-pixel constants for shapes, track, train          (rewrite)
src/feedback/sound.ts       pitchFor(colorIndex), playTone(), playChord()            (modify)
src/feedback/haptics.ts     buzz()                                                   (keep)
src/ui/Plane.tsx            pointer events in, screen-space children, no transform   (modify)
src/ui/Track.tsx            one track: SVG segments and the train                    (new)
src/ui/Stop.tsx             one stop: shape or dot, label                            (new)
src/ui/Ghost.tsx            the shape under the finger during a tray drag            (new)
src/ui/NameField.tsx        the field that opens beside a new stop or goal           (new)
src/ui/Tray.tsx             the plus and its three tiles                             (new)
src/ui/StopEditor.tsx       long-press panel: title, shape, size, delete / not done  (rewrite)
src/ui/Bubble.tsx           one edge bubble                                          (new)
src/ui/App.tsx              wires store, camera, clock, gestures, HUD               (rewrite)
src/styles/tokens.css       colours and sizes                                        (modify)
src/styles/ui.css           v2 styles                                                (rewrite)
```

Deleted in Task 1: `src/model/{kinds,line,sizes,slide,stretch}.ts` and their tests, `src/ui/{Bullets,CaptureField,Clock,Hud,Line,NameBlock,Station,StationEditor}.tsx` and their tests, `src/ui/App.test.tsx`, `src/plane/{placement,routing,labels}.test.ts` (rewritten in their tasks).

---

### Task 1: Clear the deck

**Files:**
- Create: `src/model/palette.ts`, `src/model/palette.test.ts`
- Modify: `src/model/types.ts`, `src/styles/tokens.css`, `src/ui/App.tsx`, `src/main.tsx`, `src/feedback/sound.ts`, `src/feedback/sound.test.ts`, `src/plane/gestures.ts`, `src/ui/Plane.tsx`
- Delete: the files listed under "Deleted in Task 1" above, plus `src/store/storage.test.ts` and `src/model/reducer.test.ts` (both rewritten later)

**Interfaces:**
- Produces, in `src/model/types.ts`:

```ts
export type Shape = 'circle' | 'triangle' | 'square';
export type Size = 'small' | 'medium' | 'large';
/** What a track's edge bubble points at. Named so it never clashes with the recognizer's pointer Target. */
export type BubbleTarget = 'next' | 'subgoal' | 'goal';
export interface Stop { id: string; title: string; shape: Shape; size: Size; x: number; y: number; done: boolean }
/** Heading to stops[leg] since departedAt (ms epoch). leg === stops.length means parked after the goal. */
export interface Train { leg: number; departedAt: number }
export interface Track { id: string; color: number; origin: { x: number; y: number }; stops: string[]; train: Train; target: BubbleTarget }
export interface World { tracks: Track[]; stops: Stop[]; lastTouched: string | null }
```

- Produces, in `src/model/palette.ts`: `PALETTE: readonly { name: string; color: string; pitchHz: number }[]` (eight entries, colours as in Global Constraints, names blue, ochre, green, red, plum, teal, rust, slate, pitches 262, 330, 392, 440, 494, 523, 587, 659) and `colorVar(index: number): string` returning `var(--track-<name>)`, wrapping the index modulo eight.
- Produces, in `src/feedback/sound.ts`: `pitchFor(color: number): number` reading `PALETTE` (wrapping). `playTone` and `playChord` unchanged.
- Keeps `src/plane/gestures.ts` and `src/ui/Plane.tsx` compiling by changing the bullet target's `line: Kind` to `line: string` (Task 8 replaces the whole union).

- [ ] **Step 1: Create the branch**

```bash
git checkout -b build/v2
```

- [ ] **Step 2: Write the failing palette test**

```ts
// src/model/palette.test.ts
test('eight distinct opaque track colours, each with a pitch, as CSS variables', () => {
  expect(PALETTE).toHaveLength(8);
  expect(new Set(PALETTE.map((p) => p.color)).size).toBe(8);
  expect(PALETTE.every((p) => /^#[0-9A-F]{6}$/.test(p.color))).toBe(true);
  expect(colorVar(0)).toBe('var(--track-blue)');
  expect(colorVar(9)).toBe('var(--track-ochre)'); // wraps
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/model/palette.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Rewrite `src/model/types.ts`, create `src/model/palette.ts`, delete the v1 files**

Delete with `git rm`. In `tokens.css` replace the four kind variables with eight `--track-<name>` variables and replace the world-size block with the screen sizes from Global Constraints (`--track: 10px`, `--dot: 10px`, `--train-l: 30px`, `--train-w: 20px`, `--label: 13px`; shape sizes per size are set in Task 9). Reduce `src/ui/App.tsx` to a component taking `{ store: Store; now?: () => number }` that renders `<main className="plane" aria-label="The plane" />`. `src/main.tsx` keeps mounting App but temporarily passes `createStore({ tracks: [], stops: [], lastTouched: null })` without load/persist.

- [ ] **Step 5: Run everything**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: typecheck clean; the remaining suites pass (palette, camera, gestures, geometry, store, haptics, sound with its test changed to `pitchFor(0)` being 262).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: clear the v1 model and UI for v2"
```

---

### Task 2: Routing without a lead-in

**Files:**
- Modify: `src/plane/routing.ts`
- Create: `src/plane/routing.test.ts`

**Interfaces:**
- Produces: `routeThrough(points: Point[]): Route` where `Route = { vertices: Point[]; stationAt: number[] }`, `stationAt[i]` the vertex index of `points[i]`, no lead vertex (the first vertex is `points[0]`). `pointAlong(vertices, from, to, fraction): { at: Point; angle: number }` unchanged. `pathLength(vertices: Point[], from: number, to: number): number`. `legSpan(route: Route, leg: number): { from: number; to: number }` giving the vertex indices of leg `leg` (from `points[leg]` to `points[leg + 1]`). `nearestOnRoute(route: Route, p: Point): { leg: number; offset: number; at: Point; dist: number }` the closest point on the polyline, `offset` in path units from the start of that leg.
- Remove `LEAD`, `TERMINUS_OVERRUN`, `terminusOf`, `trainOn`.

- [ ] **Step 1: Write the failing tests**

```ts
test('routes a diagonal then a straight run, first vertex is the first point', () => {
  const r = routeThrough([{ x: 0, y: 0 }, { x: 100, y: 30 }]);
  expect(r.vertices).toEqual([{ x: 0, y: 0 }, { x: 30, y: 30 }, { x: 100, y: 30 }]);
  expect(r.stationAt).toEqual([0, 2]);
});
test('pathLength sums the segments and legSpan names a leg', () => {
  const r = routeThrough([{ x: 0, y: 0 }, { x: 100, y: 30 }, { x: 100, y: 130 }]);
  expect(pathLength(r.vertices, 0, 2)).toBeCloseTo(30 * Math.SQRT2 + 70);
  expect(legSpan(r, 1)).toEqual({ from: 2, to: 3 });
});
test('nearestOnRoute finds the leg, the offset along it and the foot point', () => {
  const r = routeThrough([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]);
  expect(nearestOnRoute(r, { x: 150, y: 8 })).toEqual({ leg: 1, offset: 50, at: { x: 150, y: 0 }, dist: 8 });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/plane/routing.test.ts` — FAIL on exports.

- [ ] **Step 3: Implement** the four functions in `src/plane/routing.ts`, keeping `angleOf` and `pointAlong`.

- [ ] **Step 4: Run to verify pass** — same command — PASS.

- [ ] **Step 5: Commit** — `git add src/plane/routing.ts src/plane/routing.test.ts && git commit -m "feat: route a track through its stops with no lead-in"`

---

### Task 3: The motion profile

**Files:**
- Create: `src/model/motion.ts`, `src/model/motion.test.ts`

**Interfaces:**
- Produces: `F = 0.2`, `V = 1.25`, `progress(tau: number): number` (clamped to [0, 1] in and out), `invertProgress(p: number): number`.

Formulas, from the spec:
- `tau < F`: `P = V * tau^2 / (2F)`
- `F <= tau <= 1 - F`: `P = V * (tau - F/2)`
- `tau > 1 - F`: `P = 1 - V * (1 - tau)^2 / (2F)`
- Inverse: `p < V*F/2`: `tau = sqrt(2*F*p / V)`; `p > 1 - V*F/2`: `tau = 1 - sqrt(2*F*(1-p) / V)`; else `tau = p / V + F/2`.

- [ ] **Step 1: Write the failing tests**

```ts
test('the profile starts and ends at rest and is pinned at the fifths', () => {
  expect(progress(0)).toBe(0);
  expect(progress(1)).toBe(1);
  expect(progress(0.2)).toBeCloseTo(0.125);
  expect(progress(0.5)).toBeCloseTo(0.5);
  expect(progress(0.8)).toBeCloseTo(0.875);
  expect(progress(-1)).toBe(0);
  expect(progress(7)).toBe(1);
});
test('progress is monotone and invertProgress is its inverse', () => {
  for (let i = 0; i <= 100; i++) {
    const tau = i / 100;
    expect(invertProgress(progress(tau))).toBeCloseTo(tau, 9);
    if (i > 0) expect(progress(tau)).toBeGreaterThan(progress((i - 1) / 100));
  }
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/model/motion.test.ts`.
- [ ] **Step 3: Implement `src/model/motion.ts`.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: the accelerate, cruise, brake profile"`

---

### Task 4: Train state and the rebase invariant

**Files:**
- Create: `src/model/train.ts`, `src/model/train.test.ts`

**Interfaces:**
- Consumes: Task 2 routing, Task 3 motion, Task 1 types.
- Produces:

```ts
export function trackRoute(track: Track, byId: Map<string, Stop>): Route;      // points = [origin, ...stops in order]
export function legSeconds(route: Route, leg: number): number;                 // pathLength over legSpan
export interface TrainState {
  leg: number; parked: boolean; waiting: boolean;
  seconds: number;      // planned seconds the train has covered on this leg (its offset)
  fraction: number;     // progress(tau), 1 when waiting or parked
  at: Point; angle: number;
}
export function trainState(track: Track, byId: Map<string, Stop>, now: number): TrainState;
/** A train on `leg` that has covered `seconds` of a leg `legLength` long, as of now. */
export function rebase(leg: number, seconds: number, legLength: number, now: number): Train;
export function nextIndex(track: Track): number | null;                         // train.leg, or null when parked
export function targetIndex(track: Track, byId: Map<string, Stop>): number | null;  // per track.target; null when parked
```

Rules: `tau = (now - departedAt) / 1000 / legLength`; `legLength === 0` or `tau >= 1` means waiting with `fraction 1`, `seconds = legLength`, `at` the stop. Parked: `at` the goal, `fraction 1`. `rebase` sets `departedAt = now - invertProgress(seconds / legLength) * legLength * 1000`, or `now - legLength * 1000` when `seconds >= legLength` or `legLength === 0`. `targetIndex`: `'next'` → `train.leg`; `'subgoal'` → first `i >= train.leg` whose shape is triangle, else the goal; `'goal'` → last index.

- [ ] **Step 1: Write the failing tests**

Fixture: a track with origin (0,0), stops a (1000,0) circle, b (1000,1000) triangle, g (3000,1000) square, train `{ leg: 0, departedAt: 0 }`.

```ts
test('mid-leg the train is on the path at the profile fraction', () => {
  const s = trainState(track, byId, 500_000); // tau = 0.5 of a 1000 s leg
  expect(s).toMatchObject({ leg: 0, waiting: false, parked: false, seconds: 500, fraction: 0.5 });
  expect(s.at).toEqual({ x: 500, y: 0 });
});
test('a week asleep: the train is at the stop and waiting, never beyond', () => {
  const s = trainState(track, byId, 7 * 86400 * 1000);
  expect(s).toMatchObject({ leg: 0, waiting: true, fraction: 1, seconds: 1000 });
  expect(s.at).toEqual({ x: 1000, y: 0 });
});
test('a zero-length leg is waiting at once, with no NaN', () => { /* stop a moved to (0,0) */ });
test('parked after the goal', () => { /* train.leg = 3 → parked, at g */ });
test('rebase keeps the offset: the same seconds on a longer leg gives an earlier fraction', () => {
  const t = rebase(0, 500, 2000, 1_000_000);
  expect(trainState({ ...track, train: t }, byId, 1_000_000).seconds).toBeCloseTo(500);
});
test('rebase past the end is waiting', () => { /* rebase(0, 1200, 1000, now) → waiting */ });
test('targetIndex follows the setting', () => {
  expect(targetIndex({ ...track, target: 'next' }, byId)).toBe(0);
  expect(targetIndex({ ...track, target: 'subgoal' }, byId)).toBe(1);
  expect(targetIndex({ ...track, target: 'goal' }, byId)).toBe(2);
  expect(targetIndex({ ...track, train: { leg: 3, departedAt: 0 } }, byId)).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/model/train.test.ts`
- [ ] **Step 3: Implement `src/model/train.ts`.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: where the train is, and keeping it there through edits"`

---

### Task 5: The reducer

**Files:**
- Modify: `src/model/reducer.ts`
- Create: `src/model/reducer.test.ts`

**Interfaces:**
- Consumes: Task 4.
- Produces:

```ts
export const DEFAULT_GOAL_SECONDS = 2_592_000;
export type Action =
  | { type: 'newTrack'; id: string; goalId: string; title: string; origin: Point; now: number }
  | { type: 'addStop'; trackId: string; id: string; shape: 'circle' | 'triangle'; leg: number; x: number; y: number; now: number }
  | { type: 'move'; id: string; x: number; y: number; now: number }        // a pending stop that is not the goal
  | { type: 'moveGoal'; trackId: string; x: number; y: number; now: number }
  | { type: 'edit'; id: string; title?: string; shape?: 'circle' | 'triangle'; size?: Size }
  | { type: 'delete'; id: string; now: number }                            // deleting the goal deletes the track
  | { type: 'complete'; trackId: string; now: number }
  | { type: 'undo'; trackId: string; now: number }
  | { type: 'cycleTarget'; trackId: string };
export const EMPTY: World;
export function reduce(world: World, action: Action): World;
```

Rules the tests pin:
- `newTrack`: goal at `origin + (DEFAULT_GOAL_SECONDS, 0)`, size large, square; `color = tracks.length % 8`; train `{ leg: 0, departedAt: now }`; target `'goal'`; `lastTouched = id`.
- `addStop`: ignored when `leg < train.leg`, when `leg >= stops.length`, or when the shape is square. Inserts at index `leg`. Train leg unchanged, rebased against the new leg length.
- `move`: ignored for a done stop and for the goal. Rebases the track's train.
- `moveGoal`: ignored when the goal is done. Otherwise goal to (x, y); every pending non-goal stop with index `>= train.leg` moves to `T + k * (p - T)` where `T` is the train's point before the edit and `k = |G' - T| / |G - T|` (`k = 1` when `|G - T| = 0`). Rebase.
- `delete`: a stop with index `< train.leg` → removed, `train.leg -= 1`; index `=== train.leg` → removed, leg unchanged, rebased; index `> train.leg` → removed. The goal → the track and all its stops go. `lastTouched` cleared if it named the track.
- `complete`: only when `train.leg < stops.length`: that stop done, train `{ leg: leg + 1, departedAt: now }`.
- `undo`: `i = train.leg - 1`; only when `i >= 0` and `stops[i].done`: not done, train `rebase(i, legLength, legLength, now)` (waiting at i).
- `cycleTarget`: next → subgoal → goal → next.
- Every action that names a track sets `lastTouched` to it.

- [ ] **Step 1: Write the failing tests**, one per rule above, using a `running()` fixture like Task 4's. Include:

```ts
test('adding a stop on the path leaves the total unchanged and keeps the train put', () => {
  const before = trainState(track, byId(world), now).seconds;
  const next = reduce(world, { type: 'addStop', trackId, id: 'n', shape: 'circle', leg: 0, x: 800, y: 0, now });
  expect(total(next)).toBeCloseTo(total(world));
  expect(trainState(next.tracks[0], byId(next), now).seconds).toBeCloseTo(before);
});
test('dragging the next stop onto the train makes the train wait there', () => { /* move a to the train point → waiting */ });
test('moveGoal scales every pending stop ahead of the train about the train', () => { /* k = 2 → b doubles its distance from T */ });
test('only the next stop completes, and undo restores the most recent dot with the train waiting at it', () => {});
test('deleting the goal deletes the track', () => {});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/model/reducer.test.ts`
- [ ] **Step 3: Implement `src/model/reducer.ts`.** Every editing case computes `trainState(...).seconds` before the change and calls `rebase` after.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: the v2 reducer, tracks and stops"`

---

### Task 6: Storage

**Files:**
- Modify: `src/store/storage.ts`
- Create: `src/store/storage.test.ts`

**Interfaces:**
- Produces: `STORAGE_KEY = 'chronologic.v2'`, `load(storage): World`, `save(storage, world)`. A world is trusted only if every track's stop ids exist, each track ends in exactly one square and has no other square, `train.leg` is between 0 and `stops.length`, and `target` is one of the three.

- [ ] **Step 1: Write the failing tests**: round trip; a v1 payload under the old key is ignored and the old key is untouched; a track whose goal is not a square opens as EMPTY; a thrown `setItem` is swallowed.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.** Also run the whole suite.
- [ ] **Step 5: Commit** — `git commit -m "feat: persist the v2 world"`

---

### Task 7: Camera range, clipping, layout, labels, tick

**Files:**
- Modify: `src/plane/camera.ts`, `src/plane/camera.test.ts`, `src/plane/labels.ts`, `src/plane/placement.ts`, `src/plane/world.ts`
- Create: `src/plane/clip.ts`, `src/plane/clip.test.ts`, `src/plane/layout.ts`, `src/plane/layout.test.ts`, `src/plane/labels.test.ts`, `src/plane/placement.test.ts`, `src/plane/tick.ts`, `src/plane/tick.test.ts`

**Interfaces:**
- `camera.ts`: `MIN_SCALE = 0.0002`, `MAX_SCALE = 20` (px per second), `MOTION_SCALE = MAX_SCALE`, `HOME = { x: 0, y: 0, scale: 0.01 }`; keep `worldToScreen`, `screenToWorld`, `panBy`, `zoomAt`, `centerOn`; remove `cssTransform`, `STRETCH_ZOOM`, `DEFAULT_ZOOM`. Add `fitLeg(legSeconds: number, viewportW: number, fraction = 1 / 3): number` = clamped `viewportW * fraction / legSeconds`, and `interpolate(a: Camera, b: Camera, t: number): Camera` (linear in x, y; geometric in scale).
- `clip.ts`: `clipSegment(a: Point, b: Point, rect: { x: number; y: number; w: number; h: number }): [Point, Point] | null` (Liang-Barsky). `CLIP_MARGIN_PX = 200`.
- `world.ts`: `TRACK_WIDTH = 10`, `TRAIN = { length: 30, width: 20, radius: 6 }`, `DOT = 10`, `SHAPE_PX: Record<Shape, Record<Size, { w: number; h: number }>>` with the sizes from Global Constraints, `SNAP_PX = 24`, `LABEL_ROOM_PX = 80`.
- `labels.ts`: `labelsWithRoom(stops: { id: string; x: number }[], always: Set<string>): Set<string>` greedy left to right: always-ids first, then each other stop if no shown label is within `LABEL_ROOM_PX` of its x.
- `placement.ts`: `placeClear(center, taken, radius)` taking the radius in world units.
- `tick.ts`: `tickMsFor(scale: number): number` = `clamp(1000 / (V * scale), 16, 60_000)`.
- `layout.ts`:

```ts
export interface StopView { id: string; x: number; y: number; shape: Shape; size: Size; done: boolean; title: string; label: boolean; next: boolean; goal: boolean }
export interface TrainView { x: number; y: number; angle: number; waiting: boolean; parked: boolean }
export interface TrackView { id: string; color: number; finished: boolean; segments: [Point, Point][]; stops: StopView[]; train: TrainView; anyInView: boolean }
export function layoutTrack(track: Track, byId: Map<string, Stop>, camera: Camera, now: number, viewport: { w: number; h: number }): TrackView;
```
Segments are the route's edges in screen space clipped to the viewport grown by `CLIP_MARGIN_PX`, dropped when outside. Stops outside the grown viewport are omitted. `finished` is parked. `anyInView` is true when any segment, stop or the train survived. Labels: `labelsWithRoom` with the goal and the next stop always.

- [ ] **Step 1: Write the failing tests**

```ts
// clip.test.ts
test('a segment a billion pixels long is clipped to the margin and keeps its slope', () => {
  const s = clipSegment({ x: -1e9, y: 10 }, { x: 1e9, y: 10 }, { x: -200, y: -200, w: 1400, h: 1200 });
  expect(s).toEqual([{ x: -200, y: 10 }, { x: 1200, y: 10 }]);
});
test('a segment entirely outside is dropped', () => { expect(clipSegment({ x: 5e8, y: 0 }, { x: 6e8, y: 0 }, rect)).toBeNull(); });
// layout.test.ts
test('a track lays out in screen space with constant shapes, a dot for done, and the train on the path', () => { /* scale 0.1, pan (100, 100) */ });
test('nothing off screen reaches the view and no NaN is produced at max zoom with a month of track', () => {});
// labels.test.ts, placement.test.ts, tick.test.ts: one test each pinning the rules above
// camera.test.ts: add fitLeg clamps, interpolate at t = 0.5 is the geometric mean of scales
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/plane`
- [ ] **Step 3: Implement** the modules.
- [ ] **Step 4: Run to verify pass** and the whole suite.
- [ ] **Step 5: Commit** — `git commit -m "feat: screen-space layout, clipping and the zoom range"`

---

### Task 8: Gestures for v2 targets

**Files:**
- Modify: `src/plane/gestures.ts`, `src/plane/gestures.test.ts`

**Interfaces:**
- Produces:

```ts
export type Target =
  | { kind: 'paper' }
  | { kind: 'stop'; id: string; track: string; goal: boolean }
  | { kind: 'train'; track: string }
  | { kind: 'bubble'; track: string }
  | { kind: 'tile'; tile: 'circle' | 'triangle' | 'line' }
  | { kind: 'hold'; id: string }
  | { kind: 'hud' };
```
Gesture union unchanged. Draggable: `stop`, `tile`. Long press: `stop`, `bubble`. Hold (`holdStart`/`holdEnd`): `hold`. Tap: everything. `TAP_SLOP`, `LONG_PRESS_MS`, `HOLD_MS` unchanged.

- [ ] **Step 1: Update the tests**: replace `station` with `stop`, `bullet` with `tile`, `clock` with `hold`; add a long press on a bubble fires `longPress`; a drag starting on a bubble emits nothing.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** in `gestures.ts`.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: gesture targets for stops, trains, tiles and bubbles"`

---

### Task 9: Drawing tracks, stops and trains

**Files:**
- Create: `src/ui/Track.tsx`, `src/ui/Stop.tsx`, `src/ui/App.test.tsx`
- Modify: `src/ui/Plane.tsx`, `src/ui/App.tsx`, `src/styles/ui.css`, `src/styles/tokens.css`

**Interfaces:**
- `Plane` props: `{ onGesture; onZoom; hud: ReactNode; children: ReactNode }`; no camera, no transform; renders `<main className="plane">` with a `<div className="world">` child in screen space and the HUD over it. Keeps the recognizer wiring and the wheel listener from v1.
- `Track` props: `{ view: TrackView }`: one absolutely positioned `<svg className="track">` with a `<line>` per segment (`stroke: colorVar(view.color)`, width `TRACK_WIDTH`, round caps) and the train `<rect data-train data-target="train" data-track={id}>` positioned by `transform: translate(x, y) rotate(angle)`. The train carries `data-target` only while rolling; a waiting or parked train is drawn beneath the stops layer so the stop takes the tap. A finished track uses `var(--muted)`.
- `Stop` props: `{ stop: StopView; track: string; color: string }`: a `<button className="stop" data-target="stop" data-id data-track data-goal>` at `left/top` in screen px, shape by `SHAPE_PX`, `.dot` when done, label beneath when `stop.label`. `aria-label` is the title, the shape word (circle "step", triangle "sub-goal", square "goal"), the size word (small, medium, large), then "done" or "next" when either applies, comma separated; an empty title is read as "Unnamed". The shape's width, height and border radius ease over 150 ms, as v1's did, so completing shrinks to the dot.
- `App`: holds `camera`, `now` (ticked by `tickMsFor(camera.scale)` while any track is unparked), `viewport` (window size, updated on resize); computes `layoutTrack` for every track; renders Tracks, then Stops, then the HUD (empty for now).
- Test fixture `running()` in `App.test.tsx`, reused by Tasks 10 to 15: one track, colour 0, origin (0, 0), stops Dentist (circle, medium, at 1000, 0), Wristband (square, large, at 3000, 0), train `{ leg: 0, departedAt: 0 }`, target goal. Tests render with `now={() => 500_000}` unless they say otherwise and set `window.innerWidth`/`innerHeight` to 1000 by 800.

- [ ] **Step 1: Write the failing tests** in `src/ui/App.test.tsx`

```ts
test('a seeded world draws its stops as shapes with labels and the train on the path', () => {
  render(<App store={createStore(running())} now={() => 500_000} />);
  expect(screen.getByRole('button', { name: 'Dentist, step, medium, next' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Wristband, goal, large' })).toBeInTheDocument();
  expect(document.querySelector('[data-train]')).toBeInTheDocument();
});
test('a done stop is a dot and a finished track is muted', () => {});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** the components, the App skeleton and the styles. `ui.css` keeps v1's `.plane`, focus rules and pill styles; replaces `.world` (no transform), `.line` → `.track`, `.station` → `.stop` with size classes `.small/.medium/.large` per shape from `SHAPE_PX` written as CSS variables in `tokens.css`.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: draw tracks, stops and trains in screen space"`

---

### Task 10: Pan, zoom, opening and the train tap

**Files:**
- Create: `src/plane/opening.ts`, `src/plane/opening.test.ts`
- Modify: `src/ui/App.tsx`, `src/ui/App.test.tsx`

**Interfaces:**
- `opening.ts`: `openingCamera(world: World, now: number, viewport: { w: number; h: number }): Camera`. Picks the unparked track with the least seconds to arrival (waiting counts as 0; ties by `lastTouched`), scale `fitLeg(legSeconds of the current leg, or of the next leg when waiting, viewport.w)`, centred on the train's point. No unparked track → `HOME`.
- App: `pan` → `panBy`; `pinch` → `zoomAt` then `panBy`; wheel → `zoomAt` with `Math.exp(-deltaY / 500)`; opening effect sets the camera from `openingCamera` once. A tap on a train stashes the camera and goes to `MOTION_SCALE` centred on the train over 400 ms using `interpolate` in a rAF loop (snap under `prefers-reduced-motion`); a second tap on it returns to the stash.

- [ ] **Step 1: Write the failing tests**: `opening.test.ts` (waiting beats rolling; a parked track is skipped; no tracks → HOME); App: "opening centres the soonest train" (the train's screen x is viewport.w / 2 within a pixel); "tapping the train zooms to the motion scale and tapping again returns".
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Add `useFly(setCamera)` inside `App.tsx` (a small hook, not exported) driving `interpolate`.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: pan, zoom, opening on the nearest train, and the motion zoom"`

---

### Task 11: Completing, undo, and feedback

**Files:**
- Modify: `src/ui/App.tsx`, `src/ui/App.test.tsx`
- Create: `src/ui/StopEditor.tsx` (the dot panel half only; the edit half is Task 14), `src/ui/StopEditor.test.tsx`

**Interfaces:**
- Consumes: `pitchFor(color)` from Task 1, `playTone`, `playChord`, `buzz`.
- `StopEditor` props: `{ stop: Stop; goal: boolean; done: boolean; onEdit; onDelete; onUndo; onClose }`. When `done`, the panel shows only "Not done" and, for the goal, a `data-target="hold" data-id="delete"` button labelled "Hold to delete" that fills while held. When not done, the Task 14 controls.
- App: a tap on `stop` whose index is `train.leg` dispatches `complete` and plays `playTone(ctx, pitchFor(track.color))`; if that stop was the goal, also `playChord` and `buzz`. A tap on any other pending stop does nothing. A long press on the most recent dot (`index === train.leg - 1` and done) opens the editor in dot mode; "Not done" dispatches `undo`.

- [ ] **Step 1: Write the failing tests**: "tapping the next stop completes it and the train departs toward the following stop"; "tapping a later stop does nothing"; "the goal completion plays the chord and buzzes" (spy on `AudioContext` as v1's tests do); "a long press on the most recent dot offers Not done, which puts the train back waiting there".
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: completing a stop, undoing it, and the tones"`

---

### Task 12: Dragging stops and the goal

**Files:**
- Modify: `src/ui/App.tsx`, `src/ui/App.test.tsx`

**Interfaces:**
- `dragStart` on a pending `stop`: record the grip as v1 did (`stop - under`). `dragMove`/`dragEnd`: `move` with `under + grip` for a non-goal; `moveGoal` for the goal. Done stops ignore drags (the reducer refuses too).

- [ ] **Step 1: Write the failing tests**: "dragging a stop moves it in world seconds keeping the grip" (screen 50 px at scale 0.1 is 500 s); "dragging the goal scales the stops ahead of the train"; "a dot does not move".
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: drag a stop anywhere, drag the goal to stretch the track"`

---

### Task 13: The tray, snapping, naming and new tracks

**Files:**
- Create: `src/plane/snap.ts`, `src/plane/snap.test.ts`, `src/ui/Tray.tsx`, `src/ui/Ghost.tsx`, `src/ui/NameField.tsx`, `src/ui/Tray.test.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/App.test.tsx`, `src/styles/ui.css`

**Interfaces:**
- `snap.ts`: `snapToTracks(world: World, p: Point, now: number, radius: number): { trackId: string; leg: number; at: Point } | null`. Considers, per unparked track, only the path from the train's current point to the goal: legs `>= train.leg`, and on the train's own leg only offsets `> trainState.seconds`. Returns the nearest within `radius` (world units).
- `Tray` props: `{ open: boolean; onToggle: () => void }`: the plus button (`aria-label` "Add") and, when open, three tiles with `data-target="tile" data-tile="circle|triangle|line"`, labelled "Step", "Sub-goal", "New line".
- `Ghost` props: `{ x: number; y: number; shape; snapped: boolean }` drawn in the plane layer under the finger or at the snap point.
- `NameField` props: `{ x: number; y: number; label: string; onCommit: (title: string) => void; onCancel: () => void }`: an input at screen (x, y) that commits on Return and cancels on Escape or blur. Empty Return commits an empty title.
- App: `dragStart` on a tile sets a ghost; `dragMove` snaps with `SNAP_PX / camera.scale`; `dragEnd` with a snap dispatches `addStop` (`leg`, `at`, shape, `newId()`) then opens `NameField` beside the new stop; `edit` on commit; cancel leaves the bare stop. The tray stays open until the plus or paper is tapped. A tap on the `line` tile dispatches `newTrack` with `origin = placeClear(centre of view in world, all stops and origins, 48 / camera.scale)`, opens `NameField` for the goal, and sets the camera to fit the new track at `fitLeg(DEFAULT_GOAL_SECONDS, viewport.w, 1 / 2)` centred on its midpoint; Escape dispatches `delete` of the goal.

- [ ] **Step 1: Write the failing tests**

```ts
// snap.test.ts
test('snaps to the nearest path ahead of the train, never behind it or past the goal', () => {});
test('nothing near returns null', () => {});
// App.test.tsx
test('dragging a circle from the tray onto a track adds a stop there and opens the name field', () => {});
test('dropping a tile on empty paper adds nothing', () => {});
test('the new line tile makes a track with a goal thirty days out and names it', () => {});
test('Escape on a new goal name removes the track', () => {});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: the tray, snapping a stop onto the line, and new lines"`

---

### Task 14: The editor

**Files:**
- Modify: `src/ui/StopEditor.tsx`, `src/ui/StopEditor.test.tsx`, `src/ui/App.tsx`, `src/ui/App.test.tsx`

**Interfaces:**
- Not-done mode of `StopEditor`: title input (edits live, as v1), shape buttons circle and triangle (hidden for the goal), size buttons Small / Medium / Large with `aria-pressed`, and Delete. For a non-goal, Delete dispatches at once. For the goal, the button is `data-target="hold" data-id="delete"` labelled "Hold to delete the line"; the App's `holdEnd` with `completed` dispatches `delete` of the goal; its `.holding` style shrinks the fill over `HOLD_MS` like v1's clock.
- App: `longPress` on a pending stop opens the editor; a tap on paper closes it.

- [ ] **Step 1: Write the failing tests**: "a long press opens the editor and typing renames"; "size buttons set the size"; "delete on a stop removes it and merges the legs"; "delete on the goal needs a completed hold; a short hold does nothing".
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: the stop editor with hold-to-delete on the line"`

---

### Task 15: Edge bubbles

**Files:**
- Create: `src/plane/bubbles.ts`, `src/plane/bubbles.test.ts`, `src/ui/Bubble.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/App.test.tsx`, `src/styles/ui.css`

**Interfaces:**
- `bubbles.ts`: `BUBBLE_INSET_PX = 16`; `bubbleFor(target: Point, viewport: { w: number; h: number }): { x: number; y: number } | null`: null when the target is inside the viewport; otherwise the point where the ray from the viewport centre to the target crosses the viewport edge, pulled in by the inset.
- `Bubble` props: `{ track: string; color: string; shape: Shape; title: string; x: number; y: number }`: a paper pill with the shape in the track colour and the title, `data-target="bubble" data-track`.
- App: for every track with `anyInView` and a `targetIndex`, compute the target's screen point; render a Bubble when `bubbleFor` is non-null. Tap → `cycleTarget`. Long press → fly to the target at the current scale.

- [ ] **Step 1: Write the failing tests**: `bubbles.test.ts` (inside → null; a target far right lands on the right edge at the centre row; a target up-left lands on the top or left edge within the inset); App: "a track whose goal is off screen shows a bubble naming it, and a tap cycles it to the next stop".
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat: edge bubbles that point at the goal"`

---

### Task 16: Persistence, docs and the whole-plan check

**Files:**
- Modify: `src/main.tsx`, `README.md`, `public/manifest.webmanifest` (description only, if it mentions stretches)

- [ ] **Step 1: Wire `main.tsx`** to `createStore(load(localStorage))` and `persist(store, localStorage)`.
- [ ] **Step 2: Rewrite README.md** in the v1 README's voice: what the app is now, the gestures, how to run and test.
- [ ] **Step 3: Run the full checks**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run && npm run build`
Expected: all pass, build succeeds.

- [ ] **Step 4: Walk the spec in the browser** with `npm run dev`, seeding a world through the tray: make a line, drop three stops, drag one sideways and watch the legs change, zoom to the train and see it move, complete a stop, undo it, cycle a bubble, hold to delete a line. Note anything that does not match the spec and fix it in this task, with a test if it is a rule.
- [ ] **Step 5: Commit** — `git commit -m "docs: README for v2 and the whole-plan check"`
- [ ] **Step 6:** Use `superpowers:finishing-a-development-branch`. Merging into `main` is Ian's call.
