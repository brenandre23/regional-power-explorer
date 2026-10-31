import { dataPath } from './paths';
import { fetchData } from './dataCache';
import { ndlsaNeutralFill } from '../constants';
import { average } from './color';
import { raiseWbReference, fillAnchor } from './wbStyle';
import { resolveGeoMode, geoTileSourceSpec, ADM0_LAYER, NDLSA_LAYER, NAME_PROP } from './geoSource';
/**
 * Interaction geometry: the World Bank GAD extract that tools/prepare_gad.py
 * writes into public/data/geo, and the layers pages draw from it.
 *
 * The basemap itself -- land, water, political boundaries, names -- is the
 * approved World Bank vector style (see src/utils/wbStyle.js). What the app
 * draws from its own geometry is only what the basemap cannot know: which
 * countries belong to the region on screen, which one is hovered, and how the
 * Bank's non-determined legal status areas relate to those countries.
 *
 * The extract is the same GAD product the basemap tiles are built from, so a
 * highlight outline drawn from it lands on the basemap's own border.
 *
 * Non-determined areas (Western Sahara, Abyei, Aksai Chin, Jammu and Kashmir,
 * the UN buffer zone in Cyprus, ...) carry STATUS 'non-determined' and never a
 * country code, which keeps every ISO_A3-keyed layer and click handler from
 * picking them up. Their outlines -- dashed, dotted -- come from the basemap.
 * Their fill follows Bank map convention: the midpoint of the fills of the
 * parties to the area, listed in CLAIMANTS. See ndlsaFill().
 */

/** Country features only: everything the Bank attributes to a country. */
export const COUNTRY_ONLY = ['!=', ['get', 'STATUS'], 'non-determined'];
/** The non-determined areas. */
export const NON_DETERMINED_ONLY = ['==', ['get', 'STATUS'], 'non-determined'];


/**
 * The FeatureCollection in one of the extract's TopoJSON files. It reads only
 * what tools/prepare_gad.py topology() writes -- quantized, delta-encoded, one
 * arc per ring, MultiPolygons -- not TopoJSON at large. Feature ids are
 * assigned here because MapLibre needs them for setFeatureState and the
 * source is loaded with generateId: false.
 */
function fromTopology(topo) {
  const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
  const rings = topo.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]);
  });
  return {
    type: 'FeatureCollection',
    features: topo.objects.features.geometries.map((g, i) => ({
      type: 'Feature',
      id: i,
      properties: g.properties,
      geometry: { type: 'MultiPolygon', coordinates: polygons(g.arcs, rings) },
    })),
  };
}

// A ring needs four positions (three corners and the closing one). The source
// carries a few that do not -- one of Ghana's is a single point, and Vatican
// City, Monaco and Gibraltar are two-point slivers at world scale -- which
// MapLibre skips but d3-geo, behind the Equal Earth export, fails on. A
// polygon whose outline is unusable goes with its holes.
function polygons(arcs, rings) {
  const out = [];
  for (const poly of arcs) {
    const [outline, ...holes] = poly.map(([a]) => rings[a]).map(r => (r?.length >= 4 ? r : null));
    if (outline) out.push([outline, ...holes.filter(Boolean)]);
  }
  return out;
}

/**
 * Load one of the extract's files as GeoJSON.
 *
 * @param {'world'|'region'|'country'} kind
 * @param {string} [id]  region id or ISO_A3; none for 'world'
 */
export async function fetchGeo(kind, id) {
  return fromTopology(await fetchData(dataPath(geoFile(kind, id))));
}

function geoFile(kind, id) {
  if (kind === 'world' || kind === 'world-lite') return `geo/${kind}.topo.json`;
  return `geo/${kind}/${id}.topo.json`;
}

/**
 * Start downloading a page's geometry as the page opens, instead of after the
 * map's 'load' -- which waits for the basemap style, tiles and fonts -- so the
 * two load side by side. The pages that draw through addGeoSource() skip it
 * when the GAD tiles are in use; country pages always read the file.
 *
 * @param {'world'|'region'|'country'} kind
 * @param {string} [id]  region id or ISO_A3; none for 'world'
 */
