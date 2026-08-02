// End-to-end checks against the real page in a headless browser.
// Leaflet is stubbed with just enough surface for the map paths to run — that
// also exercises the code that has to keep working when the CDN is unavailable
// in the field.
//
// The CDN is blocked explicitly rather than assumed unreachable. addInitScript
// runs before page scripts, so a reachable cdnjs would load the real Leaflet
// straight over window.L and the stub's counters would never move: the three
// pan/fly assertions failed on a networked machine and passed in the sandbox
// this was written in. test-offline.js already blocked it for the same reason.
//   npm i playwright && node tools/test-page.js
//
// Playwright is the only thing in this repo that needs installing, and only for
// the tests — index.html itself has no dependencies.
const path = require('path');
const { chromium } = require('playwright');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');

const LEAFLET_STUB = `
window.__map = { pans:0, flies:0, zoom:9 };
function Layer(){ this._on={}; }
Layer.prototype.bindPopup=function(){return this};
Layer.prototype.on=function(k,f){ this._on[k]=f; return this };
Layer.prototype.openPopup=function(){ window.__map.popups=(window.__map.popups||0)+1; return this };
Layer.prototype.addTo=function(m){ m._layers.add(this); return this };
Layer.prototype.setStyle=function(o){ this._style=Object.assign({},this._style,o); return this };
window.L = {
  map(){ const m={ _layers:new Set(),
    setView(){return m}, panTo(){ window.__map.pans++; return m },
    flyTo(ll,z){ window.__map.flies++; window.__map.zoom=z; return m },
    hasLayer(l){ return m._layers.has(l) }, removeLayer(l){ m._layers.delete(l); return m },
    addLayer(l){ m._layers.add(l); return m }, invalidateSize(){}, on(){return m} };
    window.__mapObj=m; return m; },
  tileLayer(){ return new Layer() },
  circleMarker(){ return new Layer() },
};`;

