# Architecture decision record — AI assistant and GIS delivery

**Status:** proposed for review on `ai-chat-production-integration`; not merged to `main`.

## Decision

Regional Power Explorer remains a static-first React/Vite + MapLibre publication. The AI assistant is embedded in the browser and gets analytical context from compact same-origin static JSON through read-only local MCP tools. The approved World Bank ArcGIS vector style is the visible source of political boundaries and labels.

A backend is not added for ordinary GIS/statistical reads. An authenticated AI gateway becomes appropriate only when the deployment needs a centrally managed provider credential, identity/entitlement, quotas, or audit controls.

## Data-delivery choices

- **Political cartography:** World Bank vector basemap tiles/style directly.
- **Interaction/highlight geometry:** cached local country geometry.
- **Electricity statistics for UI + AI:** static JSON publication files.
- **Current infrastructure display:** existing preprocessed GeoJSON.
- **Future large display layers:** PMTiles/vector tiles served statically with range requests.
- **Runtime FeatureServer queries:** not used for normal browser sessions.

## Consequences

This keeps hosting simple and makes the AI integration additive rather than turning the dashboard into an API application. It also cleanly separates display-optimized geometry from compact analytical/model context. The remaining performance bottleneck is the pre-existing large GeoJSON payloads, not the AI tool data path.
