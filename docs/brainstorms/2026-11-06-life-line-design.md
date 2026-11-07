# Chronologic: the life line

Date: 2026-11-06. Status: design, approved by Ian in chat ("yes i like all of these recs").
Builds on the day line (docs/superpowers/specs/2026-11-01-day-line-design.md, under the earlier process) and the week
window (docs/superpowers/specs/2026-11-06-week-window-design.md). The look
(design/nyc-subway-principles.md) and the criteria (design/flow-conditions.md) carry over.

## Intent

Ian has ADHD. Short working memory and weak executive function mean he forgets why he is doing a
thing, loses sight of the end it serves, and goes to do something that pays at once instead. He
wants the app to give direction the way a game does: a skill tree, or a mission track with main
missions and side missions.

The project lines already put the next step and the goal on one line. What is missing is the
level above: the thing the goal is for. In Ian's words, "an overarching multi track that runs
from infinitely left to infinitely right, which contains my entire life", broken into "little
clusters of tracks that each function as a period of time, or a city", with "really broad
markers" on it, "live in NYC with my girlfriend", "work in a CogSci field I am passionate about".

The app already has this structure at the scale of one day. The day line is one ink line through
the stops Ian chose, and its train is a shadow: it reaches each stop exactly when that stop's own
project train does. The life line is the day line at the scale of a life. One ink line,
horizontal, straight, running off both edges of the paper. Its train is now. Left of it is the
past, muted. Right of it is the future. Project lines feed into it as interchanges.

In the subway reading, the life line is the intercity express, each marker is a city's central
station, and the project lines are that city's local network, terminating at the express. Zoomed
out, the map shows the express and the cities it calls at. Zoomed in, one city's streets. The
levels already draw the map that way, so the metaphor costs nothing.

With this, opening the app shows three things in one glance: the next stop, the project line it
is on running to its goal, and the goal sitting on the ink line that runs to the marker. The
link Ian said his brain cannot make on its own is drawn.

## Ian's decisions

- The life line's train is a shadow, by the day line's rule. It reaches a project goal exactly
  when that project's train does, and rides real time only into a bare marker that no project
  feeds. This adds no second idea of time, and the life train waits where his life is actually
  waiting.
- The life line never bends. It is the only straight line on the map: horizontal, ink, thicker
  than the day line. Dropping a goal on it pins the goal's height. Dragging a goal along it moves
  it in time. Dragging it off takes it off the life line, as with any interchange.
- A marker is not a new shape. It is a large square, named in bold capitals, with a picture like
  any goal. A solid square on the life line is a broad goal nothing feeds yet. A ring is one a
  project is working toward. That contrast is the signal.
- A done marker keeps its square and its name in ink, small, like the terminus. A done project
  goal on the life line does the same. Zooming out and panning left is the trophy room, with no
  count anywhere.
- The app opens on today's day train if one is drawn, otherwise on the project train heading for
  the next ring on the life line. The soonest train is the fallback only when the life line has
  no ring ahead.
- Zoom reaches years. The grid ladder gains a quarter, a year and five years, with matching
  levels where only the life line and its markers draw, and the camera's range widens to match.
- There is exactly one life line. It is always there, never deleted, and a new world opens with
  it empty. The first thing to do in a fresh world is drop a marker on it.
- A ring further along the life line can be completed while the life train waits at an earlier
  one. The day line already handles this: the done ring becomes a dot and the train passes through
  it later. No new rule.

## What it gives for free

- The main mission is the next ring on the life line, wherever the life train is waiting. No
  flag to set. Side missions are the project lines whose goal is not on the life line.
- Cities need no name and no border. A city is the stretch of the life line into a marker, and
  the project lines whose goals sit on that stretch. The marker names it.
- The past needs no history view. It is the muted left half of the life line with its landmarks.

## The model

- **The life line** is a track with `life: { y: number; budgets: number[] }` in place of `day`.
  `y` is the height it runs at. `budgets` runs alongside `stops` as a day line's does: the project
  time its train shadows on each leg. One per world, made by `load` when the saved world has none.
- **Its stops** are squares. A stop on the life line and on no project line is a **marker**. A
  stop on the life line and on a project line is that project's goal, drawn as a ring. The life
  line never carries a circle or a triangle; a tile of either dropped on it is refused, shown
  muted, as the week window refuses a drop.
- **Position is time** along it as on every line: the next stop to the right, the one after it
  further right. The train's x is now. A marker two years out sits two years of world units to the
  right of the train. A shadow leg's length still reads as the time it was given, and the leg chip
  says so while a square is dragged along it.
- **Its train** shadows by the day rule: on a leg into a ring, fraction is one minus the project
  time left over the leg's budget; on a leg into a bare marker, it rides real time with the usual
  profile. It never stops a project train and never counts.
- **Infinite both ways.** The track's `origin` is where its train was when the world was made.
  Drawing extends the ink from the left edge of the viewport to the right edge at `y`, whatever
  the stops. Left of the train the ink is muted, as any travelled road is.

## How it is built, in one line each

- LL1. `Track.life` beside `Track.day`; `stateOf` sends a life track to the shadow rule.
- LL2. `load` adds an empty life line to a world without one and saves under `chronologic.v5`,
  reading v4, v3 then v2.
