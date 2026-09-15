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

Keep a static cached geometry product for hit-testing, region membership and bounding boxes. Do not query FeatureServer on every user session. Refresh the cached geometry through a controlled preprocessing pipeline when the authoritative boundary publication changes.

### Electricity infrastructure

Keep current preprocessed static delivery for the first integrated release. Move oversized regional display layers to PMTiles as a separate performance workstream. Do not replace them with direct OSM/provider REST calls at runtime.

### AI analytical tools

Read compact static JSON summaries. Never send whole regional GeoJSON to the model. Use the package's live MapLibre tool server for viewport/layer questions and the Explorer's own static JSON for quantitative questions.

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
