/**
 * Where the interaction geometry comes from: the World Bank GAD Admin-0 vector
 * tile service. One source, two source-layers -- countries and the
 * non-determined legal status areas -- carrying the Bank's own attributes
 * (ISO_A3, WB_STATUS, SOV_ISO_A3, NAM_0). Nothing is fetched or generalised
 * app-side: the tiler simplifies per zoom, and republishing the service
 * updates the map.
 *
 * Pages add this source once and draw fills/lines from the two layers with
 * filters on ISO_A3 (countries) and NAM_0 (areas); see src/utils/basemap.js.
 */

// Public ArcGIS Online tile service, source FeatureServer "WB_GAD_Polygons"
// (item e793c45f7af44ea3bd90596305f71179), sublayers ADM0/ADM1/ADM2/NDLSA.
// Replaces an earlier URL on an internal-only geowb.worldbank.org host that
// never resolved from outside the Bank.
const SERVICE = 'https://vectortileservices.arcgis.com/iQ1dY19aHwbSDYIF/arcgis/rest/services/WB_GAD_Areas/VectorTileServer';

export const GEO_SOURCE = 'wb-gad';
export const ADM0_LAYER = 'WB_GAD_ADM0';
export const NDLSA_LAYER = 'WB_GAD_NDLSA';
/** The Bank's name field on both layers; the key the NDLSA policy table joins on. */
export const NAME_PROP = 'NAM_0';

// BLOCKED -- as of 2026-09-17 the service resolves (?f=json, /tilemap all
// 200) but every /tile/{z}/{y}/{x}.pbf request 404s, at every zoom tried
// (0, 2, 3, 6, 10). That's an empty or broken tile cache on the ArcGIS side,
// not a symbology/attribute problem -- a sibling service (WB_GAD_Boundaries)
// serves real tile bytes at 0/0/0 today, so the pattern is specific to this
// service. Needs Brenan to check the publish job / re-run the tile cache in
// ArcGIS before any of this can be decoded or wired in.
//
// Once tiles are live, still confirm from a decoded tile:
//   1. Does the tiler keep a feature id? If not, hover (setFeatureState) needs
//      promoteId. ISO_A3 works for countries; areas need NAM_0, and Jammu and
//      Kashmir is two polygons with one name -- SOV_ISO_A3 tells them apart.
//   2. Tile size: ArcGIS publishes 512 px tiles; MapLibre must be told.
const TILE_SIZE = 512;
const PROMOTE_ID = { [ADM0_LAYER]: 'ISO_A3', [NDLSA_LAYER]: NAME_PROP };

export function geoSourceSpec() {
  return {
    type: 'vector',
    tiles: [`${SERVICE}/tile/{z}/{y}/{x}.pbf`],
    tileSize: TILE_SIZE,
    minzoom: 0,
    maxzoom: 14,
    promoteId: PROMOTE_ID,
    attribution: 'Boundaries © World Bank GAD',
  };
}

/** Spread into a layer definition to bind it to one of the two source-layers. */
export function fromLayer(sourceLayer) {
  return { source: GEO_SOURCE, 'source-layer': sourceLayer };
}
