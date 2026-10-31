# Data lineage and update frequency

Where the data the explorer and its AI assistant use comes from, how it reaches
`public/data/`, and how often it is refreshed. Sources, versions and licences
for each layer are on the in-app Data Sources page (`src/pages/AboutPage.jsx`); what each
figure means is in `public/data/methodology.md`, which the AI assistant also reads.

Nothing is fetched from an outside service while a visitor uses the app. Every
file is built ahead of time, committed, and served with the app. The deployed
site changes only when it is rebuilt and uploaded to Design Studio (by hand
today), so even daily data reaches users only on the
next deployment.

## Three kinds of file

1. **Published data**: built from outside sources by the pipelines in
   `tools/`. The map, the dashboard tabs and the assistant read these.
2. **Derived summaries**: small files computed from the published data for
   the region page and the assistant, because the plant and line files are too
   big to read on demand (up to 21 MB). They must be regenerated whenever their
   inputs change. CI checks this (below).
3. **Resource figures**: country solar and wind figures built from outside
   atlases by `tools/prepare_re.py` (see `RE_RESOURCES_METHOD.md`).

## Lineage

| Data | Source → pipeline → file | Read by | Source updates | Explorer file refreshed |
|---|---|---|---|---|
| Supply (generation, capacity, demand) | National statistics, Ember/OWID, ENTSO-E → `tools/build_all.py` → **`reconcile_supply.py`** (Ember check, see below) → `supply/<ISO3>.json` | Supply and Load tabs; region page; `data__supply` | Ember yearly; others mostly yearly | By hand (`metadata.json` records the last update) |
| Trade | National statistics, power-pool secretariats, ENTSO-E, UN Comtrade → `tools/build_all.py` → `trade/<ISO3>.json` (known problems: `TRADE_AUDIT.md`) | Supply tab; `data__trade` | Yearly | By hand |
| ENTSO-E fuel detail | Generation: ENTSO-E harmonised monthly statistics → `entsoe_stats_pipeline.py`; capacity: ENTSO-E A68 → `entsoe_supply_pipeline.py` (not for Norway, Sweden, Denmark, Italy) → `entsoe/<ISO3>.json` (hydro run-of-river / reservoir / pumped storage, lignite / hard coal, onshore / offshore wind) | `fuel_detail` assistant tool only; totals not used | Monthly statistics, published yearly | By hand, about once a year |
| Market prices (Türkiye) | EPİAŞ → `tools/pipelines/epias_pipeline.py` → `market/TUR.json` | Market tab; `data__market` | Daily | **Daily, automatic** (`epias-daily-update.yml`, 03:00 UTC) |
| Access, tariffs | World Bank WDI / SE4All; IRENA, utilities → `access.json`, `tariffs.json` | Country pages; `data__indicators` | Yearly / irregular | By hand |
| Plants | GEM, WRI GPPD, OpenStreetMap → `prepare_gem.py`, `prepare_gppd.py`, OSM extract → `cache/region_plants_<region>[_gem\|_gppd].geojson` | Maps; Zoning tab | GEM about twice a year; GPPD frozen since 2021; OSM continuous | By hand |
| Lines, substations | OpenStreetMap → `prepare_lines.py` → `cache/region_lines_*`, `cache/region_substations_*` | Maps; Zoning tab | Continuous | By hand (can't be automated yet) |
| Capacity by region | Plant files → pipeline → `cache/region_capacity_*`, `cache/region_age_*_gppd.json` | Region page; `data__capacity` | With the plant files | With the plant files |
| Planning-model zones | EPM model zones → `zones/` | Zoning tab | When the model is rerun | By hand |
| Country briefing notes | AI-drafted HTML → `notes/<ISO3>.html` | Country page; `data__country_note` | Ad hoc | By hand (most dated June 2026) |
| Load centres (Black Sea) | `region_load_centers_blacksea.geojson` | Country page; `data__load_centres` | Ad hoc | By hand |
| **Derived:** region summaries | Plant and line files → `prepare_region_summary.py` → `cache/region_summary_<region>.json` | Region page | With its inputs | **Checked by CI** |
| **Derived:** plants and pipeline | Plant files → `prepare_ai.py` → `ai/plants/<ISO3>.json` | `data__pipeline`, `data__plants` | With its inputs | **Checked by CI** |
| **Derived:** grid | Line and substation files → `prepare_ai.py` → `ai/grid/<region>.json` | `data__grid` | With its inputs | **Checked by CI** |
| **Derived:** zones | Zone files + OSM plant files → `prepare_ai.py` → `ai/zones/<ISO3>.json` | `data__zones` | With its inputs | **Checked by CI** |
| Solar resource | Global Solar Atlas country statistics → `prepare_re.py` → `re/<ISO3>.json` | RE tab; `data__re_resources` | About yearly (new atlas versions) | By hand, about once a year |
| Wind resource | Global Wind Atlas v4 → `prepare_re.py` → `re/<ISO3>.json` | RE tab; `data__re_resources` | Every few years | By hand, about once a year |
| Monthly solar and wind profiles | NASA POWER climatology → `prepare_re.py` → `re/<ISO3>.json` | RE tab; `data__re_resources` | Rarely | With the resource figures |

## Supply reconciliation and QA reports

An audit in October 2026 found the supply series often disagreed with each other and with the
briefing notes. The causes, and what now handles each:

| Problem found | Example | Handled by |
|---|---|---|
| ENTSO-E annual totals miss whole fuels | Norway's capacity 11% of Ember's; Switzerland without solar | Supply uses Ember for every ENTSO-E country; ENTSO-E's finer split kept in `entsoe/` for the assistant |
| A fuel not reported was written as 0 | Ukraine's 2023 solar, wind and coal | Ember series write an empty value, not 0 |
| OWID pipeline counted bioenergy twice | Uruguay's generation 24% above Ember | `owid_pipeline.py` fixed; `reconcile_supply.py` cleans published files |
| Countries without capacity | United States, Brazil, Mexico and 12 more | Filled from Ember |
| Series stopping in 2023 | Most countries | Refreshed to Ember's latest year (2024 or 2025) |
| A newer Ember release dropping a fuel | Geothermal capacity 0 for Kenya, Indonesia, the Philippines | The current series is kept and the gap reported |
| Briefing-note figures that differ from the data | Lithuania "~4 GW" against 7.8 GW | Listed by `tools/check_notes.py` for maintainers |

National sources (TEİAŞ, SSC Azerbaijan, GSE Georgia, SIAT) are left as they are and only
compared. ENTSO-E is not used for supply: it measures a narrower thing (see "Why national
statistics" below). `build_all.py` runs `reconcile_supply.py` and `check_notes.py` last, and they write:

- `docs/SUPPLY_QA.md`: every country's series against Ember, and what was done;
- `docs/NOTES_QA.md`: note figures that differ from the data by more than 15%.

### Why national statistics (via Ember) rather than ENTSO-E for annual figures

Both are official, but they measure different things (full reasoning in
`public/data/methodology.md`, section "Source principles"):

- **ENTSO-E** reports generation metered by the grid operators, mostly net of the plants'
  own use and without some small and embedded generators. ENTSO-E's own harmonised
  statistics put most European countries 4–15% below national statistics (2023–24), and
  Switzerland, Ireland and Austria 20–45% below.
- **National statistics** (statistics offices, energy ministries, Eurostat) cover the whole
  power system. Ember compiles them, and matches them within 1% where checked: net imports
  for Norway, Spain, Kenya and Switzerland, and Norway's generation.
- **Comparability:** every non-European country uses national statistics, so using them for
  Europe too keeps all countries on one definition.

**Correction (October 2026).** An earlier version of this section blamed ENTSO-E for gaps
that were partly the explorer's own: the ENTSO-E pipeline queried one price zone for Norway,
Sweden, Denmark and Italy, and under-counted some hourly series 4x (`docs/TRADE_AUDIT.md`).
It also cited a balance test built on the explorer's ENTSO-E trade files, which turned out
to be wrong; that test is withdrawn. The capacity check against GEM's operating plants
still stands: ENTSO-E capacity was more than 5% below GEM's in 10 countries outside the
one-zone bug, Ember's in 1 (Luxembourg).

Ember is a compilation and has gaps too: its 2026 release gives geothermal capacity as 0
for several countries. `reconcile_supply.py` guards against that (above).

## Keeping derived summaries in step

The derived summaries copy facts from the plant, line and zone files. If those
files change and the summaries don't, the assistant answers from older data than
the map shows. After any pipeline step that rewrites plant, line or zone files:

```bash
python tools/prepare_region_summary.py
python tools/prepare_ai.py
```

Then commit `public/data/cache/region_summary_*.json` and `public/data/ai/`
together with the change.

`.github/workflows/check-derived-data.yml` enforces this. On every pull request
and push to `main` that touches `public/data/` or the two scripts, it reruns
both scripts and fails if the output differs from what is committed. Both
scripts are deterministic and use only the Python standard library, so the check
needs no setup.

This is a check, not a build step: the derived files stay committed so changes
are reviewed like any other data, and `npm run build` does not need Python.
