# Working on the Downtown Ledger

`index.html` is the entire application — data, styles and behaviour in one file. There is
no build step and no package manager. Open it in a browser; that is the full test loop.

Keep it that way. The value of this file is that it still opens in ten years.

## Data model

`RAW` is an array of one object per location. Required on every entry:
`name, region, type, lat, lng, origin, era, history, shoot, street, light`.

Optional, rendered as an em dash when absent:

| Field | Notes |
|---|---|
| `style` | Architectural vocabulary. Must be a member of `STYLE_ORDER` or it falls into the "not surveyed" group. |
| `axis` | Main street's bearing **as a line**, 0–179°. Not a direction — a street points both ways, and the code derives the sunrise and sunset ends from it. |
| `weather` | `coastal fog` / `inland heat` / `mixed`. Picks the season, not the hour. |
| `landmark` | The single object that makes the picture. |
| `marquee` | Surviving theatre, for the dusk series. |
| `market` | Farmers-market day, abbreviated (`Sun`). |
| `pairs_with` | Another entry's exact `name`. Author one side only — the reverse is filled in at load, and an unresolvable name logs a console warning. |

`DATA` adds `id` (the array index) plus two derived fields, `align` and `alignMonth`.

**Status is keyed by `name`, never by `id`.** Indices shift whenever an entry is added,
merged or reordered, and a saved season of scouting must not move with them.

## Verified findings — don't "fix" these

Things that look like bugs and are not. Each was deliberate; changing it makes the tool
worse.

- **The map/list interaction is asymmetric on purpose.** Clicking a map pin
  (`selectFromMap`) pans without re-zooming and scrolls the list to the row. Clicking a
  row (`setActive`) flies the map to zoom 12 and leaves the list where it is. You are
  doing different things in each case: from the map you are browsing geography and don't
  want to lose your place; from the list you want to see where a place actually is.
  Symmetrising these reads as tidier and feels worse.

- **Status buttons and the note field must not call `renderTable()`.** It rebuilds
  `tbody` wholesale, which drops focus out of a half-typed note. They update the DOM in
  place and are wired by delegation on `tbody`, once, outside the render.

- **Sun alignment uses a −0.833° horizon, not 0°.** That is refraction plus the sun's
  semidiameter. It is why an east–west street reports a date a day or two off the
  equinox instead of exactly on it. If a change makes those dates land exactly on the
  equinoxes, the correction has been dropped.

- **`axis` is deliberately absent on about half the entries.** Streets that bend too much
  for one bearing to be meaningful are left unmeasured rather than estimated, and the UI
  says "not surveyed". Filling them in by eye would make the feature look complete and be
  wrong.

- **The sticky-header offsets at the 1000px breakpoint are hand-tuned**
  (`thead th{top:296px}`, `.group-header td{top:333px}`, and `headOffset = 76` in
  `scrollRowIntoView`). They are keyed to the map column's height and the row height.
  **Do not add table columns** — new fields belong in the detail row, which already
  collapses to one column on mobile. Adding a column silently breaks scroll-to-row.

## How the bearings were produced

The scripts live in `tools/`, with `tools/README.md` covering how to run them. Adding a
location is `node tools/measure-bearings.js` then `node tools/apply-bearings.js --write`;
the latter touches only `axis` and is a no-op when nothing changed.

`axis` was measured, not estimated. For each entry the main street is parsed out of the
`street` field, matched against OpenStreetMap ways by name near the anchor, and the
segment directions within ~300 m are averaged with the angles doubled — so that 179° and
1° agree, a street being a line rather than an arrow.

Two things that pass for correct and aren't, both worth knowing if you regenerate this:

- The averaging window must be centred on **the nearest point of the street**, not on the
  ledger's anchor. Several anchors sit on a civic core a few hundred metres off the
  street they cite; Campbell's is 302 m from Campbell Avenue. Centring on the anchor
  silently finds nothing.
- `(^| )First Street$` also matches `Old First Street`, a different road in Livermore.
  Exact matches have to win over loose ones.

An entry is only given an `axis` when no substantial segment (>25 m) within the window
deviates more than 8° from the mean. That threshold is what keeps the dates honest.

## Known data issues

- **Eighteen anchors sit more than 250 m from the street they cite**, measured against
  OpenStreetMap while deriving the bearings. Four others pointed at an entirely different
  neighbourhood and were corrected: Downtown Los Gatos was a kilometre into a residential
  subdivision, Fremont's Capitol Ave was in Irvington, Point Richmond was at Brickyard
  Cove, and Foster City was 700 m off Edgewater Blvd.

  The remaining eighteen still land in the right town and are left alone, since the
  footer describes coordinates as reference points rather than boundaries. If you want to
  tighten them, this is the list, worst first:

  | Entry | Distance from its street |
  |---|---|
  | Lafayette | 684 m from Mount Diablo Blvd |
  | Solano Ave. (Berkeley/Albany) | 671 m |
  | Emeryville | 669 m from Bay St |
  | Rohnert Park | 616 m from State Farm Dr |
  | North Beach | 511 m from Columbus Ave |
  | Rio Vista | 474 m from Main St |
  | Hayward | 461 m from B St |
  | Old Oakland | 416 m from 9th St |
  | San Mateo | 388 m from B St |
  | Albany | 380 m from Solano Ave |
  | Los Altos Hills | 369 m from Fremont Rd |
  | Vallejo | 329 m from Georgia St |
  | Oakland Chinatown | 304 m from 8th St |
  | Downtown Campbell | 302 m from Campbell Ave |
  | Downtown Sunnyvale | 282 m from Murphy Ave |
  | Belvedere | 256 m from Beach Rd |
  | Dublin | 254 m from Donlon Way |
  | Alviso (San Jose) | 254 m from Elizabeth St |

- **Six streets never resolved to OpenStreetMap geometry** and so have no bearing:
  Pacifica, Main Street Cupertino (OSM calls it "Main Street Driveway"), Union City's Old
  Alvarado, Antioch's Rivertown, San Ramon, and American Canyon.
- **Palo Alto is split across two regions.** `Downtown Palo Alto` is filed under South Bay
  and `California Ave (Palo Alto)` under Peninsula. Both are defensible for a city on the
  boundary, but grouping by region separates them. Left alone deliberately — pick one
  only if you are willing to re-think the Peninsula/South Bay line generally.

## Conventions

- Prose fields are written to be read standing on a pavement. Full sentences, no
  telegraphic notes, no hedging that doesn't carry information.
- A verdict describes what survives now. Origin describes why the place formed. They
  disagree often and that disagreement is frequently the most interesting thing about an
  entry.
- When adding a location, fill `axis` only if you have measured it.
