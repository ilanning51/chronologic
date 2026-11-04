# Chronologic: the tray's tiles become brushes

Date: 2026-11-03. A change to the tray in `2026-11-01-day-line-design.md` and the select design in
`2026-11-03-select-and-origin-design.md`, which hold unchanged except as written here. Agreed in
conversation; this note records it. Ian asked for it to be built without a further approval step.

## Intent

Today the New line tile drops a line thirty days long in the middle of the view and flies the
camera to it, and every other tile has to be dragged out of the tray one shape at a time. Ian
wants to draw instead: pick a tool, put it on the map where the thing belongs, and keep going.
The friction rule decides the details: one tap arms a tool, and then each new thing costs one
gesture, with no trip back to the tray between them.

## Brushes

Each of the four tray tiles is a brush: Step (circle), Sub-goal (triangle), New line, and Today
(the sun). A tap on a tile turns its brush on. A tap on the lit tile turns it off. A tap on
another tile switches to that brush: one brush is on at most. Escape turns the brush off (as well
as clearing a selection, as it does now). Closing the tray with the plus turns the brush off
(Claude's call).

While a brush is on:

- the tray stays open, whatever is tapped on the plane;
- the brush's tile looks pressed: the tile fills with paper and its picture turns ink, the reverse
  of the others (Claude's call), and it carries `aria-pressed="true"`;
- the pointer over the plane is a crosshair.

The brush is app state only, never part of the saved world, and is off when the app opens.

Dragging a tile out of the tray still works exactly as now, brush on or off.

## What the paper does while a brush is on

A press on empty paper belongs to the brush. Everything else keeps its meaning:

- A one-finger or mouse drag on empty paper draws with the brush instead of panning. This is the
  trade Ian accepted: with a mouse, the view cannot be drag-panned until the brush is off.
- Two fingers pan and pinch, and the wheel zooms, as now.
- A press on a stop, a train, a line's start, a bubble, the HUD, or the kept box does what it does
  now. A drag that starts on a stop moves the stop.
- Shift-drag on paper draws a selection box, as now; Shift wins over the brush.
- A tap on empty paper still clears the selection, closes an open editor and commits an open
  name field (by blurring it), but leaves the tray open.

## The New line brush

Press on paper and drag. While dragging, a ghost of the line follows: the line exactly as it
would be routed from the press point to the pointer (a 45 degree run, then a straight one, as
every line is routed), drawn like the day's ghost, an ink stroke the width of a track. A chip
beneath the pointer shows the line's total time, which is its routed length, since one world
unit is one second; it is the same chip the leg time uses.

Letting go makes a new line: its start where the press went down, its goal (a large square, as
now) where the pointer let go, its train setting off now. The name field opens on the goal, as
the New line tap does today. The camera does not move: the line was drawn where Ian was looking.

A press that never becomes a drag (a tap) makes nothing. The recognizer's drag threshold is the
only minimum length.

The tap on the New line tile that made a thirty-day line is gone: the tap now arms the brush.

## The Step and Sub-goal brushes

A tap on paper drops a new stop of the brush's shape on the line nearest the tap, at the same
snap point and within the same snap distance a tile drag uses, and joins every other line in
reach there, exactly as dropping a dragged tile does. The name field opens on it. A tap with no
line in reach does nothing. The brush stays on, so the next tap places the next stop; the open
name field is committed by that tap, as a field replaced by a newer one always is.

A drag on paper with these brushes does nothing (Claude's call): only a tap places.

## The Today brush

Press on paper and drag through stops: the drag gathers stops exactly as dragging the sun out of
the tray does today, from the press point, and letting go draws the day the same way. A drag that
gathers no stop draws nothing. A tap does nothing.

## The line tile's picture

The New line tile is redrawn as a line looks on the plane: a short stroke with a round start,
ending in a square goal. Paper on ink, like the other tiles.

There are no other shapes to add. A stop is a circle, a triangle or a square, and a square is
only ever a line's goal or the day's end, both of which the New line and Today brushes draw.

## Edges (Claude's calls)

- A second finger landing mid-stroke turns the stroke into a pinch and throws the half-drawn line
  or day away, so starting a pinch never leaves a stray line behind.
- With the Step or Sub-goal brush on, one tap on paper does both jobs: it clears the selection,
  closes the editor and commits the name field, and it places the stop.
- Escape taken by a name field or the editor only does that; the brush stays on. One key does one
  thing, as with the box.
- Escape never closes the tray; only the plus does.
- The tiles take Enter and Space from the keyboard to toggle their brush, so `aria-pressed` means
  something to a keyboard user.
- A drawn line's start and goal never join other stops or lines: a line is drawn on its own.
- The plus button's pressed fill reads `--track-color`, which nothing sets on it, so it goes blank
  while held; it gets ink-on-paper pressed fill like the tiles while this work touches the tray.

## Undo

A line drawn with the brush, a day drawn with the brush, and a stop placed with the brush (with
the joins it makes) are each one undo step, as a drag and a tile drop are now. Naming is its own
step, as now.

## What does not change

Everything else: the gesture grammar for stops, trains, starts, bubbles and the HUD; the box;
the day's rules; the one rule that an edit never moves a train; levels; the saved world's shape.
