// Runs the page's own sun-alignment code against known answers.
//
//   node tools/test-solar.js
//
// No dependencies. The solar block is lifted straight out of index.html and
// eval'd, so this tests the shipped code rather than a copy of it.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

const a = src.indexOf('/* ---------- SUN ALIGNMENT');
const b = src.indexOf('/* ---------- VISIT STATUS');
if (a < 0 || b < 0) throw new Error('could not locate the sun-alignment block');
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
eval(src.slice(a, b));

let fails = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!cond) fails++;
};

// 1. A true east-west street at Bay Area latitude aligns a couple of days off the
//    equinoxes, not on them: the -0.833 deg horizon puts the crossing at dec ~ -0.5 deg.
const ew = computeAlignment({ axis: 90, lat: 37.8 });
const ewDates = ew.sunset.days.map(fmtDay);
check('E–W street: two sunset alignments', ew.sunset.days.length === 2, ewDates.join(' / '));
const inRange = (label, doy, lo, hi) => doy >= lo && doy <= hi;
check('E–W spring alignment falls Mar 16–22', inRange('', ew.sunset.days[0], 75, 81), `day ${ew.sunset.days[0].toFixed(1)} = ${ewDates[0]}`);
check('E–W autumn alignment falls Sep 20–26', inRange('', ew.sunset.days[1], 263, 269), `day ${ew.sunset.days[1].toFixed(1)} = ${ewDates[1]}`);
// The horizon correction is what makes this different from "just use the equinox":
// alignment happens when the sun's declination is about -0.5 deg, not 0.
const decAt = d => declination(d) * 180 / Math.PI;
check('alignment happens at declination ≈ -0.5°, not 0°',
  Math.abs(decAt(ew.sunset.days[0]) + 0.5) < 0.15 && Math.abs(decAt(ew.sunset.days[1]) + 0.5) < 0.15,
  `${decAt(ew.sunset.days[0]).toFixed(2)}° and ${decAt(ew.sunset.days[1]).toFixed(2)}°`);
// Solstices and equinoxes should land where the almanac puts them, +/- a day.
let maxN = 1, minN = 1;
for (let n = 1; n <= 365; n++) { if (decAt(n) > decAt(maxN)) maxN = n; if (decAt(n) < decAt(minN)) minN = n; }
check('June solstice within a day of Jun 21', Math.abs(maxN - 172) <= 1.5, `day ${maxN}`);
check('December solstice within a day of Dec 21', Math.abs(minN - 355) <= 1.5, `day ${minN}`);

// 2. A north-south street never aligns at this latitude, and must not throw.
const ns = computeAlignment({ axis: 0, lat: 37.8 });
check('N–S street: no sunset alignment', ns.sunset.days.length === 0, `closest ${ns.sunset.closest}°`);
check('N–S street: no sunrise alignment', ns.sunrise.days.length === 0);

// 3. The sunset azimuth swing at 37.8N should run about 240.5 to 301 degrees.
let lo = 999, hi = 0;
for (let n = 1; n <= 365; n++) { const s = horizonAzimuth(n, 37.8).set; lo = Math.min(lo, s); hi = Math.max(hi, s); }
check('December sunset azimuth ~240.5°', Math.abs(lo - 240.5) < 1.5, lo.toFixed(1));
check('June sunset azimuth ~301°', Math.abs(hi - 301) < 1.5, hi.toFixed(1));

// 4. Solstice declination should hit +/-23.44 deg.
let dlo = 99, dhi = -99;
for (let n = 1; n <= 365; n++) { const d = declination(n) * 180 / Math.PI; dlo = Math.min(dlo, d); dhi = Math.max(dhi, d); }
check('declination peaks at +23.44°', Math.abs(dhi - 23.44) < 0.2, dhi.toFixed(2));
check('declination bottoms at -23.44°', Math.abs(dlo + 23.44) < 0.2, dlo.toFixed(2));

// 5. Sunrise down an E-W street should mirror the sunset dates within a day or so.
check('E–W street: two sunrise alignments', ew.sunrise.days.length === 2, ew.sunrise.days.map(fmtDay).join(' / '));

// 6. Every entry in the file with an axis must produce a result without throwing.
const start = src.indexOf('const RAW = [');
const RAW = eval(src.slice(start + 'const RAW = '.length, src.indexOf('\n];', start) + 2));
const withAxis = RAW.filter(d => d.axis !== undefined && d.axis !== null);
let ok = 0, aligned = 0;
for (const d of withAxis) {
  const r = computeAlignment(d);
  if (r && Array.isArray(r.sunset.days)) ok++;
  if (r.sunset.days.length) aligned++;
  if (d.axis < 0 || d.axis >= 180) check(`axis in range for ${d.name}`, false, String(d.axis));
}
check(`all ${withAxis.length} entries with an axis compute cleanly`, ok === withAxis.length);
console.log(`\n${withAxis.length} of ${RAW.length} entries have a bearing; ${aligned} of those get a sunset alignment.`);
process.exit(fails ? 1 : 0);
