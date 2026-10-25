# Rickshaw Fare BD

Offline, bilingual (English / Bangla) rickshaw fare tool for Bangladesh. Estimate a
fare from distance and waiting time, find a fair bargaining midpoint, split a fare
between passengers, log trips, and keep your own rate card -- all in the browser,
with no account and no network requests.

Live site: https://fahad3235.github.io/rickshaw-fare-bd/

## Why this exists

Rickshaw fares in Bangladesh are negotiated per ride -- there is no official fare
chart. This tool does the arithmetic (distance, waiting, night surcharge,
rounding, splitting) and keeps a personal trip log, so the negotiation starts
from a number instead of a guess.

## Features

1. **Fare estimator** -- distance (km) + waiting minutes + night-surcharge toggle +
   optional round-to-nearest-5-taka, with a full cost breakdown.
2. **Bargain helper** -- enter what the driver asks and what you offer; it shows
   the exact midpoint and the midpoint rounded to the nearest 5 taka. It is pure
   midpoint math, not bargaining advice.
3. **Fare splitter** -- split any total across N people; leftover paisa go to the
   first people in line, so the shares always sum back exactly.
4. **Trip log** -- save estimated trips or add them manually (from / to / date /
   distance / fare), with totals, delete, JSON export, and strict JSON import.
5. **My rates** -- base fare, per-km rate, per-minute waiting rate, night
   surcharge %, and minimum fare, all user-editable and saved on-device.
6. **Bilingual UI** -- English / Bangla toggle, persisted, with Bengali digits in
   Bangla mode; 390px mobile layout; zero network requests.

## Fare math (exact, integer paisa)

Money is integer paisa (1 taka = 100 paisa) -- no float error. Order of
operations, documented in code (`logic.js: calcFare`):

```
subtotal  = base + distance x perKm + waiting x perMin
surcharge = round(subtotal x nightPct / 100)   [only when Night is on]
total     = max(subtotal + surcharge, minFare)
final     = round total to nearest 5 taka      [only when rounding is on]
```

## Default rates -- samples, not official figures

There is **no official rickshaw fare chart** in Bangladesh, so the app ships with
clearly labelled starting samples (base 20, 15/km, 2/waiting-minute, 20% night,
20 minimum). Change them in the Rates tab to match what drivers charge in your
area. The footer and the Rates tab both carry this disclaimer.

## Stack

Vanilla HTML + CSS + JavaScript. No framework, no build step, no dependencies.
`logic.js` is DOM-free and unit-tested exactly as shipped; `i18n.js` holds the
English/Bangla strings (stored as `\uXXXX` escapes so every source file stays
pure ASCII); `app.js` wires the DOM.

## Run locally

Open `index.html` in any modern browser. No server needed.

## Tests

```sh
node tests/unit.test.js   # pure-logic unit tests
node tests/smoke.js       # headless-Chrome UI smoke tests (spawns /opt/meta-chromium/chrome)
```

See `TEST_RESULTS.md` for the hand-verified numbers behind the tests.

## Limitations

- Estimates are only as good as the rates you set and the distance you enter;
  the app does not measure distance (no GPS) and does not know real road
  conditions or traffic.
- The bargain midpoint is arithmetic, not a guarantee of what a driver accepts.
- Data lives in this browser's localStorage only; clearing browser data erases
  trips and rates. Export JSON for a backup.
- Demo/personal tool, not a transport authority product.

## Status

Built, tested, and published by the MUSE Project Factory (run #138, 17:00 slot,
2026-10-25). All tests green; see `TEST_RESULTS.md`.
