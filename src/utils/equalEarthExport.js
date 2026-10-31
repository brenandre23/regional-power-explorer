/**
 * Export the current view of any page's map as an Equal Earth PNG.
 *
 * MapLibre only draws Web Mercator (and a globe), so the export is a separate
 * rendering, bottom to top:
 *   1. basemap -- 'clean' is drawn as vectors (ocean + GAD land); 'detailed'
 *      and 'satellite' are rendered by an offscreen MapLibre map and warped
 *      pixel by pixel from Mercator into Equal Earth;
 *   2. every layer the page itself added (fills, lines, circles), read from
 *      the live map: its GeoJSON data, its current filter, and its paint
 *      evaluated per feature at the current zoom -- so the export follows the
 *      page's toggles and styling without a per-page description;
 *   3. the World Bank's international boundaries, decoded from the same
 *      WB_GAD_Boundaries tiles the basemap shows, dotted / dashed / solid;
 *   4. optionally WB country names from the WB_GAD_Denominations tiles.
 * The interactive map is never touched.
 *
 * Adapted from the Exposure maps export (equal-earth.js, wbg-boundaries.js).
 */
import maplibregl from 'maplibre-gl';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { geoArea, geoEqualEarth, geoPath } from 'd3-geo';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { fetchWbStyle, buildWbStyle, DEFAULT_WB_VIEW, HIDDEN_ADM0_LABELS, ITALIC_ADM0_LABELS, adm0LabelSize, adm0LabelColor, withExtraAdm0Labels, adm0LabelsOnly } from './wbStyle';
import { fetchGeo } from './basemap';

const BOUNDARY_LAYER = 'ADM0_Boundaries';
// Boundary tiles are fetched one level above the map's own zoom (the export is
// about twice the on-screen size), from z3 for a world view up to z7.
const MIN_BOUNDARY_ZOOM = 3, MAX_BOUNDARY_ZOOM = 7;

// A World Bank tile that has not arrived by then fails the export with a
// message saying which service did not answer, rather than leaving it at
// "Preparing PNG…" for good.
const TILE_TIMEOUT_MS = 20000;

/** fetch() for a WB tile service, bounded by TILE_TIMEOUT_MS. */
async function fetchTile(url, service) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(TILE_TIMEOUT_MS) });
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? `${service} did not respond` : `${service} could not be reached`, { cause: err });
  }
}

// Dash rhythm per WB boundary type, in multiples of the line width. The
// class numbers (`_symbol`) are read from the live style, never assumed.
const DASHES = { dotted: [0.1, 3.5], dashed: [5, 7], solid: null };

function kindOf(layerId) {
  if (layerId.endsWith('/Dotted')) return 'dotted';
  if (layerId.endsWith('/Dashed Solid Line')) return 'dashed';
  if (layerId.endsWith('/Solid')) return 'solid';
  return null;
}

// Clip tile buffers before stitching: buffered duplicates otherwise overlap
// neighbouring tiles, turning dashed borders solid.
function clipSegment(a, b, extent) {
  let start = 0, end = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x], [dx, extent - a.x], [-dy, a.y], [dy, extent - a.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) start = Math.max(start, t); else end = Math.min(end, t);
    if (start > end) return null;
  }
  if (start === end) return null;
  return [{ x: a.x + start * dx, y: a.y + start * dy }, { x: a.x + end * dx, y: a.y + end * dy }];
}

