# Chronologic v2: tracks, trains and time

Date: 2026-10-31. Status: design, awaiting approval. This document replaces the model in
design/chronologic-design.md. The look (design/nyc-subway-principles.md) and the criteria
(design/flow-conditions.md) carry over unchanged; where this document and the old design
disagree, this document wins.

## Intent

Ian has ADHD. The app exists to close the gap between seeing what he needs to do and going to
do it. The first version planned a stretch of hours as a budget. It had no place for the thing
the hours were for, so the plane filled with small errands and the reason for them was never on
the page. In Ian's words: "in my adhd brain I cannot link the intermediate goals with the
feeling of excitement without directly seeing/acknowledging the end goal."

So the unit of planning is no longer a block of time. It is a project, drawn as one subway line
from where he is now to the goal he is excited about, with the next step on the same line as the
goal. A train rides the line in real time, so a glance says how close the next step is and how far
the goal is, without a date or a number anywhere.

The whole app is in service of one picture: the next stop, the goal, and a train between them.

## Goals

- Opening the app shows, with no gesture, the next thing to do and the goal it leads to.
- Distance along a line stands for time, so the gap between the train and the next stop is a
  loose deadline you can see without reading.
- Adding what you learn about a project refines the line without making the goal recede.
- Trains are seen moving when you zoom in, with a start-slow, cruise, brake-into-the-station
  profile, so a train close to a stop reads as "approaching, there is still a little time".
- Nothing is ever overdue. The train waits at a platform; it never accuses.
- Several projects live on one plane, each with its own train, so progress across projects is
  one glance.

## Non-goals

- Relationships between tracks (a stop shared by two lines, one project blocking another).
  Parked; see the end.
- Calendar dates, clock times, notifications, reminders.
- History, statistics, streaks, counts of anything.
- Collaboration, sync, accounts. One person, one device, local storage.

## Anti-goals

These would make the build a failure even if it worked:

- Any state that reads as "behind", "late" or "overdue". No red, no exclamation, no count of
  waiting days.
- A number for time on the plane while nothing is being set. The only two places a time is
  written are the grid legend and the chip under a stop a finger is dragging; see the time
  grid below. (Softened 2026-11-01: without a reference a length had no meaning.)
- A settings screen. Every per-track choice is set on the thing itself.
- A train that passes a stop on its own. The train stops and waits, always.
- The goal moving further away because a step was added.

## Constraints

- Same stack as v1: React 18, TypeScript, Vite, Vitest. One infinite plane, CSS transforms.
- Same look: thick opaque lines, solid shapes, Helvetica, no outlines, no transparency, no
  shadows, no gradients, no digits. Colour never carries meaning alone.
- Pure modules for the model, physics, layout and gestures, tested without a browser, as in v1.
- Local storage only, under a new key. A v1 world is left in place and ignored.
- Touch first; the same grammar works with a mouse and wheel.

## The model

**A track** is one project. It has a colour, an ordered list of stops ending in the goal, a train,
and a bubble setting (next stop, next sub-goal, or goal). Its name is the goal's title.

**A stop** is one step. It has a title (may be empty), a shape, a size, a position in planned
time along its track, and a done flag. Stop identity is global, not owned by the track, so a
future version can share a stop between lines.

- Shape is rank. Circle is a step. Triangle is a sub-goal. Square is the goal, and a track has
  exactly one square, always last. The editor offers circle and triangle; the square is made when
  the track is made.
- Size is effort. Small, medium, large, drawn as three sizes of the shape. Default medium; the
  goal defaults to large.
- Position is time. A stop sits anywhere on the plane, and the track is routed through the stops
  in order by the v1 algorithm (a 45 degree segment covering the shorter axis, then a straight
  run, round joins). A leg's planned time is the length of that routed path between two stops,
  in world units, where one world unit is one second. Dragging a stop anywhere changes the two
  legs beside it and nothing else.
- Done shrinks the shape to a dot. Done stops stay on the line.

**The train** is where the project is, now. It is either rolling toward stop i, having departed
the previous stop (or the origin) at a known real time, or waiting at stop i. A track is made
with its train rolling from the origin toward the first stop, departing at creation time.

