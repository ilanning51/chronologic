---
title: Vignelli Restyle - Plan
type: feat
date: 2026-11-06
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Vignelli Restyle - Plan

## Goal Capsule

- **Objective:** Chronologic looks and reads like the Vignelli / MTA New York City subway map in Ian's reference folder: white paper, MTA line colours, black Helvetica, black station marks, black sign plates for every control. Every gesture, size, place and behaviour stays as it is today.
- **Means:** a token-level restyle. New values in `src/styles/tokens.css` and the palette, one plate treatment in `src/styles/ui.css`, and the few render touches the system needs (KTD1–KTD7).
- **Authority:** the reference images (`C:\Users\alann\Downloads\Chronologic Inspo`, machine-local) win on look; this plan's R-IDs win on scope; the existing tests win on behaviour.
- **Stop conditions:** stop if a change would alter what a gesture does, what a test asserts about behaviour, or the stored world format.
- **Execution profile:** one PR from branch `build/vignelli`, worktree `../chronologic-vignelli`. Ships through `lfg` (ce-work, review, PR); merging stays with Ian.

---

## Product Contract

### Summary

Restyle the whole app to the Vignelli information system. The plane becomes the map, the HUD becomes the map's furniture. No logic changes beyond what the system needs: a per-colour text colour so words on a line's colour stay legible, and a class so the day's bubble can show its mark on a black plate.

### Problem Frame

Chronologic was drawn in a Mini Metro register: warm grey paper, muted 1970s-ish inks, capsule pills and one frosted-glass undo pill. Ian collected the system it was always borrowing from — the 1972 Vignelli diagram, two modern redraws, and the 2025 MTA map — and asked for the app to take that exact styling. `design/nyc-subway-principles.md` already names Vignelli as the source; the surface never caught up.

### Requirements

**The map (plane)**

- R1. Paper is white by day; the hourly paper drift Ian picked stays, re-keyed to Vignelli whites (cool dawn, 1972-cream dusk, grey night).
- R2. The eight line colours are the MTA trunk colours: blue, yellow, green, red, purple, lime, orange, brown.
- R3. Ink is near-black, muted is an MTA grey; both keep at least 4.5:1 on every paper keyframe.
- R4. The grid is a neutral hairline a shade off the paper.
- R5. Stations stay black marks, interchanges stay black-ringed white, labels stay black Helvetica; goal names keep Ian's bold capitals.

**The furniture (HUD)**

- R6. Every control surface — undo/redo, tray, editor, name field, leg time, legend, edge bubbles — is a black plate with square corners and white Helvetica Medium, after the 2025 map's title bar and legend headers. Two bubbles are the exceptions KTD6 names: the soonest line's fills with its line colour, and a picture bubble stays its framed picture. The plus stays a round black bullet.
- R7. The frosted glass undo pill becomes an opaque plate; nothing in the app is translucent, dimmed glyphs included.
- R8. Selected and pressed states read on a plate: a selected tile, shape or size fills white with a black glyph; focus rings are white on plates.
- R9. Text set on a line's colour (the soonest bubble, a press) uses that colour's own text colour, black or white, whichever reaches 4.5:1.
- R10. Every control keeps its size, place and behaviour; hit targets stay 44 px.

**Around the app**

- R11. The browser theme colour, manifest colours, and both app icons match the new paper and ink.

### Key Decisions

- **Restyle to the Vignelli/MTA system in the reference images.** The user asked for "that exact styling" over the current look. Governs R1–R11.
- **No logic changes unless the system needs them.** The user said so in capitals. Governs R10 and bounds every unit.
- **Keep the features Ian picked earlier.** Paper tint by hour, goal names in bold capitals, muted travelled road and pixel-art pictures were chosen features, not styling accidents. Governs R1, R5.

### Scope Boundaries

- Not changing routing, the 45-degree algorithm, label placement, level hiding, trains, gestures or the stored world.
- Not adding route bullets with letters at line ends, parallel trunk bundling, or a title bar: each is new behaviour, not a restyle.
- Considered and not built: a dark appearance. The app has none today and the references have none; evidence that would change it is Ian asking.

#### Deferred to Follow-Up Work

- Route bullets at a line's start carrying the goal's initial, the most recognisable Vignelli element, would need a rendering addition and a naming rule.
- The week window being built in another session will inherit these tokens; any plate it draws should use the new plate tokens.

### Sources

- Reference folder (machine-local, best effort): `C:\Users\alann\Downloads\Chronologic Inspo` — `1972-map_opt.jpg`, `modern-vignelli.png`, `modern-vignelli-2.png`, `with-intent-subway.png`, `NYC-full-subway-2025.pdf`.
- `design/nyc-subway-principles.md` — the app's own Vignelli notes, including the opaque-only rule the glass pill broke.
- Apple HIG via the apple-design skill: `branding.md › Best practices` ("ensure that details like sizing, placement, and behavior continue to preserve a familiar experience"), `accessibility.md` (4.5:1 up to 17 pt, 44 pt targets), `color.md › Inclusive color`.

---

## Planning Contract

