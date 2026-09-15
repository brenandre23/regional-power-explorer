# Regional Power Explorer — AI chat and cartography audit

## Scope

This audit compares three code paths:

1. the current `brenandre23/regional-power-explorer` fork baseline;
2. the supplied `regional-power-explorer-poc-ai-chat-assistant` proof of concept;
3. the supplied WB-GAD / ArcGIS vector-basemap boundary test.

It also uses the `@imaps/ai-chat` package contract as published at implementation time.

## What exists now

The Explorer is a static-first React/Vite + MapLibre application. Most electricity-sector and GIS data is preprocessed into `public/data/` and fetched as static JSON/GeoJSON. Region and country pages then build MapLibre sources/layers in the browser. There is no application API/database layer in this repository.

The baseline map starts from a nearly empty MapLibre style and recreates political geography with project-hosted country/boundary GeoJSON. Optional CARTO and Esri raster basemaps are inserted beneath those local layers.

## What the AI POC added

The POC is deliberately small and structurally compatible with the current application:

- adds `@imaps/ai-chat`, MCP SDK and Zod;
- adds an in-process MCP bridge (`useLocalServer`);
- exposes compact read-only tools over existing static JSON (`dataServer`);
- exposes an app-control MCP tool that can navigate, change tabs, plant source, minimum MW and fuel filters;
- mounts `AiChatControl` inside Region and Country MapLibre maps;
- uses the package's own live MapLibre tools for camera/layer inspection;
- does **not** introduce a backend or database.

### Strong points in the POC

- Correctly keeps large GeoJSON out of model context.
- Reuses the Explorer's published files instead of inventing a second data store.
- Uses in-process MCP for map/app control, so map actions are low latency.
- Respects source disagreement between OSM, GEM and GPPD instead of averaging them.
- Can be removed without affecting the data pipelines.

### Gaps in the POC

- `@imaps/ai-chat` was range-pinned rather than exact-pinned even though it is an alpha package.
- API-key storage was session-based; production-safe default is memory-only unless an approved gateway is present.
- Web-search / file-generation egress policy was not fully locked.
- Data URLs were absolute-root paths, which is unsafe for Design Studio subpath deployment.
- The chat was only mounted on Region/Country, not the World landing map.
- The boundary/cartography changes were not integrated with the chat branch.
- The package control chrome required host-side styling to match Explorer themes.

## What differs in the WB-GAD boundary test

The boundary test takes a different cartographic approach from the baseline Explorer. It uses the approved ArcGIS vector style directly as the MapLibre base style and relies on World Bank vector-tile sources for political boundaries and labels. Its validation notes confirm the distinction between fill polygons and authoritative boundary strokes, including dashed/tightly-dashed/dotted dispute styles.

That is preferable for visible political cartography because it removes the need to reproduce World Bank boundary symbology in application code. The Explorer still needs local country geometry for hit-testing, region highlighting and bounding-box logic, but that geometry does not need to be the visible political-boundary source.

## Similarities and differences

| Concern | Baseline Explorer | AI POC | Recommended integrated build |
|---|---|---|---|
| Runtime architecture | Static-first files | Same | Same |
| Map renderer | MapLibre | Same | Same |
| Visible political geography | Local GeoJSON + app styling | Same as baseline | Approved WB ArcGIS vector style |
| Large thematic GIS | Whole-file GeoJSON | Same | Keep now; move largest display layers to PMTiles next |
| AI analytical data | None | Compact static JSON tools | Compact static JSON tools |
| AI map control | None | In-process MapLibre MCP | Keep |
| AI app control | None | In-process MCP | Keep + production policy |
| Central AI credentials | None | Not required | Optional gateway only when centrally funded/authenticated |
| Backend required for normal Explorer reads | No | No | No |
| Backend required for production AI central key | N/A | No (BYO key) | Yes, only for secure credential/gateway use |
| Disputed-area visible treatment | Reimplemented locally | Same | Basemap is authoritative visual source |

## Principal technical risks

1. **Layer ordering.** Operational layers added after a full vector style can cover dispute lines and official labels. The integrated implementation therefore explicitly raises WB boundary and label layers after Explorer overlays are added.
2. **AI data leakage.** Provider web search, file generation and arbitrary attachments can send content outside the Explorer's controlled data path. These are disabled by deployment policy in this implementation.
3. **Alpha dependency churn.** `@imaps/ai-chat` is pinned exactly and should only be upgraded intentionally after regression testing.
4. **Credential handling.** No provider secret belongs in `VITE_*`. A production central credential must live behind an authenticated gateway.
5. **GeoJSON scale.** AI integration does not solve the existing large-GeoJSON cost. PMTiles remains the appropriate display-layer evolution for the largest regional line/plant datasets.
6. **Design Studio subpath.** The existing codebase still has many root-relative `/data/...` references. New chat code is subpath-safe, but a complete Design Studio hardening pass must convert the rest of the app consistently.
