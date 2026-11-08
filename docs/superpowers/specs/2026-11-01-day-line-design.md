# Chronologic v3: interchanges and the day line

Date: 2026-11-01. Builds on the v2 design in `2026-10-31-tracks-design.md`, which still holds
except where this document says otherwise. The grid and the leg chip added on 2026-11-01 stay.

## Intent

Ian wants two things from the plane that v2 does not give him: a clear answer to "what do I do
now", and a sense of which thing is most urgent, read from where he placed the stops and how
soon their trains get there. He also wants the feeling of Mini Metro, where the plan is a shape
you bend and the map answers, and a proxy for how much energy the day has.

v2 already has the urgency proxy: a stop's distance along its line is the time it was given, and
the train eats that time in real time, so the train's distance to its next stop is how soon the
stop is due. Nothing in this design may stop a train, because stopping a train hides that signal.

What v2 lacks is a way to say "today, these, in this order" and to compare lines at a glance.
This design adds four parts, in priority order:

1. **Interchanges.** A stop can sit on more than one line. One piece of work, one shape, one
   done flag. Completing it anywhere completes it everywhere.
2. **The day line.** One extra line a day, drawn top to bottom through the stops you choose,
   in the order you choose. Its train is the shadow of the project trains: it reaches each stop
   exactly when that stop's own train does. Energy is read from how many stops you drew
   through and how big they are, never from a dial.
3. **The soonest bubble.** The edge bubble of the line whose train reaches its next stop
   soonest is filled with its colour. The rest stay paper. The same calculation the app already
   uses to choose where to open, made visible.
4. **Sketch lines.** A project line with nothing before its goal has no next step, so it is
   drawn as a sketch until it has one stop. Never refused.
5. **Crowding.** Lowest priority, built last, dropped if it fights anything above. Small shapes
   gather at a stop where a train has waited a long time, measured against that leg's own
   planned time, capped. Cleared by completing the stop.

Dropped from Ian's original list, with his agreement: *one train moves at a time* (parking a
train hides its urgency), and *a weekly token budget* (it ranks nothing and gates capture).

## Goals

- Open the app and know the one next thing with zero gestures: when a day line exists, the
  app opens on its train.
- See which line is soonest without reading any number.
- Say "today, these, in this order" in one drag.
- A step that serves two goals is one stop, drawn once, done once.

## Non-goals

- Any notion of energy as a number or a dial. The shapes on the day line are the energy.
- Carry-over of anything from one day to the next. A day line is gone at the next 4 am.
- A second idea of time. The day line takes its pace from the project lines and adds none.
- Interchanges between two project lines as a required feature. The model allows them and the
  join gesture makes them, but no task in the plan depends on them beyond the model.

## Anti-goals

Everything in the v2 list still holds, with the grid and chip exception already written there.
In addition:

- A crowd, a sketch or an empty bubble must never read as "late", "behind" or "wrong". Nothing
  is red, nothing counts days, nothing is drawn with an exclamation.
- No gesture added between seeing a stop and completing it. A tap on the next stop completes
  it, on any line, including an interchange, including the day line.
- No numbers anywhere beyond the grid legend, the leg chip and the two times in the stop
  editor (the leg into the stop and the time from now), which are there to be read and typed.

## Constraints

- Same stack, same look, same pure-module discipline as v2. Model and physics in `src/model`,
  layout and gestures in `src/plane`, all tested without a browser.
- Existing gestures keep working exactly as the README describes them: pan, zoom, drag a stop,
  drag the goal, drag a tile, tap to complete, long press to edit, hold to delete a line,
  bubbles (tap to cycle, long press to fly), tap a train to follow it.
- Local storage only, under a new key `chronologic.v3`, with a migration from `chronologic.v2`
  on first load. The v2 payload is left in place.
- No new colour in the palette. The day line is drawn in `--ink`.

## The model

### Stops on several tracks

`Stop` is unchanged. A stop's id may appear in the `stops` array of more than one track. Its
position, title, shape, size and done flag are shared; every track that lists it routes
through it where it is.

Invariants, enforced by the reducer and checked by storage:

