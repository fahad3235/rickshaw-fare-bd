'use strict';
// Rickshaw Fare BD - pure logic, no DOM, no network.
// Money is integer paisa (1 taka = 100 paisa) to avoid float error.
(function (root) {
  var DEFAULT_RATES = {
    baseFare: 20,      // taka, charged on every ride
    perKm: 15,         // taka per km
    perMin: 2,         // taka per waiting minute
    nightPct: 20,      // percent surcharge at night
    minFare: 20        // taka, floor for any ride
  };

  function isNum(x) {
    return typeof x === 'number' && isFinite(x);
  }

  function roundPaisa(x) {
    return Math.round(x);
  }

  // Fare breakdown. Order of operations (documented in README):
  // subtotal = base + distance + waiting; surcharge = round(subtotal * nightPct%);
  // total = max(subtotal + surcharge, minFare); then optional round to nearest 5 taka.
  function calcFare(input) {
    var distanceKm = input.distanceKm;
    var rates = input.rates || DEFAULT_RATES;
    var waitingMin = input.waitingMin || 0;
    var night = !!input.night;
    var roundTo5 = !!input.roundTo5;
    if (!isNum(distanceKm) || distanceKm <= 0) throw new Error('distanceKm must be > 0');
    if (waitingMin < 0) throw new Error('waitingMin must be >= 0');
    var baseP = roundPaisa(rates.baseFare * 100);
    var distP = roundPaisa(distanceKm * rates.perKm * 100);
    var waitP = roundPaisa(waitingMin * rates.perMin * 100);
    var subtotalP = baseP + distP + waitP;
    var surchargeP = night ? roundPaisa(subtotalP * rates.nightPct / 100) : 0;
    var totalP = subtotalP + surchargeP;
    var minP = roundPaisa(rates.minFare * 100);
    if (totalP < minP) totalP = minP;
    var roundedP = totalP;
    if (roundTo5) roundedP = Math.round(totalP / 500) * 500;
    return {
      baseP: baseP, distP: distP, waitP: waitP, subtotalP: subtotalP,
      surchargeP: surchargeP, totalP: totalP, roundedP: roundedP,
      finalP: roundTo5 ? roundedP : totalP
    };
  }

  // Bargain helper: pure midpoint math, no invented bargaining rules.
  function bargainMidpoint(askedP, offerP) {
    if (!isNum(askedP) || askedP <= 0) throw new Error('asked must be > 0');
    if (!isNum(offerP) || offerP < 0) throw new Error('offer must be >= 0');
    if (offerP > askedP) throw new Error('offer must not exceed asked');
    var mid = (askedP + offerP) / 2;
    return { midpointP: mid, rounded5P: Math.round(mid / 500) * 500 };
  }

  // Split a paisa total across n people; remainder paisa go to the first people.
  function splitFare(totalP, people) {
    if (!isNum(totalP) || totalP < 0) throw new Error('total must be >= 0');
    if (people !== Math.floor(people) || people < 1) throw new Error('people must be an integer >= 1');
    var base = Math.floor(totalP / people);
    var rem = totalP % people;
    var shares = [];
    for (var i = 0; i < people; i++) shares.push(base + (i < rem ? 1 : 0));
    return shares;
  }

  function formatBDT(paisa, bnDigits) {
    var neg = paisa < 0;
    var abs = Math.abs(paisa);
    var taka = Math.floor(abs / 100);
    var p = abs % 100;
    var intPart = String(taka).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var str = intPart + '.' + (p < 10 ? '0' + p : String(p));
    if (bnDigits) str = str.replace(/[0-9]/g, function (d) { return '\u09e6\u09e7\u09e8\u09e9\u09ea\u09eb\u09ec\u09ed\u09ee\u09ef'[+d]; });
    return (neg ? '-' : '') + '\u09f3' + str;
  }

  function toBnDigits(str) {
    return String(str).replace(/[0-9]/g, function (d) { return '\u09e6\u09e7\u09e8\u09e9\u09ea\u09eb\u09ec\u09ed\u09ee\u09ef'[+d]; });
  }

  function validDateStr(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  function validateTrip(t) {
    if (!t || typeof t !== 'object') return 'trip must be an object';
    if (typeof t.from !== 'string' || typeof t.to !== 'string') return 'from/to must be strings';
    if (t.from.length > 80 || t.to.length > 80) return 'from/to too long';
    if (!validDateStr(t.date)) return 'date must be YYYY-MM-DD';
    if (!isNum(t.distanceKm) || t.distanceKm <= 0 || t.distanceKm > 500) return 'distanceKm out of range';
    if (!isNum(t.farePaisa) || t.farePaisa < 0 || t.farePaisa > 100000000) return 'farePaisa out of range';
    if (t.id !== undefined && (typeof t.id !== 'string' || t.id.length > 40)) return 'bad id';
    return null;
  }

  // Strict import: { app: 'rickshaw-fare-bd', version: 1, trips: [...] }
  function validateImport(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'import must be an object';
    if (data.app !== 'rickshaw-fare-bd') return 'wrong app tag';
    if (data.version !== 1) return 'unsupported version';
    if (!Array.isArray(data.trips)) return 'trips must be an array';
    if (data.trips.length > 1000) return 'too many trips';
    for (var i = 0; i < data.trips.length; i++) {
      var err = validateTrip(data.trips[i]);
      if (err) return 'trip ' + i + ': ' + err;
    }
    if (data.rates !== undefined) {
      var r = data.rates;
      var keys = ['baseFare', 'perKm', 'perMin', 'nightPct', 'minFare'];
      for (var j = 0; j < keys.length; j++) {
        if (!isNum(r[keys[j]]) || r[keys[j]] < 0) return 'bad rate: ' + keys[j];
      }
    }
    return null;
  }

  function tripTotals(trips) {
    var totalFare = 0, totalDist = 0;
    for (var i = 0; i < trips.length; i++) {
      totalFare += trips[i].farePaisa;
      totalDist += trips[i].distanceKm;
    }
    return {
      count: trips.length,
      totalFareP: totalFare,
      totalDistKm: Math.round(totalDist * 100) / 100,
      avgFareP: trips.length ? Math.round(totalFare / trips.length) : 0
    };
  }

  var api = {
    DEFAULT_RATES: DEFAULT_RATES, calcFare: calcFare,
    bargainMidpoint: bargainMidpoint, splitFare: splitFare,
    formatBDT: formatBDT, toBnDigits: toBnDigits,
    validDateStr: validDateStr, validateTrip: validateTrip,
    validateImport: validateImport, tripTotals: tripTotals
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RickshawLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
