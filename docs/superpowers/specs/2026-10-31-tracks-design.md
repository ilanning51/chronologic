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
- A number for time anywhere on the plane. Not hours, not days, not percentages.
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
- Position is time. A stop's position is its planned offset in seconds from the track's origin
  (where the train started). The distance between two stops is the planned time for that leg.
- Done shrinks the shape to a dot. Done stops stay on the line.

**The train** is where the project is, now. It is either rolling toward stop i, having departed
the previous stop (or the origin) at a known real time, or waiting at stop i. A track is made
with its train rolling from the origin toward the first stop, departing at creation time.

**The goal pins the length; stops subdivide it.** When a track is made the goal is placed a
default distance out and dragged to where it belongs. Adding a stop splits the leg it lands in.
The total never changes because a step was discovered. Crowding is the only signal that the
estimate was short, and the remedy is to drag the goal.

**The train's planned position is an invariant under editing.** Any edit to a track (drag a
stop, drag the goal, add, delete, not done) keeps the train's planned-time offset along the
track, and so its place on the line, exactly where it was. The edit then recomputes the train's
departure time by inverting the motion profile for whatever leg the train now finds itself on, so
the picture does not change and the clock continues from there. The train never jumps because a
stop was moved. Two consequences:

- No stop can be dragged or dropped past the train. Drags are clamped at the train's position.
- Done stops (dots) are not draggable. Track behind the train never moves.
- Deleting the stop the train is waiting at leaves the train where it is, now mid-way along the
  merged leg and rolling toward the next stop.

## Time, the camera and scale

The camera holds a pan in pixels (both axes), and one scale: seconds per screen pixel. Zooming
multiplies the scale by a fixed factor per step, so zoom is logarithmic. It is anchored on the
pointer or the pinch centre.

**A leg's drawn length** is its planned seconds divided by the scale, with a floor in pixels.
Zoomed far out the floor wins on every leg and a track is a diagram with even spacing, like the
subway map, which is not to scale on purpose. Zoomed far in, time wins and the legs are to scale.
There is no mode switch; the two are ends of one rule.

**Nothing else scales.** Track width, stop sizes, train size, dot size, label font, row spacing:
all constant in screen pixels at every zoom. Shape and size stay readable from any height.

**Layout.** Each track is a horizontal row. Rows are stacked top to bottom in creation order with
a constant pixel spacing. A track is laid out from its own origin: the origin is at the row's x
of zero, stops follow to the right at the cumulative drawn length of their legs, and the train
sits within its leg at its progress fraction of that leg's drawn length. Tracks are not aligned
to one another in time; each is its own line, and its train moves right along a line that holds
still. Vertical position carries no meaning.

**What zoom does to the train.** On screen the train's cruising speed is its leg's drawn length
per leg time. Zoomed out that is nothing. Zoomed all the way in a screen holds a few minutes of
track and the train visibly rolls. Suggested range: at maximum zoom one pixel is about a
twentieth of a second, so a cruising train crosses a screen in well under a minute; at minimum
zoom one pixel is several hours. The builder tunes both ends so motion is unmistakable at one
end and a year of track fits at the other.

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
- One finger on a stop drags it along its line, between its two neighbours, never past them. The
  two legs beside it change; nothing else moves.
- One finger on the goal drags it left or right and scales every leg ahead of the train in
  proportion. Track behind the train never moves.
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
the line and rides along it under the finger, showing where it will split the leg. It snaps only
to track ahead of the train and before the goal. Let go and it is a stop at that point; the drop
point is the leg length. A field opens beside it for the title. Return commits. Escape or a tap
elsewhere leaves it as a bare shape, to be named later by a long press.

**Starting a project.** Tap the new-line tile. A new row appears below the last with a train at
the origin and a square a default distance to the right, and a field opens for the goal's title.
Return commits; Escape removes the track. The next colour is taken from the palette. Drag the
square to where the goal really is.

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
is the reason the feature exists. When a track's row is in view and its target is off screen, a
bubble sits on the window edge at that row, on the side the target is. The bubble carries the
target's shape in the track's colour and its title, nothing else. When the target comes on
screen the bubble goes. Tracks whose row is off screen get no bubble.

## Opening

The camera opens centred on the train whose next stop is nearest in time. A waiting train
counts as nearest of all, since its stop is ready now. Ties go to the most recently touched
track. The zoom is set so that train's current leg (or next leg, if waiting) spans about a third
of the screen width, clamped to the zoom range. Rows are constant pixels apart, so the
neighbouring tracks are in view. With no tracks, the plane opens empty with the tray closed.

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

1. Tracks are laid out from their own origins and not aligned to each other in time, so the
   track holds still and the train moves. (An alternative aligned every train in one "now"
   column, which would have made the track slide and the train stand still.)
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

- Exact pixel constants: leg floor, row spacing, stop sizes, zoom range and step, label room
  rule, bubble size.
- The other four palette colours.
- How the layout handles zoom anchoring when the leg floor makes the mapping non-linear.
- Snapping distance for the tray drag, and how a drop between rows picks a track.
- The goal drag when the train is mid-leg: scale only the part of the current leg ahead of the
  train, keep the train's offset, and re-derive its departure time as the invariant says.
- Build order. Suggested: model and physics as pure modules with tests; layout and camera;
  rendering of tracks, stops, trains; gestures; tray and capture; editor; bubbles; opening;
  persistence; feedback.

## Parked

- Relationships between tracks: a transfer stop shared by two lines, one line waiting on
  another. Global stop identity is kept now so this needs no migration.
- Reordering rows.
- A dark palette.
- History of finished tracks beyond their dots.
- Import from Todoist.