- Every track's last stop is a square.
- A square is the last stop of exactly one track, its *home*. A square may also appear, not
  last, on other tracks: a project's goal can be a stop on the day line, or a step on another
  project ("finish A" as a step toward B).
- A circle or triangle appears on at least one track. Leaving its last track deletes it.
- A stop appears at most once on any one track.
- The day's-end square (below) belongs to the day track only.

`trackOf(world, stopId)` in the reducer, which finds one track, is replaced by
`tracksOf(world, stopId)`, which returns every `{ track, index }`. Each action that today
touches "the stop's track" touches every track that lists the stop:

- `move` moves the stop once; every track through it re-routes, and `keepTrain` runs for
  every one of them.
- `edit` is unchanged in effect; `shape` is still refused for a square.
- `delete` removes the stop from every track it is on, running the v2 leg-merge logic on each.
  Deleting a square whose home track this is deletes the home track as in v2, but a stop on
  the deleted track that is also on another track survives there; only stops that were on no
  other track go with it. Deleting the day's-end square deletes the day track.
- `complete(trackId)` completes that track's next stop (defined below) and sets `done`. Then,
  for every other track listing the stop where it is that track's next stop, that track's train
  departs too (`leg + 1, departedAt: now`). Where the stop is further ahead, nothing changes:
  the train will pass through it later.
- `undo(trackId)` is offered only when the stop is, on every *project* track it sits on,
  either ahead of the train or the dot just behind it. It clears `done` and puts each of those
  trains back to waiting at the stop (`rebase(i, length, length, now)`), as v2 does for one
  track. The day track is settled afterwards (see "Settling the day").
- `moveGoal` carries every pending stop ahead of the train by the goal's offset (it scaled them
  until November 2026), shared stops included: a
  shared stop is one point, so every other track through it re-routes and `keepTrain` runs for
  each, with the drag's `keep` recorded per track. A step shared with another project moves
  when that project's goal is dragged; that is visible and reversible, and pinning it would
  break the shape of the dragged line.

**Only projects keep a stop alive.** The day track is never the track that keeps a circle or
triangle in the world. Deleting a project goal removes the project's stops from the day too,
unless another *project* lists them. `leave` of a stop's last project track is `delete`, which
takes it off the day. Tiles and joins never snap to the day track (`snapToAll` skips it), so
the only ways onto the day are the sun drag and the day's-end drag. A 4 am clear therefore
never orphans anything.

**Next stop.** A track's next stop is its first stop at or after `train.leg` that is not done.
`nextIndex` returns that index, or null when there is none and the train is parked.

**Passing through.** A train heading for a stop that is already done (completed from another
line) does not wait there. `trainState` derives this: while the stop at `leg` is done and the
leg's time has run out, the train is on the next leg, with its departure time the end of the
one before. The stored `train` lags; the derived state is right, and every reader uses the
derived state. When the derived leg reaches the end, the track is parked. Dragging a stop or
the goal on such a track reads the derived leg before it applies `keepTrain`.

### The day track

```ts
interface Track {
  // ... as v2 ...
  /** Set on the one day track. `date` is the local day it belongs to, see "Days". */
  day?: { date: string; budgets: number[] };
}
```

There is at most one day track. Its `color` is unused and drawn as ink. Its `origin` is where
the sun was dropped. Its `stops` are the ids of existing pending stops in the order drawn,
then the day's-end square, a `Stop` with shape `square`, size `small`, title `""`, created with
the track. Its `target` starts at `goal`.

`budgets[i]` is the seconds the project train had left to reach `stops[i]` when the day train
set off toward it (see "The shadow rule"). `budgets` has one entry per stop; the entry for the
day's-end square is 0.

Actions added:

- `newDay { id, endId, origin, stops: string[], end: Point, now, date }`: makes the day track,
  replacing any existing one. `stops` are pending stop ids; ids that are done, missing, or the
  day's-end square are dropped; duplicates keep the first. With no stops left, no track is
  made. `budgets[0]` is the time left to `stops[0]` at `now`; the rest are filled as the train
  reaches each stop.
