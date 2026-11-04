# Box select and dragging the start of a line. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The start of every line is a drag handle, and a Shift-drag with the mouse draws a box whose contents move as one piece.

**Architecture:** The model stays a pure reducer over `World`: two actions, `moveOrigin` for one line's start and `moveGroup` for a set of stops and origins given their new points, both ending in the existing `keepTrain` so no train moves. A pure `src/plane/select.ts` turns a world rectangle into a selection and a selection into its bounds. The recognizer learns three targets, `origin`, `marquee` and `selection`, all of which drag like a stop. `App` holds the selection as state and works every group move from the drag's start.

**Tech Stack:** React 18, TypeScript, Vite, Vitest with jsdom and Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-03-select-and-origin-design.md` (a change to `docs/superpowers/specs/2026-11-01-day-line-design.md`).

## Global Constraints

- Pure modules in `src/model` and `src/plane`, tested without a browser; the UI only wires them.
- One world unit is one second of plan. An edit never moves the train (`keepTrain`).
- The look: opaque colours from `src/styles/tokens.css` only. The box is the one dashed line in the app, in `--ink`, and is never part of the saved world.
- Hit targets are 44 px (`TAP_PX`, `--tap`) and paint nothing.
- Every existing test stays green at every commit. Run `npx vitest run` and `npx tsc --noEmit -p tsconfig.json` before each commit.
- Commits go on branch `build/select`, already made from `main`. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Code comments and copy follow the repo's voice: short sentences, no jargon, say why.

## Review Focus

1. A group move of a goal together with every pending stop ahead of its train: the goal must translate, not scale, and the leg from the train's last stop into the group stretches with the train's progress kept. (Task 1)
2. Dragging the start of a line whose train has passed the first stop: no stop moves, no train moves, no chip. (Tasks 1 and 5)
3. A box drawn after a pan and a zoom: it must pick in world coordinates, so what looks inside is inside. (Task 6)
4. A stop in the selection is deleted from its editor: the box shrinks to what is left, and vanishes when nothing is. (Task 6)
5. A box over a stop hidden by the level: the stop is picked and moves with the group. (Tasks 2 and 6)

---

### Task 1: The model moves a line's start and a group

**Files:**
- Modify: `src/model/reducer.ts` (the `Action` union and `apply`)
- Test: `src/model/reducer.test.ts`

**Interfaces:**
- Produces: `{ type: 'moveOrigin'; trackId: string; x: number; y: number; now: number; keep?: number }` and `{ type: 'moveGroup'; stops: Record<string, Point>; origins: Record<string, Point>; now: number; keep?: Record<string, number> }` on `Action`. `stops` maps stop id to its new point; `origins` maps track id to its new origin. `keep` is per track id, as for `move`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('moveOrigin', () => {
  test('moves the start, and a train on the first leg keeps its seconds', () => {
    const before = running();
    const was = trainState(before.tracks[0], byId(before), now);
    const after = reduce(before, { type: 'moveOrigin', trackId, x: -1000, y: 0, now });
    expect(after.tracks[0].origin).toEqual({ x: -1000, y: 0 });
    expect(after.stops).toEqual(before.stops);
    const is = trainState(after.tracks[0], byId(after), now);
    expect(is.leg).toBe(0);
    expect(is.seconds).toBeCloseTo(was.seconds, 6);
    expect(legSeconds(trackRoute(after.tracks[0], byId(after)), 0)).toBe(2000);
  });
  test('past the first stop the start is history: it moves and nothing else changes', () => {
    const before = running();
    before.stops[0].done = true;
    before.tracks[0].train = { leg: 1, departedAt: 0 };
    const after = reduce(before, { type: 'moveOrigin', trackId, x: 0, y: -500, now });
    expect(after.tracks[0].origin).toEqual({ x: 0, y: -500 });
    expect(after.tracks[0].train).toEqual(before.tracks[0].train);
  });
  test('an unknown track is ignored', () => {
    const before = running();
    expect(reduce(before, { type: 'moveOrigin', trackId: 'nope', x: 1, y: 1, now })).toBe(before);
  });
});

describe('moveGroup', () => {
  test('a whole line moves as a picture: every leg keeps its time and the train its place', () => {
    const before = running();
    const was = trainState(before.tracks[0], byId(before), now);
    const shift = (p: { x: number; y: number }) => ({ x: p.x + 100, y: p.y - 50 });
    const after = reduce(before, {
      type: 'moveGroup',
      stops: Object.fromEntries(before.stops.map((s) => [s.id, shift(s)])),
      origins: { [trackId]: shift(before.tracks[0].origin) },
      now,
    });
    expect(after.tracks[0].origin).toEqual({ x: 100, y: -50 });
    expect(after.stops.map((s) => [s.x, s.y])).toEqual([[1100, -50], [1100, 950], [3100, 950]]);
    expect(total(after)).toBeCloseTo(total(before), 6);
    const is = trainState(after.tracks[0], byId(after), now);
    expect(is.seconds).toBeCloseTo(was.seconds, 6);
    expect(is.at).toEqual(shift(was.at));
  });
  test('a goal in the group translates and never scales, and a leg half in stretches with the train kept', () => {
    const before = running();
    const was = trainState(before.tracks[0], byId(before), now);
    const after = reduce(before, { type: 'moveGroup', stops: { b: { x: 1000, y: 2000 }, g: { x: 3000, y: 2000 } }, origins: {}, now });
    expect(after.stops.find((s) => s.id === 'a')).toMatchObject({ x: 1000, y: 0 });
    expect(after.stops.find((s) => s.id === 'g')).toMatchObject({ x: 3000, y: 2000 });
    expect(trainState(after.tracks[0], byId(after), now).seconds).toBeCloseTo(was.seconds, 6);
  });
  test('a done stop moves too, and the train behind a moved leg keeps its place on every line', () => {
    const before = twoLines();
    before.stops[0].done = true;
    before.tracks[0].train = { leg: 1, departedAt: 0 };
    const was = before.tracks.map((t) => trainState(t, byId(before), now));
    const after = reduce(before, { type: 'moveGroup', stops: { dentist: { x: 1000, y: 300 }, shared: { x: 1500, y: 900 } }, origins: {}, now });
    expect(after.stops.find((s) => s.id === 'dentist')).toMatchObject({ x: 1000, y: 300, done: true });
    after.tracks.forEach((t, i) => expect(trainState(t, byId(after), now).seconds).toBeCloseTo(was[i].seconds, 6));
  });
  test('ids the world does not know are ignored, and an empty group is no change', () => {
    const before = running();
    expect(reduce(before, { type: 'moveGroup', stops: {}, origins: {}, now })).toBe(before);
    expect(reduce(before, { type: 'moveGroup', stops: { nope: { x: 0, y: 0 } }, origins: { nope: { x: 0, y: 0 } }, now })).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/model/reducer.test.ts`. Expected: FAIL, the reducer returns the world unchanged or TypeScript rejects the action type.