**The goal pins the length; stops subdivide it.** When a track is made the goal is placed a
default distance out and dragged to where it belongs. Adding a stop drops it onto the routed
path, so it splits the leg it lands in and the total is unchanged. Dragging that stop off the
path afterwards bends the route through it, and the two legs beside it get longer or shorter by
exactly the bend. So the total changes only when you move something, never because a step was
discovered. Crowding is the signal that the estimate was short, and the remedy is to drag the
goal, which scales everything ahead of the train.

**The train's planned position is an invariant under editing.** Any edit to a track (drag a
stop, drag the goal, add, delete, not done) keeps the train's planned-time offset along the
track, and so its place on the line, exactly where it was. The edit then recomputes the train's
departure time by inverting the motion profile for whatever leg the train now finds itself on, so
the picture does not change and the clock continues from there. The train never jumps because a
stop was moved. Two consequences:

- If the next stop is dragged so close that its leg becomes shorter than the train's offset, the
  train is at the stop and waiting. You pulled the platform to the train; that is the one edit
  that moves it, and you did it on purpose.
- Done stops (dots) are not draggable. Track behind the train never moves.
- Deleting the stop the train is waiting at leaves the train where it is, now mid-way along the
  merged leg and rolling toward the next stop.

## Time, the camera and scale

**The time grid.** Squares on the paper, in a grey a shade off it, under every track. One
square stands for one unit from a fixed ladder: 1 s, 5 s, 15 s, 1 min, 5 min, 15 min, 1 hour,
6 hours, 1 day, 1 week, 30 days. The grid uses the smallest unit that draws at 20 px or more, so
as the camera zooms in a square grows until the next unit down fits, then the grid steps to it
and the squares drop back; zooming out does the reverse. The largest a square gets is about
140 px, at the day-to-week step. A legend in the bottom left names the unit, as "1 hour". The
grid never draws a number on a square and never moves a stop; it is paper, not a snap.

**The leg chip.** While a finger drags a stop or the goal, a paper-on-ink chip beneath it reads
the planned time of the leg arriving at it, as its two largest whole units: "2 h 15 min". While
a tile from the tray sits on a line, the chip reads the leg the new stop would end. The chip is
gone the moment the finger lifts. It reads the leg into the stop, not the whole track, because
that is the length the hand is setting.

The plane is the v1 plane: world space where stops live, and a camera that is a translation
and a scale. World units are seconds, so a day of track is a long way and a month is a very
long way. Zooming multiplies the scale by a fixed factor per step, so zoom is logarithmic, and
it is anchored on the pointer or the pinch centre. The range is wide, on the order of a thousand
to one or more.

**Only positions scale.** Track width, stop sizes, train size, dot size, label font: all
constant in screen pixels at every zoom. Shape and size stay readable from any height. Zoomed
far out a track is its shape, a thick coloured line through small solid shapes. Zoomed far in a
screen holds a few minutes of one leg.

**Layout.** A track is routed through its origin (where the train started), then its stops in
order, then the goal, by the 45 degree algorithm. The train sits on the routed path at its
offset along the current leg. Tracks are placed wherever their stops are dragged and have no
relationship to each other on the plane. Left is not sooner, up is not anything; the only
meaning in a position is the length of the path it makes.

**What zoom does to the train.** On screen the train's cruising speed is the world speed times
the camera scale. Zoomed out that is nothing. Zoomed all the way in the train visibly rolls.
Suggested range: at maximum zoom one second of track is about twenty pixels, so a cruising train
moves a clear twenty-five pixels a second; at minimum zoom a month of track fits a screen. The
builder tunes both ends so motion is unmistakable at one end and every project fits at the
other.

**A note for the builder on big numbers.** A month is about 2.6 million world units. Compute
screen positions in code for what is on screen rather than CSS-scaling one world layer by a
factor of a hundred-thousandth, as float precision in the compositor will not survive that.

**Labels.** A stop's title sits beneath its shape at a constant font size. The goal's label and
the next stop's label always show. Other labels show when there is room between neighbours and
hide when there is not. Labels never scale.

## Train motion

Within a leg of planned duration T, elapsed fraction tau = elapsed / T, the train's progress
fraction P along the drawn leg follows a symmetric trapezoid in speed:

- accelerate for the first fifth of T,
- cruise for the middle three fifths at speed v = 1 / (1 - 0.2) = 1.25 (in leg-lengths per T),
- brake for the last fifth.

With f = 0.2:

- tau < f: P = v * tau^2 / (2f)
- f <= tau <= 1 - f: P = v * (tau - f/2)
- tau > 1 - f: P = 1 - v * (1 - tau)^2 / (2f)

P(0) = 0, P(1) = 1, and the train covers the last fifth of the time over only an eighth of the
distance, which is the buffer Ian asked for: a train that looks almost there has a fifth of the
leg's time left.

A note on top speed, which Ian should know: because the leg's length is its time, every leg's
average speed is the same by construction, and so the cruise speed is the same on every leg.
What differs by leg length is how much track the braking covers. The feeling of an express run
comes from zooming in, not from the physics. The fixed fractions are Claude's call; the
alternative, a fixed acceleration like a real train, would make the time of a leg grow with the
square root of its length and break the "drag it twice as far, it takes twice as long" intuition.

**Arrival.** When tau >= 1 the train is at the stop and waiting. Waiting is drawn exactly like
arriving: the train at the platform, still. Nothing changes until the stop is tapped, however
long that takes. Nothing records how long it took.

**Early completion.** Tapping the next stop before the train arrives completes it: the stop
shrinks to a dot, the train jumps to it and departs at once on the next leg.

**Only the next stop can be completed.** A tap on any other pending stop does nothing. To skip a
step, delete it or drag it later. This keeps "the train never passes a stop" true in every path.

**Arriving at the goal.** The train stops at the square and waits. Tapping the square completes
the project: the square shrinks to a dot, the train parks, and the whole track dims to the muted
ink. It stays on the plane as a line of dots. A long press on the dotted goal opens the same
small panel as any most-recent dot: "not done", which restores the goal and puts the train back
to waiting at it, and delete, which is the hold-to-confirm described under the editor.

**Time while closed.** Positions are computed from departure times and the real clock, so a
train that was rolling keeps rolling while the app is closed and is where it should be on
reopening.

## Touch grammar

- One finger on empty paper pans. Two fingers zoom and pan together. The wheel zooms about the
  pointer.
- One finger on a stop drags it anywhere on the plane. The track re-routes through it, the two
  legs beside it change length, and nothing else moves.
- One finger on the goal drags it anywhere, and every stop ahead of the train moves with it in
  proportion, scaled about the train's position, so the whole remaining track stretches or
  squeezes and keeps its shape. Track behind the train never moves.
- A tap on the next stop completes it (on arrival or early). A tap on any other pending stop
  does nothing.
- A long press on a stop or the goal opens the editor. A drag of more than ten pixels is a move,
  never a tap or a press.
- A tap on a train zooms the camera to the motion zoom, centred on it, so you can watch it roll.
  A tap on it again returns to the previous view.
- A tap on an edge bubble cycles that track's bubble target: next stop, next sub-goal, goal. A
  long press on a bubble flies the camera to the target.
- A tap on the plus opens and closes the tray.
- A long press on the most recent dot of a track offers "not done", which restores the stop and
  puts the train back to waiting at it.

On a desktop the left button is one finger, the wheel zooms, and a held left button or a right
click is a long press. Return and Escape work in every field.

## Capture: the tray

The plus button, bottom right, opens a small tray holding three tiles: circle, triangle, and a
new-line tile (a square with a train). The tray stays open until the plus is tapped again or
empty paper is tapped, so several stops can be dropped in a row.

**Adding a stop.** Drag a circle or triangle out of the tray. As it nears a track it snaps onto
the routed path and rides along it under the finger, showing where it will split the leg. It
snaps only to path ahead of the train and before the goal. Let go and it is a stop at that point
on the path, so the total is unchanged; the drop point is how the leg divides. A field opens
beside it for the title. Return commits. Escape or a tap elsewhere leaves it as a bare shape, to
be named later by a long press. Dragging it off the path afterwards is how you tidy the map.

**Starting a project.** Tap the new-line tile. A new track appears with its origin and train at
the centre of the view, nudged clear of anything there, and its square a default distance to
the right, and a field opens for the goal's title. Return commits; Escape removes the track. The
next colour is taken from the palette. Drag the square to where the goal really is.

Suggested default goal distance: thirty days. Claude's call.

## The editor

A long press opens a small panel on the stop with: title, shape (circle or triangle; not offered
on the goal), size (small, medium, large), delete. Delete on the goal deletes the whole track and
is a hold-to-confirm, using the hold pattern from v1 (the button fills while held, letting go
early cancels). No other action in the app confirms.