function decodeTile(bytes, x, y, z, kinds) {
  const layer = new VectorTile(new Pbf(bytes)).layers[BOUNDARY_LAYER];
  if (!layer) return [];
  const n = 2 ** z, extent = layer.extent, out = [];
  const lngLat = p => [
    (x + p.x / extent) / n * 360 - 180,
    Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + p.y / extent) / n))) * 180 / Math.PI,
  ];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const kind = kinds.get(f.properties._symbol);
    if (f.type !== 2 || !kind) continue;
    for (const line of f.loadGeometry()) {
      let cur = [];
      const flush = () => { if (cur.length > 1) out.push({ kind, coordinates: cur }); cur = []; };
      for (let j = 1; j < line.length; j++) {
        const seg = clipSegment(line[j - 1], line[j], extent);
        if (!seg) { flush(); continue; }
        const [a, b] = seg.map(lngLat), last = cur.at(-1);
        if (last && (Math.abs(last[0] - a[0]) > 1e-8 || Math.abs(last[1] - a[1]) > 1e-8)) flush();
        if (!cur.length) cur.push(a);
        cur.push(b);
      }
      flush();
    }
  }
  return out;
}

let servicePromise = null;
/** The boundary service URL and its `_symbol` -> dotted/dashed/solid map. */
function boundaryService() {
  if (!servicePromise) {
    servicePromise = fetchWbStyle().then(style => {
      const kinds = new Map();
      for (const l of style.layers) {
        if (l.source !== 'wbg_borders' || l['source-layer'] !== BOUNDARY_LAYER) continue;
        const kind = kindOf(l.id);
        if (kind && l.filter?.[1] === '_symbol') kinds.set(l.filter[2], kind);
      }
      return { url: style.sources.wbg_borders.url.replace(/\/$/, ''), kinds };
    }).catch(err => { servicePromise = null; throw err; });
  }
  return servicePromise;
}

const tileCache = new Map();   // "z/y/x" -> Promise of decoded lines
function loadTile(service, z, x, y) {
  const key = `${z}/${y}/${x}`;
  if (!tileCache.has(key)) {
    tileCache.set(key, (async () => {
      const r = await fetchTile(`${service.url}/tile/${key}.pbf`, 'World Bank boundary tiles');
      if (r.status === 404 || r.status === 204) return [];   // empty ocean tile
      if (!r.ok) throw new Error(`World Bank boundary tiles: HTTP ${r.status}`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      return bytes.length ? decodeTile(bytes, x, y, z, service.kinds) : [];
    })().catch(err => { tileCache.delete(key); throw err; }));
  }
  return tileCache.get(key);
}

/** The Bank's ADM0 boundary lines over `bounds`, as { kind, coordinates }[]. */
async function loadBoundaries(bounds, mapZoom) {
  const service = await boundaryService();
  const z = Math.max(MIN_BOUNDARY_ZOOM, Math.min(MAX_BOUNDARY_ZOOM, Math.round(mapZoom) + 1));
  const tiles = tilesOver(bounds, z).map(({ x, y }) => loadTile(service, z, x, y));
  const seen = new Set(), out = [];
  for (const l of (await Promise.all(tiles)).flat()) {
    const c = JSON.stringify(l.coordinates), rc = JSON.stringify([...l.coordinates].reverse());
    const key = l.kind + (c < rc ? c : rc);
    if (!seen.has(key)) { seen.add(key); out.push(l); }
  }
  return out;
}

/**
 * d3 reads a ring's winding as which side is inside: clockwise exterior rings,
 * the reverse of GeoJSON (RFC 7946). Unconverted, every country would fill
 * the rest of the globe. Any polygon d3 sees as covering over half the sphere
 * gets its rings reversed.
 */
function forD3(feature) {
  const g = feature.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return feature;
  const fix = rings => (geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI
    ? rings.map(r => [...r].reverse()) : rings);
  const coordinates = g.type === 'Polygon' ? fix(g.coordinates) : g.coordinates.map(fix);
  return { ...feature, geometry: { type: g.type, coordinates } };
}

function hatchPattern(ctx, t) {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d');
  g.strokeStyle = t.isDark ? 'rgba(200,205,215,0.7)' : 'rgba(90,95,105,0.6)';
  g.lineWidth = 1;
  for (let d = -8; d <= 16; d += 4) { g.beginPath(); g.moveTo(d, 0); g.lineTo(d + 8, 8); g.stroke(); }
  return ctx.createPattern(c, 'repeat');
}

/** A longitude in [-180, 180] moved by a turn, if need be, to within 180 degrees of `centre`. */
const unwrap = (lng, centre) => (lng < centre - 180 ? lng + 360 : lng > centre + 180 ? lng - 360 : lng);

/**
 * The meridian the projection centres on: Greenwich, unless the view runs
 * across the antimeridian (Pacific SIDS, Fiji), which would otherwise be cut
 * at the frame's edge; then the view's own middle.
 */
function centralMeridian(bounds) {
  const w = bounds.getWest(), e = bounds.getEast();
  // Not brought back into [-180, 180]: frameFor() compares it with these bounds.
  return (w < -180 || e > 180) && e - w < 300 ? (w + e) / 2 : 0;
}

/**
 * The part of the world to frame: the whole sphere for a world-wide view,
 * otherwise the visible bounds.
 */
function frameFor(bounds, lon0) {
  const w = Math.max(lon0 - 180, bounds.getWest()), e = Math.min(lon0 + 180, bounds.getEast());
  const s = Math.max(-85, bounds.getSouth()), n = Math.min(85, bounds.getNorth());
  if (e - w >= 300) return { type: 'Sphere' };
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const lng = w + (e - w) * i / 16, lat = s + (n - s) * i / 16;
    pts.push([lng, s], [lng, n], [w, lat], [e, lat]);
  }
  return { type: 'MultiPoint', coordinates: pts };
}

