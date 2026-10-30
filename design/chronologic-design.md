# Chronologic

A planning tool for one person. It plans in loose chronological order, without timestamps, and still answers the question that makes people plan in the first place: what can I get done in the time I have?

## The problem

Planning tools earn their keep through one comparison, what you intend to do against the time you actually have. Time blocking makes that comparison by pinning every task to a clock time, which turns each task into a small deadline and a day into a row of them. I find the boundaries of structured time exhausting, as the moment 2:00 passes with the thing undone the plan starts to accuse you, and the accusation does not go away when you reschedule. However, the comparison itself is still worth having.

Chronologic keeps the comparison and throws away the clock times. It is essentially a budget rather than a schedule: you know roughly how much time you have, each task costs roughly something, and the app shows you where the money runs out.

## What it is for

The app exists to close the gap between seeing what I need or want to do and going to do it. I have ADHD, so that gap is the whole problem, and the conditions for flow are the criteria the app is held to. They are written out in flow-conditions.md and reduce to one rule: zero gestures from opening the app to knowing the next thing, one tap and a few words from a thought to a station, three gestures from a plan to a started stretch.

## What it does

You declare a stretch of time in loose words, "a couple of hours", and draw a line through the tasks you intend to do in it, in order. Each task has a rough size shown as a shape. The line is only as long as the stretch, therefore it runs out, and the tasks it did not reach are left standing with no line under them. That is the whole answer to "what can I get done": whatever the line reaches. Nothing is ever overdue, as there is no time at which anything was due.

Everything lives on one infinite plane that you pan with one finger and zoom with two. The look is borrowed from Mini Metro and from the Vignelli map of the New York subway, and the principles taken from that map are in nyc-subway-principles.md. Thick colored lines, solid shapes for stations, Helvetica, no outlines, no transparency, no digits.

## The model

Definitions first, as every later rule leans on them.

A station is a task. It has a title, a size, a position on the plane and a state, pending or done. Size is one of three shapes, and each shape stands for a rough duration that the app keeps to itself: a circle is about 20 minutes, a triangle about 45 and a square about 90. Anything bigger than a square is not one station but several, as a four hour "task" is an estimate you cannot trust.

A kind is the sort of energy a stretch takes, which is what actually decides which stations you pull into it. There are four, Deep, Shallow, Body and Out, and each owns a color. The color belongs to the stretch and never to a station, so a station can ride any kind of line.

A stretch is a block of time you are about to spend. It has a kind, a name and a declared length chosen from four phrases, an hour, a couple of hours, half a day and the whole day, which stand for 60, 120, 240 and 480 minutes. Its capacity is 80 percent of its length, as every planner on earth over-packs and the app should absorb that rather than you. A stretch therefore holds about 48, 96, 192 or 384 minutes of stations.

A line is the ordered list of stations in a stretch, in the order you drew through them. The line's color is spent in that order, and a station fits when the sum of sizes up to and including it is at most the capacity. The first station that does not fit, and every station after it, is beyond the line: it belongs to the stretch's intention, sits on bare paper and is drawn exactly like any other pending station.

The plane is where every station lives. Position is loose chronology: left is sooner, right is later, and two stations at nearly the same horizontal position are about the same time. Vertical position means nothing and exists so stations can be read. A third axis is reserved, back is later, and in the first version every station stores a depth of zero and nothing draws in depth.

The clock is a solid pie in the stretch's color that is eaten as the stretch's length elapses. It carries no digits. It is the only thing in the app that knows the time, and all it knows is how much of the stretch is left, never the hour.

## Rules that never bend

- Nothing is ever overdue and nothing is ever counted against you. There is no carry-over count, no streak, no score and no history in the first version.
- The terminus bar at the end of the colored line is the only fit signal. No bars, no percentages, no "107 percent".
- No outlines, no thin strokes, opaque colors only. No transparency, no shadows and no gradients, except the hard stop pie.
- Shape is size. Color is kind. Dot is done. Position is order. Every attribute a station has is drawn on the station, never in a legend.
- Color never carries meaning alone. Every kind's bullet holds its initial, and the stretch name is followed by the kind in words.
- The app never interrupts a running stretch. No notifications, no badges, nothing pinned to the screen beyond the four corner stickers.
- No settings screen. Every decision in this document was made once, here.

## The plane and the camera

The app has two coordinate systems. World space is where stations live, in units that never change. Screen space is the glass you look through, and the camera is a translation and a scale applied to the whole world layer at once. Panning and zooming never move a station, they move the camera.

The HUD is drawn in screen space, therefore it ignores the camera entirely. Zooming far in on the current line is how you see your stretch: labels grow, the line thickens and nothing else changes, as there is no separate stretch screen to keep in sync. Zoomed far out, labels hide below a threshold and the plane becomes shapes and lines only, since text at four pixels is noise.

## On opening

When a stretch is running, the camera flies to the train at the stretch zoom, so the first thing on screen is the next station and nothing has to be decided. When no stretch is running, the plane opens at the default zoom on the leftmost stations with the bullets ready.

## The HUD

Four stickers on the glass, one per corner. Top left, the stretch name in bold with the kind and length beneath it in muted ink, "Afternoon" over "Deep, a couple of hours". Top right, the clock. Bottom left, the four kind bullets, each a solid disc carrying its initial. Bottom right, the add button, a solid ink disc with a plus.

Nothing else is ever pinned to the screen.

## Touch grammar

