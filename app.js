'use strict';
(function () {
  var L = window.RickshawLogic;
  var I18N = window.RickshawI18n;
  var LS_TRIPS = 'rickshaw_trips';
  var LS_RATES = 'rickshaw_rates';
  var LS_LANG = 'rickshaw_lang';

  var lang = localStorage.getItem(LS_LANG) === 'bn' ? 'bn' : 'en';
  var rates = loadRates();
  var trips = loadTrips();
  var lastEstimate = null;

  function $(id) { return document.getElementById(id); }
  function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key; }
  function fmt(paisa) { return L.formatBDT(paisa, lang === 'bn'); }
  function num(n) { var s = String(n); return lang === 'bn' ? L.toBnDigits(s) : s; }
  function show(el, msg) { el.textContent = msg; el.hidden = false; }
  function hide(el) { el.hidden = true; }

  function loadTrips() {
    try {
      var raw = localStorage.getItem(LS_TRIPS);
      if (!raw) return [];
      var data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.filter(function (x) { return L.validateTrip(x) === null; });
    } catch (e) { return []; }
  }
  function saveTrips() { localStorage.setItem(LS_TRIPS, JSON.stringify(trips)); }
  function loadRates() {
    try {
      var raw = localStorage.getItem(LS_RATES);
      if (raw) {
        var r = JSON.parse(raw);
        var keys = ['baseFare', 'perKm', 'perMin', 'nightPct', 'minFare'];
        var ok = keys.every(function (k) { return typeof r[k] === 'number' && isFinite(r[k]) && r[k] >= 0; });
        if (ok && r.nightPct <= 100) return r;
      }
    } catch (e) {}
    return Object.assign({}, L.DEFAULT_RATES);
  }
  function saveRates() { localStorage.setItem(LS_RATES, JSON.stringify(rates)); }

  function applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    $('langBtn').textContent = t('langToggle');
    document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
    renderTrips();
    if (lastEstimate) renderBreakdown(lastEstimate.result, lastEstimate.dist);
    renderStats();
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    document.querySelectorAll('.panel').forEach(function (p) { p.hidden = true; });
    $('panel-' + name).hidden = false;
  }

  function renderBreakdown(res, dist) {
    $('bdBase').textContent = fmt(res.baseP);
    $('bdDist').textContent = fmt(res.distP) + ' (' + num(dist) + ' km)';
    $('bdWait').textContent = fmt(res.waitP);
    $('bdSub').textContent = fmt(res.subtotalP);
    $('bdNight').textContent = fmt(res.surchargeP);
    $('bdMinRow').hidden = !(res.totalP > res.subtotalP + res.surchargeP);
    $('bdMin').textContent = fmt(res.totalP);
    $('bdTotal').textContent = fmt(res.finalP);
    $('estNote').hidden = false;
    if (res.finalP !== res.totalP) {
      $('estNote').textContent = t('roundLabel') + ': ' + fmt(res.finalP);
    } else {
      $('estNote').hidden = true;
    }
    $('breakdown').hidden = false;
  }

  function renderStats() {
    var tot = L.tripTotals(trips);
    $('statCount').textContent = num(tot.count);
    $('statFare').textContent = fmt(tot.totalFareP);
    $('statDist').textContent = num(tot.totalDistKm) + ' km';
    $('statAvg').textContent = fmt(tot.avgFareP);
  }

  function renderTrips() {
    renderStats();
    var list = $('tripList');
    list.innerHTML = '';
    $('tripsEmpty').hidden = trips.length > 0;
    var sorted = trips.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return 0;
    });
    sorted.forEach(function (tr) {
      var li = document.createElement('li');
      var route = (tr.from || '\u2014') + ' \u2192 ' + (tr.to || '\u2014');
      var span = document.createElement('span');
      span.textContent = route + ' \u00b7 ' + num(tr.distanceKm) + ' km \u00b7 ' + tr.date + ' \u00b7 ' + fmt(tr.farePaisa);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'danger';
      btn.textContent = t('deleteBtn');
      btn.addEventListener('click', function () {
        trips = trips.filter(function (x) { return x.id !== tr.id; });
        saveTrips();
        renderTrips();
        show($('tripMsg'), t('tripDeleted'));
      });
      li.appendChild(span);
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  // ---- Estimate ----
  $('estimateBtn').addEventListener('click', function () {
    hide($('estError')); hide($('estMsg'));
    var dist = parseFloat($('distanceInput').value);
    var wait = parseFloat($('waitingInput').value);
    if (isNaN(wait)) wait = 0;
    if (isNaN(dist) || dist <= 0) { show($('estError'), t('errorDistance')); return; }
    if (wait < 0) { show($('estError'), t('errorWaiting')); return; }
    var res = L.calcFare({
      distanceKm: dist, rates: rates, waitingMin: wait,
      night: $('nightCheck').checked, roundTo5: $('roundCheck').checked
    });
    lastEstimate = { result: res, dist: dist };
    renderBreakdown(res, dist);
    $('saveTripBtn').disabled = false;
  });

  $('saveTripBtn').addEventListener('click', function () {
    if (!lastEstimate) return;
    var today = new Date();
    var ds = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    trips.push({
      id: 't' + Date.now(), from: '', to: '', date: ds,
      distanceKm: lastEstimate.dist, farePaisa: lastEstimate.result.finalP
    });
    saveTrips();
    renderTrips();
    show($('estMsg'), t('tripSaved'));
  });

  // ---- Bargain ----
  $('bargainBtn').addEventListener('click', function () {
    hide($('bargainError'));
    var asked = parseFloat($('askedInput').value);
    var offer = parseFloat($('offerInput').value);
    if (isNaN(asked) || asked <= 0) { show($('bargainError'), t('errorAsked')); return; }
    if (isNaN(offer) || offer < 0 || offer > asked) { show($('bargainError'), t('errorOffer')); return; }
    var r = L.bargainMidpoint(Math.round(asked * 100), Math.round(offer * 100));
    $('midVal').textContent = fmt(Math.round(r.midpointP));
    $('midRound').textContent = fmt(r.rounded5P);
    $('bargainOut').hidden = false;
  });

  // ---- Split ----
  $('splitBtn').addEventListener('click', function () {
    hide($('splitError'));
    var total = parseFloat($('splitTotalInput').value);
    var people = parseFloat($('splitPeopleInput').value);
    if (isNaN(total) || total < 0) { show($('splitError'), t('errorSplitTotal')); return; }
    if (isNaN(people) || people !== Math.floor(people) || people < 1) { show($('splitError'), t('errorSplitPeople')); return; }
    var shares = L.splitFare(Math.round(total * 100), people);
    $('splitShares').textContent = shares.map(fmt).join(' + ');
    $('splitOut').hidden = false;
  });

  // ---- Trips ----
  $('addTripBtn').addEventListener('click', function () {
    hide($('tripError')); hide($('tripMsg'));
    var from = $('tripFrom').value.trim();
    var to = $('tripTo').value.trim();
    var dist = parseFloat($('tripDist').value);
    var fare = parseFloat($('tripFare').value);
    var date = $('tripDate').value;
    if (from.length > 80 || to.length > 80) { show($('tripError'), t('errorFromTo')); return; }
    if (isNaN(dist) || dist <= 0) { show($('tripError'), t('errorDistance')); return; }
    if (isNaN(fare) || fare < 0) { show($('tripError'), t('errorTripFare')); return; }
    if (!L.validDateStr(date)) { show($('tripError'), t('errorTripDate')); return; }
    var tr = { id: 't' + Date.now(), from: from, to: to, date: date, distanceKm: dist, farePaisa: Math.round(fare * 100) };
    var err = L.validateTrip(tr);
    if (err) { show($('tripError'), err); return; }
    trips.push(tr);
    saveTrips();
    renderTrips();
    show($('tripMsg'), t('tripAdded'));
  });

  $('exportBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify({ app: 'rickshaw-fare-bd', version: 1, trips: trips, rates: rates }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rickshaw-trips.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('importFile').addEventListener('change', function () {
    var file = $('importFile').files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      hide($('tripMsg'));
      var err = null, data = null;
      try { data = JSON.parse(reader.result); } catch (e) { err = 'invalid JSON'; }
      if (!err) err = L.validateImport(data);
      if (err) { show($('tripError'), t('importBad') + err); return; }
      trips = data.trips;
      if (data.rates) { rates = data.rates; saveRates(); fillRates(); }
      saveTrips();
      renderTrips();
      show($('tripMsg'), t('importOk'));
    };
    reader.readAsText(file);
    $('importFile').value = '';
  });

  $('clearConfirm').addEventListener('input', function () {
    $('clearBtn').disabled = $('clearConfirm').value.trim() !== 'DELETE';
  });
  $('clearBtn').addEventListener('click', function () {
    trips = [];
    saveTrips();
    renderTrips();
    $('clearConfirm').value = '';
    $('clearBtn').disabled = true;
    show($('tripMsg'), t('cleared'));
  });

  // ---- Rates ----
  function fillRates() {
    $('rateBase').value = rates.baseFare;
    $('ratePerKm').value = rates.perKm;
    $('ratePerMin').value = rates.perMin;
    $('rateNight').value = rates.nightPct;
    $('rateMin').value = rates.minFare;
  }
  $('saveRatesBtn').addEventListener('click', function () {
    hide($('rateError')); hide($('rateMsg'));
    var r = {
      baseFare: parseFloat($('rateBase').value),
      perKm: parseFloat($('ratePerKm').value),
      perMin: parseFloat($('ratePerMin').value),
      nightPct: parseFloat($('rateNight').value),
      minFare: parseFloat($('rateMin').value)
    };
    var bad = Object.keys(r).some(function (k) { return isNaN(r[k]) || r[k] < 0; }) || r.nightPct > 100;
    if (bad) { show($('rateError'), t('errorRate')); return; }
    rates = r;
    saveRates();
    show($('rateMsg'), t('ratesSaved'));
  });

  // ---- Tabs + lang ----
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
  });
  $('langBtn').addEventListener('click', function () {
    lang = lang === 'en' ? 'bn' : 'en';
    localStorage.setItem(LS_LANG, lang);
    applyLang();
  });

  // Init: default trip date = today
  (function () {
    var today = new Date();
    $('tripDate').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  })();
  fillRates();
  applyLang();
})();
