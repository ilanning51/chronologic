---
title: Week Window Slide and Reach - Plan
type: feat
date: 2026-11-06
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Week Window Slide and Reach - Plan

## Goal Capsule

- **Objective:** Ian sees his map change when he plans in the week window, and sees where a line stops letting a block go while he drags, so neither the map nor the window surprises him.
- **Means:** the plane holds its stops still while the window is open and slides them into place when it closes (KTD1, KTD2). The day plane shades the hours outside the held stop's reach (KTD4).
- **Authority:** the Requirements and Key Decisions below win on behavior. KTDs win on mechanism. `docs/superpowers/specs/2026-11-06-week-window-design.md` and `docs/plans/2026-11-06-0011-feat-week-window-plan.md` hold wherever this plan is silent.
- **Execution profile:** one pull request, units in the order listed. The pure helpers in `src/plane` go test-first.
- **Stop conditions:** stop if holding the plane would change what any action dispatches (only drawing may read the held world), or if a settled decision proves unbuildable. Report either rather than working around it.
- **Who finishes:** the executing agent builds, checks it in the browser, and opens the PR. Ian merges.

## Product Contract

### Summary

When the week window closes, every stop it moved slides from where it stood when the window opened to where it stands now, over about half a second. While it is open, the map behind it holds still. While a block or a next stop is held in the window, the day plane shades the hours its end cannot reach.

### Problem Frame

Placing or moving a block slides its stop along its line, so planning in the window reshapes the map. Today that happens with no motion: Ian closes the window and the map has changed shape. A block also can only end between the arrival of the stop before it and the stop after it. While dragging, the ghost simply stops at that limit, which feels like the window is stuck rather than like the line saying where it ends.

### Key Decisions

- **The map moves into place when the window closes.** (session-settled: user-approved — chosen over stops jumping silently, as today: the map quietly changing shape was the biggest gap between the map and the window.) Governs R1, R2, R3, R4.
- **The day plane shades what the held block cannot reach.** (session-settled: user-approved — chosen over the ghost silently stopping at its limit: the limit should read as "your line ends here", not as the window being stuck.) Governs R5, R6.
- **Moving one block may still move others on its line.** (session-settled: user-approved — chosen over pinning or hiding the knock-on shift: hiding it would make the map and the calendar disagree.) Governs R7.
- **The earlier week-window decisions stand.** These are the Mon–Sun week row with arrows, today red, the selected day in ink, the scrolling midnight-to-midnight day plane, no fixed events, and tomorrow's day line muted and thin. They also cover a block's end being its stop's arrival, and any of the seven days being plannable. (session-settled: user-directed — chosen over changing any of them in this work: settled with Ian on 2026-11-06.)

### Requirements

**The slide**

- R1. When the week window closes, each stop whose place changed while it was open slides in a straight line from its place at opening to its place now, easing out over about half a second. The start of each line slides with it.
- R2. While the window is open, the plane draws each stop and line start that existed at opening where it stood then.
- R3. A line made while the window was open is drawn once the slide ends. A line or stop removed while it was open is gone at once.
- R4. Under reduced motion, nothing slides: the stops are drawn at their new places as soon as the window closes.

**The reach shade**

- R5. While a block or a next stop is held in the window, the day plane shades the hours where its end cannot land: before the earliest its line lets it arrive, and after the latest.
- R6. A goal, which has no latest, is shaded only before its earliest. The shade uses a muted theme colour, never red, and goes when the drag ends.

**Unchanged**

- R7. Moving a block still slides the other stops on its line, as now.

### Scope Boundaries

- Undo and redo after the window closes do not slide. Undo is the escape hatch, and an instant jump back is what it already does on the map.
- No slide while the window is open, as each drop lands. The window covers the middle of the map, and the hold (R2) is what makes one slide at close readable.
- Not built: a fade for lines that appear or go (R3). A sudden appearance at the end of a half-second slide is readable. Revisit if Ian finds it jarring.
- Not built: shading the stretch rule (a block at least its minimum length). The ghost already enforces it, and it is never more than minutes.

## Planning Contract

### Key Technical Decisions

