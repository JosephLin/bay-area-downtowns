# The Downtown Ledger

A working field survey of main streets across the nine-county Bay Area, kept for a
photography project. One self-contained HTML file: no build step, no dependencies to
install, no server. Open it and it works.

The project starts in the South Bay — Campbell, Saratoga, Los Gatos, the San Jose
neighbourhoods — and works outward. The ledger is ahead of the camera on purpose: it
is a list of places to go, in the order they are worth going.

## What it answers

The survey began as an argument about a single question — *does this place actually
have a downtown?* — and the six-verdict taxonomy is the answer to it:

| Verdict | Meaning |
|---|---|
| **Confirmed** | A clear, walkable historic downtown |
| **Complex** | Multiple districts, no single core — most big cities |
| **Invented** | A purpose-built downtown with no historic core beneath it |
| **Diffuse** | Some commercial node, but no real centre |
| **Erased** | Had a real downtown; it was demolished |
| **Not Found** | No downtown, historic or otherwise |

The taxonomy exists because the interesting cases are the ones that don't fit. Downtown
Santa Clara is `erased` — eight blocks razed in 1964 for a futurist centre that was never
built. Fremont is `invented` because a city assembled from five old towns in 1956 chose
not to call any of their cores its downtown. Hercules was a genuine company town and
still reads as `invented`, because almost nothing of the dynamite works survives above
ground. A verdict is about what is standing now, not about what the place once was.

Two further questions the file answers, which is what makes it a shooting tool rather
than a reference:

- **What does this street look like?** `style` puts each entry in one of nine
  architectural vocabularies, from false-front wood through to New Urbanist pastiche.
  Group by it and the list stops being geography and starts being a series.
- **When does the light run down it?** See below.

## Sun alignment

Each entry carries `axis`, the bearing of its main street measured as a line (0–179°).
From that the page computes the days each year when the setting — or rising — sun runs
straight down the street. The local henge.

The bearings are measured from OpenStreetMap geometry within about 300 m of each anchor
point, not estimated by eye. The arithmetic is closed-form and inline: solar declination
from Spencer's series, then the horizon azimuth at −0.833° to account for refraction and
the sun's own radius. That correction is the whole point — it puts an east–west street's
alignment a day or two off the equinoxes rather than exactly on them.

Three honest limits:

- It assumes a **flat horizon**. The Berkeley hills, Mt. Tamalpais and the building on
  the corner all beat the arithmetic.
- Streets that **bend** too much for a single bearing to mean anything are left
  unmeasured rather than guessed at, and the page says so.
- Roughly **half the entries have no bearing** — either the street bends, or its name in
  the ledger doesn't resolve to one in OpenStreetMap. Those read "not surveyed".

Treat a date as the evening to be standing there, and trust the *When to go* note about
whether the light will actually arrive.

## Using it in the field

Published to GitHub Pages, the ledger is meant to be added to a phone's home screen.

- **Visit status** — mark each place unvisited / scouted / shot / needs revisit, with a
  free-text note. Pins on the map pick up the colour, and shot ones go dashed, so a
  half-finished route reads at a glance.
- **Storage is per-device.** Status lives in `localStorage` under `downtown-ledger:v1`,
  keyed by name. Your phone and your laptop keep separate ledgers, and iOS will evict
  storage for sites it hasn't seen in a while. **Export ledger** copies everything to the
  clipboard as JSON and **Import** merges it back — that is both the backup and the way
  the two devices stay in step.
- **Offline.** A service worker caches the page, Leaflet and the fonts, so the list,
  the notes, the sun dates and status editing all work with no signal. Map tiles are
  cached only once you have looked at them, up to 400 — so panning over an area at home
  before a trip is what makes the map available in the field. Anywhere you haven't
  browsed will be blank offline.

## Working on it

`index.html` is the whole application. Open it in a browser; that is the full test loop.
See `CLAUDE.md` for the data model, the scripts that generated the bearings, and a list
of things that look like bugs and aren't.

## On sourcing

Founding histories are compiled from general historical knowledge, with the more unusual
claims checked against public sources — Menlo Park's 1867 depot, the Hercules powder
works, Niles' Essanay film era, Santa Clara's 1964 demolition. Treat years as
approximate and *Origin story* as the dominant driver among what were usually several
overlapping causes. Market days move; verify before a trip.

Coordinates are main-street or civic-core reference points for trip planning, not
district boundaries. Several are known to sit a few hundred metres off the street they
cite — see the note in `CLAUDE.md`.