// ── Country names ───────────────────────────────────────────────────────────

/** Interpolate a legacy `{stops}` / plain number text-size at `zoom`. */
function sizeAt(spec, zoom) {
  if (typeof spec === 'number') return spec;
  const stops = spec?.stops;
  if (!stops?.length) return 12;
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z0, v0] = stops[i - 1], [z1, v1] = stops[i];
    if (zoom <= z1) return v0 + (v1 - v0) * (zoom - z0) / (z1 - z0);
  }
  return stops.at(-1)[1];
}

/**
 * WB country names over `bounds`: label points from the Denominations tiles,
 * with the label classes the WB style shows at `zoom` (each class names its
 * own `_nameN` field and size).
 */
async function loadLabels(bounds, zoom) {
  const style = await fetchWbStyle();
  const url = style.sources.wbg_admin_labels?.url?.replace(/\/$/, '');
  if (!url) return [];
  const classes = withExtraAdm0Labels(style.layers).filter(l =>
    l.source === 'wbg_admin_labels' && l['source-layer'] === 'ADM0' && l.type === 'symbol'
    && (l.minzoom ?? 0) <= zoom && zoom < (l.maxzoom ?? 99) && l.filter?.[0] === '=='
  ).map(l => ({
    key: l.filter[1], value: l.filter[2],
    field: String(l.layout?.['text-field'] || '').replace(/[{}]/g, ''),
    size: adm0LabelSize(sizeAt(l.layout?.['text-size'], zoom)),
    upper: l.layout?.['text-transform'] === 'uppercase',
    only: adm0LabelsOnly(l),
  }));
  const z = Math.max(0, Math.min(9, Math.floor(zoom)));
  const out = [], seen = new Set();
  // All at once, then read in tile order, so the same name always wins.
  const tiles = await Promise.all(tilesOver(bounds, z).map(async ({ x, y }) => {
    const r = await fetchTile(`${url}/tile/${z}/${y}/${x}.pbf`, 'World Bank country-name tiles');
    return { x, y, bytes: r.ok ? new Uint8Array(await r.arrayBuffer()) : null };
  }));
  for (const { x, y, bytes } of tiles) {
    if (!bytes) continue;
    const layer = bytes.length && new VectorTile(new Pbf(bytes)).layers.ADM0;
    if (!layer) continue;
    const n = 2 ** z, extent = layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const cls = classes.find(c => f.properties[c.key] === c.value && f.properties[c.field]);
      if (!cls || f.type !== 1) continue;
      const text = String(f.properties[cls.field]);
      if (seen.has(text) || HIDDEN_ADM0_LABELS.includes(text) || (cls.only && !cls.only.includes(text))) continue;
      const [[p]] = f.loadGeometry();
      if (p.x < 0 || p.y < 0 || p.x > extent || p.y > extent) continue;   // tile buffer copy
      seen.add(text);
      out.push({
        text: cls.upper ? text.toUpperCase() : text, size: cls.size,
        italic: ITALIC_ADM0_LABELS.includes(text),
        coordinates: [(x + p.x / extent) / n * 360 - 180,
          Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + p.y / extent) / n))) * 180 / Math.PI],
      });
    }
  }
  return out.sort((a, b) => b.size - a.size);   // big names claim space first
}