- [ ] **Step 3: Implement both cases in `apply`**

`moveOrigin`: find the track; return `world` if missing. Write the origin, set `lastTouched` to the track, then `keepTrain(world, after, trackId, now, keep)`.

`moveGroup`: keep only ids the world knows; return `world` when none remain. Write every listed stop's point (done or not) and every listed origin, set `lastTouched` to the first track touched. Touched tracks are those whose origin moved or that list any moved stop; reduce them through `keepTrain(world, w, t.id, now, keep?.[t.id])`.

- [ ] **Step 4: Run to verify they pass, then typecheck and commit**

```bash
npx vitest run src/model/reducer.test.ts && npx tsc --noEmit -p tsconfig.json
git add src/model/reducer.ts src/model/reducer.test.ts
git commit -m "feat: the model moves a line's start and a group of points"
```

---

### Task 2: Picking a selection and its bounds

**Files:**
- Create: `src/plane/select.ts`, `src/plane/select.test.ts`

**Interfaces:**
- Produces: `interface Rect { x: number; y: number; w: number; h: number }`; `interface Selection { stops: string[]; origins: string[] }`; `rectOf(a: Point, b: Point): Rect` (any two corners, normalised, w and h >= 0); `pick(world: World, box: Rect): Selection | null` (every stop whose point is inside or on the edge, every track whose origin is; null when both lists are empty); `bounds(world: World, s: Selection): Rect | null` (the bounds of the points of every id the world still knows; null when none remain); `prune(world: World, s: Selection): Selection | null` (the selection without ids the world no longer has; null when empty).

