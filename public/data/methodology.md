# Regional Power Explorer: data methodology

What each figure in the explorer means, where it comes from, and its limits. The AI assistant
reads this file through its `methodology` tool, so answers about sources and definitions match
what is written here. Each `##` section is one topic; the assistant looks topics up by the
id in brackets.

All figures are national (or regional) unless a section says otherwise. Sub-national figures
(provinces, districts) are not published yet.

## Source principles [principles]

- **Annual national figures come from national official statistics,** as compiled by Ember,
  for every country where Ember has them. Where checked, Ember matches the national figures
  within 1%: net imports for Norway (Statistics Norway), Spain (Red Eléctrica), Kenya (KNBS)
  and Switzerland, and Norway's generation.
- **A national source replaces Ember where the explorer was built on it on purpose:** Türkiye
  (TEİAŞ), Azerbaijan (State Statistical Committee), Georgia (ESCO, GSE) and Uzbekistan (SIAT
  for solar and wind).
- **ENTSO-E** (the European grid operators' platform) is official too, but measures something
  narrower: generation metered on the grid, mostly net of the plants' own use, without some
  small and embedded generators. Its totals run 4–15% below national statistics, more for some
  countries (Switzerland, Ireland, Austria). The explorer uses ENTSO-E for European
  cross-border flows and for the finer fuel split, not for annual totals.
- **Plant-level data** (capacity by plant, the pipeline of new plants) comes from plant
  databases (GEM, GPPD, OpenStreetMap). They count plants differently from national statistics,
  so their totals differ from the national capacity figures. Never mix or average them.
- **Every figure carries its source and year.** A figure the explorer does not publish is
  reported as not published, not estimated.

## Definitions [definitions]

- **Installed capacity (MW, GW):** the maximum output of power plants. A stock, not a flow.
- **Generation (GWh, TWh):** electricity produced over a year. 1 TWh = 1,000 GWh.
- **Demand:** generation plus net imports (Ember's definition), in GWh.
- **Net imports:** imports minus exports. Negative means a net exporter.
- **Gross vs net flows:** gross counts each direction separately; net is the balance. Gross
  cross-border flows differ between sources by definition (how simultaneous flows on different
  lines are counted); net balances agree across sources. Prefer net balances.
- **Operating / under construction / planned:** plant status in GEM. Planned projects are
  announcements at various stages, not commitments.
- **Capacity factor:** actual or modelled generation as a share of what the capacity could
  produce running all year (MW × 8,760 h).
- **Access:** % of the population with access to electricity (World Bank WDI), including
  off-grid solar. Grid-connection rates quoted elsewhere are lower by definition.

## Generation, capacity and demand by country [supply]

- **Source:** Ember Yearly Electricity Data (CC BY 4.0), compiled from national statistics;
  national sources for Türkiye, Azerbaijan, Georgia and Uzbekistan (see [principles]).
- **Coverage:** 175 countries. Years 2015 to 2024 or 2025, depending on the country.
- **Fuels:** coal, gas, oil & other fossil, nuclear, hydro, solar, wind, bioenergy, other
  renewables (mostly geothermal). National sources use their own categories.
- **Processing:** `tools/pipelines/reconcile_supply.py` checks every country against Ember
  each build and records what it did in `docs/SUPPLY_QA.md`. A fuel that is not reported for a
  year is left empty, not 0.
- **Caveats:** small island states may be approximate (Ember's own caution). For 12
  countries the capacity series stays on an earlier Ember release, because the current one
  drops a fuel, mostly geothermal (Kenya, Indonesia, the Philippines and others). Albania,
  Micronesia and Tuvalu are not in Ember.

## Plant databases: capacity by plant and region [plants]

- **GEM:** Global Energy Monitor, Global Integrated Power Tracker (2026 release; CC BY 4.0).
  Operating, under-construction and planned units; unit-level for most fuels. The source for
  the pipeline of new plants.
- **GPPD:** WRI Global Power Plant Database v1.3 (CC BY 4.0). No longer updated since 2021; the
  source of fleet age.
- **OSM:** OpenStreetMap power plants (ODbL); coverage depends on volunteer mapping.
- **Processing:** region capacity sums by country and fuel; `tools/prepare_ai.py` summarises
  plant counts, MW by status and fuel, and the largest plants per country.
- **Caveats:** the three databases count plants differently and differ from national
  capacity statistics; name the database with every figure. Some plant locations are
  approximate (placed at a town rather than the site).

## Transmission grid [grid]

- **Source:** OpenStreetMap lines and substations (ODbL).
- **Processing:** line length is measured from the mapped geometry and grouped by voltage
  class; region totals only (lines are not split by country).
- **Caveats:** OSM coverage and voltage tagging vary by country; untagged lines are
  "unknown". Lengths count each mapped circuit and are indicative.

## Cross-border trade [trade]

- **Sources:** ENTSO-E physical flows (33 European countries), UN Comtrade customs
  declarations (32), EAPP Secretariat (8, net annual flows), national sources (Türkiye,
  Georgia, Azerbaijan, Armenia). 46 countries carry a status note instead (e.g. no
  interconnection).
- **Known problems (audit in progress, `docs/TRADE_AUDIT.md`):**
  - ENTSO-E: some borders are counted up to 4× too low; Norway, Sweden and Denmark cover one
    price zone each (internal flows appear as trade with themselves). Treat volumes as
    indicative and say so; the direction of the net balance is more reliable than the size.
  - Comtrade: whole years of declarations are often missing and read as zero; partner
    declarations disagree.
  - EAPP: one net value per border; borders with countries outside the pool are missing.
- **Reference for net imports:** national statistics (via Ember) where a figure must be
  exact.

## Access and tariffs [indicators]

- **Access:** World Bank WDI (EG.ELC.ACCS.ZS) / SE4All; total, urban and rural; each country
  carries its own reference year.
- **Tariffs:** approximate residential and industrial tariffs in USD/kWh (World Bank,
  GlobalPetrolPrices, IRENA), mostly 2022–2024. Indicative; verify before publication.

## Wholesale market [market]

- **Source:** EPİAŞ Transparency Platform (Türkiye only), updated daily.
- **Series:** day-ahead price (TL/MWh, also USD and EUR), intraday price, balancing market
  price, and matched volumes; yearly mean/min/max and monthly means.

## Planning-model zones [zones]

- **Source:** zones of the EPM planning model runs for each country (zone shapes and which
  zones connect). Plants per zone are counted from OpenStreetMap plants falling inside each
  zone.
- **Caveats:** zones are modelling constructs, not administrative units.

## Load centres [load_centres]

- Main cities with population, Black Sea region only. The source of the file is not
  recorded in the repository; treat the figures as indicative.

## Renewable resources [re_resources]

- **Solar:** Global Solar Atlas country statistics (ESMAP / Solargis, CC BY 4.0, published
  2020): GHI, DNI, PV output (PVOUT); mean, median, p10, p90 over every ~250 m cell. PV
  capacity factor = PVOUT ÷ 8,760 h. None above 60°N (Finland, Iceland).
- **Wind:** Global Wind Atlas v4 at 100 m (DTU / ESMAP, CC BY 4.0): mean wind speed, power
  density, capacity factor of an IEC class 2 turbine; averaged over the World Bank country
  outline, weighted by cell area.
- **Monthly profiles:** NASA POWER climatology; only the seasonal shape, scaled to the
  annual figures.
- **Caveats:** whole-country averages, not limited to buildable land. "Best 10%" (p90) is the
  value the best tenth of the country reaches. Modelled wind capacity factors exceed real
  fleet averages. Full method: `docs/RE_RESOURCES_METHOD.md`.

## ENTSO-E fuel detail [fuel_detail]

- **Source:** ENTSO-E's harmonised monthly statistics ("monthly domestic values"), summed by
  year: generation split into hydro run-of-river / reservoir / pumped storage, lignite / hard
  coal, onshore / offshore wind, and more.
- **Use:** the split within a fuel. Totals are ENTSO-E's grid-metered net generation and run
  below national statistics (see [principles]); take totals from [supply].

## Country briefing notes [notes]

- 181 written briefings (sector structure, actors, issues), drafted with AI assistance and
  **not fact-checked**; most dated June 2026.
- Use them for context. Their figures can differ from the explorer's data (listed in
  `docs/NOTES_QA.md`); the data takes precedence.