### Current theme values (ui-consistency:values record)

Read from `src/styles/tokens.css` (custom properties on `:root`, the single theme), duplicated as literals in `src/model/palette.ts`, `src/plane/daylight.ts`, `src/ui/picture.ts`, `scripts/icon.mjs`, `public/icon.svg`, `public/manifest.webmanifest`, `index.html`. No `DESIGN.md` exists.

- **Colour:** paper `#EEEBE5`, ink `#2B2420`, muted `#6B635C`, grid `#E0DCD5`, eight tracks `#2440A4 #A67C00 #1F7A3A #C4251F #6B2D8B #0F6E7A #B5500F #3D4F63`.
- **Hand-written off-theme literals:** five `rgba()` values on `.hud-history` and `.hud-segment` in `src/styles/ui.css` (the glass pill). These are the one deviation from the opaque theme.
- **Spacing:** rem steps 0.125, 0.375, 0.5, 0.75, 0.875, 1, 1.375, 2.5; base 0.125rem. Screen geometry in px (`--tap` 44, shape sizes) mirrors `src/plane/world.ts`.
- **Type:** one family token `--font`. Roles: map label 13 px / 400 / 1.25; goal name 700, uppercase, 0.04em; HUD button 0.9375rem / 400; HUD input 1.0625rem; legend 13 px muted.
- **Shape:** every HUD surface is a capsule (radius = height / 2); the plus is a circle.
- **Elements:** every control is a native `button`, fields are `input`, groups are `role="group"`. No change.

### Key Technical Decisions

- KTD1. **Paper and ink values.** Day paper `#FFFFFF`; dawn `#F3F6F8`; dusk `#FBF4E6` (the 1972 cream); night `#EDEDF0`. Ink `#111111` (18.9:1 on white). Muted `#636466` (5.9:1 on white, 5.1:1 on night paper). Grid is the paper less 18 in every channel (`#EDEDED` by day), replacing the warm per-channel step. Daylight tests' relationships still hold (dusk warmer, dawn cooler); their literal grid value updates.
- KTD2. **Palette slots map to MTA trunk colours by index.** 0 blue `#0039A6`, 1 yellow `#FCCC0A`, 2 green `#00933C`, 3 red `#EE352E`, 4 purple `#B933AD`, 5 lime `#6CBE45`, 6 orange `#FF6319`, 7 brown `#996633`. Saved worlds store only the index, so every existing line keeps its slot and pitch. Names change with the colour (`--track-ochre` becomes `--track-yellow`, and so on); grey is left out because grey already means the travelled road.
- KTD3. **Each palette entry carries its text colour (`on`).** The text colour is whichever of ink and white has the higher contrast, measured: white on blue 9.8, purple 5.1, brown 4.9; ink on yellow 12.4, green 4.7, red 4.7, lime 8.2, orange 6.3. Exposed as `--track-<name>-on` and set beside `--track-color` as `--track-on` wherever a component sets the line colour. This is the one data addition, and it is what keeps R9 legible.
- KTD4. **Plate tokens.** `--plate` (ink), `--on-plate` (`#FFFFFF`), `--plate-hover` `#2A2A2A`, `--plate-press` `#3D3D3D`, `--plate-radius: 0`. Every HUD surface uses them; the opaque hover and press fills replace the `rgba()` literals.
- KTD5. **HUD type is Helvetica Medium (500) in white.** The MTA signage weight. Map labels stay 400; goal names stay 700 capitals.
- KTD6. **Edge bubbles become plates.** A bubble is a black plate: the target's shape as a bullet in the line's colour, the name in white. The soonest line's bubble fills with the line's colour and sets its words and shape in `--track-on`. Picture bubbles keep their framed picture. The day's bubble gets a `day` class so its mark shows white on the plate instead of ink on ink. On a black plate the bullet wears a 1.5 px white keyline, drawn on a wrapper around the shape because a clipped triangle cannot carry its own outline; without it the blue bullet is 1.9:1 on the plate.
- KTD7. **Selected means white on the plate; pressed means a lighter plate.** A selected tray tile, the editor's chosen shape and chosen size all fill white with an ink glyph, a square to match the plate. An editor text button's press and focus fill `--plate-press`, and the hold-to-delete drain fills `--muted` (white text on it is 5.9:1), both replacing the `--track-color` that nothing sets on the editor today, so they currently show nothing. A held tile and a disabled undo symbol dim by colour (`--muted`), not opacity. A line chip keeps its paper press. All through CSS alone.

### Assumptions

- White rather than the 1972 cream as day paper: three of the five references are white, and cream is kept as dusk.
- Yellow and lime lines sit below 3:1 against white as graphics, as they do on the MTA map; a line is never identified by colour alone (its stops, labels and bubble name it).
- Square plate corners follow the map's title bar and legend; Apple's branding guidance allows the restyle because size, place and behaviour are unchanged.

### Risks & Dependencies

- `src/styles/ui.css` and `src/ui/App.tsx` are also being changed by the week-window session; whichever branch merges second resolves conflicts there. This plan keeps `App.tsx` untouched.
- Goal pictures already saved were painted in the old inks and keep them; only new pictures snap to the MTA colours. Repainting saved ones would rewrite stored data, which the stop conditions rule out.

