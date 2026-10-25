'use strict';
// Rickshaw Fare BD - headless-Chrome smoke tests via raw CDP.
// Run: node tests/smoke.js  (spawns /opt/meta-chromium/chrome, file:// page)
const { spawn } = require('child_process');
const path = require('path');
const PORT = 9335;
const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');
let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('ok - ' + name); }
  else { failed++; console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getWsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await res.json();
      const page = list.find(t => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('chrome debugger endpoint never came up');
}
async function main() {
  const chrome = spawn('/opt/meta-chromium/chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + PORT, '--no-first-run', PAGE
  ], { stdio: 'ignore' });
  const errors = [];
  try {
    const wsUrl = await getWsUrl();
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let seq = 0;
    const pending = new Map();
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id).resolve(data);
        pending.delete(data.id);
      }
      if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
        errors.push('console.error: ' + JSON.stringify(data.params.args));
      }
      if (data.method === 'Runtime.exceptionThrown') {
        errors.push('exception: ' + (data.params.exceptionDetails.exception.description || 'unknown'));
      }
    };
    function send(method, params) {
      return new Promise((resolve) => {
        const id = ++seq;
        pending.set(id, { resolve });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    }
    const evaluate = async (expr) => {
      const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (res.error) return { error: JSON.stringify(res.error) };
      const inner = res.result ? res.result.result : undefined;
      if (!inner) return { error: 'no result: ' + JSON.stringify(res).slice(0, 200) };
      if (inner.subtype === 'error') return { error: inner.description };
      return { value: inner.value };
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await sleep(1200);

    let r = await evaluate('document.title');
    check('page title is Rickshaw Fare BD', r.value === 'Rickshaw Fare BD', JSON.stringify(r));
    r = await evaluate('document.querySelectorAll(".tab").length');
    check('4 tabs present', r.value === 4, JSON.stringify(r));
    r = await evaluate('document.getElementById("tripsEmpty").hidden === false');
    check('empty trips state shown initially', r.value === true, JSON.stringify(r));

    // Estimate: 2.5 km, 10 min waiting, day, round on -> 20+37.50+20=77.50 -> 80.00
    await evaluate('document.getElementById("distanceInput").value = "2.5"; document.getElementById("waitingInput").value = "10"; document.getElementById("estimateBtn").click()');
    await sleep(300);
    r = await evaluate('document.getElementById("bdTotal").textContent');
    check('estimate 2.5km+10min rounds to 80.00', (r.value || '').indexOf('80.00') >= 0, JSON.stringify(r));
    r = await evaluate('document.getElementById("bdSub").textContent');
    check('subtotal shows 77.50', (r.value || '').indexOf('77.50') >= 0, JSON.stringify(r));
    r = await evaluate('document.getElementById("saveTripBtn").disabled === false');
    check('save trip enabled after estimate', r.value === true);

    // Save trip -> trips tab shows 1 item
    await evaluate('document.getElementById("saveTripBtn").click()');
    await sleep(200);
    r = await evaluate('document.getElementById("estMsg").hidden === false');
    check('trip saved message shown', r.value === true);
    await evaluate('document.querySelector(\'[data-tab="trips"]\').click()');
    await sleep(200);
    r = await evaluate('document.querySelectorAll("#tripList li").length');
    check('trip list has 1 item after save', r.value === 1, JSON.stringify(r));
    r = await evaluate('document.getElementById("statCount").textContent');
    check('stats count is 1', r.value === '1', JSON.stringify(r));

    // Add manual trip: 1 km, fare 40 -> count 2, total 120.00
    await evaluate('document.getElementById("tripFrom").value = "A"; document.getElementById("tripTo").value = "B"; document.getElementById("tripDist").value = "1"; document.getElementById("tripFare").value = "40"; document.getElementById("tripDate").value = "2026-10-25"; document.getElementById("addTripBtn").click()');
    await sleep(300);
    r = await evaluate('document.querySelectorAll("#tripList li").length');
    check('trip list has 2 items after manual add', r.value === 2, JSON.stringify(r));
    r = await evaluate('document.getElementById("statFare").textContent');
    check('stats total fare 120.00', (r.value || '').indexOf('120.00') >= 0, JSON.stringify(r));

    // Delete one trip -> 1 item left
    await evaluate('document.querySelector("#tripList li button").click()');
    await sleep(200);
    r = await evaluate('document.querySelectorAll("#tripList li").length');
    check('delete removes one trip', r.value === 1, JSON.stringify(r));

    // Bargain: asked 100, offer 60 -> midpoint 80.00
    await evaluate('document.querySelector(\'[data-tab="bargain"]\').click()');
    await sleep(200);
    await evaluate('document.getElementById("askedInput").value = "100"; document.getElementById("offerInput").value = "60"; document.getElementById("bargainBtn").click()');
    await sleep(200);
    r = await evaluate('document.getElementById("midVal").textContent');
    check('bargain midpoint 80.00', (r.value || '').indexOf('80.00') >= 0, JSON.stringify(r));

    // Bargain invalid: offer > asked -> error
    await evaluate('document.getElementById("offerInput").value = "150"; document.getElementById("bargainBtn").click()');
    await sleep(200);
    r = await evaluate('document.getElementById("bargainError").hidden === false');
    check('offer above asked shows error', r.value === true);

    // Split: 100 across 3 -> 33.34 + 33.33 + 33.33
    await evaluate('document.getElementById("splitTotalInput").value = "100"; document.getElementById("splitPeopleInput").value = "3"; document.getElementById("splitBtn").click()');
    await sleep(200);
    r = await evaluate('document.getElementById("splitShares").textContent');
    check('split 100/3 shares', (r.value || '').indexOf('33.34') >= 0 && (r.value || '').indexOf('33.33') >= 0, JSON.stringify(r));

    // Rates: perKm 15 -> 20, save, then estimate 2.5km/0min -> 20+50 = 70.00
    await evaluate('document.querySelector(\'[data-tab="rates"]\').click()');
    await sleep(200);
    await evaluate('document.getElementById("ratePerKm").value = "20"; document.getElementById("saveRatesBtn").click()');
    await sleep(200);
    r = await evaluate('document.getElementById("rateMsg").hidden === false');
    check('rates saved message shown', r.value === true);
    await evaluate('document.querySelector(\'[data-tab="estimate"]\').click()');
    await sleep(200);
    await evaluate('document.getElementById("distanceInput").value = "2.5"; document.getElementById("waitingInput").value = "0"; document.getElementById("estimateBtn").click()');
    await sleep(200);
    r = await evaluate('document.getElementById("bdTotal").textContent');
    check('new rate gives 70.00 for 2.5km', (r.value || '').indexOf('70.00') >= 0, JSON.stringify(r));

    // Invalid estimate: distance 0 -> error, breakdown unchanged
    await evaluate('document.getElementById("distanceInput").value = "0"; document.getElementById("estimateBtn").click()');
    await sleep(200);
    r = await evaluate('document.getElementById("estError").hidden === false');
    check('distance 0 shows inline error', r.value === true);

    // Language toggle -> Bangla title + Bengali digits in total
    await evaluate('document.getElementById("langBtn").click()');
    await sleep(300);
    r = await evaluate('document.querySelector("h1").textContent');
    check('lang toggle switches title to Bangla', /[\u0985-\u09b9]/.test(r.value || ''), JSON.stringify(r));
    r = await evaluate('document.getElementById("bdTotal").textContent');
    check('Bengali digits shown in bn mode', /[\u09e6-\u09ef]/.test(r.value || ''), JSON.stringify(r));

    // Persistence: rates + trips survive reload
    r = await evaluate('localStorage.getItem("rickshaw_rates")');
    check('rates persisted in localStorage', r.value && r.value.indexOf('"perKm":20') >= 0, JSON.stringify(r));
    await send('Page.reload');
    await sleep(1500);
    r = await evaluate('document.querySelectorAll("#tripList li").length');
    check('trip survives reload', r.value === 1, JSON.stringify(r));

    // Mobile 390px: no horizontal overflow
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.reload');
    await sleep(1500);
    r = await evaluate('document.documentElement.scrollWidth <= 390');
    check('390px no horizontal overflow', r.value === true, JSON.stringify(r));

    check('zero console/page errors', errors.length === 0, errors.join(' | '));
  } finally {
    chrome.kill();
  }
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
