# Chronologic v3: interchanges and the day line. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stops can sit on several lines, one ink day line a day runs top to bottom through chosen stops with its train shadowing the project trains, the soonest line's bubble fills, a goal-only line is a sketch, and a long-waited stop draws a small crowd.

**Architecture:** The model stays a pure reducer over `World`. Stop identity is already global, so interchanges are a stop id listed on several tracks; every action that found "the stop's track" now walks every track that lists it. The day line is one more `Track` with a `day` field whose train is derived from the project trains (the shadow rule), never from its own clock. Layout, storage and the UI learn the new facts in small steps; every v2 gesture keeps working.

**Tech Stack:** React 18, TypeScript, Vite, Vitest with jsdom and Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-01-day-line-design.md` (builds on `docs/superpowers/specs/2026-10-31-tracks-design.md`).

## Global Constraints

- Pure modules in `src/model` and `src/plane`, tested without a browser; the UI only wires them.
- One world unit is one second of plan. No number for time on the plane beyond the grid legend and the leg chip.
- The look: opaque colours from `src/styles/tokens.css` only, no gradients, no shadows, no dashes, no outlines. The day line and its train are `--ink`. Sketch and crowd use `--muted`.
- Nothing reads as late, behind or wrong. No red, no counts, no exclamation.
- Storage key `chronologic.v3`; `chronologic.v2` is read once on migration and never written.
- Every existing test stays green at every commit. Run the whole suite (`npx vitest run`) and `npx tsc --noEmit -p tsconfig.json` before each commit.
- Commits go on branch `build/v3`, made from `main` at the start of Task 1. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Code comments and copy follow the repo's voice: short sentences, no jargon, say why.

## Review Focus

Five things the spec implies and a user will meet; each has its test in the task named.

1. A stop completed from another line while this line's train is rolling toward it: the train must roll through without waiting and arrive at the stop after at its planned time. (Task 2)
2. Dragging a project leg longer while the day train is halfway to that stop: the day train slides back, never past its last stop, never beyond the next. (Task 5)
3. Deleting a project whose stop is also on the day line: the stop survives on the day line, the day line still routes through it. (Task 3)
4. Opening the app at 3 am with yesterday's day line: it is cleared before anything is drawn, and the project lines are untouched. (Tasks 6 and 11)
5. A v2 world under `chronologic.v2` on first open: every line, stop and train comes through unchanged, and the v2 key is still there afterwards. (Task 8)

---

### Task 1: The day's date

**Files:**
- Create: `src/model/days.ts`, `src/model/days.test.ts`

**Interfaces:**
- Produces: `DAY_TURNS_AT = 4` (local hour); `dayOf(now: number): string` returning the local `YYYY-MM-DD` of the day `now` falls in, where a day runs from 04:00 local to 04:00 local.

- [ ] **Step 1: Branch**

```bash
git checkout -b build/v3 main
```

- [ ] **Step 2: Write the failing tests**

```ts
// days.test.ts
test('a day runs from four in the morning', () => {
  const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();
  expect(dayOf(at(2026, 11, 1, 12))).toBe('2026-11-01');
  expect(dayOf(at(2026, 11, 2, 3, 59))).toBe('2026-11-01');
  expect(dayOf(at(2026, 11, 2, 4))).toBe('2026-11-02');
  expect(dayOf(at(2026, 1, 1, 0, 30))).toBe('2025-12-31');
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/model/days.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 4: Implement `dayOf` in `src/model/days.ts`**

Subtract `DAY_TURNS_AT` hours from `now`, then format the local year, month and day with zero padding. Local time via `Date` getters, not UTC.

- [ ] **Step 5: Run to verify it passes, then commit**

```bash
git add src/model/days.ts src/model/days.test.ts
git commit -m "feat: a day turns over at four in the morning"
```

---

### Task 2: The next stop and passing through done stops

**Files:**
- Modify: `src/model/train.ts` (`nextIndex`, `targetIndex`, `trainState`), `src/model/train.test.ts`
- Modify callers of `nextIndex`: `src/model/reducer.ts` (`complete`), `src/plane/layout.ts`, `src/ui/App.tsx`, `src/plane/snap.ts` if it reads `state.leg`

**Interfaces:**
- Produces: `nextIndex(track: Track, byId: Map<string, Stop>): number | null`, the first index at or after the derived leg whose stop is not done, null when none. `targetIndex(track, byId)` unchanged in signature, built on the new `nextIndex`. `trainState(track, byId, now)` now derives: while the stop at `leg` is done and that leg's time has run out, the train is on the next leg with `departedAt` advanced by the leg's length in ms; past the last stop it is parked. `TrainState.leg` is the derived leg.

- [ ] **Step 1: Write the failing tests**

```ts
test('the next stop is the first undone stop at or after the leg', () => {
  // running() with Dentist done but the train still on leg 0: next is Wristband (1).
});
test('a train rolls through a done stop without waiting and on to the next', () => {
  // Dentist done, train departed at 0 toward it (leg 0, 1000 s). At 500 s: leg 0, rolling.
  // At 1000 s: leg 1, seconds 0, not waiting. At 1500 s: leg 1, on its way, at.x > 1000.
  // At 3000 s + : leg 1 waiting at Wristband. nextIndex is 1 throughout.
});
test('every stop done and passed means parked', () => { /* both done, train leg 0, now 4000 s: parked at Wristband */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/model/train.test.ts`. Expected: FAIL on the derived leg and on the new `nextIndex` signature.

- [ ] **Step 3: Implement in `src/model/train.ts`; update callers to pass `byId`**

The pass-through loop sits at the top of `trainState`, producing an effective `{ leg, departedAt }` that the rest of the function uses unchanged.

- [ ] **Step 4: Run the whole suite and typecheck, then commit**

```bash
git add src/model/train.ts src/model/train.test.ts src/model/reducer.ts src/plane/layout.ts src/ui/App.tsx
git commit -m "feat: a train passes through a stop already done from another line"
```

---

### Task 3: Shared stops in the reducer

**Files:**
- Modify: `src/model/reducer.ts` (`tracksOf`, `keepTrain`, `move`, `edit`, `delete`, `complete`, `undo`), `src/model/reducer.test.ts`
- Modify: `src/test/fixtures.ts` (add `twoLines()`: `running()` plus a second track `t2`, origin `{ x: 0, y: 600 }`, stops `['shared', 'goal2']` with `shared` at `{ x: 1500, y: 600 }` medium circle and `goal2` at `{ x: 3000, y: 600 }`; `shared` is also inserted into `t1` at index 1, so `t1.stops = ['dentist', 'shared', 'wristband']`)

**Interfaces:**
- Produces: `tracksOf(world: World, stopId: string): { track: Track; index: number }[]`. `keepTrain(before, after, trackId, now, keep?)` rebases from the derived leg of `before`'s train. Semantics per spec "Stops on several tracks" and "Only projects keep a stop alive": the day track never keeps a stop in the world. `moveGoal` scales shared stops and runs `keepTrain` for every track through them; the `keep` of a goal drag becomes per track (`keep?: Record<string, number>` keyed by track id).

- [ ] **Step 1: Write the failing tests**

```ts
test('moving a shared stop re-routes every line through it and keeps every train', () => { /* twoLines(); move shared; both tracks' trains keep their seconds */ });
test('completing a shared stop that is next on both lines sends both trains on', () => { /* t2 train at leg 0 waiting at shared, t1 train at leg 1 waiting at shared: complete t1 → both trains leg+1, departedAt now */ });
test('completing a shared stop that is further ahead on the other line leaves that train be', () => { /* t1 train leg 0: complete t2 → t1 train unchanged, stop done */ });
test('deleting a line keeps its shared stops on the other line', () => { /* delete goal2 → t2 gone, shared still in t1.stops and in world.stops; goal2 gone */ });
test('deleting a shared stop removes it from every line', () => { /* delete shared → not in t1.stops nor t2.stops */ });
test('undo on a shared stop is refused unless every line can take it back', () => { /* t1 passed through shared and is waiting at wristband: undo t2 → unchanged; with t1 at leg 2 just past shared: undo works and both trains wait at shared */ });
test('keepTrain rebases from the derived leg', () => { /* t1 dentist done, train stored leg 0 but 1500 s elapsed: move wristband; result train.leg === 1 and its seconds preserved */ });
test('dragging a goal scales a shared stop and keeps the other line its train', () => { /* twoLines(): moveGoal wristband → shared moves, t2 re-routes, t2 train seconds kept */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/model/reducer.test.ts`. Expected: FAIL on each new behaviour.

- [ ] **Step 3: Implement**

`tracksOf` replaces `trackOf`. `move`, `delete` loop over `tracksOf`, applying `keepTrain` per track. `complete` reads `nextIndex(track, byId)`; after setting `done`, for each other track whose `nextIndex` is that stop, set its train to `{ leg: idx + 1, departedAt: now }`. `undo` checks every track. `delete` of a home square removes the track and only the stops on no other track.

- [ ] **Step 4: Run the whole suite and typecheck, then commit**

```bash
git add src/model/reducer.ts src/model/reducer.test.ts src/test/fixtures.ts
git commit -m "feat: a stop can sit on several lines, done once everywhere"
```

---

### Task 4: Join and leave, and snapping to every line

**Files:**
- Modify: `src/model/reducer.ts` (`join`, `leave`), `src/model/reducer.test.ts`
- Modify: `src/plane/snap.ts` (`snapToAll`, `ignore`, `nearestStop`), `src/plane/snap.test.ts`

**Interfaces:**
- Produces actions: `{ type: 'join'; trackId; stopId; leg: number; x; y; now }` inserts the stop at `leg` on the track, moves it to `(x, y)`, keeps every train through it; refused when already on the track, done, `leg` behind the derived train leg or past the end. `{ type: 'leave'; trackId; stopId; now }` removes the stop from one track with the leg-merge logic; refused when last on the track or a square's home; becomes `delete` when the stop would be on no track.
- Produces: `snapToAll(world, p, now, radius, ignore?: string): { trackId; leg; offset; at }[]` every project track within radius sorted nearest first, never the day track, skipping tracks that already list `ignore`; `snapToTracks` is `snapToAll(...)[0] ?? null` and gains the same `ignore`. `nearestStop(stops: Stop[], p: Point, radius: number): Stop | null`.

- [ ] **Step 1: Write the failing tests**

```ts
// reducer
test('join puts a stop on a second line at the snap point', () => { /* running() + t2; join dentist onto t2 at leg 0 → t2.stops[0] === 'dentist', dentist.x/y at snap point, t1 train kept */ });
test('join is refused on the same line, behind the train or for a done stop', () => {});
test('leave takes a stop off one line and off the world when it was its last', () => {});
test('leave is refused for a square on its home line', () => {});
test('leaving the last project line deletes the stop, off the day too', () => {});
test('snapToAll never offers the day line', () => {});
// snap
test('snapToAll lists every line within radius nearest first and skips lines the stop is on', () => {});
test('a dragged stop does not block its own snap', () => { /* snapToTracks(world, at dentist, ..., ignore 'dentist') is not null */ });
test('nearestStop finds the closest pending stop within radius', () => {});
```

- [ ] **Step 2: Run to verify they fail**, then **Step 3: Implement**, then **Step 4: Run the whole suite and typecheck, commit**

```bash
git add src/model/reducer.ts src/model/reducer.test.ts src/plane/snap.ts src/plane/snap.test.ts
git commit -m "feat: a stop joins a second line on release, and leaves it from the editor"
```

---

### Task 5: The shadow rule

**Files:**
- Modify: `src/model/types.ts` (`Track.day?: { date: string; budgets: number[] }`)
- Modify: `src/model/train.ts` (`timeLeft`, `timeLeftAny`, `dayState`), `src/model/train.test.ts`
- Modify: `src/test/fixtures.ts` (add `withDay()`: `twoLines()` plus a day track `day` with `origin { x: 1000, y: -400 }`, `stops ['dentist', 'shared', 'dayEnd']`, `dayEnd` a small square at `{ x: 1500, y: 900 }`, `train { leg: 0, departedAt: 0 }`, `day: { date: '2026-11-01', budgets: [1000, 0, 0] }`)

**Interfaces:**
- Produces: `timeLeft(track: Track, stopId: string, byId, now): number` per spec: time, `(1 - invertProgress(state.fraction)) * length` for the current leg (0 when waiting) plus the lengths of the legs up to the stop; 0 when the stop is done or behind. `timeLeftAny(world: World, stopId: string, now): number`, the smallest over project tracks listing the stop, 0 when none. `dayState(day: Track, world: World, now): TrainState` with `fraction = budget === 0 ? 1 : clamp(1 - left / budget, 0, 1)`, linear in time, `waiting` when fraction is 1, `parked` when `train.leg >= stops.length`, position by `pointAlong` on the routed day leg. `dayState` never derives a pass-through; the reducer settles the day train (Task 6).

- [ ] **Step 1: Write the failing tests**

```ts
test('time left to a stop is the time left on this leg plus the legs up to it', () => { /* running() at 500 s: timeLeft dentist === 500 exactly (time, not distance), wristband === 2500 */ });
test('time left is time, not distance: a braking train has more time than distance left', () => { /* at 900 s: timeLeft dentist === 100 while length - seconds is less */ });
test('time left stands still while the train waits at an earlier stop', () => { /* at 1500 s and 2500 s timeLeft(wristband) is equal */ });
test('time left is zero for a done or passed stop and smallest across lines', () => {});
test('the day train is as far along its leg as the project time has run down', () => { /* withDay(): budget 1000 at now 0; at 500 s fraction 0.5 by time (left=budget*0.5 → use a now where timeLeft is 500) */ });
test('pulling the leg longer slides the day train back, never below zero', () => { /* move dentist to x 2000 at 500 s → left 1500 > budget 1000 → fraction 0 */ });
test('budget zero means waiting at the stop', () => {});
```

Note for the implementer: `timeLeft` is elapsed-time based, as `opening.ts` computes `eta` today; reuse that expression, and in Task 7 `opening.ts` calls `timeLeft`.

- [ ] **Step 2: Run to verify they fail**, **Step 3: Implement**, **Step 4: Whole suite, typecheck, commit**

```bash
git add src/model/types.ts src/model/train.ts src/model/train.test.ts src/test/fixtures.ts
git commit -m "feat: the day train shadows the project trains"
```

---

### Task 6: Day actions

**Files:**
- Modify: `src/model/reducer.ts` (`newDay`, `addToDay`, `moveDayEnd`, `clearDay`, `tick`; `complete` sets day budgets), `src/model/reducer.test.ts`

**Interfaces:**
- Produces actions:
  - `{ type: 'newDay'; id; endId; origin: Point; stops: string[]; end: Point; now; date: string }` per spec; `budgets[0] = timeLeftAny(stops[0])`, the rest `0` until set.
  - `{ type: 'addToDay'; stopId; now }` appends before the end square; sets its budget now if it becomes the day's next stop.
  - `{ type: 'moveDayEnd'; x; y; now }` moves the end square only.
  - `{ type: 'clearDay'; now }` removes the day track and its end square.
  - `{ type: 'tick'; now }`: `clearDay` when `dayOf(now) !== day.date`, else the same world object (the store relies on identity).
  - `settleDay(world, now): World`, a reducer-internal helper run at the end of `newDay`, `addToDay`, `complete`, `undo`, `leave` and `delete`: while the day's stop at `train.leg` is done, advance to `leg + 1` with `departedAt: now` and write `budgets[leg + 1] = timeLeftAny(stops[leg + 1], now)` (0 for the end square). `undo` on a stop that is on the day puts the day train at that stop's leg with budget 0.

- [ ] **Step 1: Write the failing tests**

```ts
test('newDay makes an ink line through pending stops in order with a budget for the first', () => {});
test('newDay drops done, unknown and repeated stops and makes nothing from none', () => {});
test('newDay replaces the day that was', () => {});
test('completing a day stop on its project sends the day train on with a fresh budget', () => {});
test('completing on the day completes on the project', () => {});
test('the end square has budget zero so the train is there as soon as the last stop is done', () => {});
test('addToDay appends before the end and refuses done or repeated stops', () => {});
test('tick clears a day whose date has passed and leaves the projects alone', () => {});
test('tick returns the same world when nothing changes', () => {});
test('a day stop done from its project before its turn is passed over when its turn comes, with the next budget written then', () => { /* day [A, B, C, end]; complete B on its project; complete A → day leg points at C, budgets[2] === timeLeftAny(C) */ });
test('undo of a day stop puts the day train back there with budget zero', () => {});
test('deleting a project goal takes its stops off the day unless another project has them', () => {});
```

- [ ] **Step 2: Run to verify they fail**, **Step 3: Implement**, **Step 4: Whole suite, typecheck, commit**

```bash
git add src/model/reducer.ts src/model/reducer.test.ts
git commit -m "feat: draw a day, add to it, clear it at four"
```

---

### Task 7: The soonest line and the opening camera

**Files:**
- Create: `src/plane/soonest.ts`, `src/plane/soonest.test.ts`
- Modify: `src/plane/opening.ts`, `src/plane/opening.test.ts`

**Interfaces:**
- Produces: `soonestTrack(world: World, now: number): Track | null`, among project tracks with an unparked train the smallest `timeLeft` to its next stop; ties to `lastTouched`, then first. `openingCamera` uses `soonestTrack`, and when a day track exists and `dayState` is not parked, centres on the day train with `fitLeg` of the routed day leg.

- [ ] **Step 1: Write the failing tests**

```ts
test('the soonest line is the one whose next stop is nearest in time, waiting wins', () => {});
test('ties go to the line touched last, parked lines and the day never count', () => {});
test('the camera opens on the day train when there is a day', () => {});
test('without a day the camera opens as before', () => { /* existing opening tests stay green */ });
```

- [ ] **Step 2: Run to verify they fail**, **Step 3: Implement**, **Step 4: Whole suite, typecheck, commit**

```bash
git add src/plane/soonest.ts src/plane/soonest.test.ts src/plane/opening.ts src/plane/opening.test.ts
git commit -m "feat: the soonest line, and the camera opens on the day"
```

---

### Task 8: Storage v3 and the v2 migration

**Files:**
- Modify: `src/store/storage.ts`, `src/store/storage.test.ts`

**Interfaces:**
- Produces: `STORAGE_KEY = 'chronologic.v3'`, `V2_KEY = 'chronologic.v2'`. `load(storage)` reads v3; when absent, reads v2, validates, returns it. Validation per spec "Storage": a track ends in a square; a square is last on exactly one track; every named stop exists; at most one day track with `date: string`, `budgets` finite numbers one per stop, its last stop on no other track.

- [ ] **Step 1: Write the failing tests**

```ts
test('a v3 world round trips under the v3 key', () => {});
test('a v2 world is read once and the v2 key is left untouched; the next save writes v3', () => {});
test('a square that is last on two tracks is refused', () => {});
test('a shared stop and a goal mid-line on another track are accepted', () => {});
test('a day track with the wrong number of budgets, or a shared end square, is refused', () => {});
```

- [ ] **Step 2: Run to verify they fail**, **Step 3: Implement**, **Step 4: Whole suite, typecheck, commit**

```bash
git add src/store/storage.ts src/store/storage.test.ts
git commit -m "feat: storage v3, reading a v2 world once"
```

---

### Task 9: Layout: rings, sketch, the day train, crowds

**Files:**
- Create: `src/model/crowd.ts`, `src/model/crowd.test.ts`
- Modify: `src/plane/layout.ts`, `src/plane/layout.test.ts`

**Interfaces:**
- Produces: `CROWD_CAP = 5`; `crowdAt(track: Track, byId, now): number` per spec, 0 for a day track.
- `layoutTrack(track: Track, world: World, camera, now, viewport): TrackView` (signature changes: `world` replaces `byId`; the function builds `byId`). `StopView` gains `ring: boolean` (on two or more tracks) and `crowd: number` (only on the stop the train waits at). `TrackView` gains `day: boolean` and `sketch: boolean` (`stops.length === 1` on a project track). A day track's train view comes from `dayState`.

- [ ] **Step 1: Write the failing tests**

```ts
test('a crowd grows one per leg-time of waiting, capped at five, never on a day line or a zero leg', () => {});
test('a stop on two lines is a ring, and a goal-only line is a sketch', () => {});
test('the day line lays out its train by the shadow rule', () => {});
test('the crowd sits on the waiting stop only', () => {});
```

- [ ] **Step 2: Run to verify they fail**, **Step 3: Implement**, update `App.tsx` for the new `layoutTrack` signature, **Step 4: Whole suite, typecheck, commit**

```bash
git add src/model/crowd.ts src/model/crowd.test.ts src/plane/layout.ts src/plane/layout.test.ts src/ui/App.tsx
git commit -m "feat: layout knows rings, sketches, the day train and crowds"
```

---

### Task 10: The look: ring, day line, sketch, soonest bubble

**Files:**
- Modify: `src/ui/Stop.tsx`, `src/ui/Track.tsx`, `src/ui/Bubble.tsx`, `src/styles/ui.css`, `src/ui/App.tsx` (pass `soonest`, day colour), `src/ui/App.test.tsx`

**Interfaces:**
- `Stop` renders `shape ring` on `stop.ring`: the shape in `--ink` with an inner paper shape inset 4 px (`::after` with the same `border-radius` or `clip-path`). A done ring is a plain dot.
- `Track` draws a day track in `var(--ink)`; a sketch in `var(--muted)` at `TRACK_WIDTH / 2` with its train muted.
- `Bubble` gains `soonest?: boolean` → class `bubble soonest`: background `var(--track-color)`, text and shape `var(--paper)`.
- `App` computes `soonestTrack(world, time)` and passes `soonest` to that track's bubble.

- [ ] **Step 1: Write the failing tests** (in `App.test.tsx`, reading styles from the CSS text as the existing tests do)

```ts
test('a stop on two lines is drawn as a ring', () => {});
test('a line with only its goal is a sketch at half width in the muted ink', () => {});
test('the day line is ink', () => {});
test('the soonest line fills its bubble', () => {});
```

- [ ] **Step 2: Run to verify they fail**, **Step 3: Implement**, **Step 4: Whole suite, typecheck, commit**

```bash
git add src/ui/Stop.tsx src/ui/Track.tsx src/ui/Bubble.tsx src/styles/ui.css src/ui/App.tsx src/ui/App.test.tsx
git commit -m "feat: rings, the ink day line, sketches and the soonest bubble"
```

---

### Task 11: Drawing the day

**Files:**
- Modify: `src/plane/gestures.ts` (`Target.tile` adds `'sun'`), `src/ui/Plane.tsx` (`targetOf` accepts `sun`), `src/ui/Tray.tsx` (sun tile, `aria-label="Today"`), `src/ui/App.tsx`, `src/ui/App.test.tsx`
- Create: `src/ui/DayGhost.tsx` (an ink polyline through the collected points to the finger, `aria-hidden`)

**Interfaces:**
- The sun tile drag: on `dragMove`, `nearestStop(pending stops not yet collected, world point, SNAP_PX / scale)` appends; `DayGhost` shows origin → collected → finger. On `dragEnd` with one or more collected, dispatch `newDay` with `origin = first collected stop minus { x: 0, y: 120 / camera.scale }`, `end` at the release point, `date = dayOf(now())`, `id = newId()`, `endId = newId()`. With none collected, nothing.
- The tick: the existing interval effect also dispatches `{ type: 'tick', now }`; on mount, `tick` runs once before the opening camera is computed.
- The day's-end drag: a `dragStart` on a stop whose track is the day and which is its last stop; `dragMove` dispatches `moveDayEnd` and, when `nearestStop` of pending stops not on the day is within `SNAP_PX / scale`, `addToDay`; `dragEnd` after any add dispatches `moveDayEnd` back to the drag's start point.

- [ ] **Step 1: Write the failing tests**

```ts
test('dragging the sun through two stops on two lines draws the day through them in that order', () => {});
test('lifting the sun with no stops draws nothing', () => {});
test('drawing a new day replaces the old', () => {});
test('dragging the day end through a stop adds it and the end returns', () => {});
test('a day from yesterday is cleared on open', () => { /* now at 2026-11-02 05:00 local, withDay() dated 2026-11-01: no ink track after render */ });
test('tapping the next stop on the day completes it on its project too', () => {});
```

- [ ] **Step 2: Run to verify they fail**, **Step 3: Implement**, **Step 4: Whole suite, typecheck, commit**

```bash
git add src/plane/gestures.ts src/ui/Plane.tsx src/ui/Tray.tsx src/ui/DayGhost.tsx src/ui/App.tsx src/ui/App.test.tsx src/styles/ui.css
git commit -m "feat: drag the sun through today's stops"
```

---

### Task 12: Joining on release and leaving from the editor

**Files:**
- Modify: `src/ui/App.tsx` (release of a stop drag → `snapToAll(... ignore stop.id)[0]` → `join`; tile drop → `snapToAll` → `addStop` on the first and `join` on the rest), `src/ui/StopEditor.tsx` (`lines: { trackId: string; color: number | null }[]`, `onLeave(trackId)`; chips only when `lines.length >= 2`; a square's home is omitted), `src/ui/StopEditor.test.tsx`, `src/ui/App.test.tsx`, `src/styles/ui.css` (`.line-chip`)

- [ ] **Step 1: Write the failing tests**

```ts
test('releasing a dragged stop on another line joins it there as a ring', () => {});
test('dragging through a line without releasing on it does not join', () => {});
test('a tile dropped where two lines meet is added to both', () => {});
test('the editor shows a chip per line and leaving one removes the stop from it', () => {});
test('a stop on one line shows no chips', () => {});
```

- [ ] **Step 2: Run to verify they fail**, **Step 3: Implement**, **Step 4: Whole suite, typecheck, commit**

```bash
git add src/ui/App.tsx src/ui/StopEditor.tsx src/ui/StopEditor.test.tsx src/ui/App.test.tsx src/styles/ui.css
git commit -m "feat: join a line on release, leave it from the editor"
```

---

### Task 13: The crowd

**Files:**
- Modify: `src/ui/Stop.tsx` (render `stop.crowd` dots as `span.crowd > span.dot × n`, `aria-hidden`), `src/styles/ui.css` (`.crowd`: a row above-right of the stop, outside the 44 px target, dots of `--dot` in `--muted`), `src/ui/App.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
test('a long-waited stop shows a small crowd in the muted ink, at most five', () => {});
```

- [ ] **Step 2: Run to verify it fails**, **Step 3: Implement**, **Step 4: Whole suite, typecheck, commit**

```bash
git add src/ui/Stop.tsx src/styles/ui.css src/ui/App.test.tsx
git commit -m "feat: a crowd gathers where a train has waited"
```

---

### Task 14: Docs

**Files:**
- Modify: `README.md` ("Using it": the sun tile, the day line, rings, joining and leaving, the soonest bubble, sketches, crowds; "Running it": the storage key is now `chronologic.v3`, a v2 world is read once)
- Modify: `docs/superpowers/specs/2026-11-01-day-line-design.md` only if a call changed during the build; record it under "Calls Claude made".

- [ ] **Step 1: Write the README changes**, **Step 2: Run the whole suite and typecheck**, **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-11-01-day-line-design.md
git commit -m "docs: README for the day line and interchanges"
```