export function prefetchGeo(kind, id) {
  // The world's full detail is not prefetched: it would share the connection
  // with the first pass and hold the colours back. addWorldSource() asks for it
  // once the first pass is on screen.
  const files = kind === 'world' ? [geoFile('world-lite')] : [geoFile(kind, id)];
  // fetchGeo() then picks the download up from the data cache.
  const start = () => files.forEach(file => fetchData(dataPath(file)).catch(() => {}));
  if (kind === 'country') start();
  else resolveGeoMode().then(mode => { if (mode === 'static') start(); });
}

let bboxesPromise = null;
/** Extents of every country and region, keyed by ISO_A3 / region id. */
export function fetchBboxes() {
  if (!bboxesPromise) {
    bboxesPromise = fetchData(dataPath('geo/bboxes.json'))
      .catch(err => { bboxesPromise = null; throw err; });
  }
  return bboxesPromise;
}

/**
 * MapLibre bounds for a country or region, padded in degrees, or null when
 * the extract has no such feature. East runs past 180 for what crosses the
 * antimeridian (Fiji, Pacific SIDS), which fitBounds frames as one piece.
 *
 * @param {object} bboxes  from fetchBboxes()
 * @param {'countries'|'regions'} kind
 */
export function boundsFor(bboxes, kind, id, pad = 0.5) {
  const b = bboxes?.[kind]?.[id];
  if (!b) return null;
  return [[b[0] - pad, b[1] - pad], [b[2] + pad, b[3] + pad]];
}

/**
 * @param {import('maplibre-gl').Map} map
 * @param {object} fc  a FeatureCollection from fetchGeo()
 */
export function addCountriesSource(map, fc) {
  map.addSource('countries', { type: 'geojson', data: fc, generateId: false });
}

/**
 * Add the 'countries' source from the GAD tiles when usable, otherwise from
 * the static extract (see src/utils/geoSource.js). Pages then bind layers
 * with countryLayer()/areaLayer() and never need to know which one it is.
 *
 * @param {'world'|'region'} kind  which static file to fall back to
 * @returns {Promise<'tiles'|'static'|null>}  null when the map was torn down meanwhile
 */
export async function addGeoSource(map, kind, id, isDisposed = () => false) {
  const mode = await resolveGeoMode();
  if (mode === 'tiles') {
    if (isDisposed()) return null;
    map.addSource('countries', geoTileSourceSpec());
    return mode;
  }
  if (kind === 'world') return addWorldSource(map, isDisposed);
  const fc = await fetchGeo(kind, id);
  if (isDisposed()) return null;
  addCountriesSource(map, fc);
  return mode;
}

// Resolves once a map's countries source holds its full geometry.
const detailReady = new WeakMap();

/**
 * When the map's countries source holds its full geometry -- for the world
 * file, after the first pass has been replaced. Anything that reads the
 * source's data, like the export, waits on this.
 */
export function geoDetail(map) {
  return detailReady.get(map) || Promise.resolve();
}

/**
 * The world geometry in two passes: world-lite first -- a tenth of the
 * vertices, so the colours are up almost at once -- then world.topo.json in
 * its place when it has loaded. The pages' layers key on properties, which
 * the two files share, so filters and colours carry over; feature ids do not
 * line up, so hover state is reset at the swap.
 */
async function addWorldSource(map, isDisposed) {
  const lite = await fetchGeo('world-lite').catch(() => null);
  if (isDisposed()) return null;
  if (!lite) {
    const fc = await fetchGeo('world');
    if (isDisposed()) return null;
    addCountriesSource(map, fc);
    return 'static';
  }
  addCountriesSource(map, lite);
  // Full detail only once the first pass is drawn. Downloaded together, the
  // two shared the connection: on a simulated slow phone the 111 KB first pass
  // took about 5 s to arrive alongside the 1.1 MB full file.
  detailReady.set(map, firstDraw(map, 'countries').then(() => fetchGeo('world')).then(fc => {
    if (isDisposed() || !map.getSource('countries')) return;
    map.removeFeatureState({ source: 'countries' });
    map.getSource('countries').setData(fc);
  }).catch(err => console.error('world geometry', err)));
  return 'static';
}

