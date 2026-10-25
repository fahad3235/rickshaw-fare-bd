# TEST RESULTS -- Rickshaw Fare BD (factory run #138, 2026-10-25)

## Unit tests (node, logic.js exactly as shipped)

42/42 passed, 0 failed. Run: `node tests/unit.test.js`

Hand-verified cases (default rates: base 20, 15/km, 2/min waiting, 20% night, 20 min):

- 2.5 km, day, no waiting, no rounding: base 2000p + distance 3750p = subtotal 5750p, total 5750p.
- Same trip at night: surcharge 20% of 5750 = 1150p, total 6900p.
- 2.5 km + 10 waiting minutes: waiting 2000p, subtotal 7750p.
- Rounding: 5750p -> nearest 500p = 6000p (11.5 rounds up).
- Minimum fare: custom rates base 5 / 5 per km / min 20, 0.1 km -> 550p floored to 2000p.
- Fractional km: 0.33 km x 15 = 495p exactly.
- Bargain: asked 100.00 / offer 60.00 -> midpoint 80.00; asked 100.00 / offer 60.30 -> midpoint 80.15, rounded to 80.00.
- Split: 100.00 / 3 -> [33.34, 33.33, 33.33]; 99.99 / 4 sums back to 99.99.
- Formatting: 5750p -> "57.50" with Taka sign; Bangla mode -> Bengali digits.
- Validation: 5 trip rejections (bad date, zero distance, negative fare, over-long from, bad id via import) and 4 import rejections (wrong app tag, bad trip, bad rate, bad version path) all behave as asserted.

## Headless-Chrome smoke tests (raw CDP, /opt/meta-chromium/chrome, file://)

24/24 passed, 0 failed, 0 console/page errors. Run: `node tests/smoke.js`

- Title + 4 tabs + empty-trips state render on load.
- Estimate 2.5 km + 10 min waiting (round on): subtotal 77.50, total rounds to 80.00; Save Trip enabled.
- Save trip -> trips tab lists 1 item, stats count 1.
- Manual trip (1 km, fare 40) -> 2 items, stats total 120.00; delete -> 1 item.
- Bargain 100 / 60 -> midpoint 80.00; offer 150 > asked 100 -> inline error.
- Split 100 / 3 -> shares contain 33.34 and 33.33.
- Rates: perKm 15 -> 20 saved (message shown); re-estimate 2.5 km / 0 min -> 70.00.
- Distance 0 -> inline error.
- Language toggle -> Bangla title, Bengali digits in total.
- Rates persisted in localStorage; trip survives reload; 390px viewport has no horizontal overflow.

## Repairs

0 app-logic bugs. 1 pre-test cleanup: the estimate note reused the wrong i18n
label (fixed before testing by pointing it at the round-to-5 label).

## Source hygiene

All shipped sources are pure ASCII (Bengali as `\uXXXX` escapes in JS,
numeric entities in HTML); `grep -P '[^\x00-\x7F]'` returns zero matches.
No secrets, no network requests, no fabricated fare data: default rates are
labelled samples and user-editable.
