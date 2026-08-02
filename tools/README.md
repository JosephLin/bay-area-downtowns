# tools

Everything here is optional. `index.html` has no build step and no dependencies —
these exist to measure street bearings and to check the page still behaves.

Nothing in this directory runs automatically, and nothing in it ships to the browser.

## Requirements

| Script | Needs |
|---|---|
| `apply-bearings.js` | node |
| `measure-bearings.js` | node, `curl`, network |
| `test-solar.js` | node |
| `test-page.js`, `test-offline.js` | node, `npm i playwright` |

Playwright is the only install, and only for the two browser tests.

## Measuring bearings

`axis` — the bearing of a location's main street, which drives the sun-alignment
dates — is measured from OpenStreetMap, never estimated by eye.

After adding entries to `index.html`:

```bash
node tools/measure-bearings.js          # fetches only what's missing; ~40 min for a full sweep
node tools/apply-bearings.js            # dry run: shows what would change
node tools/apply-bearings.js --write    # folds the results into index.html
```

`apply-bearings.js` touches **only** the `axis` field — every other field is read
out of `index.html` and written straight back, so it cannot clobber hand-edited
prose, and running it twice is a no-op.

`data/bearings.json` is the measurement record for all 131 current entries: the
bearing, how straight the street is, which OpenStreetMap way matched, and how far
the ledger's anchor sits from that street. Keep it — a full sweep is about forty
minutes of rate-limited Overpass queries.

### Why so many entries have no bearing

Of 131 locations: **80 have a bearing**, 45 were measured but bend too much for a
single bearing to mean anything (>8° deviation on a substantial segment), and 6
never matched a street in OpenStreetMap at all — usually because the ledger's
street name differs from the OSM name, or the anchor is too far away.

Those 51 render "not surveyed" on the page. That is deliberate. Filling them in
by eye would make the feature look complete and be wrong.

### Two traps, if you ever rewrite this

- The averaging window must be centred on **the nearest point of the street**, not
  on the ledger's anchor. Anchors sit on a civic core, and Campbell's is 302 m off
  Campbell Ave — an anchor-centred window silently finds nothing at all.
- `(^| )First Street$` also matches `Old First Street`, a different road in
  Livermore. Exact matches have to beat loose ones.

`measure-bearings.js` also records how far each anchor is from its street, which is
how the drifted coordinates listed in `CLAUDE.md` were found.

## Tests

```bash
node tools/test-solar.js      # 14 assertions, no browser
npm i playwright
node tools/test-page.js       # 27 assertions
node tools/test-offline.js    # 10 assertions; starts its own local server
```

`test-solar.js` lifts the sun-alignment block straight out of `index.html` and
evaluates it, so it tests the shipped code rather than a copy. The load-bearing
assertion is that an east–west street aligns at declination −0.5°, **not** 0° — if
those dates ever land exactly on the equinoxes, the −0.833° horizon correction has
been dropped.

`test-page.js` stubs Leaflet, which doubles as a check that the page still works
when the CDN is unreachable. It covers the deliberate map/list interaction
asymmetry described in `CLAUDE.md`, so it will fail loudly if someone "fixes" it.

`test-offline.js` serves the repo over localhost, lets the service worker install,
then cuts the network and reloads.