- [ ] **Step 1: Write the failing tests**

```ts
test('rectOf takes any two corners', () => {
  expect(rectOf({ x: 10, y: 20 }, { x: 0, y: 5 })).toEqual({ x: 0, y: 5, w: 10, h: 15 });
});
test('pick takes the stops and origins inside, edges included, drawn or not', () => {
  const world = twoLines();
  expect(pick(world, { x: 0, y: 0, w: 1500, h: 600 })).toEqual({ stops: ['dentist', 'shared'], origins: ['t1', 't2'] });
  expect(pick(world, { x: 2900, y: -10, w: 200, h: 20 })).toEqual({ stops: ['wristband'], origins: [] });
  expect(pick(world, { x: 5000, y: 5000, w: 10, h: 10 })).toBeNull();
});
test('bounds wrap what is still in the world, and prune drops what is not', () => {
  const world = twoLines();
  const s = { stops: ['dentist', 'goal2', 'gone'], origins: ['t2', 'gone'] };
  expect(bounds(world, s)).toEqual({ x: 0, y: 0, w: 3000, h: 600 });
  expect(prune(world, s)).toEqual({ stops: ['dentist', 'goal2'], origins: ['t2'] });
  expect(bounds(world, { stops: ['gone'], origins: [] })).toBeNull();
  expect(prune(world, { stops: ['gone'], origins: [] })).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/plane/select.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/plane/select.ts`**

Pure functions over `World` and `Point`. Order of ids follows the world's order.

- [ ] **Step 4: Run to verify it passes, then commit**

```bash
git add src/plane/select.ts src/plane/select.test.ts
git commit -m "feat: a box picks the stops and line starts inside it"
```

---

### Task 3: The recognizer knows the start of a line, the marquee and the selection

**Files:**
- Modify: `src/plane/gestures.ts` (the `Target` union, the `pending` branch of `move`)
- Test: `src/plane/gestures.test.ts`

**Interfaces:**
- Produces: `Target` gains `{ kind: 'origin'; track: string }` (the start of a line), `{ kind: 'marquee' }` (empty paper with the select key held) and `{ kind: 'selection' }` (the drawn box). All three drag like a stop: `dragStart`, `dragMove`, `dragEnd` past the slop; a short press is a `tap` with that target. None long presses.

- [ ] **Step 1: Write the failing tests**

```ts
const origin: Target = { kind: 'origin', track: 't' };
const marquee: Target = { kind: 'marquee' };
const selection: Target = { kind: 'selection' };

test.each([origin, marquee, selection])('%o drags like a stop and never long presses', (target) => {
  const { r, gestures } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, target);
  r.tick(LONG_PRESS_MS + 1);
  r.move({ id: 1, x: 20, y: 0, t: 600 });
  r.up({ id: 1, x: 30, y: 0, t: 700 });
  expect(gestures()).toEqual([
    { type: 'dragStart', target, at: { x: 0, y: 0 } },
    { type: 'dragMove', target, at: { x: 20, y: 0 } },
    { type: 'dragEnd', target, at: { x: 30, y: 0 } },
  ]);
});

test('a short press on the marquee or the selection is a tap', () => {
  const { r, gestures } = rig();
  r.down({ id: 1, x: 0, y: 0, t: 0 }, selection);
  r.up({ id: 1, x: 2, y: 0, t: 100 });
  expect(gestures()).toEqual([{ type: 'tap', target: selection, at: { x: 0, y: 0 } }]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/plane/gestures.test.ts`. Expected: FAIL, the moves emit nothing (mode goes `dead`).

- [ ] **Step 3: Implement**

Add the three kinds to `Target` with a one-line comment each. In the `pending` branch, the drag condition becomes a set: `stop`, `tile`, `origin`, `marquee`, `selection`. The long-press test in `tick` is unchanged.

- [ ] **Step 4: Run to verify it passes, then commit**

```bash
git add src/plane/gestures.ts src/plane/gestures.test.ts
git commit -m "feat: the recognizer drags a line's start, a marquee and a selection"
```

---

### Task 4: Layout and the track draw a hit target at the start of a line

**Files:**
- Modify: `src/plane/layout.ts` (`TrackView`, `layoutTrack`), `src/ui/Track.tsx`, `src/styles/ui.css`
- Test: `src/plane/layout.test.ts`, `src/ui/App.test.tsx`

