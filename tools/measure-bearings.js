// Measures each location's main-street bearing from OpenStreetMap geometry and
// writes tools/data/bearings.json. Run it after adding entries to index.html;
// then run apply-bearings.js to fold the results back in.
//
//   node tools/measure-bearings.js
//
// Only entries missing from bearings.json are fetched, so it resumes safely if
// interrupted. Delete the file to re-measure everything from scratch.
//
// Needs node and curl. Overpass allows two concurrent queries per client, so
// this batches six lookups per request and backs off on 429/503 — a full sweep
// of 131 locations takes roughly forty minutes. Be patient rather than parallel.
//
// Two things that pass for correct and are not, both learned the hard way:
//  - the averaging window must be centred on the nearest point OF THE STREET,
//    not on the ledger's anchor. Anchors sit on the civic core, and Campbell's
//    is 302 m off Campbell Ave; an anchor-centred window silently finds nothing.
//  - "(^| )First Street$" also matches "Old First Street", a different road in
//    Livermore, so exact matches have to beat loose ones.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(ROOT, 'index.html');
const OUT = path.join(__dirname, 'data', 'bearings.json');

const SUFFIX = {
  Ave: ['Avenue', 'Ave'], Av: ['Avenue', 'Av'], St: ['Street', 'St'], Blvd: ['Boulevard', 'Blvd'],
  Rd: ['Road', 'Rd'], Dr: ['Drive', 'Dr'], Ln: ['Lane', 'Ln'], Pl: ['Place', 'Pl'],
  Hwy: ['Highway', 'Hwy'], Expy: ['Expressway', 'Expy'], Pkwy: ['Parkway', 'Pkwy'],
  Way: ['Way'], Cir: ['Circle', 'Cir'], Ter: ['Terrace', 'Ter'], Ct: ['Court', 'Ct'],
};
const ORDINAL = { '1st':'First', '2nd':'Second', '3rd':'Third', '4th':'Fourth', '5th':'Fifth',
  '6th':'Sixth', '7th':'Seventh', '8th':'Eighth', '9th':'Ninth', '10th':'Tenth',
  '11th':'Eleventh', '12th':'Twelfth', '14th':'Fourteenth', '18th':'Eighteenth',
  '19th':'Nineteenth', '24th':'Twenty-Fourth', '51st':'Fifty-First' };
const DIRWORD = /^(N|S|E|W|North|South|East|West)$/i;
const ABBREV = { Mt:'Mount', St:'Saint', Ft:'Fort' };   // only where it leads the name

function mainStreet(street) {
  const head = street.split('&')[0];
  const parts = head.split(',').map(s => s.trim()).filter(Boolean);
  const withSuffix = parts.find(p => p.split(/\s+/).some(w => SUFFIX[w.replace(/\.$/, '')]));
  return (withSuffix || parts[parts.length - 1]).trim();
}
function parseName(main) {
  let toks = main.replace(/\./g, '').split(/\s+/);
  while (toks.length > 1 && DIRWORD.test(toks[toks.length - 1])) toks.pop();
  while (toks.length > 1 && DIRWORD.test(toks[0])) toks.shift();
  const last = toks[toks.length - 1];
  const hasSuffix = SUFFIX[last] && toks.length > 1;
  const base = hasSuffix ? toks.slice(0, -1).join(' ') : toks.join(' ');
  const alts = [base];
  for (const [num, word] of Object.entries(ORDINAL)) {
    if (base === num) alts.push(word);
    else if (base.toLowerCase() === word.toLowerCase()) alts.push(num);
  }
  const lead = base.split(' ')[0];
  if (ABBREV[lead]) alts.push(base.replace(lead, ABBREV[lead]));
  return { alts, suffix: hasSuffix ? SUFFIX[last] : null };
}
function nameRegex(main) {
  const { alts, suffix } = parseName(main);
  const baseRx = alts.length > 1 ? `(${alts.join('|')})` : alts[0];
  return suffix ? `(^|[ ])${baseRx}( (${suffix.join('|')}))?( (North|South|East|West|N|S|E|W))?$`
                : `(^|[ ])${baseRx}$`;
}
/* True when the OSM name is this street and not merely one containing its name. */
function isExact(osmName, main) {
  const { alts, suffix } = parseName(main);
  let toks = osmName.replace(/\./g, '').split(/\s+/);
  while (toks.length > 1 && DIRWORD.test(toks[0])) toks.shift();
  while (toks.length > 1 && DIRWORD.test(toks[toks.length - 1])) toks.pop();
  const last = toks[toks.length - 1];
  const stripped = suffix && suffix.some(s => s.toLowerCase() === last.toLowerCase())
    ? toks.slice(0, -1).join(' ') : toks.join(' ');
  return alts.some(a => a.toLowerCase() === stripped.toLowerCase());
}

