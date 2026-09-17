import { dataPath } from './paths';
import { ndlsaNeutralFill } from '../constants';
import { average } from './color';
import { raiseWbReference, fillAnchor } from './wbStyle';
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

async function fetchJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

/**
 * Load one of the extract's files. Feature ids are assigned here because
 * MapLibre needs them for setFeatureState and the source is loaded with
 * generateId: false.
 *
 * @param {'world'|'region'|'country'} kind
 * @param {string} [id]  region id or ISO_A3; none for 'world'
 */
export async function fetchGeo(kind, id) {
  const file = kind === 'world' ? 'geo/world.geojson' : `geo/${kind}/${id}.geojson`;
  const fc = await fetchJson(dataPath(file));
  fc.features.forEach((f, i) => { f.id = i; });
  return fc;
}

let bboxesPromise = null;
/** Extents of every country and region, keyed by ISO_A3 / region id. */
export function fetchBboxes() {
  if (!bboxesPromise) {
    bboxesPromise = fetchJson(dataPath('geo/bboxes.json'))
      .catch(err => { bboxesPromise = null; throw err; });
  }
  return bboxesPromise;
}

/**
 * MapLibre bounds for a country or region, padded in degrees, or null when
 * the extract has no such feature.
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
    ndlsaPromise = fetchJson(dataPath('ndlsa.json')).then(j => j.areas)
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
export function addNdlsaLayer(map, { ndlsa, colorForIso, opacity, hoverOpacity, before, t }) {
  const neutral = ndlsaNeutralFill(t);
  const colorPairs = [], alphaPairs = [], hatched = [];
  for (const [name, area] of Object.entries(ndlsa)) {
    const { color, alpha, hatch } = ndlsaFill(area, colorForIso, t);
    if (hatch) { hatched.push(name); continue; }
    colorPairs.push(name, color);
    alphaPairs.push(name, alpha);
  }
  const byName = (pairs, fallback) =>
    pairs.length ? ['match', ['get', 'WB_NAME'], ...pairs, fallback] : fallback;
  const base = hoverOpacity == null ? opacity
    : ['case', ['boolean', ['feature-state', 'hover'], false], hoverOpacity, opacity];
  const isHatched = ['in', ['get', 'WB_NAME'], ['literal', hatched]];
  map.addLayer({
    id: 'ndlsa-fill', type: 'fill', source: 'countries',
    filter: ['all', NON_DETERMINED_ONLY, ['!', isHatched]],
    paint: {
      'fill-color': byName(colorPairs, neutral),
      'fill-opacity': ['*', byName(alphaPairs, 1), base],
    },
  }, before);
  // Areas drawn as grey diagonal stripes (Golan Heights).
  if (!map.hasImage(HATCH_IMAGE)) map.addImage(HATCH_IMAGE, hatchImage(t), { pixelRatio: 2 });
  map.addLayer({
    id: 'ndlsa-hatch', type: 'fill', source: 'countries',
    filter: ['all', NON_DETERMINED_ONLY, isHatched],
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