**Interfaces:**
- Produces: `TrackView.origin: Point` (the origin in screen pixels). `Track` draws an unpainted `rect.origin-hit` of `TAP_PX` by `TAP_PX` centred on it with `data-target="origin"` and `data-track`, `fill="none"`, `pointerEvents="all"`, before the segments so a stop drawn later still wins.

- [ ] **Step 1: Write the failing tests**

```ts
// layout.test.ts
test('the view carries the origin in screen pixels', () => {
  const camera = { x: 100, y: 100, scale: 0.1 };
  const track = trackOf(['a']);
  const v = layoutTrack(track, worldOf(track, [stop('a', 1000, 0)]), camera, 0, viewport);
  expect(v.origin).toEqual(worldToScreen(camera, { x: 0, y: 0 }));
});
```

```tsx
// App.test.tsx
test('the start of a line has a 44 px hit target that paints nothing', () => {
  render(<App store={createStore(running())} now={() => WAITING} />);
  const hit = document.querySelector<SVGRectElement>('[data-target="origin"]')!;
  expect(hit).toBeInTheDocument();
  expect(hit.getAttribute('width')).toBe('44');
  expect(hit.getAttribute('height')).toBe('44');
  expect(hit.getAttribute('fill')).toBe('none');
  expect(hit.dataset.track).toBe('t1');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/plane/layout.test.ts src/ui/App.test.tsx -t "origin|start of a line"`. Expected: FAIL.

- [ ] **Step 3: Implement**

In `layoutTrack`, `origin: vertices[0]` (the first routed vertex is the origin, already in screen pixels). In `Track`, add the rect translated to `view.origin` with `x={-TAP_PX / 2}`, `y={-TAP_PX / 2}`. Add `.origin-hit { cursor: grab; }` to `src/styles/ui.css` beside the track rules.

- [ ] **Step 4: Run to verify they pass, then commit**

```bash
git add src/plane/layout.ts src/plane/layout.test.ts src/ui/Track.tsx src/ui/App.test.tsx src/styles/ui.css
git commit -m "feat: the start of a line has a hit target"
```

---

### Task 5: The app drags the start of a line

**Files:**
- Modify: `src/ui/App.tsx` (`startDrag`, `dragTo`, `onGesture`)
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `moveOrigin` (Task 1), the `origin` target (Task 3), `TrackView.origin` (Task 4).

- [ ] **Step 1: Write the failing tests**

```tsx
/** Presses on a line's start 4 px off its centre, moves by (dx, dy), and returns the release. */
function dragOrigin(dx: number, dy: number) {
  const hit = document.querySelector<SVGRectElement>('[data-target="origin"]')!;
  const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(hit.style.transform)!;
  const x = parseFloat(m[1]) + 4;
  const y = parseFloat(m[2]);
  fireEvent.pointerDown(hit, { pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerMove(hit, { pointerId: 1, clientX: x + dx, clientY: y + dy });
  return () => fireEvent.pointerUp(hit, { pointerId: 1, clientX: x + dx, clientY: y + dy });
}

test('dragging the start of a line moves it, keeps the train, and shows the first leg time', () => {
  const NOW = 500_000;
  const store = createStore(running());
  render(<App store={store} now={() => NOW} />);
  const stops = () => new Map(store.getState().stops.map((s) => [s.id, s]));
  const was = trainState(store.getState().tracks[0], stops(), NOW);
  const scale = scaleOnScreen();
  let up = () => {};
  act(() => { up = dragOrigin(-50, 30); });
  const track = store.getState().tracks[0];
  expect(track.origin.x).toBeCloseTo(-50 / scale, 6);
  expect(track.origin.y).toBeCloseTo(30 / scale, 6);
  expect(stopNamed(store, 'dentist')).toMatchObject({ x: 1000, y: 0 });
  expect(trainState(track, stops(), NOW).seconds).toBeCloseTo(was.seconds, 6);
  const chip = document.querySelector('.leg-time')!;
  expect(chip.textContent).toBe(formatSeconds(legSeconds(trackRoute(track, stops()), 0)));
  act(() => up());
  expect(document.querySelector('.leg-time')).not.toBeInTheDocument();
});

test('past the first stop the start drags with no chip', () => {
  const world = running();
  world.stops[0].done = true;
  world.tracks[0].train = { leg: 1, departedAt: 0 };
  const store = createStore(world);
  render(<App store={store} now={() => 500_000} />);
  let up = () => {};
  act(() => { up = dragOrigin(-50, 0); });
  expect(store.getState().tracks[0].origin.x).toBeLessThan(0);
  expect(document.querySelector('.leg-time')).not.toBeInTheDocument();
  act(() => up());
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/ui/App.test.tsx -t "start"`. Expected: FAIL, the origin does not move.