- LL3. The life line routes as a straight segment through its stops at `y`; `routeThrough` is not
  used for it. A stop joined to it is moved to `y`, and a stop dragged on it keeps `y`.
- LL4. `join` onto the life line refuses circles and triangles, and sorts the joined square into
  `stops` by x, as the day line sorts by its order.
- LL5. `leave`, and `delete` of the project, keep a square on the life line as a marker when it
  was a ring; a bare marker is deleted from the life line like any stop.
- LL6. Completing a ring completes it everywhere, as any interchange; the life train's budgets are
  kept current by the reducer, as the day's are.
- LL7. Done squares on the life line are drawn as small ink squares with their name, the
  terminus style, never as dots.
- LL8. `UNITS` gains 90 days ("3 months"), 365 days ("1 year") and 5 years ("5 years");
  `MIN_SCALE` drops so that five years fits across a phone.
- LL9. `LEVELS` gains a rule by line: at the 90-day unit and wider, only squares on the life line
  draw and only its ink is drawn; project lines, their stops and their trains are hidden. At
  1 year and wider, only bare markers and done squares draw; rings are hidden too.
- LL10. `openingCamera` prefers, after today's day train, the project train of the first not-done
  ring on the life line; `soonestTrack` is the fallback.
- LL11. The life line's bubble points at its next not-done square, filled when its train waits
  there, in ink. Its target cycles like any bubble.
- LL12. The square tile dropped on the life line makes a marker there. A new line's goal may be
  dropped on it in the same gesture.
- LL13. The life line is drawn under the day lines and over the grid, thicker than the day line,
  in ink; its train is an ink train like the day's.

## Edges (Claude's calls)

- A marker's leg into it is given 90 days when it is dropped with nothing between it and the
  train, so a fresh marker is not at the train. Dragging it sets the real time.
- A ring's x on the life line is pinned by the join, not by the project: the project's last leg
  bends to reach it. Dragging the ring along the life line changes the project's last leg and the
  life line's two legs beside it, and nothing else. This is the existing interchange rule.
- When a project goal that is a ring is dragged off the life line, the project keeps its goal and
  the life line forgets it. There is no marker left behind, because the goal was never a marker.
- The life train's budget on a leg into a ring is the project's time left when the life train
  departed the previous stop, by the day rule. If the project is edited so its goal gets further
  away, the life train slides back on its leg, as the day train does.
- A marker is done by a tap on it: the life train must be waiting there, and nothing feeds it.
  The tap completes it as any next stop. There is no other way to finish a marker.
- The crowd never gathers on the life line, as it never gathers on a day line.
- The week window does not list the life line's squares, as it lists next stops of project lines.
- Box select can pick up markers and move them together, along the life line only: their y is
  kept.
- The grid's 3-month and 1-year squares are drawn as the others; the legend names them.
- Daylight paper tint, sound and haptics do not change.

## Assumptions for Ian to check

Each is cheap to change after a week of use.

- A marker's default distance of 90 days.
- Rings hidden at the 1-year unit and wider; markers and done squares still shown.
- A life train that waits for weeks at a ring reads as "my life is here, at this project" and not
  as stuck. Ian has not yet answered this directly.
- The life line's bubble is in ink and cycles like the others.

## What does not change

Project lines, the day line, the week window, brushes, undo and the box keep every rule they have.
Nothing counts anything. No number appears beyond the grid legend and the leg chip. Nothing is
sent anywhere.

## Parked, from the same conversation

Ian asked for an analysis of the design against his goal of direction like a skill tree. Nine
changes were proposed; the life line then arrived and replaced the first of them (a trunk line).
The others are not built and not decided:

- a one-sentence why on each goal, shown under the next stop of its line;
- a first move on a stop, shown only while it is next;
- done sub-goals kept as small ink triangles with their names, with a chord;
- the far-out map keeping finished lines and checkpoints in ink;
- branch lines that start at a stop of another line and stay a sketch until it is done;
- crowds only on the main line;
- a siding: a tile dropped on bare paper becomes a lineless stop;
- a cab view on tapping the train (unpicked in the rewards batch).

## Resolved in planning

Planning found four places where the notes above disagree with each other or with the app, and settled them.

- A marker has no default distance. The 90 days above would put the first marker about 78,000 pixels off the screen at the opening zoom. A marker lands where the square tile is let go, which must be right of the life train, and its leg is that distance in time.
- A ring leaves the life line by the Life chip in the editor, the existing interchange rule, and not by dragging it off. A drag on the life line moves along it only. Leaving leaves nothing behind, and the project keeps its goal. Deleting the project is different: the square stays on the life line as a marker, with its name, picture, size and done flag.
- A bare marker completes on a tap whether or not the life train has arrived, as every next stop does; the "must be waiting" above is dropped. A ring's tap belongs to its project, so the life line never completes a ring, which would end the goal before its steps.
- The zoom range reaches 5e-7, because at the old floor the 5-year unit could not be reached on a landscape phone. Framing a project never zooms wider than the 30-day unit, or a leg of years would open on a view with nothing of it in sight. The by-line rule that hides project lines and rings lives in the layout, not in the per-shape levels.

A done ring on the life line becomes a landmark, a small ink square with its name, and not a dot as the "Ian's decisions" list says of a ring further along that is completed early.
