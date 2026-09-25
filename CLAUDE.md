# Working on the Downtown Ledger

`index.html` is the entire application: data, styles and behavior in one file, with
no build step. Opening it in a browser is the whole test loop. Keep it that way, so
it still opens in ten years. Past notes are in this file's git history.

## Data model

`RAW` has one object per location.
- **Required:** `name, region, type, lat, lng, origin, era, history, shoot, street,
  light`.
- **Optional:** `style` (must be in `STYLE_ORDER`), `axis` (the street's bearing as a
  line, 0–179°), `weather`, `landmark`, `marquee`, `market` and `pairs_with` (author
  one side only; the reverse is filled in at load).

**Status is keyed by `name`, never by `id`.** Indices shift.

## Verified findings — don't "fix" these

- Map and list clicks behave differently on purpose. A pin pans without zooming and
  scrolls the list; a row flies to zoom 12.
- Status buttons and notes must not call `renderTable()`; it drops focus.
- Sun alignment uses a −0.833° horizon (refraction plus semidiameter). East–west
  dates land a day or two off the equinox.
- `axis` is absent on about half the entries on purpose. Only measured bearings go
  in, never estimates.
- Sticky-header offsets at 1000px are hand-tuned. **Don't add table columns**; new
  fields go in the detail row.

## Adding a location

```bash
node tools/measure-bearings.js          # fetches only new entries (OpenStreetMap)
node tools/apply-bearings.js --write    # touches only axis
node tools/test-solar.js
```

When measuring bearings:
- center the window on the street's nearest point, not the anchor;
- exact name matches win over loose ones;
- set `axis` only when no segment over 25 m deviates more than 8°.

## Known data issues and open work

- 18 anchors sit 250–700 m from their cited street; they're in the right town and
  left alone. Six streets never resolved in OSM; those are name mismatches, fixable
  per entry.
- Palo Alto is split across two regions on purpose.
- `landmark` is the field most worth filling (34 of 67 confirmed downtowns have one).
  `marquee` and `market` were promoted from prose; verify them. Don't invent a
  `style` for places with no commercial fabric.
- Enabling GitHub Pages (main / root) is the highest-value unfinished step. Without
  https, the home-screen app, storage and offline mode don't work.

## Conventions

- Prose is written to be read standing on a pavement: full sentences, no hedging.
- The verdict is what survives now; the origin is why the place formed.
