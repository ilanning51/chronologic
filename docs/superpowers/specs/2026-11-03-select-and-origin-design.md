# Chronologic: box select, and dragging the start of a line

Date: 2026-11-03. A change to the v3 design in `2026-11-01-day-line-design.md`, which holds
unchanged except as written here. Agreed in conversation; this note records it.

## Intent

Ian wants to tidy the map. Two things stood in the way. A line's start, where its train first set
off, is drawn as nothing but the rounded end of the line, so it cannot be grabbed, and only the
goal end of a line moves. And moving a cluster of stops, or a whole line, means dragging each
one, with the legs between them stretching on every drag. So the start of a line becomes a
handle, and a box drawn with the mouse picks up everything inside it to move as one piece.

## Dragging the start of a line

The start of every line, the origin in `Track`, is a drag target with the same 44 px hit area a
stop has. Nothing new is drawn there: the rounded end of the line is the handle (Claude's call).

Dragging it moves that one point and nothing else. The one rule holds, an edit never moves the
train: when the train is still on the first leg, the leg changes length under it and the train
keeps the seconds it had covered, exactly as a stop drag does. While that is so, the leg chip
shows the first leg's planned time beneath the start. Once the train has passed the first stop,
the start is history and moves freely, changing no time and showing no chip.

The day line's start drags the same way and never shows a chip, as its legs are not time.

A tap or a long press on the start does nothing.

## The box

With a mouse, holding Shift and dragging on empty paper draws a box. A plain drag still pans.
Touch has no box for now. While the mouse moves, the box is drawn in a thin dashed ink line
from where the button went down to where the pointer is.

Letting go keeps a selection: every stop whose point is inside the box, pending or done, goals
and the day's end square included, and every line whose start is inside the box. A stop hidden
by the level counts as much as a drawn one: the box is geometry, not what happens to be drawn.
A box that catches nothing leaves no selection.

The selection is drawn as the same dashed ink box, now snug around what it caught plus a margin
of 24 px on every side (Claude's call). It follows the pan and the zoom, as it is the bounds of
world points.

**Moving it.** Dragging anything in the selection, a stop, a dot, a line's start or the empty
paper inside the box, moves the whole selection by the same amount, as if sliding a cut-out of
the map. Nothing scales: a goal in the selection moves like any other point, never as a goal
drag. A leg with both ends in the selection keeps its length and so its time. A leg with one end
inside stretches, and its train keeps its progress, as with any drag. No leg chip shows, and
nothing joins another line on release. Every move is worked from where the drag began, so the
path the mouse took never matters.

**Clearing it.** A tap on paper, a tap inside the box, Escape, or drawing a new box clears the
selection. Nothing else does: a selection survives panning, zooming, completing a stop and
opening an editor.

Dragging a stop or a line's start that is not in the selection drags it alone, as before, and
leaves the selection as it is.

## What does not change

Zoom, gestures on stops, tiles, bubbles and trains, the sun, the day's end square, the editor,
levels and the opening camera are as they were. The dashed box is the one dashed line in the
app: it is a tool held in the hand, not a part of the map, and goes when the hand lets go of it.
