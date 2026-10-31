# AI chat + World Bank cartography QA checklist

This checklist is the manual sign-off companion to the automated build gates. A successful Vite build proves that the application compiles; it does **not** prove that World Bank political cartography is visually correct.

## Political-boundary review

Review World, Region and Country routes at multiple zooms. Confirm operational fills never cover the World Bank boundary treatment or official labels.

- Western Sahara — disputed / non-determined treatment remains visually distinct.
- Abyei — broken boundary treatment remains visible through regional highlight fills.
- South Asia / Kashmir dispute areas — dashed/dotted policy strokes remain legible at regional and country scales.
- Cyprus / UN Buffer Zone — non-determined treatment remains intact.
- One additional known disputed-boundary case selected by the Cartography Unit.

For each case test:

- WB Clean
- WB Labeled
- Satellite, labels off
- Satellite, labels on
- hover / selected-country / selected-region fills
- transmission and zoning overlays where available

## AI assistant review

Answer quality: run the test questions in `AI_ASSISTANT.md`. Deployment:

- Assistant opens on World, Region and Country maps.
- No API key configured: UI gives a usable setup path rather than a blank failure.
- BYO key mode stores the key in memory only.
- Gateway mode works without a provider secret in the browser configuration.
- The default model is the first allowed one (Claude Opus 5 unless `VITE_AI_ALLOWED_MODELS` is set).
- Provider web search, arbitrary attachments and provider-side file generation remain disabled by deployment policy.

## Performance / hosting review

- AI chat code is a lazy chunk and does not block initial dashboard rendering.
- Design Studio route is tested from a hard refresh, not only SPA navigation.
- `/regional-power-explorer/` hosting contract is confirmed for Vite assets and existing root-relative `/data/...` requests before production publication.
- Largest regional GeoJSON files are profiled separately; PMTiles migration remains the next display-performance workstream.
