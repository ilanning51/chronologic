# Chronologic: levels

Date: 2026-11-03. A small change to the v3 design in `2026-11-01-day-line-design.md`, which
holds unchanged except as written here. Agreed in conversation; this note records it.

## Intent

Ian wants to zoom into one stretch of a project, the steps to a prototype say, and have that
stretch read as its own short line, while the whole project stays one zoom away and the goal's
bubble stays on the edge. Zoomed out he does not want the clutter of every small step. So the
plane draws like a map: cities from far away, streets only up close.

## The rule

Each shape and size has a grid unit. A stop is drawn only when the grid is at that unit or a
smaller one, so a shape appears at the same moment the legend steps down. The grid is the one
idea of level in the app.

| Shape | Drawn when the grid is at or below |
|---|---|
| Square | always |
| Large triangle | always |
| Medium triangle | 1 week |
| Small triangle | 1 day |
| Large circle | 6 hours |
| Medium circle | 1 hour |
| Small circle | 15 minutes |

The units are Claude's call, kept as constants in `src/plane/level.ts`, to be tuned by feel.

**Always drawn**, whatever the level: the next stop of any line, the goal, the train, and a stop
added since the last zoom, so a circle dropped from far away does not vanish on being named.

**A hidden stop** still routes the line, so the picture's shape and every leg's time are
untouched. It has no shape, no label and no hit target. A done dot follows the rule of the stop
it was. A stop on two lines is one stop, so it hides or shows the same on both.

**Labels** make room among the stops that are drawn, not the hidden ones.

Nothing else changes: zoom, gestures, bubbles and the opening camera are as they were. Ian chose
fixed units over hiding by crowding.