const toRad = d => d * Math.PI / 180;
function bearing(a, b) {
  const [la1, lo1, la2, lo2] = [toRad(a[0]), toRad(a[1]), toRad(b[0]), toRad(b[1])];
  const y = Math.sin(lo2 - lo1) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(lo2 - lo1);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function metres(a, b) {
  return Math.hypot((b[1] - a[1]) * Math.cos(toRad((a[0] + b[0]) / 2)) * 111320, (b[0] - a[0]) * 110540);
}

function lineBearing(ways, anchor, window = 300) {
  // Centre the window on the street's closest point to the anchor.
  let centre = null, near = Infinity;
  for (const w of ways) for (const p of (w.geometry || [])) {
    const d = metres([p.lat, p.lon], anchor);
    if (d < near) { near = d; centre = [p.lat, p.lon]; }
  }
  if (!centre) return null;

  let sx = 0, sy = 0, total = 0;
  const segs = [];
  for (const w of ways) {
    const g = w.geometry || [];
    for (let i = 0; i < g.length - 1; i++) {
      const a = [g[i].lat, g[i].lon], b = [g[i + 1].lat, g[i + 1].lon];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (metres(mid, centre) > window) continue;
      const len = metres(a, b);
      if (len < 1) continue;
      // Doubling the angle before averaging makes 179 deg and 1 deg agree:
      // a street is a line, not an arrow.
      const th = toRad(bearing(a, b) * 2);
      sx += len * Math.cos(th); sy += len * Math.sin(th); total += len;
      segs.push({ len, az: bearing(a, b) % 180 });
    }
  }
  if (!total) return null;
  const axis = ((Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360) / 2;
  let spread = 0;
  for (const s of segs) {
    let dd = Math.abs(s.az - axis) % 180; dd = Math.min(dd, 180 - dd);
    if (s.len > 25) spread = Math.max(spread, dd);   // worst single segment
  }
  // Length-weighted circular spread. Worst-segment is too brittle: one slip road
  // or T-junction stub carrying the same name condemns a dead-straight street.
  // R is how much of the total length points the same way; 1 is perfect.
  const R = Math.min(1, Math.hypot(sx, sy) / total);
  const sd = R >= 1 ? 0 : Math.sqrt(-2 * Math.log(R)) * (180 / Math.PI) / 2;
  return { axis: +(axis % 180).toFixed(1), spread: +spread.toFixed(1), sd: +sd.toFixed(1),
           metres: Math.round(total), near: Math.round(near) };
}

function q(query) {
  for (let attempt = 0; ; attempt++) {
    try {
      return JSON.parse(execFileSync('curl', ['-sS', '--fail', '--max-time', '180', '-X', 'POST',
        'https://overpass-api.de/api/interpreter', '--data-urlencode', 'data=' + query],
        { encoding: 'utf8', maxBuffer: 128 << 20 })).elements || [];
    } catch (e) {
      if (attempt >= 5) throw new Error((e.message || '').split('\n')[0]);
      execFileSync('sleep', [String(10 * (attempt + 1))]);
    }
  }
}

const src = fs.readFileSync(LEDGER, 'utf8');
const start = src.indexOf('const RAW = [');
const ALL = eval(src.slice(start + 'const RAW = '.length, src.indexOf('\n];', start) + 2));

const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const todo = ALL.filter(d => !out[d.name]);
console.log(`resolving ${todo.length}`);

const BATCH = 6;
for (let i = 0; i < todo.length; i += BATCH) {
  const items = todo.slice(i, i + BATCH).map(d => ({ d, main: mainStreet(d.street), rx: nameRegex(mainStreet(d.street)) }));
  let els;
  try {
    els = q(`[out:json][timeout:180];(\n` +
      items.map(x => `way(around:900,${x.d.lat},${x.d.lng})["highway"]["name"~"${x.rx}"];`).join('\n') +
      `\n);out geom;`);
  } catch (e) { console.log(`BATCH ${i} FAILED: ${e.message}`); continue; }

  for (const x of items) {
    const re = new RegExp(x.rx);
    let named = els.filter(e => e.tags && e.tags.name && e.geometry && re.test(e.tags.name));
    const exact = named.filter(e => isExact(e.tags.name, x.main));
    if (exact.length) named = exact;
    const r = named.length ? lineBearing(named, [x.d.lat, x.d.lng]) : null;
    if (!r || r.near > 700) {
      console.log(`MISS  ${x.d.name}  "${x.main}"  ${named.length} ways${r ? `, nearest ${r.near}m` : ''}`);
      out[x.d.name] = null;
    } else {
      out[x.d.name] = { axis: r.axis, spread: r.spread, sd: r.sd, metres: r.metres, near: r.near,
                        street: x.main, matched: named[0].tags.name, ways: named.length };
      console.log(`ok  ${String(r.axis).padStart(5)}  sd ${String(r.sd).padStart(5)}  worst ${String(r.spread).padStart(5)}  ${x.d.name}  (${named[0].tags.name})`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  execFileSync('sleep', ['5']);
}
console.log(`\nresolved ${Object.values(out).filter(Boolean).length} / ${ALL.length}`);
