# Trade data audit (in progress)

Status, October 2026: **investigation only, no data changed.** Findings so far, the
experiments behind them, and what is still open. Rerun the experiments with
`python tools/audit/trade_audit.py`. The one test that needs an ENTSO-E API token is
`python tools/audit/entsoe_resolution_check.py`.

## What is in the trade files

`public/data/trade/` has 123 files: 77 with yearly series by partner, 46 with a status note
only (e.g. "isolated grid"). The series come from ENTSO-E (33 European countries), UN Comtrade
(32), the EAPP Secretariat (8) and national sources (TEİAŞ, GNERC, SSC Azerbaijan, Armenia).

## References used

None of these comes from our own files:

- **ENTSO-E statistics.** Harmonised monthly physical flows by country pair, in GWh
  ([power-stats](https://www.entsoe.eu/data/power-stats/)), 2019 onwards. They include
  non-member neighbours such as Ukraine, Moldova and Türkiye, but not North Africa.
- **National statistics.** Red Eléctrica's open API (Spain, by border) and Statistics Norway
  table 14091 (Norway's balance). Kenya's 2024 figures from KNBS, as reported in the press.
- **Ember.** Net imports per country.

## Findings

### 1. Norway, Sweden and Denmark: one price zone stands in for the whole country (pipeline bug)

`entsoe_supply_pipeline.py` queries NO_1 for Norway, SE_3 for Sweden and DK_1 for Denmark
(`AREA_OVERRIDES`, `TRADE_AREA_OVERRIDES`). Each file holds exactly that zone's neighbours.
For example, Norway's file has only Sweden plus Norway's own other zones: none of the NO_2
cables to Germany, the Netherlands, the UK and Denmark.

- Flows to the country's other zones are counted as trade with itself: 93% of Sweden's
  "imports" (44 of 48 TWh) and 87% of Norway's.
- Norway's net imports in our file are +1.6 TWh for 2024. Statistics Norway has −18.4 TWh.
- The same override caused much of the supply gap first blamed on ENTSO-E: Norway, Sweden,
  Denmark, and Italy (IT_NORD). Supply now comes from Ember, so the charts are unaffected,
  but `public/data/entsoe/` (`data__fuel_detail`) still describes one zone for these four.

### 2. Hourly borders counted 4× too low (very likely a pipeline bug; test pending)

- **Scale.** 135 of 228 disagreeing border-years (excluding the three countries above) are
  exactly 4× apart. Against the ENTSO-E statistics, about 50 flows on each side are exactly
  4× too low. In 20 of them both countries' files are 4× too low, so comparing the two sides
  can't detect them.
- **Timing.** It grows from 6% of flows in 2019 to 20% in 2024, and starts in a different
  year for each country's file: Austria, Hungary and Romania 2021; Switzerland, the
  Netherlands and Denmark 2022; France, Spain and Croatia 2024.
- **Within a file**, some borders stay correct while the rest drop 4× in the same year. In
  2021, Austria–Hungary stays correct in both files while every other Austrian and Hungarian
  border drops. In France 2024, Belgium and Spain stay correct while Switzerland, Germany and
  the UK drop.
- **Mechanism.** It reproduces with the pipeline's own `_to_gwh` on synthetic data. A 15-minute
  and an hourly border at a constant 100 MW give 2.4 GWh each when computed separately. Put on
  one timeline, as the all-borders query returns them, the hourly border gives 0.6 GWh.
- **Pending.** Confirm that `query_physical_crossborder_allborders` really returns mixed
  resolutions on one timeline: `entsoe_resolution_check.py`, once the API token arrives.

### 3. Names and zone codes

- Zone codes left as partners: `DE_AT_LU` (Germany's zone before October 2018, kept apart from
  "Germany"), `IT_GR`, `IT_BRNN`, `IT_NORD_CH`, `IT_NORD_FR`, `IE_SEM`.
- Russia appears as Russia, Russian Federation, Russia/USSR and "Russia (via Georgia)".
- Comtrade files store an ISO code in `country` where the others store a name. Their partner
  names (`Côte d'Ivoire`, `Viet Nam`, `Lao People's Dem. Rep.`) don't match the app's.

### 4. Gross flows depend on the source; net flows agree

| | Gross flows | Net flows |
|---|---|---|
| German borders (AT, NL, CH, CZ, PL): our files vs statistics | ours 1.2–2.6× higher | within 0–7% |
| Spain 2024: statistics vs Red Eléctrica | statistics 9–34% lower | within 1–3% |
| Norway 2019–25: statistics vs Statistics Norway | statistics 8–25% lower | within 1.5–4% |

The statistics count flows in both directions each month (958 of 1,082 border-months in 2024),
so they are not netted monthly. The likeliest explanation is netting per hour or across the
lines of a border, against per-direction totals elsewhere; the exact definition is unconfirmed.
Belgium–Germany is separate: the live platform's "Germany" is the Germany–Luxembourg zone, and
adding the statistics' Belgium–Luxembourg flows makes it match (6,043 against 6,062 GWh).

**Consequence:** net bilateral balances are robust across sources. Gross import and export
totals need a stated definition before they can be compared.

### 5. How each source does on net imports

| Country-years (2023–24) | Median error vs Ember | Within 10% | Over 30% off |
|---|---|---|---|
| Our ENTSO-E files as they are | 41% | 31% | 55% |
| Our files, larger of the two sides per border | 31% | 36% | 50% |
| ENTSO-E statistics | 3% | 70% | 16% |

Ember is not just a third opinion here: it reproduces the national figures exactly where they
were checked (Spain 2024: −10,230 against Red Eléctrica's −10,228 GWh; Norway 2019–24:
equal to Statistics Norway; Kenya 2024: 1,490 against about 1,488 GWh). So "the larger side"
does not work as a repair; the statistics are far better.

### 6. Zeros mean different things

Across all files: 595 zeros before a partner's first flow (link not built yet, or data not
started), 168 between flowing years (gaps, mostly Comtrade and the TEİAŞ file back to 1990),
359 after the last flow. Some of the last are real (Russia stopped supplying Finland in 2022);
some are relabelling (Albania–Serbia flows end in 2021, when Kosovo began reporting as its own
area). No single rule fits.

### 7. Comtrade (customs declarations)

In 150 country-years a whole direction is empty while other years have flows: missing
declarations. Benin's imports are empty in 8 of 9 years, though it imports much of its power.
Net imports against Ember: median error 52% from own declarations, 33% when partners'
declarations fill the gaps. Still weak either way.

### 8. EAPP (power pool)

Each border has one value and both files agree by construction ("net annual flows", so no
gross flows). Against Ember: Djibouti and Rwanda match; Egypt, Uganda and Kenya miss partners
outside the pool (Jordan, Tanzania, DR Congo). Libya has 574 GWh of imports from Egypt where
Ember has 0. Kenya–Uganda is probably the wrong way round: the file has Kenya exporting
219 GWh to Uganda, while KNBS reports Kenya importing from Uganda (106 GWh in H1 2024) and
exporting 43 GWh in total.

## Not concluded yet

- Confirm the 4× mechanism with the API (above).
- The exact definition behind the statistics' gross flows (finding 4).
- Whether the ENTSO-E statistics should replace live-platform data for European trade.
  They do far better on net imports, but cover 2019 onwards only, and the earlier ENTSO-E
  files for 2015–18 have not been checked.
- Outside Europe: compare the WAPP and SAPP reports with Comtrade and Ember; confirm
  Kenya–Uganda from EAPP's or KPLC's own reports.
