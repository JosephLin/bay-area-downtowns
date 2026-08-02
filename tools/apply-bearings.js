// Folds measured bearings from data/bearings.json into index.html's RAW block.
//
//   node tools/apply-bearings.js          report what would change
//   node tools/apply-bearings.js --write  actually rewrite index.html
//
// Only the `axis` field is touched. Every other field is read out of index.html
// and written straight back, so this cannot clobber hand-edited prose — and
// running it twice in a row is a no-op.
//
// An entry gets an axis only when no substantial segment (>25 m) of its street
// deviates more than MAX_SPREAD from the mean across the measuring window. A
// street that wanders more than that has no single bearing worth quoting a
// sunset date against, so it is left unset and the page says "not surveyed".
// Filling those in by eye would make the feature look complete and be wrong.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(ROOT, 'index.html');
const BEARINGS = path.join(__dirname, 'data', 'bearings.json');
const MAX_SPREAD = 8;
const write = process.argv.includes('--write');

const src = fs.readFileSync(LEDGER, 'utf8');
const openAt = src.indexOf('const RAW = [');
const closeAt = src.indexOf('\n];', openAt);
if (openAt < 0 || closeAt < 0) throw new Error('could not find the RAW block in index.html');
const RAW = eval(src.slice(openAt + 'const RAW = '.length, closeAt + 2));
const measured = JSON.parse(fs.readFileSync(BEARINGS, 'utf8'));

const changes = [];
for (const d of RAW) {
  const before = d.axis;
  const m = measured[d.name];
  let after;
  if (m && m.spread <= MAX_SPREAD) after = m.axis;
  if (before !== after) {
    changes.push({ name: d.name, before, after,
      why: !(d.name in measured) ? 'never measured'
         : m === null ? 'no matching street in OpenStreetMap'
         : m.spread > MAX_SPREAD ? `street bends ${m.spread}°`
         : 'measured' });
  }
  if (after === undefined) delete d.axis; else d.axis = after;
}

// Absent from the file means it still needs a lookup. Present-but-null means the
// lookup ran and found nothing — usually the ledger's street name doesn't match
// what OpenStreetMap calls it, or the anchor is too far from the street.
const unmeasured = RAW.filter(d => !(d.name in measured)).map(d => d.name);
const unmatched = RAW.filter(d => d.name in measured && measured[d.name] === null).map(d => d.name);
const bendy = RAW.filter(d => measured[d.name] && measured[d.name].spread > MAX_SPREAD).length;
const withAxis = RAW.filter(d => d.axis !== undefined).length;

console.log(`${RAW.length} entries | ${withAxis} with a bearing | ${RAW.length - withAxis} unsurveyed`);
console.log(`  ${bendy} measured but too bendy (>${MAX_SPREAD}°)`);
if (unmatched.length) console.log(`  ${unmatched.length} with no matching street in OSM: ${unmatched.join(', ')}`);
if (unmeasured.length) console.log(`\n${unmeasured.length} never measured — run measure-bearings.js:\n  ${unmeasured.join('\n  ')}`);
if (!changes.length) {
  console.log('\nindex.html already matches bearings.json; nothing to do.');
  process.exit(0);
}
console.log(`\n${changes.length} change(s):`);
for (const c of changes) console.log(`  ${c.name}: ${c.before ?? '—'} -> ${c.after ?? '—'}  (${c.why})`);
if (!write) {
  console.log('\nDry run. Re-run with --write to apply.');
  process.exit(0);
}

// Regenerate the block in the same shape the file already uses: scalars grouped
// on one line, the four prose fields one per line.
const s = v => JSON.stringify(v);
const GROUPS = [
  ['name', 'region', 'type', 'lat', 'lng'],
  ['origin', 'era', 'style', 'axis', 'weather'],
  ['landmark', 'marquee', 'market', 'pairs_with'],
];
const PROSE = ['history', 'shoot', 'street', 'light'];

const line = (d, keys) => {
  const parts = keys.filter(k => d[k] !== undefined && d[k] !== null)
    .map(k => `${k}:${typeof d[k] === 'number' ? d[k] : s(d[k])}`);
  return parts.length ? '  ' + parts.join(', ') + ',' : null;
};
const body = RAW.map(d => [
  '{',
  ...GROUPS.map(g => line(d, g)),
  ...PROSE.map(k => `  ${k}:${s(d[k])},`),
  '},',
].filter(Boolean).join('\n')).join('\n');

fs.writeFileSync(LEDGER, src.slice(0, openAt) + 'const RAW = [\n' + body + '\n];' + src.slice(closeAt + 3));
console.log(`\nWrote ${LEDGER}.`);
