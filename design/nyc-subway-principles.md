# Design principles borrowed from the New York City subway map

These are notes I collected on the Vignelli era New York City subway map and the MTA Graphics Standards Manual, kept close to their original wording. Under each one sits a line on what it means for Chronologic, as a principle that is not translated into a rule for this app is just trivia.

## Line routing and trunk groups

Trunk line consolidation. Rather than drawing an individual line for every single train service (A, C, E, etc.), routes that share a physical tunnel or corridor are bundled into a single, thick colored trunk line (for example, the Eighth Avenue Line). Source: https://en.wikipedia.org/wiki/New_York_City_Subway

For Chronologic: one thick line per stretch. There is never a line per task and never a line per project, as tasks that travel together travel on one trunk.

Service bullet identifiers. Circular, color-coded badges containing the exact service letter or number sit directly alongside the route lines to tell riders exactly which trains run on that corridor.

For Chronologic: the stretch kinds are solid colored discs, which are the bullets. They sit in the bottom bar of the map and in the new stretch sheet. A bullet carries no letter in the first version, as there are at most five kinds and color plus position is enough. If the kinds ever grow past that, a single initial goes inside the bullet and nothing more.

Geometric streamlining. Tracks are straightened out into a highly disciplined layout. Instead of meandering realistically through the earth, the lines strictly adhere to a clean layout built primarily on vertical, horizontal, and 45-degree diagonal strokes.

For Chronologic: the map line is drawn only with horizontal, vertical and 45 degree segments, with round joins and round caps, whatever path the finger actually took. The stretch view is a single vertical. No curves.

## Station nodes and transfer logistics

Station distinction. Solid black or colored markers dictate standard local stops, while larger or uniquely outlined nodes signify express stations.

For Chronologic: a completed station shrinks to a small solid dot, a local stop you have passed. A pending station is the full size solid shape. Outlines are banned under the opaque rule, therefore size and shape carry all of the meaning.

Physical connectivity blocks. Complex interchange hubs (like Times Square or Atlantic Avenue) use clear physical blocks, capsules, or connector lines to explicitly group disparate platforms into a single station complex, proving to riders that they can transfer without leaving the turnstiles.

For Chronologic: parked. If a task ever needs sub-tasks, they become a capsule of small shapes on one station rather than a nested list. This is not in the first version.

Wheelchair accessibility integration. The universal blue-and-white accessibility icon is integrated directly into the station label or node design rather than forcing riders to cross-reference a separate index sheet. Source: https://www.reddit.com/r/Design/comments/1o6067/new_york_city_transit_authority_graphics/

For Chronologic: any attribute a station has is shown on the station itself, never in a legend, a settings page or a detail screen. Today the only attribute is size, and it is the shape.

## Geography and typography

Faded street underlays. The complex above-ground street grid is highly simplified and rendered in low-contrast, muted tones. This lets the vibrant trunk lines pop visually while giving users critical cross-streets and park boundaries to find their bearings.

For Chronologic: an open question. An underlay for bearings would have to be opaque and muted, as transparency is banned, and it must not turn into a calendar grid through the back door. The current answer is nothing at all, which leaves the left edge of the map as "now" and the only landmark.

Clean sans-serif type. All station names and labels are locked into highly legible, uniform sans-serif typefaces (built on the legacy of the MTA's Helvetica standards).

For Chronologic: one typeface, the Helvetica Neue, Helvetica, Arial system stack. Two weights, bold for the stretch name and regular for everything else. Two sizes on the stretch view, 17 and 15, and one on the map, 13.

Label proximity. Text is always placed immediately adjacent to its corresponding node, ensuring that dense corridors do not suffer from text-overlapping or visual confusion. Source: https://standardsmanual.com/products/nyctacompactedition

For Chronologic: a label sits beside its shape and never in a column of its own. On the map a label goes above or below its node, on whichever side the line does not pass. Overlap is a bug rather than a styling problem.

## Rules already in force from Mini Metro

No outlines, no thin strokes, opaque colors only. This means no transparency, no shadows and no gradients, with the one exception of a hard stop pie for the clock.

Shape is size: circle small, triangle medium, square large.

Color belongs to the stretch, never the task.

The end of the colored line is the only fit signal.

Nothing is ever overdue and nothing is ever counted against you.
