# Vector tile migration — where we are (2026-09-17)

Goal: interaction geometry (country/area fills, hover, click) comes from a
World Bank GAD vector tile service instead of static GeoJSON in
`public/data/geo/`. Republishing the service updates the map; no pipeline,
no app-side generalisation.

## Services (from Brenan, 2026-09-17 — supersedes the note below)

Four public ArcGIS Online vector tile services, all under
`https://vectortileservices.arcgis.com/iQ1dY19aHwbSDYIF/arcgis/rest/services/`:

| name (matches `wbStyle.js` `groupOf()` source names) | service | source FeatureServer | status |
|---|---|---|---|
| `wbg_borders` | `WB_GAD_Boundaries` | `WB_GAD_Boundaries` (ADM0/1/2 + Pacific maritime boundaries) | tiles serve real bytes (checked 0/0/0) |
| `wbg_admin_labels` | `WB_GAD_Denominations` | `WB_GAD_Labels_012` | not checked, presumably fine — already used via the basemap style |
| `wbg_places` | `WB_GAD_Capitals_Cities` | `WB_GAD_Capitals_CIties_Labels` | not checked, presumably fine — already used via the basemap style |
| `wbg_admin_layers` (this migration) | `WB_GAD_Areas` | `WB_GAD_Polygons`, sublayers ADM0/ADM1/ADM2/**NDLSA** | **metadata resolves, every tile 404s** — see below |

The first three are already reached indirectly today, baked into
`WB_BASEMAP_STYLE_URL` (see `src/utils/wbStyle.js`); this migration only needs
the fourth, `WB_GAD_Areas`, which is what `src/utils/geoSource.js` now points
at.

## Status: `WB_GAD_Areas` tiles are 404ing, not a symbology problem

The URL previously in `geoSource.js`
(`geowb.worldbank.org/.../Hosted/WB_GAD_Admin0/VectorTileServer`) never
resolved from outside WB at all — wrong host, not the service above. Fixed to
`WB_GAD_Areas/VectorTileServer` in `geoSource.js`.

Checked 2026-09-17: `?f=json` and `/tilemap/0/0/0` both return 200 (service is
published, tile scheme is standard 512px). But `/tile/{z}/{y}/{x}.pbf` returns
a genuine 404 (CloudFront-cached "File or directory not found") at every zoom
tried — 0, 2, 3, 6, 10, several x/y per level. For comparison, the sibling
service `WB_GAD_Boundaries` serves a real 4.3KB tile at `0/0/0` today, so this
isn't a client mistake (wrong tile scheme, wrong z/y/x order) — it's specific
to `WB_GAD_Areas`. Reads as an empty or broken tile cache on the ArcGIS side.

## Next step (Brenan, ArcGIS Online)

Check the `WB_GAD_Areas` vector tile service's publish/tile-cache job — it may
need re-running. Once a tile actually downloads, still need the symbology
check from the previous plan (Unique Values on `ISO_A3`/`WB_STATUS`/`SOV_ISO_A3`
for ADM0, `NAM_0`/`SOV_ISO_A3` for NDLSA) since ArcGIS only writes fields
referenced by symbology/labels — unconfirmed whether that's already set on
this service.

Decided **not** to add a `UID` field. `promoteId` will use `ISO_A3` / `NAM_0`;
the only consequence is the two Jammu & Kashmir polygons share an id and hover
together, which is acceptable.

Then send one tile (any zoom, over Kashmir ideally) for decoding:
`node -e` with `@mapbox/vector-tile` + `pbf` (both in node_modules now,
installed --no-save). Check: attributes present, ids present or not.

## Done this session (uncommitted, on branch `wb-cartography`)

- `src/utils/geoSource.js` — new. Source spec, layer names, `NAME_PROP = 'NAM_0'`,
  `promoteId` placeholder. Nothing imports it yet.
- `public/data/ndlsa.json` — new. Single claimants + fill-rule table
  (23 areas). `prepare_gad.py` reads it; `NDLSA_FILL_RULES` removed from
  `constants.js`.
- `src/utils/basemap.js` — `applyNdlsaFills()` removed (it mutated feature
  properties, impossible with tiles). `addNdlsaLayer()` now takes `ndlsa` +
  `colorForIso` and builds a `match` on `WB_NAME`. `fetchNdlsa()` added.
  Expressions validated against maplibre style-spec.
- `WorldPage`/`RegionPage`/`CountryPage` — fetch the table, pass it through.
- `tools/prepare_region_data.py` — clips against `geo/region/<id>.geojson`
  (detail) instead of the coarse world file. Correctness fix, independent.
- `tools/prepare_gad.py` — no longer writes `ndlsa.geojson` or `bboxes.areas`;
  both files removed. Docstring claim that `f=geojson` ignores
  `maxAllowableOffset` is wrong (measured) — Esri-JSON ring conversion could go.
- `public/preview/southasia.html` — fetches live from the FeatureServer at
  `0.002°`; full-res caused an earcut triangulation band (see
  `public/error_images/`). Has its own copy of the policy table; will drift.
- `vite build` passes. ESLint: 22 pre-existing react-hooks findings in the
  pages, none on changed lines.

## Left to do once tiles carry attributes

1. `geoSource.js`: set `promoteId`, confirm `tileSize` (ArcGIS default 512)
   and LOD range from `?f=json`.
2. `basemap.js`: `addCountriesSource` → `map.addSource(GEO_SOURCE, geoSourceSpec())`;
   `NON_DETERMINED_ONLY` filters → `fromLayer(NDLSA_LAYER)`; `WB_NAME` → `NAME_PROP`.
3. Pages: `setFeatureState({ source: 'countries', id: index })` →
   `{ source: GEO_SOURCE, sourceLayer, id: props.ISO_A3 | props.NAM_0 }`.
   `WorldPage.regionsFor()` keys areas on `WB_NAME` → `NAM_0`.
   `CountryPage` uses `countries.features.find(...)` for point-in-polygon
   plant filtering — needs the polygon; use `map.querySourceFeatures` or keep
   a small `country/<ISO>.geojson` just for that.
4. `fetchGeo` and `public/data/geo/{world,region,country}` go. Keep
   `bboxes.json` (or replace with `returnExtentOnly` FeatureServer queries).
5. `prepare_gad.py` shrinks to: rewrite `regions.json non_determined`, write
   `bboxes.json`.
6. Point `southasia.html` at the tiles as the prototype, or delete it.

## Parked (from the audits, not geography)

Two region registries (`regions.yaml` vs `regions.json`), Kosovo three codes,
`RegionPage`/`CountryPage` 60% duplicated, mislabelled capacity source caption,
dead `countriesOff` feature, `nasaPower.js` unused. See conversation audit.
