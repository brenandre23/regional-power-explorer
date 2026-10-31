# Regional Power Explorer

An interactive web map for exploring **open-access electricity-sector data** — generation
mix, installed capacity, power plants, grid infrastructure, cross-border trade, electricity
access, tariffs, and renewable-energy resources — at world, regional, and country level.

It is a **pilot**: not an official product of any institution, not endorsed by one, and parts
of its content were drafted with AI assistance and have not been fact-checked. The tool
aggregates and harmonises data from many open sources so that planners, analysts, and
decision-makers can get a quick, sourced overview of a country's power system. It can be used
to help populate inputs for the
[Electricity Planning Model (EPM)](https://github.com/ESMAP-World-Bank-Group/EPM),
but it is a **standalone data-exploration tool** and is not limited to EPM.

> **Scope — what it is and isn't.** The Regional Power Explorer *aggregates and visualises
> already-published open data*. It is **not** a power-system model, it does **not** run
> simulations or forecasts of its own, and the figures it shows are **indicative**: coverage
> and accuracy vary by region. Always cross-check against national statistics before using
> the data for planning or official purposes. See [Limitations & Disclaimer](#limitations--disclaimer).

## Data sources

All layers, their sources, versions, update frequency, coverage, and a quality indicator are
documented in the in-app **Data Sources** page (`/about`). Key sources include ENTSO-E,
OpenStreetMap, the WRI Global Power Plant Database, Global Energy Monitor, the Global Solar
Atlas, the Global Wind Atlas, NASA POWER, Our World in Data, Ember, and national statistical
offices. Where each file comes from and how often it is refreshed is in
[docs/DATA_LINEAGE.md](docs/DATA_LINEAGE.md).

Data licences include: OpenStreetMap (ODbL), WRI GPPD (CC BY 4.0), Global Energy Monitor
(CC BY 4.0), World Bank Official Boundaries (CC BY 4.0), and others as listed on the Data Sources page.

## Tech stack

- **React 19** + **Vite** (build/dev)
- **MapLibre GL** for the interactive map
- **React Router** for navigation
- Deployed on **Vercel**

## Getting started

```bash
npm install
npm run dev        # local dev server (Vite, HMR)
npm run build      # production build → dist/
npm run preview    # preview the production build
npm run lint       # ESLint
```

## How data flows

```
data-source/        Raw inputs and pipeline intermediates (git-ignored — kept local, large)
   │  tools/ scripts fetch, clean, and harmonise
   ▼
public/data/        Curated, web-ready data served by the app (committed)
```

Only the curated, web-ready output under `public/data/` is committed. Heavy raw inputs and
caches under `data-source/` are git-ignored (see `.gitignore`) and produced/refreshed by the
scripts in `tools/`.

## Project structure

```
src/
  pages/        Route pages (World, Region, Country, About, Contact, …)
  components/   Reusable UI + map components
  utils/        Helpers
  constants.js  Theme + shared constants
public/data/    Curated data served at runtime
tools/          Data-pipeline scripts
config/         Pipeline configuration (API tokens are git-ignored)
```

## Contributing

Contributions and data-source suggestions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
For new data sources or coverage gaps, open a
[GitHub Issue](https://github.com/ESMAP-World-Bank-Group/regional-power-explorer/issues).

## Limitations & Disclaimer

- Data shown is **indicative** and aggregated from third-party open sources; coverage and
  accuracy vary by country and layer. Quality indicators are provided per source on the
  Data Sources page. Do not use as a sole basis for investment or policy decisions.
- Estimation methods (e.g. demand projections, capacity-factor derivation, wind-speed
  height correction) are documented on the Data Sources / Methods page; treat estimated
  layers accordingly.
- Parts of the content — in particular the country briefing notes held in `public/data/notes/`
  — were **drafted with AI language models** and have not been verified or peer-reviewed.
  They may contain wrong figures or inaccurate statements on politically sensitive matters.
  Each note carries a line saying so; treat them as unverified drafts, not as sources.
- The boundaries, colours, denominations, and other information shown on any map do **not**
  imply any judgment concerning the legal status of any territory or the endorsement or
  acceptance of such boundaries.
- The findings and data presented here are for informational purposes only. They are not an
  official product of any institution, carry no institutional endorsement, and must not be
  attributed to any organisation or its members.

## License

Code is released under the [MIT License](LICENSE). Aggregated data remains under the licences
of its respective sources (see the Data Sources page).

---

*Pilot · indicative data · partly AI-generated · unofficial*