// Resolves on the first frame drawn after `sourceId` has loaded its data.
function firstDraw(map, sourceId) {
  return new Promise(resolve => {
    const check = () => {
      if (!map.getSource(sourceId) || !map.isSourceLoaded(sourceId)) return;
      map.off('render', check);
      resolve();
    };
    map.on('render', check);
    map.triggerRepaint();
  });
}

/** Source binding for a layer drawn from the countries. */
export function countryLayer(mode) {
  return mode === 'tiles' ? { source: 'countries', 'source-layer': ADM0_LAYER } : { source: 'countries' };
}

/** Source binding for a layer drawn from the non-determined areas. */
function areaLayer(mode) {
  return mode === 'tiles' ? { source: 'countries', 'source-layer': NDLSA_LAYER } : { source: 'countries' };
}

/** The Bank's name for an area; the NDLSA policy table's key. */
function areaNameExpr(mode) {
  return ['get', mode === 'tiles' ? NAME_PROP : 'WB_NAME'];
}

/** setFeatureState target for a feature from a rendered-features query. */
export function featureTarget(f) {
  return f.sourceLayer ? { source: 'countries', sourceLayer: f.sourceLayer, id: f.id } : { source: 'countries', id: f.id };
}

/** True for a non-determined area, from either source. */
export function isArea(f) {
  return f.sourceLayer ? f.sourceLayer === NDLSA_LAYER : f.properties.STATUS === 'non-determined';
}

/** A country's or area's Bank name, from either source. */
export function areaName(f) {
  return f.properties.WB_NAME ?? f.properties[NAME_PROP];
}

// The two contested territories the app names. Bank style sets their names in
// italics wherever they appear; the map's own labels follow the same rule (see
// ITALIC_ADM0_LABELS in wbStyle.js).
const ITALIC_NAMES = new Set(['West Bank and Gaza', 'Western Sahara']);

/** True for a name Bank style sets in italics. */
export function isItalicName(name) {
  return ITALIC_NAMES.has(name);
}

/**
 * Whether the app may name a feature. Countries yes; of the non-determined
 * areas only the contested territories above -- the rest stay unnamed, on the
 * map and in popups alike.
 */
export function isNamed(f) {
  return !isArea(f) || isItalicName(areaName(f));
}

/** A name for popup HTML, italicised where Bank style asks. */
export function nameHtml(name) {
  return isItalicName(name) ? `<i>${name}</i>` : name;
}

/** Match a region's member countries. Areas are drawn by addNdlsaLayer(). */
export function regionFilter(isos) {
  return ['in', ['get', 'ISO_A3'], ['literal', isos]];
}

let ndlsaPromise = null;
/**
 * The non-determined areas policy table from public/data/ndlsa.json, keyed on
 * the Bank's name: { claimants: ISO_A3[], fill?: {color}|{neutral}|{hatch} }.
 */
export function fetchNdlsa() {
  if (!ndlsaPromise) {
    ndlsaPromise = fetchData(dataPath('ndlsa.json')).then(j => j.areas)
      .catch(err => { ndlsaPromise = null; throw err; });
  }
  return ndlsaPromise;
}

/**
 * The fill of one non-determined area under the current page's colouring.
 *
 * Bank convention: an area takes the midpoint of its parties' colours. A party
 * the page does not colour (a country outside the region, or one belonging to
 * no region) contributes no colour but still counts, so an area between one
 * coloured and one uncoloured party comes out at half strength -- halfway
 * between the coloured party and the land. An area none of whose parties are
 * coloured takes the theme's neutral fill. The area's own `fill` overrides.
 *
 * @param {{ claimants: string[], fill?: object }} area  from fetchNdlsa()
 * @param {(iso: string) => (string|null|undefined)} colorForIso
 * @param {object} t  the active theme
 * @returns {{ color: string, alpha: number, hatch?: boolean }}
 */
