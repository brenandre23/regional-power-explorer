# Recommended architecture

## Decision

Keep Regional Power Explorer static-first. Do **not** add an application backend merely to serve map or statistical reads.

Use three delivery lanes:

1. **World Bank vector basemap** — browser reads the approved ArcGIS vector style and its vector-tile/glyph/sprite dependencies directly. It is the visual source of truth for political boundaries, disputed styles, and World Bank labels.
2. **Explorer publication data** — existing same-origin static JSON/GeoJSON under `public/data/`. AI tools read only compact analytical JSON. MapLibre continues to render the current thematic GeoJSON until the largest layers are migrated to PMTiles.
3. **AI model access** — BYO provider key for POC/development, held in memory only; an authenticated organization gateway for production central credentials. The gateway is the only backend-like component that becomes necessary, and only because secrets/authentication require it.

## REST FeatureServer vs cache

### Visible basemap/political cartography

Use the approved vector-tile style, not per-session FeatureServer geometry queries. The vector style is already optimized for interactive rendering and preserves the intended World Bank cartography.

### Country interaction geometry

Fills, hover and click come from the World Bank GAD vector tile service when it is public and its tiles identify each polygon, with the static GAD extract in `public/data/geo` as the fallback (see `src/utils/geoSource.js`). Borders are never drawn from this geometry: they are the Bank's own boundary lines from the basemap style. Do not query FeatureServer at runtime.

### Electricity infrastructure

Keep current preprocessed static delivery for the first integrated release. Move oversized regional display layers to PMTiles as a separate performance workstream. Do not replace them with direct OSM/provider REST calls at runtime.

### AI analytical tools

Read compact static JSON summaries. Never send whole regional GeoJSON to the model. Use the package's live MapLibre tool server for viewport/layer questions and the Explorer's own static JSON for quantitative questions.

The region plant and line files are too big to read per question, so `tools/prepare_ai.py` summarises them into `public/data/ai/` (about 2 MB in all). Run it after any pipeline step that rewrites the region plant, line or zone files. CI fails a pull request whose summaries are out of date (see `DATA_LINEAGE.md`).

The files each data tool reads (`src/chat/dataServer.js`, prefixed `data__` for the model). What each tool is for, the prompt and the design rules: `AI_ASSISTANT.md`.

| Tool | Reads | Answers |
|---|---|---|
| `regions` | `regions.json` | regions and their member countries |
| `coverage` | build file list, `metadata.json` | what is published for a country, and when data was last updated |
| `methodology` | `methodology.md` | sources, definitions and limits of each dataset |
| `capacity` | `cache/region_capacity_*.json`, `cache/region_age_*_gppd.json` | operating MW by fuel and country for a region; GPPD fleet age |
| `pipeline` | `ai/plants/<ISO3>.json` | GEM planned and under-construction MW by fuel, for a country or region |
| `plants` | `ai/plants/<ISO3>.json` | largest plants by dataset, fuel and status |
| `supply` | `supply/<ISO3>.json` | generation and capacity by fuel and year, demand, peak demand (up to 10 countries) |
| `trade` | `trade/<ISO3>.json` | net imports and flows by partner and year, with known-problem caveats |
| `indicators` | `access.json`, `tariffs.json` | access (total, urban, rural) and residential/industrial tariffs |
| `grid` | `ai/grid/<region>.json` | region line km by voltage class, top operators, substations |
| `market` | `market/<ISO3>.json` | wholesale prices and volumes, yearly and monthly (Türkiye) |
| `zones` | `ai/zones/<ISO3>.json` | planning-model zones: plants by fuel per zone, connected zones |
| `load_centres` | `region_load_centers_<region>.geojson` | main cities by population (Black Sea) |
| `country_note` | `notes/<ISO3>.html` | the AI-drafted briefing note: figures, outline, takeaways or one section |
| `re_resources` | `re/<ISO3>.json` | country solar and wind resource: averages, best 10%, monthly profiles |
| `fuel_detail` | `entsoe/<ISO3>.json` + `supply/<ISO3>.json` | ENTSO-E's finer hydro, coal and wind split (harmonised statistics) for European countries, with how complete it is |

`public/data/re/` is written by `tools/prepare_re.py` from Global Solar Atlas country statistics, Global Wind Atlas v4 and NASA POWER. The RE tab reads the same files, so neither the tab nor the assistant calls an outside service. The method is in `RE_RESOURCES_METHOD.md`.

## AI trust boundary

Browser:

- MapLibre + Explorer UI
- local MCP data tools (read-only)
- local MCP app-control tools
- `@imaps/ai-chat`

Optional production gateway:

- authentication / user entitlement
- provider standing credentials
- model allowlist / quotas / audit logging
- no GIS database required

Provider:

- receives only user prompts, selected map screenshots, and tool-returned compact data needed for the answer.

The integrated deployment locks provider web search and provider-side file generation off by default and disables arbitrary attachments. These can be enabled only after a separate data-governance decision.

## Cartographic layer order

1. WB vector basemap land / water / contextual layers
2. optional satellite imagery
3. Explorer region/country fills and zoning areas
4. transmission / corridors
5. substations / plants / load centers
6. WB political boundary lines
7. WB administrative / country / capital labels

The `raiseBoundaries()` compatibility function now detects the WB vector basemap and promotes only the World Bank reference layers after Explorer operational layers are installed.

## Future PMTiles target

The eventual display architecture should use PMTiles for the heavy lines/plants/country-interaction geometry while retaining compact JSON/CSV for charts, downloads and AI tools. This preserves serverless hosting and HTTP-range delivery; no spatial API is required unless the product later needs authenticated data, writes, ad-hoc spatial queries, or protected datasets.
