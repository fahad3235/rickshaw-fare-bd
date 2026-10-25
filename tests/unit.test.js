'use strict';
// Rickshaw Fare BD - node unit tests for logic.js. Run: node tests/unit.test.js
const L = require('../logic.js');
let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('ok - ' + name); }
  else { failed++; console.log('FAIL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : '')); }
}
function throws(name, fn) {
  try { fn(); check(name, false, 'did not throw'); }
  catch (e) { check(name, true); }
}
const D = L.DEFAULT_RATES;

// calcFare: 2.5 km, defaults, no waiting, day, no rounding
let r = L.calcFare({ distanceKm: 2.5, rates: D, waitingMin: 0, night: false, roundTo5: false });
check('base 2000p', r.baseP === 2000, r);
check('dist 3750p', r.distP === 3750, r);
check('subtotal 5750p', r.subtotalP === 5750, r);
check('no surcharge by day', r.surchargeP === 0, r);
check('total 5750p', r.totalP === 5750 && r.finalP === 5750, r);

// night surcharge 20% of 5750 = 1150
r = L.calcFare({ distanceKm: 2.5, rates: D, waitingMin: 0, night: true, roundTo5: false });
check('night surcharge 1150p', r.surchargeP === 1150, r);
check('night total 6900p', r.totalP === 6900, r);

// waiting: 10 min x 2 = 2000p; subtotal 7750
r = L.calcFare({ distanceKm: 2.5, rates: D, waitingMin: 10, night: false, roundTo5: false });
check('waiting 2000p, subtotal 7750p', r.waitP === 2000 && r.subtotalP === 7750, r);

// rounding: 5750 -> nearest 500 = 6000 (11.5 rounds up)
r = L.calcFare({ distanceKm: 2.5, rates: D, waitingMin: 0, night: false, roundTo5: true });
check('round 5750 -> 6000', r.roundedP === 6000 && r.finalP === 6000, r);

// minimum fare: custom rates base 5, perKm 5, min 20, 0.1 km -> 550p -> floor 2000p
r = L.calcFare({ distanceKm: 0.1, rates: { baseFare: 5, perKm: 5, perMin: 2, nightPct: 20, minFare: 20 }, waitingMin: 0, night: false, roundTo5: false });
check('min fare floor 2000p', r.totalP === 2000, r);

// fractional km rounding in paisa: 0.33 km x 15 = 4.95 -> 495p
r = L.calcFare({ distanceKm: 0.33, rates: D, waitingMin: 0, night: false, roundTo5: false });
check('0.33km dist 495p', r.distP === 495, r);

throws('distance 0 throws', () => L.calcFare({ distanceKm: 0, rates: D }));
throws('negative waiting throws', () => L.calcFare({ distanceKm: 1, rates: D, waitingMin: -1 }));

// bargain
let b = L.bargainMidpoint(10000, 6000);
check('midpoint 8000p', b.midpointP === 8000, b);
check('midpoint rounded 8000p', b.rounded5P === 8000, b);
b = L.bargainMidpoint(10000, 6030);
check('midpoint 8015p rounds to 8000p', b.midpointP === 8015 && b.rounded5P === 8000, b);
throws('offer > asked throws', () => L.bargainMidpoint(6000, 10000));
throws('asked 0 throws', () => L.bargainMidpoint(0, 0));

// split
check('split 10000/3', JSON.stringify(L.splitFare(10000, 3)) === '[3334,3333,3333]', L.splitFare(10000, 3));
check('split 10000/1', JSON.stringify(L.splitFare(10000, 1)) === '[10000]');
check('split 0/3', JSON.stringify(L.splitFare(0, 3)) === '[0,0,0]');
check('split sums back', L.splitFare(9999, 4).reduce((a, x) => a + x, 0) === 9999);
throws('split people 0 throws', () => L.splitFare(100, 0));
throws('split people 2.5 throws', () => L.splitFare(100, 2.5));

// format
check('format 5750', L.formatBDT(5750, false) === '\u09f357.50', L.formatBDT(5750, false));
check('format 100000 comma', L.formatBDT(100000, false) === '\u09f31,000.00', L.formatBDT(100000, false));
check('format bn digits', L.formatBDT(5750, true) === '\u09f3\u09eb\u09ed.\u09eb\u09e6', L.formatBDT(5750, true));
check('bn digits 123', L.toBnDigits('123') === '\u09e7\u09e8\u09e9');

// trips
const good = { id: 't1', from: 'A', to: 'B', date: '2026-10-25', distanceKm: 2.5, farePaisa: 8000 };
check('valid trip ok', L.validateTrip(good) === null);
check('bad date rejected', L.validateTrip({ ...good, date: '2026-13-01' }) !== null);
check('zero distance rejected', L.validateTrip({ ...good, distanceKm: 0 }) !== null);
check('negative fare rejected', L.validateTrip({ ...good, farePaisa: -1 }) !== null);
check('long from rejected', L.validateTrip({ ...good, from: 'x'.repeat(81) }) !== null);

check('import ok', L.validateImport({ app: 'rickshaw-fare-bd', version: 1, trips: [good] }) === null);
check('import wrong app', L.validateImport({ app: 'other', version: 1, trips: [] }) !== null);
check('import bad trip', L.validateImport({ app: 'rickshaw-fare-bd', version: 1, trips: [{ ...good, date: 'nope' }] }) !== null);
check('import bad rates', L.validateImport({ app: 'rickshaw-fare-bd', version: 1, trips: [], rates: { baseFare: -1, perKm: 1, perMin: 1, nightPct: 1, minFare: 1 } }) !== null);

const tot = L.tripTotals([good, { ...good, id: 't2', farePaisa: 4000, distanceKm: 1 }]);
check('totals count 2', tot.count === 2, tot);
check('totals fare 12000p', tot.totalFareP === 12000, tot);
check('totals dist 3.5', tot.totalDistKm === 3.5, tot);
check('totals avg 6000p', tot.avgFareP === 6000, tot);
check('totals empty', L.tripTotals([]).count === 0 && L.tripTotals([]).avgFareP === 0);

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