export function ndlsaFill(area, colorForIso, t) {
  const fill = area.fill || {};
  if (fill.hatch) return { color: ndlsaNeutralFill(t), alpha: 1, hatch: true };
  if (fill.color) return { color: fill.color, alpha: 1 };
  const colors = fill.neutral ? [] : area.claimants.map(colorForIso).filter(Boolean);
  if (!colors.length) return { color: ndlsaNeutralFill(t), alpha: 1 };
  return { color: average(colors), alpha: colors.length / area.claimants.length };
}

/**
 * Draw the non-determined areas from the 'countries' source. Fills are
 * data-driven on WB_NAME, so the same layers work on any source carrying the
 * Bank's names -- the current GeoJSON extract or vector tiles. The basemap
 * supplies the outlines.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {object} opts
 * @param {object} opts.ndlsa          from fetchNdlsa()
 * @param {(iso: string) => (string|null|undefined)} opts.colorForIso
 * @param {number} opts.opacity        fill opacity for a fully-coloured area
 * @param {number} [opts.hoverOpacity] opacity under feature-state hover
 * @param {string} [opts.before]       layer id to insert before
 * @param {object} opts.t              the active theme
 */
export function addNdlsaLayer(map, { ndlsa, colorForIso, opacity, hoverOpacity, before, t, mode = 'static' }) {
  const neutral = ndlsaNeutralFill(t);
  const colorPairs = [], alphaPairs = [], hatched = [];
  for (const [name, area] of Object.entries(ndlsa)) {
    const { color, alpha, hatch } = ndlsaFill(area, colorForIso, t);
    if (hatch) { hatched.push(name); continue; }
    colorPairs.push(name, color);
    alphaPairs.push(name, alpha);
  }
  const byName = (pairs, fallback) =>
    pairs.length ? ['match', areaNameExpr(mode), ...pairs, fallback] : fallback;
  const base = hoverOpacity == null ? opacity
    : ['case', ['boolean', ['feature-state', 'hover'], false], hoverOpacity, opacity];
  const isHatched = ['in', areaNameExpr(mode), ['literal', hatched]];
  // The tiles keep areas in their own layer; the extract flags them.
  const onlyAreas = mode === 'tiles' ? [] : [NON_DETERMINED_ONLY];
  map.addLayer({
    id: 'ndlsa-fill', type: 'fill', ...areaLayer(mode),
    filter: ['all', ...onlyAreas, ['!', isHatched]],
    paint: {
      'fill-color': byName(colorPairs, neutral),
      'fill-opacity': ['*', byName(alphaPairs, 1), base],
    },
  }, before);
  // Areas drawn as grey diagonal stripes (Golan Heights).
  if (!map.hasImage(HATCH_IMAGE)) map.addImage(HATCH_IMAGE, hatchImage(t), { pixelRatio: 2 });
  map.addLayer({
    id: 'ndlsa-hatch', type: 'fill', ...areaLayer(mode),
    filter: ['all', ...onlyAreas, isHatched],
    paint: { 'fill-pattern': HATCH_IMAGE, 'fill-opacity': Math.min(1, opacity * 6) },
  }, before);
}

const HATCH_IMAGE = 'ndlsa-hatch';

/** A 16 px tile of grey diagonal stripes in the theme's neutral tone. */
function hatchImage(t) {
  const size = 16;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = t?.isDark ? 'rgba(200,205,215,0.7)' : 'rgba(90,95,105,0.6)';
  ctx.lineWidth = 2;
  for (let d = -size; d <= size * 2; d += 6) {
    ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + size, size); ctx.stroke();
  }
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Lift the Bank's boundaries and names back above the operational overlays a
 * page adds after the style loads. The dashes are the whole point of drawing
 * those borders differently, and thematic layers must never cover them.
 */
export function raiseBoundaries(map) {
  raiseWbReference(map);
}

export { fillAnchor };