- [ ] **Step 3: Implement**

A new ref `originDrag: { track: string; grip: Point; keep?: number; chip: boolean } | null`. In `startDrag`, on an `origin` target: find the track, `grip = origin - under`, `keep = trainState(...).seconds` when not day and not parked, `chip = !track.day && trainState(...).leg === 0 && !parked`. A move dispatches `moveOrigin` with `under + grip`, then if `chip` sets `legTime` at the origin's screen point with `legSeconds(trackRoute(track, byId), 0)`. `dragEnd` moves once more, clears the ref and `legTime`. Clear this ref alongside the others at the top of `startDrag`. Route `dragMove` and `dragEnd` through it before `dragTo`.

- [ ] **Step 4: Run the whole suite, typecheck, commit**

```bash
npx vitest run && npx tsc --noEmit -p tsconfig.json
git add src/ui/App.tsx src/ui/App.test.tsx
git commit -m "feat: drag the start of a line"
```

---

### Task 6: The box: draw it, keep it, move it, clear it

**Files:**
- Create: `src/ui/SelectionBox.tsx`
- Modify: `src/ui/Plane.tsx` (`targetOf` and the pointer-down handler), `src/ui/App.tsx`, `src/styles/ui.css`, `src/plane/world.ts`
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `moveGroup` (Task 1), `pick`, `bounds`, `prune`, `rectOf` (Task 2), `marquee` and `selection` targets (Task 3).
- Produces: `SelectionBox({ rect: Rect; live: boolean })` draws `div.selection-box` at `rect` in screen pixels; when `live` is false it carries `data-target="selection"` and takes pointer events, when true (the marquee in flight) it is `.live` and takes none. `BOX_PAD_PX = 24` in `src/plane/world.ts`.

- [ ] **Step 1: Write the failing tests**

