# Chronologic

A planning tool for one person. It plans in loose chronological order, without timestamps, and still answers the question that makes people plan in the first place: what can I get done in the time I have?

Planning tools earn their keep through one comparison, what you intend to do against the time you actually have. Time blocking makes that comparison by pinning every task to a clock time, which turns a day into a row of small deadlines, and I find the boundaries of structured time exhausting. However, the comparison itself is still worth having.

Chronologic keeps the comparison and throws away the clock times. You declare a stretch of time in loose words, "a couple of hours", and draw a colored line through the tasks you intend to do in it, in order. Each task is a station with a shape for its rough size, the line is only as long as the stretch, and the color runs out at capacity, so whatever it does not reach is left standing on bare paper. That is the whole answer to what can get done, and nothing is ever overdue, as there is no time at which anything was due.

Everything lives on one infinite plane that you pan with one finger and zoom with two. The look is borrowed from Mini Metro and from the Vignelli map of the New York subway. The full design, the principles taken from that map and the conditions for flow the app is held to are in the `design` folder, and the plan the first version was built from is in `docs/superpowers/plans`.

## Running it

Install the dependencies once, then start the development server and open the address it prints.

```bash
npm install
```

```bash
npm run dev
```

The tests cover the model, the camera, the gesture recognizer, the routing and the components, and they run without a browser.

```bash
npm test
```

A production build lands in `dist`, and `npm run preview` serves it so the install flow can be tried on a phone on the same network.

```bash
npm run build
```

The app ships a web app manifest, therefore it installs to the home screen from the browser's share or menu and opens in landscape. Everything is saved in the browser's local storage on the device it was made on, as there is one user and one device at a time.