- One finger on empty paper pans.
- One finger on a station moves it.
- A tap on a station that is on the current line completes it, and a tap on a done station restores it. A drag of more than ten pixels is a move, never a tap.
- A long press on a station opens it for editing: title, shape, split into circles, delete.
- Two fingers zoom and pan together.
- A drag that starts on a bullet draws a line, and a second drag from a bullet redraws it.
- A tap on the clock flies the camera to the train. Holding the clock ends the stretch, and the pie shrinks while you hold, so letting go early cancels.
- Three fingers are reserved for depth.

On a desktop the same grammar holds with a mouse. The left button stands in for one finger, the wheel zooms about the pointer, and a right click or a held left button opens a station for editing, as the browser reports a finger and a mouse through the same pointer events and there is therefore one code path rather than two. In the capture field, Return adds a circle and Escape closes the field, as the smallest size is the one you can revise with the least regret.

## Capture

The add button opens a one line field in the HUD with the three shapes beside it. Type a title, tap a shape, and the station lands at the center of the current view, nudged clear of whatever is already there. Moving it to where it belongs is optional and can happen never. This is the one tap and a few words from the friction rule.

## Starting, working and ending a stretch

Starting: tap a bullet and the four length chips appear beside it in the HUD. Pick one, then drag from the bullet through the stations you intend to do, in order. The line follows your finger in horizontal, vertical and 45 degree segments with round joins, and the color runs out at capacity, so the last stations you pass are left unconnected. Lifting your finger starts the clock. The name defaults from the time of day, Morning, Afternoon or Evening, and a tap on it lets you type over it.

Working: the train sits on the segment before the next pending station, and next is the first pending station on the line, though you may complete stations in any order. Completing a station shrinks it to a dot and moves the train on. The line never re-spends on its own, so the stations beyond the terminus stay beyond unless you redraw.

Redrawing: drag from any bullet again. Done stations stay done, the color is spent afresh in the new order and the terminus moves. This is the only way to reorder, as one gesture for drawing and redrawing is one less thing to learn.

Ending: hold the clock, or let the pie empty, or complete every station on the line. Unreached stations slide to the front of the plane, leftmost, with no mark on them, so the next stretch picks them up first by default and nothing records how many times that has happened.

## Feedback

Completing a station is a 150 millisecond shrink to a dot, the train sliding to the next segment and one short tone in the stretch's pitch, which is the immediate feedback flow asks for. The pie emptying is one quiet chord and a haptic, and the stretch ends by itself. Nothing sounds before that moment, as a warning is a deadline wearing a disguise. Sound follows the phone's silent switch, motion follows the reduced motion setting, and neither has an in-app toggle.

## Capacity, worked through

"Afternoon, a couple of hours" has 96 minutes of capacity. Draw through a circle, a triangle, a square and two more circles. The running total is 20, then 65, then 155. The square does not fit, so the line reaches the circle and the triangle, the terminus sits after the triangle, and the square and the two circles stand beyond it.

Redraw with the two circles ahead of the square. The running total is 20, 65, 85, 105. Three stations fit, the last circle and the square stand beyond, and you have gained one task by changing the order rather than the plan. This is the feedback loop the whole app exists for.

## Visual tokens

Contrast is measured against paper with the WCAG relative luminance formula.

| Role | Hex | Contrast on paper |
| --- | --- | --- |
| Paper | #EEEBE5 | |
| Ink | #2B2420 | 12.8:1 |
| Muted ink | #6B635C | 5.0:1 |
| Deep | #2440A4 | 7.5:1 |
| Shallow | #A67C00 | 3.2:1 |
| Body | #1F7A3A | 4.5:1 |
| Out | #C4251F | 4.9:1 |

Paper on each kind color passes for bold text and for the bullets' initials. A second set of four kind colors is needed for a dark appearance, as none of these pass on ink.

Sizes at the default zoom, in CSS pixels.

| Element | Size |
| --- | --- |
| Line | 10 |
| Circle station | 22 |
| Triangle station | 24 by 22 |
| Square station | 20 |
| Done dot | 10 |
| Train | 30 by 20 along the line |
| Terminus bar | 10 by 26, perpendicular to the line |
| Kind bullet | 28, in a 44 hit area |
| Clock | 36, in a 44 hit area |
| Add button | 56 |
| Length chip | 36 tall |

Type is the Helvetica Neue, Helvetica, Arial stack in two weights. The stretch name is 22 bold, its subtitle 15 regular in muted ink, station labels 13 regular at the default zoom and 17 when zoomed in, done labels in muted ink. Everything is sized in rem in the build so the browser's text size scales the layout.

## Stack

React with TypeScript on Vite. The plane is one world layer under a CSS transform for the camera, the line is SVG and the stations are plain elements. State lives in one store persisted to localStorage, as there is one user and one device at a time, and a web app manifest lets it install to the home screen. Focus and press are shown as the shape filling with the line color, as a ring would be an outline.

## Build order

1. The model and the store: stations, kinds, stretches, the capacity rule, with tests for the capacity rule and the slide to the front.
2. The plane and the camera: pan, pinch, the HUD pinned, labels hiding below the threshold.
3. Capture in the HUD, moving and editing stations.
4. Drawing a line from a bullet with the color running out, and the terminus.
5. The clock, completing and restoring, the train, holding to end, the slide to the front.
6. The length chips, the default name, renaming.
7. Sound and motion, the opening fly-to, install to the home screen.

## Parked

- Depth: three finger drag, back is later, far stations drawn smaller.
- A second set of kind colors for dark appearance.
- Sub-tasks as a capsule of small shapes on one station.
- A muted underlay for bearings, a dot grid if ever, never named bands.
- History of past stretches.
- Import from Todoist.