```tsx
const box = () => document.querySelector<HTMLElement>('.selection-box');
const plane = () => screen.getByRole('main', { name: 'The plane' });

/** Shift-drags on the plane from (x0, y0) to (x1, y1). */
function drawBox(x0: number, y0: number, x1: number, y1: number) {
  fireEvent.pointerDown(plane(), { pointerId: 1, clientX: x0, clientY: y0, shiftKey: true });
  fireEvent.pointerMove(plane(), { pointerId: 1, clientX: x1, clientY: y1 });
  fireEvent.pointerUp(plane(), { pointerId: 1, clientX: x1, clientY: y1 });
}

/** Drags from a screen point by (dx, dy) on whatever element is given. */
function dragOn(el: Element, x: number, y: number, dx: number, dy: number) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: x + dx, clientY: y + dy });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: x + dx, clientY: y + dy });
}

test('a shift drag on paper draws a box, and a plain drag still pans', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const before = left(/^Dentist/);
  act(() => {
    fireEvent.pointerDown(plane(), { pointerId: 1, clientX: 100, clientY: 100, shiftKey: true });
    fireEvent.pointerMove(plane(), { pointerId: 1, clientX: 300, clientY: 250 });
  });
  expect(box()).toHaveClass('live');
  expect(box()!.style.left).toBe('100px');
  expect(box()!.style.width).toBe('200px');
  expect(left(/^Dentist/)).toBe(before);
  act(() => fireEvent.pointerUp(plane(), { pointerId: 1, clientX: 300, clientY: 250 }));
  expect(box()).toBeNull(); // nothing inside: no selection
  act(() => dragOn(plane(), 100, 100, 50, 0));
  expect(left(/^Dentist/)).toBeCloseTo(before + 50, 3);
});

test('letting go keeps a box snug around what it caught, and dragging inside moves it all', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const scale = scaleOnScreen();
  const dx = left(/^Dentist/);
  const gx = left(/^Wristband/);
  const y = parseFloat(screen.getByRole('button', { name: /^Dentist/ }).style.top);
  act(() => drawBox(dx - 30, y - 30, gx + 30, y + 30));
  expect(box()).not.toHaveClass('live');
  expect(parseFloat(box()!.style.left)).toBeCloseTo(dx - 24, 3);
  expect(parseFloat(box()!.style.width)).toBeCloseTo(gx - dx + 48, 3);
  const before = store.getState();
  act(() => dragOn(box()!, (dx + gx) / 2, y, 60, 40));
  const after = store.getState();
  expect(stopNamed(store, 'dentist').x).toBeCloseTo(1000 + 60 / scale, 6);
  expect(stopNamed(store, 'wristband').x).toBeCloseTo(3000 + 60 / scale, 6); // translated, not scaled
  expect(stopNamed(store, 'wristband').y).toBeCloseTo(40 / scale, 6);
  expect(after.tracks[0].origin).toEqual(before.tracks[0].origin); // not in the box
  expect(document.querySelector('.leg-time')).toBeNull();
  expect(parseFloat(box()!.style.left)).toBeCloseTo(dx + 60 - 24, 3);
});

test('dragging a selected stop moves the group, a stop outside drags alone', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const scale = scaleOnScreen();
  const dx = left(/^Dentist/);
  const y = parseFloat(screen.getByRole('button', { name: /^Dentist/ }).style.top);
  // Catch the origin and Dentist, not the goal.
  act(() => drawBox(dx - 1000 * scale - 30, y - 30, dx + 30, y + 30));
  expect(store.getState().tracks[0].origin).toEqual({ x: 0, y: 0 });
  act(() => dragStop(/^Dentist/, 0, 50));
  expect(store.getState().tracks[0].origin.y).toBeCloseTo(50 / scale, 6);
  expect(stopNamed(store, 'dentist').y).toBeCloseTo(50 / scale, 6);
  expect(stopNamed(store, 'wristband').y).toBe(0);
  act(() => dragStop(/^Wristband/, 0, 50));
  expect(stopNamed(store, 'dentist').y).toBeCloseTo(50 / scale, 6); // unchanged
  expect(box()).not.toBeNull(); // the selection survives a drag outside it
});

test('a tap on paper, a tap on the box or Escape clears the selection, and a pan keeps it', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const dx = left(/^Dentist/);
  const y = parseFloat(screen.getByRole('button', { name: /^Dentist/ }).style.top);
  const select = () => act(() => drawBox(dx - 30, y - 30, dx + 30, y + 30));
  select();
  act(() => dragOn(plane(), 100, 700, 50, 0));
  expect(box()).not.toBeNull();
  expect(parseFloat(box()!.style.left)).toBeCloseTo(dx + 50 - 24, 3);
  act(() => tapOn(plane()));
  expect(box()).toBeNull();
  select();
  act(() => tapOn(box()!));
  expect(box()).toBeNull();
  select();
  act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
  expect(box()).toBeNull();
});

test('a box picks in world coordinates after a zoom, and a hidden stop moves with its group', () => {
  reduceMotion();
  const world = running();
  world.stops[0].size = 'small'; // hidden once the grid is coarse enough
  const store = createStore(world);
  render(<App store={store} now={() => WAITING} />);
  // Zoom out with the wheel until Dentist is below the level.
  while (screen.queryByRole('button', { name: /^Dentist/ })) {
    act(() => { fireEvent.wheel(plane(), { clientX: 500, clientY: 400, deltaY: 500 }); });
  }
  const gx = left(/^Wristband/);
  const y = parseFloat(screen.getByRole('button', { name: /^Wristband/ }).style.top);
  act(() => drawBox(0, y - 30, gx + 30, y + 30));
  act(() => dragOn(box()!, gx - 10, y, 0, 50));
  expect(stopNamed(store, 'dentist').y).toBeGreaterThan(0);
  expect(stopNamed(store, 'dentist').y).toBeCloseTo(stopNamed(store, 'wristband').y, 6);
});

test('deleting the one selected stop clears the box', () => {
  const store = createStore(running());
  render(<App store={store} now={() => WAITING} />);
  const dx = left(/^Dentist/);
  const y = parseFloat(screen.getByRole('button', { name: /^Dentist/ }).style.top);
  act(() => drawBox(dx - 30, y - 30, dx + 30, y + 30));
  expect(parseFloat(box()!.style.width)).toBeCloseTo(48, 3);
  act(() => store.dispatch({ type: 'delete', id: 'dentist', now: WAITING }));
  expect(box()).toBeNull();
});
```