- KTD1. **One display-only world, built at the drawing boundary.** A pure function in a new module, `src/plane/slide.ts`, takes the world at opening, the live world, and a progress from 0 to 1. It returns the live world with every stop and line start found in both moved to the point that far between them, and leaves out lines that did not exist at opening (R3). App passes this world only to what draws the plane: track layout, `stopsOnce`, and bubbles. Every handler and every dispatch keeps reading the store. A world, not per-element CSS transitions, because a line's stroke, its train and its labels all derive from stop positions through `layoutTrack`. Moving the stops alone would tear them off their lines.
- KTD2. **Hold, then one slide at close.** App keeps the world at opening in a ref. While the window is open it draws at progress 0 (R2). On close it animates progress to 1 over 500 ms with the cubic ease-out that `useFly` uses. This uses `requestAnimationFrame` and is skipped under `prefers-reduced-motion` (R4). It then drops the snapshot. Reopening during a slide cancels it and snapshots the live world. Copy the `useFly` shape (cancel on unmount, reduced-motion check) rather than generalising `useFly`, whose type is a camera.
- KTD3. **A drag that starts on the plane while the map is held or sliding moves nothing.** A plane drag measures its grip from the stop's real position (`startDrag` in `src/ui/App.tsx`, for a stop, a day's end square and a line's start alike). A press on a stop drawn at its held or mid-slide place would leave the stop offset from the finger by the whole distance, and the drop would land it, and its block's times, somewhere Ian never aimed. While the window is open, a `dragStart` on the plane closes the window, which starts the slide, and starts no drag. While the slide runs, a `dragStart` on the plane is ignored. The rest of that gesture does nothing, as when a tap on the paper closes the window. The next press works on the settled map. Taps, which change no position, keep working as today.
- KTD4. **The shade comes from `reach()`, worked out once per held block and day.** A pure function in `src/plane/week.ts` turns a date and a `Reach` into the px bands of the day plane to shade, using `yOf`. The window takes `reach(world, stopId, now)` when a drag goes live, and works out the bands again when the selected day changes. It draws them under the blocks and the ghost, `aria-hidden`. The bands are where the block's end cannot land, matching the clamp in `aimAt`, so the ghost's bottom edge stops exactly at a band's edge.

### Assumptions

- Only places are held, not which stops a line runs through. A stop placed on, or taken off, a line that existed at opening changes that line's route at once, drawn through the held places. Tomorrow's day line gaining a stop is the common case. Holding each line's stop list would need its own design for day budgets, the train's leg and deleted stops.
- "Moved" means any change of position between opening and closing, whatever caused it. That includes a day line's start and end square refitted around its stops, and a shared stop's other lines rerouting.
- While the window is open, trains behind it run along the held geometry. A train may be drawn a little off its true place until the window closes. That is harmless, since the window covers most of the map.
- Half a second (500 ms) is "about half a second". It sits beside the camera's 400 ms flight.

## Implementation Units

### U1. The display world between two worlds

- **Goal:** a pure function that gives the world to draw at a given progress between the world at opening and the live world.
- **Requirements:** R1, R2, R3 (KTD1).
- **Dependencies:** none.
- **Files:** `src/plane/slide.ts` (new), `src/plane/slide.test.ts` (new). This seam catches the geometry rules. It misses timing and what App draws, which U2 covers.
- **Approach:** stops and line origins found in both worlds interpolate linearly. Everything else about the live world (trains, budgets, done flags) stays live. Lines absent at opening are left out while progress is below 1. Return the live world unchanged at progress 1 and when nothing moved, so the plane draws exactly what it does today.
- **Patterns to follow:** `interpolate` in `src/plane/camera.ts` for the lerp, and the fixture worlds in `src/model/blocks.test.ts`.
- **Test scenarios:**
  - A stop placed by `place` (it moved): at 0 it is at its opening point, at 1 at its live point, and at 0.5 halfway.
  - A placed day line's origin and end square, refitted between opening and now, interpolate the same way.
  - A stop and line that did not move are the same objects as in the live world.
  - A day line made after opening is absent below 1 and present at 1. Its project stop still interpolates through its project line.
  - A day line that existed at opening and gained a stop since keeps the live stop list, drawn through the held places at 0.
  - A stop deleted after opening is absent at every progress.
  - A live world whose train moved on since opening keeps the live train at every progress.
- **Verification:** the slide tests pass, and the function never returns the opening world's train or done state.

### U2. The plane holds still and slides on close

- **Goal:** App draws the held world while the window is open and slides it into place when it closes.
- **Requirements:** R1, R2, R3, R4 (KTD2, KTD3).
- **Dependencies:** U1.
- **Files:** `src/ui/App.tsx`, `src/ui/App.test.tsx`. These catch the timing and the drawn positions. They miss how the slide looks, which the browser check covers.
- **Approach:**
  1. Snapshot the store's world in a ref when the window opens, through `toggleWeek` and any other path that opens it.
  2. Build the drawn world from U1 at the current progress, and use it only for `views`, `stopsOnce` and the bubbles.
  3. On every path that closes the window, start the slide or, under reduced motion, end the hold at once. These paths are the button, Escape, a tap on the paper, and taking up a brush.
  4. On `dragStart` with the window open, close it and start no drag. While the slide runs, ignore `dragStart`. In both cases the rest of that gesture does nothing and records no undo step (KTD3).