---

## Implementation Units

### U1. Paper, ink, grid and palette values

- **Goal:** the map's colours become Vignelli's.
- **Requirements:** R1, R2, R3, R4, R11; KTD1, KTD2.
- **Dependencies:** none.
- **Files:** `src/styles/tokens.css`, `src/model/palette.ts`, `src/model/palette.test.ts`, `src/plane/daylight.ts`, `src/plane/daylight.test.ts`, `src/ui/picture.ts`, `src/ui/picture.test.ts`, `index.html`, `public/manifest.webmanifest`, `public/icon.svg`, `scripts/icon.mjs`, `public/apple-touch-icon.png`.
- **Approach:**
  1. Set the token values from KTD1 and KTD2; rename the track variables with the palette names.
  2. Re-key `PAPER_BY_HOUR`, `DAY_PAPER` and the grid step in `daylight.ts`.
  3. Point `picture.ts`'s ink and muted constants at the new values.
  4. Update the icon sources and regenerate the touch icon with the existing `npm run icon`.
- **Test scenarios:**
  - Palette: eight distinct `#RRGGBB` colours; `colorVar(0)` is `var(--track-blue)` and `colorVar(9)` wraps to `var(--track-yellow)`.
  - Daylight: paper is `#FFFFFF` from 10 to 16; the day grid is `#EDEDED`; dusk is warmer and dawn cooler than day; applying at noon writes both tokens.
  - Picture: pure black snaps to the new ink; a mid blue snaps to the new blue.
- **Verification:** tests green; the plane renders white with MTA lines.

### U2. Text colour for each line colour

- **Goal:** words set on a line's colour are always legible.
- **Requirements:** R9; KTD3.
- **Dependencies:** U1.
- **Files:** `src/model/palette.ts`, `src/model/palette.test.ts`, `src/styles/tokens.css`, `src/ui/Bubble.tsx`, `src/ui/Stop.tsx`, `src/ui/StopEditor.tsx`.
- **Approach:**
  1. Add `on` to each palette entry, a helper that returns its CSS variable with the same wrap as `colorVar`, and the eight `-on` tokens.
  2. Set `--track-on` beside each existing `--track-color`; the day line's is paper, a sketch's is paper.
- **Test scenarios:**
  - Each palette entry's `on` reaches at least 4.5:1 contrast against its colour (computed in the test).
  - The text-colour helper wraps past the eighth like `colorVar`.
- **Verification:** the soonest bubble on a yellow line reads in black.

### U3. Plates for the furniture

- **Goal:** every control surface is a Vignelli plate, opaque, square, white Helvetica Medium.
- **Requirements:** R5, R6, R7, R8, R10; KTD4, KTD5, KTD6, KTD7.
- **Dependencies:** U1, U2.
- **Files:** `src/styles/tokens.css`, `src/styles/ui.css`, `src/ui/Bubble.tsx`, `src/ui/App.test.tsx`.
- **Approach:**
  1. Add the plate tokens; restyle `.hud-history`, `.hud-tray`, `.hud-editor`, `.name-field`, `.leg-time`, `.legend` and `.bubble` onto them, keeping every width, height and position.
  2. Drop the glass (`backdrop-filter`, shadow, `rgba`) and its reduced-transparency branch, which no longer has anything to reduce.
  3. Restate selected, pressed and focus states per KTD7 and R8.
  4. Bubble: plate, keylined bullet, soonest fill with `--track-on`, and the `day` class.
- **Test scenarios:**
  - The day's bubble carries the `day` class; a coloured line's bubble does not.
  - The soonest bubble's rule assertions in `src/ui/App.test.tsx`, which read `ui.css` as text, move from `var(--paper)` to `var(--track-on)` for its words and shape; its fill stays `var(--track-color)`.
  - The CSS-text assertions on the ring, the sketch goal and the crowd keep passing unchanged.
  - Test expectation for the rest: none -- styling only; existing App, Tray, History and StopEditor tests prove behaviour is unchanged.
- **Verification:** full suite, typecheck and build green; a browser pass at desktop and phone widths shows every surface as a plate with no translucency, 44 px targets intact, a blue line's bubble bullet visible, and a yellow line's soonest bubble readable.

---

## Verification Contract

- `npm test` (vitest), `npm run build` (typecheck plus Vite build) — both green in the worktree.
- Browser check on the dev server at 1280×800 and 390×844 with a seeded world: plane, tray open, editor open on a stop and on a goal, bubbles including the soonest, undo/redo, legend, a name field.
- Contrast figures for every token pairing named in KTD1 and KTD3 recomputed from hex.

## Definition of Done

- R1–R11 visible in the browser check; every test and the build green.
- No `rgba()`, `backdrop-filter` or `opacity` left in `src/styles`.
- No behaviour test changed except the colour literals and names U1 updates and the soonest-bubble CSS assertions U3 restyles.
- No abandoned experiments left in the diff.