- `addToDay { stopId, now }`: appends a pending stop before the day's-end square. Refused for a
  stop already on the day, for a done stop, for a stop on no project track, and when there is
  no day track.
- `moveDayEnd { x, y, now }`: moves the day's-end square alone. It scales nothing.
- `leave { trackId, stopId, now }`: removes a stop from one track with the v2 leg-merge logic.
  Refused when it is the track's last stop, or when the stop is a square and this is its home.
  When the stop would be on no track afterwards, this is `delete` instead.
- `clearDay { now }`: removes the day track and its day's-end square. Stops it listed are left
  as they are, done or not.

### The shadow rule

The day train's leg toward `stops[i]` is as long as the time the stop's own project train needs
to reach it.

**Time left to a stop S from a project track P** (`timeLeft(P, S, byId, now)`): let `k` be the
index of S on P and `state` the derived train state. If `k < state.leg`, or S is done, the
answer is 0. Otherwise it is the *time* left on the current leg, `(1 − invertProgress(fraction))
× length`, as `opening.ts` already computes it, plus `Σ lengths of legs state.leg+1 … k` using
routed leg lengths (a later leg's time is its length). Time, not distance covered: a braking
train has an eighth of its leg's distance left but a fifth of its time. A project train waiting
at an intermediate pending stop has nothing left on its leg, so the sum stands still until that
stop is tapped, and the day train stands still with it.

If S sits on more than one project track, the time left is the smallest of them. A stop is
never on the day track alone (see "Only projects keep a stop alive"), so there is always one.

**Day train state** (`dayState(track, world, now)`): with `leg = track.train.leg`,
`budget = budgets[leg]`, `left = timeLeft(…)` for `stops[leg]`:

- `fraction = budget === 0 ? 1 : clamp(1 − left / budget, 0, 1)`.
- The train is waiting when `fraction === 1`, at the stop; otherwise it is at
  `pointAlong(vertices, from, to, fraction)` on the routed day leg. The fraction is linear in
  time, not the v2 accelerate-cruise-brake profile: the day train is a literal shadow.
- Pulling the project leg longer raises `left`, the fraction falls and the day train slides
  back. Pulling it shorter, the day train jumps ahead. This is deliberate; there is no
  special case.

**Settling the day.** The day train never lags and never derives a pass-through. A stop's
`done` changes only by action, so at the end of every action that can change the day's next
stop (`newDay`, `addToDay`, `complete`, `undo`, `leave`, `delete`) the reducer runs
`settleDay(world, now)`: while the day's stop at `train.leg` is done, advance to the next leg
and write `budgets[leg] = timeLeft` for its stop at that moment (0 for the day's-end square).
So a day `[A, B, C, end]` where B was done from its project before A was tapped goes, on
tapping A, straight past B onto the leg to C with C's budget written then. `undo` puts the
day train back to the stop's own leg with budget 0 (both it and the project train wait there);
the day track never blocks an undo, only project tracks do.

**The day's end.** The last leg's budget is 0, so the moment the last day stop is done the day
train is at the day's-end square, waiting. Tapping the square completes it, the train parks,
and the whole day line dims as a finished track does. Leaving it is fine too: 4 am clears it.

**Tapping.** The next stop on the day line is tappable like any next stop, whether or not the
day train has arrived. Completing it on the day completes it on its project(s) by the rule in
"Stops on several tracks", and the reverse: completing it on its project advances the day
train when it is the day's next stop. It is the same rule in both directions.

### Days

A day runs from 4 am local to 4 am local. `dayOf(now)` returns the local date string
(`YYYY-MM-DD`) of the day that `now` falls in, so 2 am belongs to the previous date.

On load and on every tick, the app dispatches `tick { now }`, which is `clearDay` when the day
track's `date` is not `dayOf(now)` and otherwise returns the same world. The day line is never carried over, and nothing on the project lines records that
a stop was on a day line that passed.

### The soonest line

`soonestTrack(world, now)`: among project tracks whose train is not parked, the one whose
next stop is nearest in time (`timeLeft` to its next stop). A waiting train has 0 left and
wins; ties go to `lastTouched`, then to the first. The day track never counts. The opening
camera already uses this calculation; it is extracted so both use the same function.

### Sketch

A project track is a sketch when its next stop is its goal and nothing pending sits before it,
i.e. `stops.length === 1` or every stop before the goal is done and none pending. Only the first
case is new behaviour in practice; the second is a finished project heading home and is already
a normal line. So: `sketch = track.stops.length === 1`. A sketch is a look, not a state: its
train runs, its goal is tappable, its bubble shows.

### Crowding

`crowdAt(track, byId, now)`: when the derived train is waiting at a pending stop,
`min(5, floor(waitedSeconds / legPlannedSeconds))`, where `waitedSeconds` is real seconds since
the leg's time ran out and `legPlannedSeconds` is the leg's routed length. A zero-length leg
never crowds. A day track never crowds, so an interchange shows one crowd, its project's. An
edit on the track (a drag, an added stop) rebases the waiting train to `now`, which restarts
the wait and clears the crowd; that is accepted.

## Gestures

Every v2 gesture is unchanged. Added:

- **Draw the day.** The tray gains a fourth tile, a sun. Dragging it starts a day drawing. As
  the finger passes within `SNAP_PX` of a pending stop not yet in the drawing, the stop is
  appended and a ghost ink line is drawn from the sun's drop point through the collected stops
  to the finger. Lifting places the day's-end square where the finger is and dispatches
  `newDay`. Lifting with no stops collected draws nothing. Drawing a new day replaces the old.
- **Add to the day.** Drag the day's-end square through a pending stop: it is appended
  (`addToDay`), the square returns to where it was. Dragging the square elsewhere moves it,
  as a goal moves, except that it scales nothing: the day line's legs are not time.
- **Join a line.** Release a dragged stop within `SNAP_PX` of another line's path, ahead of
  its train and not within `SNAP_PX` of one of that line's stops: the stop is inserted into
  that line at that leg, at the snap point (`join { trackId, stopId, leg, x, y, now }`). The
  stop stays on the line it came from. Dragging *through* a line never joins; only the release
  does. A tile from the tray released where two lines are within `SNAP_PX` is added to both.
  `snapToTracks` gains a sibling `snapToAll` returning every track within radius, and learns
  to ignore the dragged stop itself when it checks for stops in the way.
- **Leave a line.** The long-press editor on a stop that is on two or more tracks shows a row
  of colour chips, one per track (ink for the day), under the size row. Tapping one dispatches
  `leave` for that track. A square's home track shows no chip. The row is absent on a stop
  that is on one track.
- **Tap the soonest bubble**, long press it: unchanged, it is an ordinary bubble.

## The look

- **Interchange.** A stop on two or more tracks is drawn as a ring: its own shape at its own
  size, with a paper centre and an ink border as thick as the track line (`--track`, 10 px).
  Borrowed from Mini Metro's interchange ring, kept to the stop's shape so kind is still
  readable. A done interchange is an ordinary dot. The ring is not an outline on a shape; it
  is the shape.
- **The day line.** `--ink`, the same width as a project line, routed with the same 45° joins.
  Its train is ink. Its stops are rings (they are interchanges by definition). Its day's-end
  square is a small square in ink. The day's bubble is an ink-on-paper pill like the others.
- **The soonest bubble.** Background in the track's colour, text and shape in paper. Every
  other bubble unchanged. The day line's bubble is never the soonest.
- **Sketch.** The line, its train and its goal in `--muted`, the line at half width (5 px). No
  dash. The moment a stop is added it is drawn as a normal line.
- **Crowd.** Up to five dots of `--dot` size in `--muted`, in a row above and to the right of
  the stop, outside its hit target. No colour, no number.
- **The sun tile.** A paper circle with eight short rays, in the tray after the line tile.
- **Finished day.** When the day's-end square is completed the whole day line dims to
  `--muted`, as a finished project does.

## The camera

- The opening camera: when a day track exists and its train is not parked, open on the day
  train, fitting its current leg as v2 fits a leg. Otherwise as v2.
- Following a train (tap) works on the day train too.

## Storage

- Key `chronologic.v3`. `load` reads v3; if absent, reads v2 under `chronologic.v2`,
  validates it with the v2 rules, and returns it as a v3 world (the shapes are compatible: no
  `day` field, no shared stops). The first `save` writes v3. The v2 key is never written.
- Validation: a track ends in a square; a square is last on exactly one track; every stop id a
  track names exists; the day track, if any, is one, has `date` as a string, `budgets` as
  finite numbers one per stop, and its last stop is on no other track. A world that fails is
  opened as empty, as v2 does.

## Tests

The existing suite stays green throughout. Added, all without a browser:

- Reducer: shared stops through move, delete, complete, undo; join and leave; newDay,
  addToDay, clearDay; the home-square rule; budgets set on departure.
- Train: pass-through of done stops in `trainState`; `timeLeft` with waiting intermediate
  stops; `dayState` fractions including slide-back when a leg grows.
- Days: `dayOf` around 4 am and midnight.
- Soonest: `soonestTrack` ties and the parked exclusion; opening camera unchanged in effect.
- Snap: `snapToAll`, ignoring the dragged stop.
- Storage: v3 round trip, v2 migration, rejection of a square on two homes and of a bad day.
- Layout: rings, sketch flag, crowd counts, day train position.
- App: draw a day through two stops on two lines and see the order; complete on the day and see
  the project train depart; complete on the project and see the day train move; the soonest
  bubble fills; the editor's leave chips; the sun tile; 4 am clears the day.

## Calls Claude made

Ian should check these; each is a reasonable default, not something he said.

1. The day train's motion is linear in time, not the accelerate-cruise-brake profile.
2. A stop on two project lines takes the smaller time left.
3. A train passes through a done stop at its planned pace rather than skipping ahead.
4. `undo` on an interchange is offered only when every line can take it back.
5. The day's-end square is small, untitled and tappable; completing it dims the day line.
6. The final day leg has budget 0, so the day train is at the day's end as soon as the last
   stop is done.
7. Joining happens only on release, never while passing through a line.
8. Leaving a line is a chip in the editor, not a drag.
9. Crowding is capped at five and measured in units of the leg's own planned time.
10. A sketch is only a line with no stop before its goal.
11. Migration reads v2 once and never writes it.
12. Days turn over at 4 am local.

Settled after the builder check, 2026-11-01:

13. Time left is time (inverse of the motion profile), not distance covered.
14. The day train is settled eagerly in the reducer; it never lags and never derives.
15. The day track never keeps a stop alive, and nothing snaps to it but the sun and the day's end.
16. A goal drag carries shared stops too, and every line through them keeps its train.
17. An edit on a waiting line restarts its wait, so its crowd clears.

Settled during the build, 2026-11-01:

18. A stop dragged from any line keeps every train through it (`move.keep` is per track, like `moveGoal`'s).
19. `undo` is judged against the derived train, so a stop a train rolled through and now waits past can still be put back.
20. A running line with no undone stop left (rolling home to a done goal) is never the soonest.
21. One validator serves both storage keys; a v2 world passes the v3 rules.
22. A shared stop is one button. It speaks for the line on which it is next (so a tap completes it there), else the first line listing it; it is dimmed only when every line through it is finished.
23. The day's-end square is not a ring; a done interchange is a plain dot.
24. A sketch's goal is muted with its line; pressing it still fills with the line's colour.
25. The tick runs on open and with the clock while any train rolls; a plane with every train parked re-ticks on its next open.
26. The sun collects only pending stops on project lines, in the order the finger reaches them; the day's own stops and its end square are never collected.
27. Join on release is for a plain stop only: a goal drag and the day's-end drag never join a line.
28. The day's-end drag measures from the square; the sun measures from the finger.
29. A goal is a goal on every line it sits on: its editor, its hold-to-delete and its drag act on its home line whichever line's button was pressed, and a square never joins a line on release.
30. A ring's border is 4 px, not the track's 10 px: 10 px cannot fit a 14 px small circle.
31. undo is by stop, judged against every project line's derived train, so Not done always puts back the stop that was pressed.