/** The z tiles over `bounds`; columns past 180 either way wrap round. */
function tilesOver(bounds, z) {
  const n = 2 ** z;
  const w = bounds.getWest(), e = Math.min(bounds.getEast(), w + 360);
  const tx = lng => Math.floor((lng + 180) / 360 * n);
  const ty = lat => {
    const r = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180;
    return Math.min(n - 1, Math.max(0, Math.floor((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * n)));
  };
  const xs = new Set();
  for (let x = tx(w); x <= Math.min(tx(e), tx(w) + n - 1); x++) xs.add(((x % n) + n) % n);
  const out = [];
  for (let y = ty(bounds.getNorth()); y <= ty(bounds.getSouth()); y++)
    for (const x of xs) out.push({ x, y });
  return out;
}

function drawLabels(ctx, labels, projection, k, t, [[x0, y0], [x1, y1]]) {
  const placed = [];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const l of labels) {
    const pt = projection(l.coordinates);
    if (!pt) continue;
    const size = l.size * k * 0.8;
    ctx.font = `${l.italic ? 'italic ' : ''}400 ${size.toFixed(1)}px 'Open Sans', system-ui, sans-serif`;
    const w = ctx.measureText(l.text).width + size * 0.12 * l.text.length, h = size * 1.2;
    const box = [pt[0] - w / 2, pt[1] - h / 2, pt[0] + w / 2, pt[1] + h / 2];
    if (box[0] < x0 || box[2] > x1 || box[1] < y0 || box[3] > y1) continue;
    if (placed.some(b => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) continue;
    placed.push(box);
    ctx.letterSpacing = `${(size * 0.1).toFixed(1)}px`;
    ctx.strokeStyle = t.land; ctx.lineWidth = Math.max(2, size * 0.22);
    ctx.strokeText(l.text, pt[0], pt[1]);
    ctx.fillStyle = adm0LabelColor(t);
    ctx.fillText(l.text, pt[0], pt[1]);
  }
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ── Raster basemaps ─────────────────────────────────────────────────────────

/**
 * Render `canvasKind` ('detailed' | 'satellite') without names or boundaries
 * on an offscreen map covering `bounds`; returns its pixels and exact bounds.
 */
async function renderBasemap(wbBase, t, canvasKind, bounds) {
  // Size the offscreen map to the bounds' Mercator shape, so fitting them
  // leaves no margin to waste resolution on.
  const aspect = (bounds.getEast() - bounds.getWest()) * Math.PI / 180
    / (mercY(bounds.getNorth()) - mercY(bounds.getSouth()));
  const w = aspect >= 1 ? 2048 : Math.max(256, Math.round(2048 * aspect));
  const h = aspect >= 1 ? Math.max(256, Math.round(2048 / aspect)) : 2048;
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px;`;
  document.body.appendChild(div);
  const view = { ...DEFAULT_WB_VIEW, canvas: canvasKind, esriLabels: false, boundaries: false,
    countryNames: false, admin1: false, capitals: false };
  const m = new maplibregl.Map({
    container: div, style: buildWbStyle(wbBase, t, view), bounds, interactive: false,
    preserveDrawingBuffer: true, attributionControl: false, pixelRatio: 1, fadeDuration: 0,
    // Copies only for bounds across the antimeridian, which need the next one.
    renderWorldCopies: bounds.getWest() < -180 || bounds.getEast() > 180,
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Basemap render timed out')), 30000);
      m.once('idle', () => { clearTimeout(timer); resolve(); });
      m.once('error', e => { if (!m.loaded()) { clearTimeout(timer); reject(e.error || e); } });
    });
    const src = m.getCanvas();
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    return { pixels: g.getImageData(0, 0, c.width, c.height), bounds: m.getBounds() };
  } finally {
    m.remove();
    div.remove();
  }
}

/**
 * The lng/lat box the export frame shows, from its inverse-projected edges;
 * longitudes within 180 degrees of the central meridian `lon0`.
 */
function frameBounds(projection, [[x0, y0], [x1, y1]], lon0) {
  let w = lon0 + 180, e = lon0 - 180, s = 90, n = -90;
  for (let i = 0; i <= 40; i++) {
    const fx = x0 + (x1 - x0) * i / 40, fy = y0 + (y1 - y0) * i / 40;
    for (const pt of [[fx, y0], [fx, y1], [x0, fy], [x1, fy]]) {
      const ll = projection.invert(pt);
      if (!ll || !Number.isFinite(ll[0]) || Math.abs(ll[0]) > 180 || Math.abs(ll[1]) > 90) continue;
      const lng = unwrap(ll[0], lon0);
      w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, ll[1]); n = Math.max(n, ll[1]);
    }
  }
  return new maplibregl.LngLatBounds([Math.max(lon0 - 180, w), Math.max(-85, s)], [Math.min(lon0 + 180, e), Math.min(85, n)]);
}

const mercY = lat => Math.log(Math.tan(Math.PI / 4 + Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 360));

/**
 * Warp a Mercator raster into the projection. Inverse-projects a coarse grid
 * of output pixels and interpolates between them (the mapping is smooth), then
 * samples the source per pixel.
 */
function warpBasemap(ctx, { pixels, bounds }, projection, W, H, SCALE) {
  const OW = W * SCALE, OH = H * SCALE, STEP = 4;
  const gw = Math.ceil(OW / STEP) + 1, gh = Math.ceil(OH / STEP) + 1;
  const grid = new Float64Array(gw * gh * 2).fill(NaN);
  // Longitudes in the raster's own range: across the antimeridian invert()
  // jumps from 180 to -180, and interpolating over that jump would smear.
  const mid = (bounds.getWest() + bounds.getEast()) / 2;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const ll = projection.invert([gx * STEP / SCALE, gy * STEP / SCALE]);
    if (ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1])) {
      grid[(gy * gw + gx) * 2] = unwrap(ll[0], mid); grid[(gy * gw + gx) * 2 + 1] = ll[1];
    }
  }
  const { width: sw, height: sh, data: sd } = pixels;
  const west = bounds.getWest(), east = bounds.getEast();
  const yN = mercY(bounds.getNorth()), yS = mercY(bounds.getSouth());
  const out = new ImageData(OW, OH), od = out.data;
  for (let py = 0; py < OH; py++) {
    const gy = Math.min(gh - 2, Math.floor(py / STEP)), fy = py / STEP - gy;
    for (let px = 0; px < OW; px++) {
      const gx = Math.min(gw - 2, Math.floor(px / STEP)), fx = px / STEP - gx;
      const i00 = (gy * gw + gx) * 2, i10 = i00 + 2, i01 = i00 + gw * 2, i11 = i01 + 2;
      const lng = (grid[i00] * (1 - fx) + grid[i10] * fx) * (1 - fy) + (grid[i01] * (1 - fx) + grid[i11] * fx) * fy;
      const lat = (grid[i00 + 1] * (1 - fx) + grid[i10 + 1] * fx) * (1 - fy) + (grid[i01 + 1] * (1 - fx) + grid[i11 + 1] * fx) * fy;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      const sx = Math.floor((lng - west) / (east - west) * sw);
      const sy = Math.floor((yN - mercY(lat)) / (yN - yS) * sh);
      if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
      const si = (sy * sw + sx) * 4, oi = (py * OW + px) * 4;
      od[oi] = sd[si]; od[oi + 1] = sd[si + 1]; od[oi + 2] = sd[si + 2]; od[oi + 3] = 255;
    }
  }
  const c = document.createElement('canvas');
  c.width = OW; c.height = OH;
  c.getContext('2d').putImageData(out, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(c, 0, 0);
  ctx.restore();
}

// ── The page's own layers ───────────────────────────────────────────────────

const GEOM_TYPE = { Point: 1, MultiPoint: 1, LineString: 2, MultiLineString: 2, Polygon: 3, MultiPolygon: 3 };
const DRAWN = new Set(['fill', 'line', 'circle']);

function cssColor(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v.toString === 'function' && 'r' in v) return v.toString();
  return null;
}

/** A paint property of a live style layer, evaluated for one feature. */
function paint(styleLayer, prop, feature) {
  const v = styleLayer.paint?.get?.(prop);
  if (v == null) return undefined;
  return typeof v.evaluate === 'function' ? v.evaluate(feature, {}, undefined, []) : v;
}

/**
 * The layers a page added on top of the basemap, bottom to top, each with its
 * visible features: GeoJSON sources, and any other source the page gives a
 * loader for in sourceData (a tiled source holds no whole features to read).
 * The basemap's vector tiles are left out.
 */
async function pageLayers(map, sourceData = {}) {
  const zoom = map.getZoom();
  const data = new Map();
  const out = [];
  for (const spec of map.getStyle().layers) {
    if (!DRAWN.has(spec.type) || spec.layout?.visibility === 'none') continue;
    const src = map.getSource(spec.source);
    const load = src?.type === 'geojson' ? () => src.getData() : sourceData[spec.source];
    if (!load) continue;
    if (!data.has(spec.source)) data.set(spec.source, load().catch(() => null));
    const fc = await data.get(spec.source);
    const features = fc?.type === 'FeatureCollection' ? fc.features : fc?.type === 'Feature' ? [fc] : [];
    const filter = spec.filter ? featureFilter(spec.filter) : null;
    const styleLayer = map.getLayer(spec.id);
    const kept = [];
    for (const f of features) {
      if (!f?.geometry) continue;
      const ev = { type: GEOM_TYPE[f.geometry.type], properties: f.properties || {}, id: f.id };
      if (filter && !filter.filter({ zoom }, ev)) continue;
      kept.push({ f: spec.type === 'fill' ? forD3(f) : f, ev });
    }
    if (kept.length) out.push({ spec, styleLayer, features: kept, dash: spec.paint?.['line-dasharray'] });
  }
  return out;
}

function drawPageLayer(ctx, path, projection, layer, k, hatch) {
  const { spec, styleLayer, features, dash } = layer;
  for (const { f, ev } of features) {
    if (spec.type === 'fill') {
      const pattern = spec.paint?.['fill-pattern'];
      ctx.globalAlpha = paint(styleLayer, 'fill-opacity', ev) ?? 1;
      ctx.fillStyle = pattern ? hatch : (cssColor(paint(styleLayer, 'fill-color', ev)) || 'transparent');
      ctx.beginPath(); path(f); ctx.fill();
    } else if (spec.type === 'line') {
      const width = (paint(styleLayer, 'line-width', ev) ?? 1) * k;
      ctx.globalAlpha = paint(styleLayer, 'line-opacity', ev) ?? 1;
      ctx.strokeStyle = cssColor(paint(styleLayer, 'line-color', ev)) || '#000';
      const blur = (paint(styleLayer, 'line-blur', ev) ?? 0) * k;
      ctx.lineWidth = width;
      ctx.setLineDash(Array.isArray(dash) ? dash.map(d => d * width) : []);
      ctx.filter = blur > 0 ? `blur(${(blur / 2).toFixed(1)}px)` : 'none';
      ctx.beginPath(); path(f); ctx.stroke();
      ctx.filter = 'none';
    } else {
      const r = (paint(styleLayer, 'circle-radius', ev) ?? 5) * k;
      const opacity = paint(styleLayer, 'circle-opacity', ev) ?? 1;
      const strokeW = (paint(styleLayer, 'circle-stroke-width', ev) ?? 0) * k;
      const fill = cssColor(paint(styleLayer, 'circle-color', ev)) || '#000';
      const stroke = cssColor(paint(styleLayer, 'circle-stroke-color', ev));
      const coords = f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const c of coords) {
        const pt = projection(c);
        if (!pt) continue;
        ctx.beginPath(); ctx.arc(pt[0], pt[1], Math.max(0.5, r), 0, Math.PI * 2);
        ctx.globalAlpha = opacity; ctx.fillStyle = fill; ctx.fill();
        if (strokeW > 0 && stroke) {
          ctx.globalAlpha = paint(styleLayer, 'circle-stroke-opacity', ev) ?? 1;
          ctx.strokeStyle = stroke; ctx.lineWidth = strokeW; ctx.setLineDash([]); ctx.stroke();
        }
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

// ── Export ──────────────────────────────────────────────────────────────────

/**
 * @param {import('maplibre-gl').Map} map  the page's live map
 * @param {object} o
 * @param {object} o.t          active theme
 * @param {string} o.title
 * @param {'clean'|'detailed'|'satellite'} [o.basemap]
 * @param {boolean} [o.labels]  WB country names
 * @param {{color: string, alpha?: number, label: string, shape?: 'square'|'circle'|'line'}[]} [o.legend]
 *   swatches are blended over the land colour at `alpha`, as on the map
 * @returns {Promise<Blob>}
 */
export async function exportEqualEarthPng(map, { t, title, basemap = 'clean', labels = false, legend = [], sourceData }) {
  const bounds = map.getBounds(), zoom = map.getZoom();
  // The map area keeps the on-screen map's shape, so the export frames what
  // the user sees rather than padding it out with more of the world.
  const SCALE = 2, TOP = 56, BOTTOM = 44, PAD = 24, MAX_W = 1552, MAX_H = 1400, MIN_H = 520;
  const { clientWidth: cw, clientHeight: ch } = map.getContainer();
  let aw = MAX_W, ah = Math.round(MAX_W * ch / cw);
  if (ah > MAX_H) { aw = Math.round(MAX_H * cw / ch); ah = MAX_H; }
  ah = Math.max(MIN_H, ah);
  const W = Math.max(aw + 2 * PAD, 900), H = ah + TOP + BOTTOM;
  const area = [[(W - aw) / 2, TOP], [(W + aw) / 2, TOP + ah]];
  const [boundaries, layers, names, land, wbBase] = await Promise.all([
    loadBoundaries(bounds, zoom), pageLayers(map, sourceData),
    labels ? loadLabels(bounds, zoom) : [],
    basemap === 'clean' ? fetchGeo('world') : null,
    basemap === 'clean' ? null : fetchWbStyle(),
    // A canvas draws with whatever font is already loaded, so load the weights
    // the export writes in before painting, or its text falls back silently.
    Promise.all(['400', '600', '700'].map(w => document.fonts.load(`${w} 12px 'Open Sans'`))).catch(() => {}),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = t.panel;
  ctx.fillRect(0, 0, W, H);

  const lon0 = centralMeridian(bounds);
  const frame = frameFor(bounds, lon0);
  const projection = geoEqualEarth().rotate([-lon0, 0]).fitExtent(area, frame).clipExtent(area);
  const path = geoPath(projection, ctx);
  // Symbol and line sizes follow the on-screen map, scaled to the export.
  const k = Math.max(0.8, Math.min(2.5, aw / cw));

  // 1. Basemap.
  ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = t.bg; ctx.fill();
  if (basemap === 'clean') {
    ctx.fillStyle = t.land;
    for (const f of land.features) { ctx.beginPath(); path(forD3(f)); ctx.fill(); }
  } else {
    const raster = await renderBasemap(wbBase, t, basemap, frameBounds(projection, area, lon0));
    const [[x0, y0], [x1, y1]] = area;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.clip();
    warpBasemap(ctx, raster, projection, W, H, SCALE);
    ctx.restore();
  }

  // 2. The page's layers, in their on-screen order.
  const hatch = hatchPattern(ctx, t);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const layer of layers) drawPageLayer(ctx, path, projection, layer, k, hatch);

  // 3. WB boundaries over everything the page drew, as on screen.
  ctx.strokeStyle = basemap === 'satellite' ? 'rgba(255,255,255,0.85)' : t.worldBdr;
  for (const kind of ['solid', 'dashed', 'dotted']) {
    const width = kind === 'dotted' ? 1.4 : 0.7;
    ctx.lineWidth = width;
    ctx.setLineDash(DASHES[kind] ? DASHES[kind].map(d => d * width) : []);
    ctx.beginPath();
    for (const l of boundaries) if (l.kind === kind) path({ type: 'LineString', coordinates: l.coordinates });
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 4. Country names.
  if (names.length) drawLabels(ctx, names, projection, Math.min(k, 1.6), t, area);

  if (frame.type === 'Sphere') {
    ctx.beginPath(); path({ type: 'Sphere' });
    ctx.strokeStyle = t.panelBorder; ctx.lineWidth = 1; ctx.stroke();
  }

  // Title, legend, disclaimer.
  ctx.fillStyle = t.lbl;
  ctx.font = "600 20px 'Open Sans', system-ui, sans-serif";
  ctx.fillText(title, PAD, 34);
  ctx.fillStyle = t.muted;
  ctx.font = "12px 'Open Sans', system-ui, sans-serif";
  ctx.fillText('Equal Earth projection', PAD, 50);
  if (legend.length) {
    ctx.font = "12px 'Open Sans', system-ui, sans-serif";
    const rowH = 18;
    const boxW = Math.max(160, ...legend.map(i => ctx.measureText(i.label).width + 46));
    const boxH = legend.length * rowH + 16;
    const x = PAD + 8, y = H - BOTTOM - boxH - 8;
    ctx.fillStyle = t.panel; ctx.strokeStyle = t.panelBorder; ctx.lineWidth = 1;
    ctx.fillRect(x, y, boxW, boxH); ctx.strokeRect(x, y, boxW, boxH);
    legend.forEach((item, i) => {
      const ry = y + 8 + i * rowH, cx = x + 15, cy = ry + 9;
      if (item.shape === 'circle') {
        ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fillStyle = item.color; ctx.fill();
      } else if (item.shape === 'line') {
        ctx.beginPath(); ctx.moveTo(cx - 7, cy); ctx.lineTo(cx + 7, cy);
        ctx.strokeStyle = item.color; ctx.lineWidth = 2.5; ctx.stroke();
      } else {
        ctx.fillStyle = t.land; ctx.fillRect(cx - 5.5, cy - 5.5, 11, 11);
        ctx.globalAlpha = item.alpha ?? 1;
        ctx.fillStyle = item.color; ctx.fillRect(cx - 5.5, cy - 5.5, 11, 11);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = t.text; ctx.fillText(item.label, x + 30, ry + 13);
    });
  }
  ctx.fillStyle = t.muted;
  ctx.font = "10px 'Open Sans', system-ui, sans-serif";
  const source = basemap === 'satellite' ? ' Imagery: Esri, Maxar, Earthstar Geographics.' : basemap === 'detailed' ? ' Basemap: Esri.' : '';
  ctx.fillText('The boundaries, colors, denominations, and other information shown on any map in this work do not imply any judgment on the part of the World Bank', PAD, H - 24);
  ctx.fillText(`concerning the legal status of any territory or the endorsement or acceptance of such boundaries. Boundaries: World Bank GAD.${source} Regional Power Explorer (pilot).`, PAD, H - 11);

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG export unavailable'))), 'image/png'));
}

/** Save a Blob as a file. */
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
