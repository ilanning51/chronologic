# Chronologic: the week window

Date: 2026-11-06. A change to the day line in `2026-11-01-day-line-design.md`, which holds unchanged
except as written here. Designed in Figma (file `y95NHifalPMqa8DP960l4v`, screen 4:4, states board
5:60, components board 3:2), agreed with Ian in conversation, and planned in
`docs/plans/2026-11-06-0011-feat-week-window-plan.md`. Ian asked for it to be built without a
further approval step.

## Intent

The project lines say what comes next, but not when in the day it happens. Ian wants to open a
calendar for tomorrow, put the next stops of his lines into hours, and close it knowing what the day
holds, so the day is not up in the air. The calendar is a second view of the map, not a second
plan: a block on a day is a stop, and the block ends when that stop's train pulls in.

## Ian's decisions

- The window is a row of the calendar week's seven days over one scrolling day plane, 12 am at the
  top and midnight at the bottom. Across the plane means nothing.
- The week runs Monday to Sunday, with arrows to step a week.
- Today's button is red and the chosen day is filled in ink. Red means today, and only today.
- No fixed events, such as meetings or lunch, in this build.
- Tomorrow's day line is drawn on the map, muted and thin like a sketch.
- Placing a stop whose train is waiting at it sets the train rolling toward the block's end.
- A block's end is its stop's arrival. Moving the block slides the stop along its line.
- Days run midnight to midnight everywhere. The day line's 4 am turnover is gone.
- Any of the seven days can be planned, and each planned day is its own day line.

## How it is built, in one line each

- KTD1. Any number of day lines, one per date, each with a length per stop beside its budgets.
- KTD2. A block stays on the day it was placed; if its arrival drifts out of the day, it is drawn
  cut off at the edge.
- KTD3. Placing or moving a block slides its stop along its line until its train arrives at the
  block's end, clamped to what the line can reach.
- KTD4. A goal's block changes only the goal's last leg.
- KTD5. A stop on two lines is one block, following the line whose train reaches it first.
- KTD6. A stop records when it was done, so a done block stays where it was finished.
- KTD7. A day line for a later date is held: its train waits at its start until its day comes. The
  hold is a stored flag, `held`, not worked out from the date.
- KTD8. The tick clears days that have passed and starts today's held day, and a timer ticks at
  midnight.
- KTD9. The save moves to `chronologic.v4`, which reads v3 and then v2.
- KTD10. The window and its button sit beside the plane, not in it, so a wheel over the window
  scrolls the day instead of zooming the map.
- KTD11. The calendar's arithmetic is a pure module, `src/plane/week.ts`.
- KTD12. Hours are laid out by the wall clock, 48 px to the hour, with no special handling for the
  daylight-saving days.

## Edges (Claude's calls)

- The window opens on tomorrow every time, and on today it scrolls to now; on another day to its
  first block, or to 8 am.
- The column on the left lists, for each line still running, its first stop that is not done and
  not yet planned on any day. A line with only its goal shows that goal in muted capitals.
- A next stop dropped on the day gets a block as long as its size suggests: 30 minutes for small,
  an hour for medium, two hours for large. The bottom third of a block, between 8 and 16 px,
  stretches it.
- The ghost of a dragged block is muted when a dry run says the drop would be refused, so the
  refusal shows before the finger lifts. A refused drop records no undo step.
- A drop onto a finished day, one whose train has passed its end square, is refused.
- A day line made from the window starts 12,000 world units above its first stop and ends the same
  below its last, a short stroke at the zoom the map opens at.
- A day's end square is given a block length of 30 minutes, though it is never drawn as a block.
- Escape closes the window and does nothing else. Opening it puts any brush down, and taking up a
  brush closes it. While it is open, Backspace leaves the box's stops alone.
- Tomorrow's bubble is muted with its line. A stop is a ring only when two drawn lines run through
  it, and a box cannot pick up the start or the end square of a day the map does not draw.
- Block times read on the twelve-hour clock without am or pm ("9:00 – 10:00"), as in the Figma
  screen; the hour rows say AM and PM.
- While the window is open the map behind it holds still, drawn as it stood when the window
  opened. When the window closes, by any path, each stop and line start it moved slides from there
  to where it stands now, over half a second, easing out. A day line made while it was open is
  drawn once the slide ends; a stop deleted is gone at once. Under reduced motion, or when nothing
  moved, the map is simply in place.
- A drag on the map while the window is open only closes the window, and one while the map slides
  does nothing; neither records an undo step. A tap on a stop still completes it.
- While a block or next stop is held, the day plane hatches, in muted ink, the hours its end cannot
  reach: before its line's earliest arrival and after its latest. A goal, which can run on without
  end, is hatched only before its earliest. The hatching goes with the drop.

## Assumptions for Ian to check

Each is cheap to change after Ian has used the window for a few days.

- A block's end can move only between the arrival of the stop before it on its line and the
  arrival of the stop after it, and never before now.
- A goal's block moves only the goal's last leg.
- A stop on two project lines is one block, in the colour of the line that reaches it first.
- On a touchscreen a block drags after the finger rests on it for 200 ms; otherwise the finger
  scrolls the day.
- A block whose arrival drifts out of its day is drawn cut off at the edge, not moved to the next
  day.

## What does not change

Completing, renaming and deleting stops happen on the map, not in the window. Nothing counts what
was planned or missed, and nothing is sent anywhere: no calendar sync, no notifications.
