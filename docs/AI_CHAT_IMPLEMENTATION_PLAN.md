# Implementation plan — integrated AI assistant + World Bank cartography

## Phase A — dependency and policy hardening

- Pin `@imaps/ai-chat` exactly at `0.0.0-alpha.1`.
- Pin direct MCP/Zod dependencies.
- Default API-key storage to memory.
- Disable arbitrary attachments, provider web search and provider-side file generation.
- Support an optional environment-configured gateway without exposing a provider secret to Vite.

Acceptance: no secret in source or Vite env; POC still works with BYO key when no gateway exists.

## Phase B — data tools

- Reuse `regions.json`, capacity summaries, supply, trade, access and tariff JSON.
- Memoize static fetches.
- Return source/year/unit alongside values.
- Return explicit unavailable states instead of hallucinated fallbacks.
- Keep GeoJSON out of model tool results.

Acceptance: quantitative responses can be traced to an Explorer publication file and dataset family.

## Phase C — app and map control

- Mount the assistant on World, Region and Country maps.
- Reuse package MapLibre tools for pan/zoom/identify/layer operations.
- Keep local `app__update_state` for route/tab/plant-source/MW/fuel changes.
- Disable the composer until each map is loaded.
- Match active Explorer theme through shadow-DOM tokens and host chrome styling.

Acceptance: a prompt can navigate to a country, switch a tab/source, filter the map, and then answer from the corresponding static dataset.

## Phase D — World Bank basemap integration

- Use the approved ArcGIS vector style URL as `mapStyle()`.
- Keep local country GeoJSON for interaction/highlight only.
- Stop drawing duplicate local political boundaries whenever the WB vector source is present.
- Re-raise World Bank boundary and label layers after operational overlays are added.
- Retain satellite imagery as an optional raster beneath WB political boundaries.
- Make "WB Clean" and "WB Labeled" the non-satellite basemap choices.

Acceptance: disputed/dashed/dotted boundaries and World Bank labels remain visible above thematic fills at all tested map levels.

## Phase E — QA

- `npm run build`
- `npm run lint`
- smoke-test World/Region/Country routes
- test theme switching and map rebuilds
- test WB Clean / WB Labeled / Satellite + labels
- inspect Western Sahara, Abyei, Kashmir/South Asia dispute areas, Cyprus buffer-zone treatment and another known disputed-boundary case at multiple zooms
- test AI with no key, BYO key, and configured gateway
- verify tool unavailable states
- verify no provider secret appears in `dist/`
- throttle network and verify chat does not request large GeoJSON itself

## Phase F — next performance release

Not bundled into this branch: convert the heaviest display GeoJSON layers to PMTiles and keep downloadable/static analytical artifacts separate. The AI architecture already aligns with that split and does not need to change when PMTiles lands.