- **Patterns to follow:** `useFly` in `src/ui/App.tsx` for the frame loop, cancel and reduced-motion check. Follow existing `App.test.tsx` tests that open the week window and drive time.
- **Test scenarios:**
  - With the window open, dispatching a `place` for Alpha leaves the plane's `[data-id="alpha"]` stop at its old screen position.
  - After Escape and the frames run out, the stop is at its new position. Partway through, it is between the two.
  - Under `prefers-reduced-motion: reduce`, the stop is at its new position on the first render after closing.
  - A day line made while open is not drawn before the slide ends and is drawn after.
  - A drag started on the plane while the window is open closes the window and moves nothing, and no undo step is recorded.
  - A drag started on the plane while the slide runs moves nothing. One started after the slide ends moves the stop as today.
  - Reopening mid-slide stops the slide, and the stop is drawn at its live position.
  - A tap on a stop while the window is open still completes it.
- **Verification:** App tests pass. In the browser, placing a block and closing the window shows the stop and its line sliding into place.

### U3. The reach shade

- **Goal:** while a block or next stop is held, the day plane shades the hours its end cannot reach.
- **Requirements:** R5, R6 (KTD4).
- **Dependencies:** none.
- **Files:** `src/plane/week.ts`, `src/plane/week.test.ts`, `src/ui/WeekWindow.tsx`, `src/ui/WeekWindow.test.tsx`, `src/styles/ui.css`. The `week` tests catch the band arithmetic. The window tests catch when bands show and go. Neither catches the colour, which the browser check covers.
- **Approach:**
  1. Add the band function to `week.ts`, beside `blocksOn`.
  2. In `WeekWindow`, work out the bands from the live grab's stop and the selected date. Draw them in `.week-blocks` before the blocks.
  3. Style `.week-reach` from an existing muted token, not `--track-red`.
- **Patterns to follow:** `yOf`, `startOfDate` and `endOfDate` in `src/plane/week.ts` and `src/model/days.ts`. Follow the drag tests in `src/ui/WeekWindow.test.tsx` and the `.week-column.taking` style.
- **Test scenarios:**
  - Reach earliest 09:00 and latest 17:00 on the date: two bands, 0 to the 09:00 row and the 17:00 row to the bottom.
  - Latest null (a goal): only the band before the earliest.
  - Earliest before the date's midnight and latest after its end: no bands.
  - Earliest after the date ends, or latest before it starts: one band over the whole day.
  - Earliest exactly at the next midnight: the band covers the whole day, matching the refusal past midnight.
  - In the window, with Bravo close behind Alpha, dragging the Alpha candidate shows a band starting at the row of Alpha's latest arrival. The band is gone after the drop.
  - Dragging the `dream` goal shows no band after its earliest.
  - Holding over another day's button turns the plane, and the bands follow the new day.
  - With no drag, no band is drawn.
- **Verification:** week and window tests pass. In the browser, the ghost's bottom edge stops at the shaded band's edge.

### U4. The spec says it

- **Goal:** the design note records the slide and the shade.
- **Requirements:** R1–R6.
- **Dependencies:** U2, U3.
- **Files:** `docs/superpowers/specs/2026-11-06-week-window-design.md`.
- **Approach:** add both to its Edges list in its own voice, and drop nothing.
- **Test expectation:** none — documentation only.
- **Verification:** the spec names the hold, the slide on close, reduced motion, and the reach shade.

## Verification Contract

| Gate | Command | Applies to |
|---|---|---|
| Unit and component tests | `npm test` (`vitest run`, jsdom) | U1–U3 |
| Type check and build | `npm run build` (`tsc --noEmit -p tsconfig.json && vite build`) | all |
| Browser check | run `npm run dev` and in a browser place a block, close the window, watch the slide, and drag a block to its limit | U2, U3 |

## Definition of Done

- All four units are done, and the whole test suite and the build pass.
- Nothing that dispatches an action reads the drawn world, and grepping App for the drawn world finds it only at the drawing calls.
- In the browser, the slide plays on close and is skipped under reduced motion. The shade shows while dragging and goes after.
- No experimental or abandoned code is left in the diff.
