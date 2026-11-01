# Chronologic

A planning tool for one person. It plans in loose chronological order, without timestamps, and keeps the thing you are planning for on the page next to the next step.

A project is one subway line, drawn from where you are to the goal you want. The stops along it are steps (a circle), sub-goals (a triangle) and the goal (a square, always last). Each is small, medium or large for its effort. The length of the line between two stops is the time you give yourself to get there, and no date or number appears anywhere.

A train rides each line in real time. It starts slowly, cruises, and slows into every stop, where it waits until you tap that stop. It never passes a stop on its own, and nothing is ever overdue, as the train just waits. Zoom in to watch the trains move. Bubbles at the screen edge point at each line's goal, so the reason for the next step is never out of sight.

Everything lives on one infinite plane. The look is borrowed from Mini Metro and from the Vignelli map of the New York subway.

## Using it

- Pan with one finger on empty paper. Zoom with two fingers, or with the mouse wheel.
- The squares on the paper are time. The legend, bottom left, says what one square is right now, and the unit changes as you zoom: 1 hour, 6 hours, 1 day, 1 week.
- Tap the plus, bottom right, to open or close the tray.
- Drag a step or a sub-goal out of the tray onto a line. It snaps to the line ahead of the train, and where you let go is where it splits the leg. Type a name and press Return.
- Tap New line in the tray, type the goal's name and press Return. Then drag the square to where the goal really is.
- Drag a stop anywhere to re-route the line through it. Only the two legs beside it change.
- While you drag a stop or the goal, a chip beneath it shows how long the leg into it is, so you can set the length to your estimate. It goes when you let go. A tile carried onto a line shows the same for the leg it would end.
- Drag the goal to stretch or squeeze everything ahead of the train. The line behind the train does not move.
- Tap the next stop to complete it, whether the train has arrived or not. Other stops ignore a tap.
- Long press a stop to edit its name, shape and size, or to delete it. Long press the most recent dot to bring it back with Not done.
- Hold the Delete button on a goal's editor to delete the whole line. It is the one thing in the app that asks you to confirm.
- Tap a bubble to change what it points at (next stop, next sub-goal, goal). Long press it to fly there.
- Tap a train to zoom in and watch it. Tap it again to go back.

## Running it

Install the dependencies once, then start the development server and open the address it prints.

```bash
npm install
```

```bash
npm run dev
```

The tests cover the model, the train's motion, the layout, the camera, the gesture recognizer, storage and the components, and they run without a browser.

```bash
npm test
```

A production build lands in `dist`, and `npm run preview` serves it so the install flow can be tried on a phone on the same network.

```bash
npm run build
```

The app ships a web app manifest, therefore it installs to the home screen from the browser's share or menu and opens in landscape. Everything is saved in the browser's local storage on the device it was made on, under the key `chronologic.v2`, as there is one user and one device at a time. A world saved by the first version is left alone and ignored.

## Design

The design is in `docs/superpowers/specs/2026-10-31-tracks-design.md` and the plan it was built from is in `docs/superpowers/plans/2026-10-31-chronologic-v2-tracks.md`. The first version's design is in `design/chronologic-design.md`, and the look and flow principles in the `design` folder still apply.
