// Verifies the service worker actually makes the ledger work with no network.
// Served over http on localhost, which is a secure context, so the worker registers.
//   npm i playwright && node tools/test-offline.js
//
// Service workers need a secure context, so the repo is served over http on
// localhost by a throwaway server started here — no http-server needed.
const fsp = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8099;
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
                '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fsp.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(buf);
  });
});
const BASE = `http://127.0.0.1:${PORT}/index.html`;

let fails = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  — ' + detail : ''}`);
  if (!cond) fails++;
};

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Leaflet's CDN is unreachable here either way; block it explicitly so the
  // first (online) load matches what a real first visit caches locally.
  await page.route('**cdnjs.cloudflare.com/**', r => r.abort());
  await page.route('**fonts.g**', r => r.abort());
  await page.route('**basemaps.cartocdn.com/**', r => r.abort());

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!r && !!(r.active || r.installing || r.waiting);
  });
  check('service worker registers over http', reg);

  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 })
    .catch(() => {});
  check('service worker takes control of the page',
    await page.evaluate(() => navigator.serviceWorker.controller !== null));

  const online = await page.textContent('#statTotal');
  check('page renders while online', /^\d+$/.test(online), `${online} locations`);
  check('map area degrades to a message when Leaflet is blocked',
    (await page.textContent('#map')).includes("map library didn't load"));

  // Now cut the network entirely and reload from the cache.
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const offline = await page.textContent('#statTotal');
  check('page still renders with the network cut', /^\d+$/.test(offline), `${offline} locations`);
  check('same number of locations offline', offline === online);
  check('rows render offline', (await page.locator('tr.row').count()) > 100);

  await page.evaluate(() => selectFromMap(0));
  await page.waitForTimeout(300);
  check('detail row opens offline', (await page.locator('tr.detail.open').count()) === 1);
  const align = await page.locator('tr.detail.open .detail-block h4', { hasText: 'Sun alignment' }).count();
  check('sun alignment computes offline', align === 1);

  await page.locator('tr.detail.open .st-btn[data-status="scouted"]').first().click();
  await page.waitForTimeout(400);
  check('visit status is editable offline',
    (await page.locator('tr.detail.open .st-btn[data-status="scouted"].on').count()) === 1);

  await browser.close();
  server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall offline checks passed');
  process.exit(fails ? 1 : 0);
})();