Check the wheel helper used by the grid test near line 665 of `App.test.tsx` and match its event shape.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/ui/App.test.tsx -t "box|selection|selected"`. Expected: FAIL.

- [ ] **Step 3: Implement**

`Plane.tsx`: in the pointer-down handler, read `targetOf(e.target)`; when it is `paper` and `e.shiftKey` is set, pass `{ kind: 'marquee' }` instead. `targetOf` maps `data-target="selection"` to `{ kind: 'selection' }` and `data-target="origin"` to `{ kind: 'origin', track }`.

`SelectionBox.tsx`: a `div.selection-box` with inline `left`, `top`, `width`, `height`; `live` adds the class `live`; otherwise `data-target="selection"`.

`ui.css`, by the ghosts:

```css
/* The box: a tool in the hand, not part of the map. The one dashed line in the app. */
.selection-box {
  position: absolute;
  box-sizing: border-box;
  border: 1px dashed var(--ink);
  cursor: grab;
}
.selection-box.live {
  pointer-events: none;
}
```

`App.tsx`:
- State `marquee: { from: Point; to: Point } | null` (screen) and `selection: Selection | null`; a ref mirrors `selection` for the gesture handler.
- Ref `groupDrag: { from: Point; stops: Record<string, Point>; origins: Record<string, Point>; keep: Record<string, number> } | null`, where `from` is the world point under the pointer at `dragStart` and the records hold the start points.
- `startDrag`: clear `groupDrag` with the other refs. On a `marquee` target set `marquee = { from: g.at, to: g.at }` and return. On a `selection` target, or a `stop` whose id is in the selection, or an `origin` whose track is in it: build `groupDrag` from the world (every selected stop and origin, done or not) and `keep` as the seconds of every non-day, non-parked train on a track touched (as `moveGroup` defines touched); return before the stop or origin branches.
- `dragMove`: a live marquee updates `to`; a group drag dispatches `moveGroup` with every start point plus `(under - from)`. No `legTime`.
- `dragEnd`: a marquee becomes `pick(world, rectOf(screenToWorld(from), screenToWorld(to)))` and clears `marquee`; a group drag moves once more and clears the ref.
- `tap` on `paper`, `marquee` or `selection`: the paper branch, plus `setSelection(null)`.
- A `keydown` listener on `window` for `Escape` clears the selection (effect, once).
- Render: after `Grid` and before the tracks, the live marquee as `SelectionBox` with `rectOf(marquee.from, marquee.to)`, else the kept selection as `bounds(world, selection)` turned to screen via `worldToScreen` on both corners with `BOX_PAD_PX` added on every side; nothing when `bounds` is null. Use `prune(world, selection)` when reading it for a drag so deleted ids never reach `moveGroup`.

- [ ] **Step 4: Run the whole suite, typecheck, commit**

```bash
npx vitest run && npx tsc --noEmit -p tsconfig.json
git add src/ui/SelectionBox.tsx src/ui/Plane.tsx src/ui/App.tsx src/ui/App.test.tsx src/styles/ui.css src/plane/world.ts
git commit -m "feat: a shift drag draws a box, and its contents move as one"
```

---

### Task 7: README

**Files:**
- Modify: `README.md` (the Using it list, after the goal-drag line; and the Design paragraph)

- [ ] **Step 1: Add two bullets after "Drag the goal to stretch or squeeze everything ahead of the train."**

```
- Drag the start of a line to move where it begins. While the train is still on the first leg, the chip shows that leg's time; after that the start is history and moves freely.
- With a mouse, hold Shift and drag on empty paper to draw a box. Everything inside it, stops, dots and line starts, is picked up, and dragging inside the box moves it all together, nothing scaling. Tap on paper, tap the box, or press Escape to let it go.
```

- [ ] **Step 2: Add the new design note to the Design paragraph, in its voice, and commit**

```bash
git add README.md
git commit -m "docs: README for the box and the start of a line"
```
