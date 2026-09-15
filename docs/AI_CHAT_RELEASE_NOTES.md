# AI chat integration release notes

## Current branch scope

This branch integrates the `@imaps/ai-chat` POC into the Regional Power Explorer while preserving the application's static-first runtime model.

### Included

- World Bank ArcGIS vector basemap as the visible political-cartography source.
- Existing static country geometry retained for interaction/highlight logic.
- WB boundary and reference-label layers promoted above Explorer operational overlays.
- AI assistant on World, Region and Country maps.
- Read-only MCP tools for region membership, installed capacity, supply, trade, access and tariffs.
- MCP app-control tool for navigation and selected dashboard controls.
- Exact pin of the alpha AI package and direct MCP dependencies.
- Memory-only BYO key mode plus optional authenticated gateway base URL configuration.
- Attachments, provider web search and provider-side file generation disabled by default.
- Lazy loading of the chat UI after map readiness.
- CI build, integration lint and production bundle smoke checks.

### Deliberately not included

- No application API/database has been introduced.
- No browser FeatureServer dependency has been introduced.
- Existing static electricity GIS files have not been replaced by live provider APIs.
- PMTiles migration is not bundled into this branch; it remains the next display-performance workstream.
- Existing app-wide lint debt outside the integration scope is not rewritten as part of this change.

## Required before production merge/deployment

1. Cartography Unit manual review of the dispute/non-determined-area checklist.
2. Confirm Design Studio's `/regional-power-explorer/` subpath contract for the existing root-relative app/data paths.
3. Decide whether production uses BYO provider keys or an authenticated World Bank AI gateway.
4. Complete organizational review of the alpha package/licence/provider data-flow implications.