let fails = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  — ' + detail : ''}`);
  if (!cond) fails++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(LEAFLET_STUB);
  // Keep the stub authoritative no matter what the network can reach.
  await ctx.route('**cdnjs.cloudflare.com/**', r => r.abort());
  await ctx.route('**basemaps.cartocdn.com/**', r => r.abort());
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(t)) problems.push('console: ' + t);
    if (m.type() === 'warning') problems.push('warn: ' + t);
  });

  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

  // --- header stats and rendering
  const total = await page.textContent('#statTotal');
  check('header stat computes', /^\d+$/.test(total), `${total} locations`);
  const rowCount = await page.locator('tr.row').count();
  check('every location renders a row', String(rowCount) === total, `${rowCount} rows`);
  check('no console errors or unresolved-pair warnings', problems.length === 0, problems.join(' | ') || 'clean');

  // --- verdict chips filter
  const before = await page.locator('tr.row').count();
  await page.locator('.chip[data-type="confirmed"]').click();
  await page.waitForTimeout(150);
  const after = await page.locator('tr.row').count();
  check('turning off a verdict chip filters rows', after < before, `${before} -> ${after}`);
  await page.locator('.chip[data-type="confirmed"]').click();
  await page.waitForTimeout(150);
  check('turning it back on restores them', await page.locator('tr.row').count() === before);

  // --- search
  await page.fill('#search', 'marquee');
  await page.waitForTimeout(200);
  const searched = await page.locator('tr.row').count();
  check('search narrows the list', searched > 0 && searched < before, `${searched} hits for "marquee"`);
  await page.fill('#search', '');
  await page.waitForTimeout(200);

  // --- grouping, including the new options
  for (const [value, label] of [['style','Architectural style'], ['alignMonth','Sun alignment month'], ['region','Region']]) {
    await page.selectOption('#groupBy', value);
    await page.waitForTimeout(200);
    const heads = await page.locator('tr.group-header').count();
    const rows = await page.locator('tr.row').count();
    check(`group by ${label}`, heads > 1 && String(rows) === total, `${heads} groups, ${rows} rows`);
  }
  const unsurveyed = await page.locator('tr.group-header', { hasText: 'not surveyed' }).count();
  await page.selectOption('#groupBy', 'style');
  await page.waitForTimeout(200);
  check('unsurveyed entries get their own bucket rather than vanishing',
    await page.locator('tr.group-header', { hasText: 'not surveyed' }).count() === 1);
  await page.selectOption('#groupBy', 'type');
  await page.waitForTimeout(200);

  // --- interaction asymmetry (the deliberate one)
  const panBefore = await page.evaluate(() => window.__map.pans);
  const flyBefore = await page.evaluate(() => window.__map.flies);
  await page.evaluate(() => selectFromMap(0));
  await page.waitForTimeout(300);
  check('map pin pans the map', await page.evaluate(() => window.__map.pans) === panBefore + 1);
  check('map pin does NOT fly/re-zoom', await page.evaluate(() => window.__map.flies) === flyBefore);
  check('map pin opens the row', await page.locator('tr.detail.open').count() === 1);

  await page.locator('tr.row').nth(3).click();
  await page.waitForTimeout(300);
  check('row click flies the map', await page.evaluate(() => window.__map.flies) === flyBefore + 1);
  check('row click zooms to 12', await page.evaluate(() => window.__map.zoom) === 12);

  // --- sun alignment surfaced in the detail row
  await page.evaluate(() => {
    const i = DATA.findIndex(d => d.align && d.align.sunset.days.length);
    window.__alignId = i; selectFromMap(i);
  });
  await page.waitForTimeout(300);
  const alignText = await page.locator('tr.detail.open .align-dates').first().textContent();
  check('sun alignment dates render', /Sunset down the street/.test(alignText), alignText.replace(/\s+/g, ' ').trim().slice(0, 60));

  // --- status: set, verify in place, reload, verify persisted
  const target = await page.evaluate(() => DATA[window.__alignId].name);
  await page.locator('tr.detail.open .st-btn[data-status="shot"]').first().click();
  await page.waitForTimeout(150);
  check('status button turns on without a re-render',
    await page.locator('tr.detail.open .st-btn[data-status="shot"].on').count() === 1);

  // typing a note must survive clicking a status button
  await page.locator('tr.detail.open .st-note').first().fill('back for the blue hour');
  await page.waitForTimeout(600);
  await page.locator('tr.detail.open .st-btn[data-status="revisit"]').first().click();
  await page.waitForTimeout(200);
  check('note survives a status click',
    await page.locator('tr.detail.open .st-note').first().inputValue() === 'back for the blue hour');

  // a second entry, so we can check both persist
  await page.evaluate(() => selectFromMap(1));
  await page.waitForTimeout(250);
  await page.locator('tr.detail.open .st-btn[data-status="scouted"]').first().click();
  await page.waitForTimeout(500);

  const stored = await page.evaluate(() => localStorage.getItem('downtown-ledger:v1'));
  check('status written to localStorage', !!stored && Object.keys(JSON.parse(stored)).length === 2,
    stored ? `${Object.keys(JSON.parse(stored)).length} entries` : 'nothing');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const restored = await page.evaluate(n => ({ s: statusOf(n), note: noteOf(n) }), target);
  check('status persists across reload', restored.s === 'revisit', restored.s);
  check('note persists across reload', restored.note === 'back for the blue hour', JSON.stringify(restored.note));
  check('two entries still stored',
    await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('downtown-ledger:v1'))).length) === 2);

  // --- pair links resolve both ways
  const pairInfo = await page.evaluate(() => {
    const withPair = DATA.filter(d => d.pairs_with);
    const symmetric = withPair.every(d => {
      const other = BY_NAME.get(d.pairs_with);
      return other && (other.pairs_with === d.name || BY_NAME.get(other.pairs_with));
    });
    return { count: withPair.length, symmetric };
  });
  check('pairings are symmetric after load', pairInfo.symmetric, `${pairInfo.count} entries carry a pair`);

  await page.evaluate(() => { const d = DATA.find(x => x.pairs_with); selectFromMap(d.id); });
  await page.waitForTimeout(300);
  const beforePair = await page.evaluate(() => state.openId);
  await page.locator('tr.detail.open .pair-link').first().click();
  await page.waitForTimeout(400);
  const afterPair = await page.evaluate(() => state.openId);
  check('clicking a pair link opens the partner', afterPair !== beforePair && afterPair !== null,
    `${beforePair} -> ${afterPair}`);

  // --- mobile breakpoint
  await page.setViewportSize({ width: 480, height: 900 });
  await page.waitForTimeout(400);
  check('region/origin columns hide on mobile',
    !(await page.locator('td.region').first().isVisible()));
  await page.evaluate(() => selectFromMap(0));
  await page.waitForTimeout(300);
  check('status buttons are reachable on mobile',
    await page.locator('tr.detail.open .st-btn').first().isVisible());
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.detail-grid')).gridTemplateColumns.split(' ').length);
  check('detail grid collapses to one column on mobile', cols === 1, `${cols} column(s)`);

  console.log(problems.length ? '\nconsole output:\n  ' + problems.join('\n  ') : '');
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})();