Deleting a stop merges its two legs; the neighbours do not move and the train's planned
position is preserved as everywhere.

## Edge bubbles

Each track has a target: next stop, next sub-goal, or goal. Default is goal, because the goal
is the reason the feature exists. When any part of a track is in view and its target is off
screen, a bubble sits on the window edge where the straight line from the screen centre to the
target leaves the screen, so it also points the way to pan. The bubble carries the target's
shape in the track's colour and its title, nothing else. When the target comes on screen the
bubble goes. Tracks with nothing in view get no bubble.

## Opening

The camera opens centred on the train whose next stop is nearest in time. A waiting train
counts as nearest of all, since its stop is ready now. Ties go to the most recently touched
track. The zoom is set so that train's current leg (or next leg, if waiting) spans about a third
of the screen width, clamped to the zoom range. With no tracks, the plane opens empty with the
tray closed.

## Feedback

- Completing a stop: the shape shrinks to a dot over 150 ms, the train departs, and one short
  tone plays. The tone's pitch is per track, taken from the colour index.
- Completing the goal: the same, plus one quiet chord and a haptic.
- Arrival at a stop is silent and unmarked. The app never interrupts.
- Reduced motion turns off the eases. Trains still move, as their position is data, not
  decoration.
- Sound follows the device's silent switch. No in-app toggle.

## Visual tokens

Carry over from v1: paper, ink, muted ink, Helvetica, the shape sizes, the track width, the
train size, the dot. The four kind colours become the first four of a palette of eight distinct
opaque track colours; the builder picks the other four to the same rules. The HUD is reduced to
the plus button and the edge bubbles. The clock, the stretch name and the kind bullets are gone.

## Persistence

Storage key `chronologic.v2`, saved on every change as v1 does. The shape is validated on load
and anything untrusted opens as empty. Contents: tracks (id, colour index, stop ids in order,
train state, bubble target), stops (id, title, shape, size, at, done), the last-touched track
id. No camera is saved; opening decides the camera.

## Flow criteria, checked

- Zero gestures to the next thing: opening centres on the nearest train with its stop on screen
  and the goal in a bubble or in view.
- One tap and a few words to capture: tap plus, drag a shape onto the line, type. The drag is
  one more gesture than v1 and it is the gesture that puts the thought in time, which Ian chose.
- Three gestures to a started project: tap plus, tap new line, type the goal.
- No failure state: the train waits, nothing is overdue, done can be undone, the goal can be
  dragged.

## Calls Claude made

Marked here so they can be checked while reading:

1. Tracks are free shapes on the plane and have no time relationship to each other, so the
   track stays put and the train moves along it. (An alternative aligned every train in one
   "now" column, which would have made the track slide and the train stand still.)
2. The motion profile uses fixed fifths rather than a fixed acceleration; see the note above.
3. Only the next stop can be completed.
4. Bubble default is the goal.
5. Default goal distance is thirty days.
6. Deleting a track is the one hold-to-confirm in the app.
7. Tap on a train zooms to the motion zoom.
8. The tray holds three tiles; size is set afterwards in the editor.
9. Edits preserve the train's planned-time offset, not its fraction of a leg, and departure time
   is re-derived from it. Found by the builder check; this is the only reading under which the
   train never moves on screen because of an edit.
10. A long press on a finished track's goal dot opens a panel (not done, hold-to-delete) rather
    than deleting directly, so the one-confirm rule holds and the gesture means the same thing
    everywhere.

## Left to the builder

- Exact pixel constants: stop sizes, zoom range and step, label room rule, bubble size.
- The other four palette colours.
- Rendering at large world coordinates (see the note under the camera).
- Snapping distance for the tray drag, and which track wins when two paths are near.
- The goal drag when the train is mid-leg: scale stop positions about the train's point on the
  path, keep the train's offset along its leg, and re-derive its departure time as the invariant
  says.
- Build order. Suggested: model and physics as pure modules with tests; layout and camera;
  rendering of tracks, stops, trains; gestures; tray and capture; editor; bubbles; opening;
  persistence; feedback.

## Parked

- Relationships between tracks: a transfer stop shared by two lines, one line waiting on
  another. Global stop identity is kept now so this needs no migration.
- A dark palette.
- History of finished tracks beyond their dots.
- Import from Todoist.
