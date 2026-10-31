import { dataPath } from '../utils/paths';
import { fetchData } from '../utils/dataCache';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { track } from '../analytics';
import maplibregl from 'maplibre-gl';
import { Protocol, PMTiles } from 'pmtiles';
import { useTheme } from '../App';
import {
  getT, FUEL_COLORS, VOLTAGE_BRACKETS, kvFilterWithFloor, bracketFor, LINE_ATTR_LABELS, lineAttrText, linePopupHTML, visibleLineFeatures, linesToCSV, linesToDownloadGeoJSON,
  plantRadiusExpr, lcRadiusExpr, fuelColorExpr, PLANT_STATUSES, zoneColorExpr, adaptiveMinMw,
  PANEL_WIDTH_MIN, PANEL_WIDTH_DEFAULT, PANEL_WIDTH_MAX,
} from '../constants';
import LayerPanel from '../components/LayerPanel';
import MapChat from '../chat/LazyMapChat';
import ExportControl from '../components/ExportControl';
import WorldButton from '../components/WorldButton';
import { powerLegend } from '../utils/exportLegend';
import CapacityChart from '../components/CapacityChart';
import StatsPanel from '../components/StatsPanel';
import RegionSupplyTrade from '../components/RegionSupplyTrade';
import MetaRegionPage from './MetaRegionPage';
import { buildWbStyle, applyWbView, useWbStyleBase, DEFAULT_WB_VIEW, MAP_LABEL_FONT } from '../utils/wbStyle';
import { fetchBboxes, fetchNdlsa, boundsFor, prefetchGeo, addGeoSource, countryLayer, featureTarget, regionFilter, addNdlsaLayer, raiseBoundaries, fillAnchor } from '../utils/basemap';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build the MapLibre filter for a status layer, respecting fuel/country visibility and minMw. */
function makeLayerFilter(status, fuelsOff, minMw, visibleIsos = null) {
  const clauses = [
    ['==', ['get', 'status'], status],
    ['>=', ['get', 'mw'], minMw],
  ];
  if (fuelsOff.size > 0)
    clauses.push(['!', ['in', ['get', 'fuel'], ['literal', [...fuelsOff]]]]);
  if (visibleIsos !== null)
    clauses.push(['in', ['get', 'country'], ['literal', visibleIsos]]);
  return ['all', ...clauses];
}

function lineKm(coords) {
  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1], [lon2, lat2] = coords[i];
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    km += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return km;
}

/** A line's two ends. A tile holds only its piece of the line, so a tiled
 *  line's true ends come from its attributes, x0 y0 x1 y1. */
function lineEnds(p, feat) {
  if (p.x0 != null) return [[p.x0, p.y0], [p.x1, p.y1]];
  const g = feat.geometry;
  const coords = g.type === 'LineString' ? g.coordinates : g.coordinates.flat();
  return [coords[0], coords[coords.length - 1]];
}

function downloadBlob(content, filename, type = 'application/octet-stream') {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Row({ label, value, t }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginBottom:3 }}>
      <span style={{ color: t.lblMuted, flexShrink:0 }}>{label}</span>
      <span style={{ color: t.lbl, fontWeight:600, textAlign:'right' }}>{value}</span>
    </div>
  );
}

// Map layers behind each corridor toggle.
const CORRIDOR_LAYERS = {
  Existing:  ['region-corridors-ex', 'region-corridors-labels', 'region-corridors-dots'],
  Committed: ['region-corridors-committed', 'region-corridors-dots'],
  Candidate: ['region-corridors-candidate', 'region-corridors-dots'],
};

// What the page needs to know about its plant and line files without reading
// them: written by tools/prepare_region_summary.py. With it the big files go to
// MapLibre by URL and are parsed in its worker; Europe's lines are 21 MB, and
// reading them here and copying them to the worker froze the page for about
// a second on a desktop. Without one (a region not yet summarised) the page
// reads the files itself, as before.
const fetchSummary = regionId => fetchData(dataPath(`cache/region_summary_${regionId}.json`)).catch(() => null);
const SOURCE_KEY = { '': 'osm', _gppd: 'gppd', _gem: 'gem' };
const SOURCE_SUFFIX = { osm: '', gppd: '_gppd', gem: '_gem' };
const absUrl = path => new URL(path, window.location.href).href;

// Download a file the map will fetch for itself, so the browser has it to
// hand; the bytes are kept, never parsed.
function warm(path) {
  fetch(path).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => {});
}

/** Default min-MW, fuels present and plant count, from a summary or a parsed file. */
function plantFacts(facts, fc) {
  const mws = facts ? facts.top_mw : fc.features.map(f => f.properties.mw || 0);
  return {
    // Cap the map to the ~150 largest plants, 0 if fewer.
    adaptMin: adaptiveMinMw(mws.map(mw => ({ properties: { mw } })), 150),
    fuels: new Set((facts ? facts.fuels : fc.features.map(f => f.properties.fuel)).filter(f => FUEL_COLORS[f])),
    count: facts ? facts.count : fc.features.length,
  };
}

// Vector tiles of a region's lines (tools/prepare_line_tiles.py), one layer
// "lines", read straight from a static .pmtiles file by range requests.
const linesTiles = regionId => absUrl(dataPath(`tiles/region_lines_${regionId}.pmtiles`));
// The rest of each tiled line, row n-1 for feature id n: name, operator,
// length, ends... -- kept out of the tiles, which they made 4x larger.
const linesAttrs = regionId => dataPath(`tiles/region_lines_${regionId}_attrs.json`);
function attrsProps(attrs, feat) {
  const row = attrs.rows[feat.id - 1] || [];
  const p = { v: feat.properties.v };
  attrs.keys.forEach((k, i) => { if (row[i] != null) p[k] = row[i]; });
  return p;
}
let protocol = null;
function pmtilesProtocol() {
  if (!protocol) {
    protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  }
  return protocol;
}
// Read a tile file's header and directory now, so that once the map asks for
// tiles it waits on the tiles alone and not on two round trips before them.
function warmTiles(url) {
  const p = pmtilesProtocol();
  if (!p.get(url)) p.add(new PMTiles(url));
  p.get(url).getHeader().catch(() => {});
}

// A big file's first pass: what the map shows at first, cut from it by
// tools/prepare_region_summary.py. The summary flags the ones that exist.
const firstPass = file => file.replace('.geojson', '_first.geojson');

// Draw a source's first-pass file, then swap in the full one once that is on
// screen. Sent together, the full file would hold up the worker drawing the
// first. A first pass that fails to load still ends in the full file.
// keep() is asked before the swap; false skips it.
async function setDataInStages(map, id, first, full, keep) {
  await map.getSource(id)?.setData(first, true);
  await new Promise(resolve => {
    const drawn = () => {
      if (!map.getSource(id) || !map.isSourceLoaded(id)) return;
      map.off('sourcedata', drawn);
      map.off('idle', drawn);
      resolve();
    };
    map.on('sourcedata', drawn);
    map.on('idle', drawn);
    drawn();
  });
  if (keep()) map.getSource(id)?.setData(full);
}

// The region's map data files, in the order the map handler reads them.
function regionDataFiles(regionId) {
  return [
    `cache/region_plants_${regionId}.geojson`,
    `cache/region_lines_${regionId}.geojson`,
    `cache/region_substations_${regionId}.geojson`,
    `region_load_centers_${regionId}.geojson`,
  ];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RegionPage() {
  const { regionId } = useParams();
  const { theme }    = useTheme();
  const t            = getT(theme);
  const navigate     = useNavigate();

  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const isDrRef      = useRef(false);
  const drStartX     = useRef(0);
  const drStartW     = useRef(0);

  const [region,        setRegion]        = useState(null);
  const [capacity,      setCapacity]      = useState(null);
  const [tariffs,       setTariffs]       = useState(null);
  const [fleetAge,      setFleetAge]      = useState(null);
  const [access,        setAccess]        = useState(null);
  const [gppdAvailable, setGppdAvailable] = useState(null);
  const [gemAvailable,  setGemAvailable]  = useState(null);
  const [presentFuels,  setPresentFuels]  = useState(new Set());
  const [fuelsOff,      setFuelsOff]      = useState(new Set());
  const [statusOff,     setStatusOff]     = useState(new Set(['planned']));
  const [kvsOff,        setKvsOff]        = useState(new Set());
  const [linesOn,       setLinesOn]       = useState(true);
  const [plantsOn,      setPlantsOn]      = useState(true);
  const [subsOn,          setSubsOn]          = useState(false);
  const [loadCentersOn,   setLoadCentersOn]   = useState(false);
  const [lcMinPop,        setLcMinPop]        = useState(300_000);
  const [lcCircleScale,   setLcCircleScale]   = useState(1.0);
  const [minMw,           setMinMw]           = useState(100);
  const [minKv,            setMinKv]            = useState(0);
  const [kvFloor,          setKvFloor]          = useState(110);
  const [presentKvs,       setPresentKvs]       = useState(null);
  const [circleScale,     setCircleScale]     = useState(1.0);
  const [plantSource,     setPlantSource]     = useState('gem');
  const plantSourceRef = useRef(plantSource); // what a rebuilt map starts on
  plantSourceRef.current = plantSource;
  const plantsShownRef = useRef(null);        // the source in the map's 'plants'
  const [mapReady,        setMapReady]        = useState(false);
  const [panelWidth,      setPanelWidth]      = useState(PANEL_WIDTH_DEFAULT);
  const [selFeature,      setSelFeature]      = useState(null);
  const [activeTab,       setActiveTab]       = useState('overview');
  const [wbView,          setWbView]          = useState(DEFAULT_WB_VIEW);
  const wbViewRef = useRef(wbView);   // what a rebuilt map (theme change) starts from
  const wbBase = useWbStyleBase();
  const [mapMode,         setMapMode]         = useState('countries');
  const [zonesAvailable,  setZonesAvailable]  = useState(false);
  const [corrExistOn,     setCorrExistOn]     = useState(false);
  const [corrCommOn,      setCorrCommOn]      = useState(false);
  const [corrCandOn,      setCorrCandOn]      = useState(false);
  const [zoningConfigs,   setZoningConfigs]   = useState([]);
  const [selectedSlug,    setSelectedSlug]    = useState(null);
  const [countriesOff,    setCountriesOff]    = useState(new Set());
  const [plantCount,      setPlantCount]      = useState(null);
  const [tradeSnapshot,   setTradeSnapshot]   = useState(null);
  const [isMobile,        setIsMobile]        = useState(() => window.innerWidth < 700);
  const [layerPanelOpen,  setLayerPanelOpen]  = useState(false);
  const [sheetHeight,     setSheetHeight]     = useState(96);
  const [isDragging,      setIsDragging]      = useState(false);
  const dragRef = useRef(null);

  useEffect(() => {
    prefetchGeo('region', regionId);
    // Start the map data now, alongside the basemap. Plants and lines go to the
    // map by URL when the region has a summary, so they are only warmed in the
    // browser's cache -- the files drawn first, which for a big region is its
    // first pass; the small files go through the data cache.
    const [plantsFile, linesFile, subsFile, lcFile] = regionDataFiles(regionId);
    fetchSummary(regionId).then(summary => {
      if (!summary) {
        for (const p of [plantsFile, linesFile]) fetchData(dataPath(p)).catch(() => {});
        return;
      }
      const source = summary.plants[plantSourceRef.current] ? plantSourceRef.current : 'osm';
      const plants = `cache/region_plants_${regionId}${SOURCE_SUFFIX[source]}.geojson`;
      warm(dataPath(summary.plants[source]?.first ? firstPass(plants) : plants));
      // Tiled lines fetch only the tiles in view; their header comes now.
      if (summary.lines?.tiles) warmTiles(linesTiles(regionId));
      else warm(dataPath(summary.lines?.first ? firstPass(linesFile) : linesFile));
    });
    for (const p of [subsFile, lcFile]) fetchData(dataPath(p)).catch(() => {});
  }, [regionId]);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    function onMove(e) {
      if (!dragRef.current) return;
      e.preventDefault();
      const dy = dragRef.current.startY - e.touches[0].clientY;
      const max = window.innerHeight - 56;
      const newH = Math.max(96, Math.min(max, dragRef.current.startH + dy));
      dragRef.current.currentH = newH;
      setSheetHeight(newH);
    }
    function onEnd() {
      if (!dragRef.current) return;
      const h = dragRef.current.currentH;
      dragRef.current = null;
      setIsDragging(false);
      const snaps = [96, Math.round(window.innerHeight * 0.5), window.innerHeight - 56];
      setSheetHeight(snaps.reduce((a, b) => Math.abs(b - h) < Math.abs(a - h) ? b : a));
    }
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isMobile]);

  useEffect(() => {
    setTimeout(() => mapRef.current?.resize(), 260);
  }, [sheetHeight, isMobile]);

  // Static data
  useEffect(() => {
    fetchData(dataPath('tariffs.json')).then(setTariffs).catch(() => {});
    fetchData(dataPath('access.json')).then(setAccess).catch(() => {});
  }, []);

  // Region metadata + availability checks
  useEffect(() => {
    fetchData(dataPath('regions.json')).then(d => {
      const r = (d.regions || []).find(r => r.id === regionId);
      setRegion(r || null);
    });
    setCapacity(null); setFleetAge(null);
    fetchData(dataPath(`cache/region_capacity_${regionId}.json`)).then(setCapacity).catch(() => {});
    setFuelsOff(new Set()); setStatusOff(new Set()); setKvsOff(new Set());
    setLinesOn(true); setPlantsOn(true); setSubsOn(false);
    setLoadCentersOn(false); setLcMinPop(300_000); setLcCircleScale(1.0);
    setMinMw(100); setCircleScale(1.0);
    setPlantSource('gem'); setActiveTab('overview');
    track('region_view', { region: regionId });

    setMapMode('countries'); setZonesAvailable(false);
    setCorrExistOn(false); setCorrCommOn(false); setCorrCandOn(false);
    setZoningConfigs([]); setSelectedSlug(null);
    setCountriesOff(new Set()); setPlantCount(null);
    fetchData(dataPath(`zones/${regionId}_configs.json`)).catch(() => null)
      .then(cfgs => {
        if (cfgs?.length) {
          setZoningConfigs(cfgs);
          setSelectedSlug(cfgs[0].slug);
          setZonesAvailable(true);
        }
      })
      .catch(() => {});

    setGppdAvailable(null);
    fetch(dataPath(`cache/region_plants_${regionId}_gppd.geojson`), { method: 'HEAD' })
      .then(r => setGppdAvailable(r.ok)).catch(() => setGppdAvailable(false));

    setGemAvailable(null);
    fetch(dataPath(`cache/region_plants_${regionId}_gem.geojson`), { method: 'HEAD' })
      .then(r => setGemAvailable(r.ok)).catch(() => setGemAvailable(false));
  }, [regionId]);

  // Fleet age — GPPD only
  useEffect(() => {
    setFleetAge(null);
    if (plantSource !== 'gppd') return;
    fetchData(dataPath(`cache/region_age_${regionId}_gppd.json`)).catch(() => null).then(setFleetAge).catch(() => {});
  }, [plantSource, regionId]);

  // Plant count for overview stats
  useEffect(() => {
    const suffix = plantSource === 'gppd' ? '_gppd' : plantSource === 'gem' ? '_gem' : '';
    fetchSummary(regionId).then(async summary => {
      const facts = summary?.plants?.[SOURCE_KEY[suffix]];
      const fc = facts ? null : await fetchData(dataPath(`cache/region_plants_${regionId}${suffix}.geojson`));
      setPlantCount(plantFacts(facts, fc).count);
    }).catch(() => {});
  }, [regionId, plantSource]);

  // R1 — cross-border integration snapshot (built from per-country trade files)
  useEffect(() => {
    if (!region) return;
    setTradeSnapshot(null);
    let cancelled = false;
    const isos = region.countries.map(c => c.iso);
    Promise.all(isos.map(iso =>
      fetchData(dataPath(`trade/${iso}.json`)).catch(() => null),
    )).then(results => {
      if (cancelled) return;
      let withData = 0, isolated = 0, netExp = 0, netImp = 0, tradedGwh = 0, tradeYear = null;
      for (const d of results) {
        if (!d) continue;                       // no file → data gap (not counted)
        if (d.status) { isolated++; continue; }  // documented "none"/"merged"
        const imp = d.imports || {}, exp = d.exports || {};
        if (Object.keys(imp).length === 0 && Object.keys(exp).length === 0) continue;
        withData++;
        // Net position over the whole series (more stable than a single year)
        const sImp = Object.values(imp).reduce((s, a) => s + a.reduce((x, y) => x + (y || 0), 0), 0);
        const sExp = Object.values(exp).reduce((s, a) => s + a.reduce((x, y) => x + (y || 0), 0), 0);
        if (sExp >= sImp) netExp++; else netImp++;
        // Volume traded: sum each member's latest-year imports (each cross-border
        // inflow counted once → avoids double-counting intra-region pairs).
        const li = (d.years?.length || 1) - 1;
        tradedGwh += Object.values(imp).reduce((s, a) => s + (a[li] || 0), 0);
        const yr = d.years?.[li];
        if (yr && (tradeYear === null || yr > tradeYear)) tradeYear = yr;
      }
      setTradeSnapshot({ withData, isolated, total: isos.length, netExp, netImp, tradedGwh, tradeYear });
    });
    return () => { cancelled = true; };
  }, [region]);

  // Country filter — reapply all plant filters when countriesOff changes
  useEffect(() => {
    const map = mapRef.current;
    // map.getLayer() reads map.style internally, which is undefined until the
    // map's 'load' event fires — calling it any earlier throws inside
    // maplibre-gl itself (not something a null-check on `map` catches), which
    // this effect can easily do since it also re-runs whenever `region` changes.
    if (!map?.isStyleLoaded() || !map.getLayer('plants-operating') || !region) return;
    const visibleIsos = countriesOff.size > 0
      ? region.countries.map(c => c.iso).filter(iso => !countriesOff.has(iso))
      : null;
    for (const s of PLANT_STATUSES)
      if (map.getLayer(`plants-${s}`))
        map.setFilter(`plants-${s}`, makeLayerFilter(s, fuelsOff, minMw, visibleIsos));
  }, [countriesOff, fuelsOff, minMw, region]);

  // Map initialisation
  useEffect(() => {
    if (!containerRef.current || !region || !wbBase) return;

    const isos = region.countries.map(c => c.iso);
    const tv = getT(theme);

    let disposed = false;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildWbStyle(wbBase, tv, wbViewRef.current),
      center: [0, 20], zoom: 2, minZoom: 1, maxZoom: 14,
      attributionControl: false,
    });
    mapRef.current = map;
    // Frame the region as soon as the (small, cached) bbox file is in, not
    // after the style and every data layer have loaded -- otherwise the page
    // sits on the zoom-2 world view for the whole download.
    fetchBboxes().then(bboxes => {
      const bounds = boundsFor(bboxes, 'regions', regionId, 0.5);
      if (!disposed && bounds) map.fitBounds(bounds, { padding: 40, duration: 0 });
    }).catch(err => console.error('bboxes', err));

    const popup = new maplibregl.Popup({
      closeButton: false, closeOnClick: false, offset: 10,
      className: `popup-${theme}`,
    });

    // On the style, not 'load': 'load' waits for every basemap tile and font to
    // arrive and draw. The region's colours go on as soon as its geometry is in;
    // plants, lines, substations and load centres start empty and fill in as
    // each file arrives (see the end of this handler), so the largest file --
    // Europe's lines, 21 MB -- holds up nothing but its own layer.
    map.once('style.load', async () => {
      const [mode, ndlsa, summary] = await Promise.all([
        addGeoSource(map, 'region', regionId, () => disposed),
        fetchNdlsa(),
        fetchSummary(regionId),
      ]);

      if (disposed || !mode) return;

      const hl = tv.highlight;
      const empty = () => ({ type: 'FeatureCollection', features: [] });
      map.addSource('plants',       { type: 'geojson', data: empty() });
      // Tiled lines load the tiles in view; the rest come as one file below.
      const tiled = !!summary?.lines?.tiles;
      if (tiled) {
        pmtilesProtocol();
        map.addSource('lines', { type: 'vector', url: `pmtiles://${linesTiles(regionId)}` });
      } else map.addSource('lines', { type: 'geojson', data: empty() });
      map.addSource('substations',  { type: 'geojson', data: empty() });
      map.addSource('load-centers', { type: 'geojson', data: empty() });


      // Transmission lines
      for (const bracket of VOLTAGE_BRACKETS) {
        const { colors, width, key } = bracket;
        map.addLayer({ id: `lines-${key}`, type: 'line', source: 'lines',
          ...(tiled && { 'source-layer': 'lines' }),
          filter: kvFilterWithFloor(bracket, minKv),
          paint: { 'line-color': colors[theme] ?? colors.fog, 'line-width': width,
            'line-opacity': tv.isDark ? 0.92 : 0.65 } });
      }


      // Region highlight
      map.addLayer({ id: 'region-fill', type: 'fill', ...countryLayer(mode),
        filter: regionFilter(isos),
        paint: { 'fill-color': hl.fill,
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.18, 0.08] } }, fillAnchor(map));
      // No outline of our own: the WB boundary lines drawn on top are the
      // borders, and a generalised polygon edge beside them reads as a double line.
      // Member countries take the highlight; a non-determined area between a
      // member and a non-member comes out at half strength, see ndlsaFill().
      addNdlsaLayer(map, { ndlsa, colorForIso: iso => (isos.includes(iso) ? hl.fill : null),
        opacity: 0.08, before: fillAnchor(map), t: tv, mode });


      // Preferred zones overlay (hidden until mapMode === 'zones')
      const emptyGJ = { type: 'FeatureCollection', features: [] };
      map.addSource('region-zones',         { type: 'geojson', data: emptyGJ });
      map.addSource('region-corridors-src', { type: 'geojson', data: emptyGJ });
      map.addSource('region-centroids-src', { type: 'geojson', data: emptyGJ });

      const zoneLayerPaint = {
        fill:   { 'fill-color': zoneColorExpr(), 'fill-opacity': 0.35 },
        border: { 'line-color': tv.isDark ? '#bbb' : '#444', 'line-width': 0.9, 'line-opacity': 0.5 },
      };
      map.addLayer({ id: 'region-zones-fill',   type: 'fill', source: 'region-zones',
        layout: { visibility: 'none' }, paint: zoneLayerPaint.fill });
      map.addLayer({ id: 'region-zones-border', type: 'line', source: 'region-zones',
        layout: { visibility: 'none' },
        paint: zoneLayerPaint.border });

      // Corridor capacity lines for preferred zone view
      const mwWidthExpr     = (field) => ['interpolate', ['linear'], ['coalesce', ['get', field], 0], 0, 1.5, 500, 3.0, 2000, 6.0];
      const hasNtcField     = (field) => ['>', ['coalesce', ['get', field], 0], 0];
      map.addLayer({
        id: 'region-corridors-ex', type: 'line', source: 'region-corridors-src',
        filter: hasNtcField('mw_existing'),
        layout: { visibility: 'none' },
        paint: { 'line-color': '#1a5fa8', 'line-width': mwWidthExpr('mw_existing'), 'line-opacity': 0.85 },
      });
      map.addLayer({
        id: 'region-corridors-committed', type: 'line', source: 'region-corridors-src',
        filter: hasNtcField('mw_committed'),
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#e07b00', 'line-width': mwWidthExpr('mw_committed'), 'line-opacity': 0.85, 'line-dasharray': [6, 3] },
      });
      map.addLayer({
        id: 'region-corridors-candidate', type: 'line', source: 'region-corridors-src',
        filter: hasNtcField('mw_candidate'),
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#555', 'line-width': mwWidthExpr('mw_candidate'), 'line-opacity': 0.7, 'line-dasharray': [2, 4] },
      });
      map.addLayer({
        id: 'region-corridors-labels', type: 'symbol', source: 'region-corridors-src',
        filter: ['>', ['coalesce', ['get', 'mw'], 0], 0],
        layout: {
          visibility: 'none',
          'text-font': MAP_LABEL_FONT, 'text-field': ['get', 'label'],
          'text-size': 9,
          'symbol-placement': 'line-center',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#1a5fa8',
          'text-halo-color': 'rgba(255,255,255,0.9)',
          'text-halo-width': 1.5,
        },
      });
      map.addLayer({
        id: 'region-corridors-dots', type: 'circle', source: 'region-centroids-src',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 4, 'circle-color': '#696969',
          'circle-opacity': 0.75,
          'circle-stroke-width': 1.2, 'circle-stroke-color': 'rgba(255,255,255,0.7)',
        },
      });

      // ── Plant layers (3 status layers, data-driven fuel color) ───────────
      // Their min-MW filter is set once the plant file is in (below).
      const colorExpr = fuelColorExpr();

      // Operating: filled circles
      map.addLayer({ id: 'plants-operating', type: 'circle', source: 'plants',
        filter: makeLayerFilter('operating', new Set(), 0),
        paint: {
          'circle-radius':       plantRadiusExpr(),
          'circle-color':        colorExpr,
          'circle-opacity':      0.88,
          'circle-stroke-width': 0.6,
          'circle-stroke-color': 'rgba(0,0,0,0.3)',
        },
      });

      // Under construction: hollow ring
      map.addLayer({ id: 'plants-construction', type: 'circle', source: 'plants',
        filter: makeLayerFilter('construction', new Set(), 0),
        paint: {
          'circle-radius':         plantRadiusExpr(),
          'circle-color':          'rgba(0,0,0,0)',
          'circle-opacity':        1,
          'circle-stroke-width':   2,
          'circle-stroke-color':   colorExpr,
          'circle-stroke-opacity': 0.9,
        },
      });

      // Planned: faint filled + thin stroke — hidden by default (statusOff init)
      map.addLayer({ id: 'plants-planned', type: 'circle', source: 'plants',
        filter: makeLayerFilter('planned', new Set(), 0),
        layout: { visibility: 'none' },
        paint: {
          'circle-radius':         plantRadiusExpr(),
          'circle-color':          colorExpr,
          'circle-opacity':        0.22,
          'circle-stroke-width':   1,
          'circle-stroke-color':   colorExpr,
          'circle-stroke-opacity': 0.45,
        },
      });

      // Hover popups for each status layer
      for (const status of PLANT_STATUSES) {
        map.on('mouseenter', `plants-${status}`, e => {
          map.getCanvas().style.cursor = 'pointer';
          const p = e.features[0].properties;
          const name   = p.name ? `<b>${p.name}</b><br>` : '';
          const mwText = p.mw   ? ` · ${p.mw} MW` : '';
          const badge  = status !== 'operating'
            ? ` <span style="opacity:.55;font-size:.85em">[${status}]</span>` : '';
          popup.setLngLat(e.features[0].geometry.coordinates)
            .setHTML(`${name}<span style="opacity:.75">${p.fuel}${mwText}${badge}</span>`)
            .addTo(map);
        });
        map.on('mouseleave', `plants-${status}`, () => {
          map.getCanvas().style.cursor = ''; popup.remove();
        });
      }

      // Substations
      const sqSz = 5;
      const sqData = new Uint8Array(sqSz * sqSz * 4);
      for (let i = 0; i < sqSz * sqSz; i++) {
        sqData[i*4] = 105; sqData[i*4+1] = 105; sqData[i*4+2] = 105;
        sqData[i*4+3] = tv.isDark ? 160 : 130;
      }
      map.addImage('sub-sq', { width: sqSz, height: sqSz, data: sqData });
      map.addLayer({ id: 'substations', type: 'symbol', source: 'substations',
        layout: { 'icon-image': 'sub-sq', 'icon-allow-overlap': true, 'icon-ignore-placement': true, visibility: 'none' },
        paint: { 'icon-opacity': 0.8 } });
      map.on('mouseenter', 'substations', e => {
        map.getCanvas().style.cursor = 'pointer';
        const p = e.features[0].properties;
        const kv = p.v ? `${Math.round(p.v / 1000)} kV` : '';
        popup.setLngLat(e.features[0].geometry.coordinates)
          .setHTML(`${p.name ? `<b>${p.name}</b><br>` : ''}<span style="opacity:.75">Substation${kv ? ' · ' + kv : ''}</span>`)
          .addTo(map);
      });
      map.on('mouseleave', 'substations', () => { map.getCanvas().style.cursor = ''; popup.remove(); });

      // Load centers
      map.addLayer({
        id: 'load-centers', type: 'circle', source: 'load-centers',
        filter: ['>=', ['get', 'pop'], 300_000],
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': lcRadiusExpr(),
          'circle-color': '#1a237e', 'circle-opacity': 0.72,
          'circle-stroke-width': 1.2, 'circle-stroke-color': 'rgba(255,255,255,0.65)',
        },
      });
      map.addLayer({
        id: 'load-centers-labels', type: 'symbol', source: 'load-centers',
        filter: ['>=', ['get', 'pop'], 300_000],
        layout: {
          visibility: 'none',
          'text-font': MAP_LABEL_FONT, 'text-field': ['get', 'name'], 'text-size': 9,
          'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#1a237e',
          'text-halo-color': 'rgba(255,255,255,0.88)', 'text-halo-width': 1.5,
        },
      });
      map.on('mouseenter', 'load-centers', e => {
        map.getCanvas().style.cursor = 'pointer';
        const p = e.features[0].properties;
        const pop = p.pop >= 1_000_000 ? `${(p.pop / 1_000_000).toFixed(1)}M` : `${Math.round(p.pop / 1_000)}k`;
        popup.setLngLat(e.features[0].geometry.coordinates)
          .setHTML(`<b>${p.name}</b><br><span style="opacity:.75">${pop} pop.</span>`).addTo(map);
      });
      map.on('mouseleave', 'load-centers', () => { map.getCanvas().style.cursor = ''; popup.remove(); });

      // Country hover + click
      let hoveredId = null;
      map.on('mousemove', 'region-fill', e => {
        map.getCanvas().style.cursor = 'pointer';
        if (hoveredId !== null)
          map.setFeatureState(hoveredId, { hover: false });
        hoveredId = featureTarget(e.features[0]);
        map.setFeatureState(hoveredId, { hover: true });
      });
      map.on('mouseleave', 'region-fill', () => {
        map.getCanvas().style.cursor = '';
        if (hoveredId !== null)
          map.setFeatureState(hoveredId, { hover: false });
        hoveredId = null;
      });
      const LINE_LAYERS = VOLTAGE_BRACKETS.map(b => `lines-${b.key}`);
      // A click on a line, plant or substation opens its card; only a click on
      // bare country goes to the country page. Lines take the same 8px slack
      // as the line click below; points are hit exactly, as their own clicks.
      const onFeature = ({ point }) => {
        const hits = (geometry, ids) => {
          const layers = ids.filter(id => map.getLayer(id));
          return layers.length > 0 && map.queryRenderedFeatures(geometry, { layers }).length > 0;
        };
        const { x, y } = point;
        return hits([[x - 8, y - 8], [x + 8, y + 8]], LINE_LAYERS)
          || hits(point, [...PLANT_STATUSES.map(s => `plants-${s}`), 'substations']);
      };
      map.on('click', 'region-fill', e => {
        const iso = e.features[0].properties.ISO_A3;
        if (isos.includes(iso) && !onFeature(e)) navigate(`/country/${iso}`);
      });
      const onZoneClick = e => {
        const iso = e.features[0].properties.ISO_A3 || e.features[0].properties.country;
        if (isos.includes(iso) && !onFeature(e)) navigate(`/country/${iso}`);
      };
      map.on('click', 'region-zones-fill', onZoneClick);
      map.on('mouseenter', 'region-zones-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'region-zones-fill', () => { map.getCanvas().style.cursor = ''; });

      // ── Feature click → detail panel ──────────────────────────────────────
      // A line's properties for the popup and the card. Tiled lines hold only
      // v; the rest arrives with the attributes file, fetched once the map
      // is idle. Before then apply() gets v at once and is called again with
      // the rest.
      let lineAttrs = null, lineAttrsP = null;
      const loadLineAttrs = () => (lineAttrsP ??= fetchData(linesAttrs(regionId))
        .then(d => (lineAttrs = d)).catch(() => null));
      const withLineProps = (feat, apply) => {
        if (!tiled) return apply(feat.properties);
        if (lineAttrs) return apply(attrsProps(lineAttrs, feat));
        apply({ v: feat.properties.v });
        loadLineAttrs().then(d => { if (d && !disposed) apply(attrsProps(d, feat)); });
      };
      let hoverToken = 0, clickToken = 0; // a late answer for a line since left is dropped

      // Line hover → popup with exact voltage + endpoint substation names
      const nearestSubName = (coord) => {
        try {
          const feats = map.querySourceFeatures('substations');
          let best = null, bestD = Infinity;
          for (const f of feats) {
            if (f.geometry?.type !== 'Point') continue;
            const [lng, lat] = f.geometry.coordinates;
            const d = (lng - coord[0]) ** 2 + (lat - coord[1]) ** 2;
            if (d < bestD) { bestD = d; best = f; }
          }
          return bestD < 0.01 ? (best?.properties?.name || null) : null;
        } catch { return null; }
      };
      for (const { key } of VOLTAGE_BRACKETS) {
        map.on('mouseenter', `lines-${key}`, e => {
          map.getCanvas().style.cursor = 'pointer';
          const feat = e.features[0];
          const token = ++hoverToken;
          popup.setLngLat(e.lngLat);
          withLineProps(feat, props => {
            if (token !== hoverToken) return;
            const [start, end] = lineEnds(props, feat);
            popup.setHTML(linePopupHTML(props, [nearestSubName(start), nearestSubName(end)])).addTo(map);
          });
        });
        map.on('mousemove', `lines-${key}`, e => { popup.setLngLat(e.lngLat); });
        map.on('mouseleave', `lines-${key}`, () => { hoverToken++; map.getCanvas().style.cursor = ''; popup.remove(); });
      }

      // Plants — keep hover popup, add click for detail panel
      let clickedPoint = false;
      for (const status of PLANT_STATUSES) {
        map.on('click', `plants-${status}`, e => {
          clickedPoint = true;
          setSelFeature({ type: 'plant', props: e.features[0].properties });
        });
      }

      // Substations — keep hover popup, add click for detail panel
      map.on('click', 'substations', e => {
        clickedPoint = true;
        setSelFeature({ type: 'substation', props: e.features[0].properties });
      });

      // General map click: handle lines (queryRenderedFeatures with bbox) + background clear
      map.on('click', e => {
        if (clickedPoint) { clickedPoint = false; return; }
        clickedPoint = false;

        // Query line features within 8px radius of click
        const { x, y } = e.point;
        const bbox = [[x - 8, y - 8], [x + 8, y + 8]];
        const activeLayers = LINE_LAYERS.filter(id => { try { return !!map.getLayer(id); } catch { return false; } });
        const lineFeats = activeLayers.length ? map.queryRenderedFeatures(bbox, { layers: activeLayers }) : [];

        const token = ++clickToken;
        if (lineFeats.length > 0) {
          // The line nearest the click, as the hover popup describes the one
          // under the pointer -- not whichever the box query lists first.
          const pixelDist = f => {
            const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
            let best = Infinity;
            for (const part of parts) for (let i = 1; i < part.length; i++) {
              const a = map.project(part[i - 1]), b = map.project(part[i]);
              const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
              const u = len2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
              best = Math.min(best, Math.hypot(a.x + u * dx - x, a.y + u * dy - y));
            }
            return best;
          };
          const feat = lineFeats.reduce((a, b) => (pixelDist(b) < pixelDist(a) ? b : a));
          const geom = feat.geometry;
          const coords = geom.type === 'LineString' ? geom.coordinates : geom.coordinates.flat();
          withLineProps(feat, props => {
            if (token !== clickToken) return;
            const v = props.v;
            setSelFeature({
              type:  'line',
              props: { ...props, voltageLabel: v ? `${Math.round(v / 1000)} kV` : bracketFor(v).label },
              // A tile holds only its piece of the line; km is the whole line's.
              km:    props.km ?? lineKm(coords),
            });
          });
        } else {
          setSelFeature(null);
        }
      });

      raiseBoundaries(map);
      // Anything toggled while the map was still loading. applyWbView() needs
      // the basemap fully in, which 'style.load' does not wait for.
      map.once('idle', () => { if (!disposed) applyWbView(map, wbViewRef.current); });

      // ── Data layers, each filled as its file arrives ─────────────────────
      const [plantsFile, linesFile, subsFile, lcFile] = regionDataFiles(regionId);
      const optional = p => fetchData(dataPath(p)).catch(() => empty());
      const lines = (async () => {
        const linesGJ = summary?.lines ? null : await fetchData(dataPath(linesFile));
        if (disposed) return;
        const volts = summary?.lines ? summary.lines.voltages : linesGJ.features.map(f => f.properties.v || 0);
        // Slider floor comes from the data itself: regions.yaml sets a different
        // min_kv per region, and this way the UI never promises voltages the file
        // doesn't hold.
        const taggedKv = volts.filter(v => v > 0);
        const floorKv = taggedKv.length ? Math.floor(Math.min(...taggedKv) / 1000) : 110;
        setKvFloor(floorKv);
        // A theme switch rebuilds the map from scratch; keep whatever the slider
        // was set to as long as the new data can honour it, and only fall back to
        // the floor when it can't (first load, or a region with a higher floor).
        setMinKv(kv => (kv >= floorKv && kv <= 500 ? kv : floorKv));
        // Regions with a 110 kV floor hold no 33-110 kV and no untagged lines;
        // an empty legend row would just be a dead checkbox.
        setPresentKvs(new Set(volts.map(v => bracketFor(v).key)));
        // Tiled lines are already on their way, and their attributes follow
        // once the map is idle; a big untiled region draws its 220 kV+ lines
        // first and the rest follow.
        if (tiled) { map.once('idle', () => { if (!disposed) loadLineAttrs(); }); return; }
        if (summary?.lines?.first)
          setDataInStages(map, 'lines', absUrl(dataPath(firstPass(linesFile))),
            absUrl(dataPath(linesFile)), () => !disposed).catch(e => console.error('region lines', e));
        else map.getSource('lines')?.setData(linesGJ ?? absUrl(dataPath(linesFile)));
      })();
      const plants = (async () => {
        const facts = summary?.plants?.osm;
        const plantsGJ = facts ? null : await fetchData(dataPath(plantsFile));
        if (disposed) return;
        // The starting min-MW comes from OSM's capacities whatever the source.
        const { adaptMin } = plantFacts(facts, plantsGJ);
        setMinMw(adaptMin);
        for (const status of PLANT_STATUSES)
          if (map.getLayer(`plants-${status}`))
            map.setFilter(`plants-${status}`, makeLayerFilter(status, new Set(), adaptMin));
        // The selected source straight away (GEM by default), not OSM first and
        // then a second big file; OSM when the summary lists no such source.
        // Without a summary, OSM as read above, and the source swap below
        // brings in any other.
        const want = plantSourceRef.current;
        const source = summary && summary.plants[want] ? want : 'osm';
        if (source !== want) setPlantSource('osm');
        plantsShownRef.current = source;
        const srcFacts = summary?.plants?.[source];
        setPresentFuels(plantFacts(srcFacts, plantsGJ).fuels);
        const file = `cache/region_plants_${regionId}${SOURCE_SUFFIX[source]}.geojson`;
        if (srcFacts?.first)
          setDataInStages(map, 'plants', absUrl(dataPath(firstPass(file))), absUrl(dataPath(file)),
            () => !disposed && plantsShownRef.current === source).catch(e => console.error('region plants', e));
        else map.getSource('plants')?.setData(plantsGJ ?? absUrl(dataPath(file)));
      })();
      const subs = optional(subsFile).then(gj => { if (!disposed) map.getSource('substations')?.setData(gj); });
      const lcs  = optional(lcFile).then(gj => { if (!disposed) map.getSource('load-centers')?.setData(gj); });
      const results = await Promise.allSettled([plants, lines, subs, lcs]);
      for (const r of results) if (r.status === 'rejected') console.error('region map data', r.reason);
      if (disposed) return;
      // Ready once the data is in: the plant-source swap and the chat act on it.
      setMapReady(true);
    });

    return () => {
      disposed = true;
      popup.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [region, theme, wbBase]);

  // ── Basemap switcher ─────────────────────────────────────────────────────
  // The initial view is baked into the style; later changes are applied live.
  useEffect(() => {
    wbViewRef.current = wbView;
    const map = mapRef.current;
    if (!map || !mapReady) return;
    applyWbView(map, wbView);
  }, [wbView, mapReady]);

  // ── Zone mode / refine toggle ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getLayer('region-zones-fill')) return;
    const showZones = mapMode === 'zones';

    if (showZones) {
      const slug       = selectedSlug || 'recommended';
      const url        = dataPath(`zones/${regionId}_${slug}_zones_hd.geojson`);
      const corrUrl    = dataPath(`zones/${regionId}_${slug}_corridors.geojson`);
      Promise.all([
        fetchData(url),
        fetchData(corrUrl).catch(() => null),
      ])
        .then(([data, corridorsGJ]) => {
          const m = mapRef.current;
          if (!m?.getSource('region-zones')) return;
          m.getSource('region-zones').setData(data);
          m.setLayoutProperty('region-zones-fill',   'visibility', 'visible');
          m.setLayoutProperty('region-zones-border', 'visibility', 'visible');
          m.setLayoutProperty('region-fill', 'visibility', 'none');
          const emptyGJ = { type: 'FeatureCollection', features: [] };
          if (m.getSource('region-corridors-src'))
            m.getSource('region-corridors-src').setData(corridorsGJ || emptyGJ);
          // Extract centroids from corridor endpoints
          const centroidMap = new Map();
          for (const f of (corridorsGJ?.features || [])) {
            const [s, e] = [f.geometry.coordinates[0], f.geometry.coordinates[f.geometry.coordinates.length - 1]];
            const ks = `${s[0]},${s[1]}`, ke = `${e[0]},${e[1]}`;
            if (!centroidMap.has(ks)) centroidMap.set(ks, { type: 'Feature', geometry: { type: 'Point', coordinates: s }, properties: { zone: f.properties.zone_a } });
            if (!centroidMap.has(ke)) centroidMap.set(ke, { type: 'Feature', geometry: { type: 'Point', coordinates: e }, properties: { zone: f.properties.zone_b } });
          }
          if (m.getSource('region-centroids-src'))
            m.getSource('region-centroids-src').setData({ type: 'FeatureCollection', features: [...centroidMap.values()] });
          const layerVis = {
            'region-corridors-ex':        corrExistOn ? 'visible' : 'none',
            'region-corridors-committed':  corrCommOn  ? 'visible' : 'none',
            'region-corridors-candidate':  corrCandOn  ? 'visible' : 'none',
            'region-corridors-labels':    corrExistOn ? 'visible' : 'none',
            'region-corridors-dots':      (corrExistOn || corrCommOn || corrCandOn) ? 'visible' : 'none',
          };
          for (const [id, vis] of Object.entries(layerVis))
            if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis);
        })
        .catch(() => setMapMode('countries'));
    } else {
      if (map.getLayer('region-zones-fill'))   map.setLayoutProperty('region-zones-fill',   'visibility', 'none');
      if (map.getLayer('region-zones-border')) map.setLayoutProperty('region-zones-border', 'visibility', 'none');
      if (map.getLayer('region-fill'))         map.setLayoutProperty('region-fill', 'visibility', 'visible');
      if (map.getSource('region-zones'))
        map.getSource('region-zones').setData({ type: 'FeatureCollection', features: [] });
      for (const id of ['region-corridors-ex', 'region-corridors-committed', 'region-corridors-candidate', 'region-corridors-labels', 'region-corridors-dots']) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      }
      if (map.getSource('region-corridors-src'))
        map.getSource('region-corridors-src').setData({ type: 'FeatureCollection', features: [] });
      if (map.getSource('region-centroids-src'))
        map.getSource('region-centroids-src').setData({ type: 'FeatureCollection', features: [] });
    }
  }, [mapMode, regionId, corrExistOn, corrCommOn, corrCandOn, selectedSlug]);

  // ── Layer toggle handlers ─────────────────────────────────────────────────

  // Flip a corridor class on or off: its state flag and its map layers together.
  const onCorridorToggle = e => {
    const label = e.currentTarget.dataset.corridor;
    const map = mapRef.current;
    if (!map) return;
    const setter = { Existing: setCorrExistOn, Committed: setCorrCommOn, Candidate: setCorrCandOn }[label];
    setter(prev => {
      const next = !prev;
      for (const id of CORRIDOR_LAYERS[label])
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', next ? 'visible' : 'none');
      return next;
    });
  };

  const toggleFuel = useCallback(fuel => {
    const map = mapRef.current;
    if (!map) return;
    setFuelsOff(prev => {
      const next = new Set(prev);
      if (next.has(fuel)) next.delete(fuel); else next.add(fuel);
      for (const s of PLANT_STATUSES) {
        if (map.getLayer(`plants-${s}`))
          map.setFilter(`plants-${s}`, makeLayerFilter(s, next, minMw));
      }
      return next;
    });
  }, [minMw]);

  const toggleStatus = useCallback(status => {
    const map = mapRef.current;
    if (!map || !map.getLayer(`plants-${status}`)) return;
    setStatusOff(prev => {
      const next    = new Set(prev);
      const hiding  = !prev.has(status);
      if (hiding) next.add(status); else next.delete(status);
      if (plantsOn)
        map.setLayoutProperty(`plants-${status}`, 'visibility', hiding ? 'none' : 'visible');
      return next;
    });
  }, [plantsOn]);

  const toggleKv = useCallback(key => {
    const map = mapRef.current;
    if (!map || !map.getLayer(`lines-${key}`)) return;
    setKvsOff(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); map.setLayoutProperty(`lines-${key}`, 'visibility', 'visible'); }
      else               { next.add(key);    map.setLayoutProperty(`lines-${key}`, 'visibility', 'none');    }
      return next;
    });
  }, []);

  const toggleLines = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setLinesOn(prev => {
      const next = !prev;
      for (const { key } of VOLTAGE_BRACKETS)
        if (!kvsOff.has(key) && map.getLayer(`lines-${key}`))
          map.setLayoutProperty(`lines-${key}`, 'visibility', next ? 'visible' : 'none');
      return next;
    });
  }, [kvsOff]);

  const togglePlants = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setPlantsOn(prev => {
      const next = !prev;
      for (const s of PLANT_STATUSES) {
        if (!map.getLayer(`plants-${s}`)) continue;
        if (!statusOff.has(s))
          map.setLayoutProperty(`plants-${s}`, 'visibility', next ? 'visible' : 'none');
      }
      return next;
    });
  }, [statusOff]);

  const toggleSubs = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('substations')) return;
    setSubsOn(prev => {
      const next = !prev;
      map.setLayoutProperty('substations', 'visibility', next ? 'visible' : 'none');
      return next;
    });
  }, []);

  const handleMinMw = useCallback(mw => {
    const map = mapRef.current;
    if (!map) return;
    setMinMw(mw);
    for (const s of PLANT_STATUSES)
      if (map.getLayer(`plants-${s}`))
        map.setFilter(`plants-${s}`, makeLayerFilter(s, fuelsOff, mw));
  }, [fuelsOff]);

  const toggleCountry = useCallback(iso => {
    setCountriesOff(prev => { const n = new Set(prev); n.has(iso) ? n.delete(iso) : n.add(iso); return n; });
  }, []);
  const selectAllCountries = useCallback(() => setCountriesOff(new Set()), []);
  const deselectAllCountries = useCallback(() => {
    if (!region) return;
    setCountriesOff(new Set(region.countries.map(c => c.iso)));
  }, [region]);

  const handleCircleScale = useCallback(scale => {
    const map = mapRef.current;
    if (!map) return;
    setCircleScale(scale);
    for (const s of PLANT_STATUSES)
      if (map.getLayer(`plants-${s}`))
        map.setPaintProperty(`plants-${s}`, 'circle-radius', plantRadiusExpr(scale));
  }, []);


  const toggleLoadCenters = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setLoadCentersOn(prev => {
      const next = !prev;
      for (const id of ['load-centers', 'load-centers-labels'])
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', next ? 'visible' : 'none');
      return next;
    });
  }, []);

  const handleLcMinPop = useCallback(pop => {
    const map = mapRef.current;
    if (!map) return;
    setLcMinPop(pop);
    for (const id of ['load-centers', 'load-centers-labels'])
      if (map.getLayer(id)) map.setFilter(id, ['>=', ['get', 'pop'], pop]);
  }, []);

  const handleLcCircleScale = useCallback(scale => {
    const map = mapRef.current;
    if (!map) return;
    setLcCircleScale(scale);
    if (map.getLayer('load-centers'))
      map.setPaintProperty('load-centers', 'circle-radius', lcRadiusExpr(scale));
  }, []);

  // Plant source hot-swap
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource('plants') || !mapReady) return;
    const suffix = SOURCE_SUFFIX[plantSource];
    const f    = `region_plants_${regionId}${suffix}.geojson`;
    const cf   = dataPath(`cache/region_capacity_${regionId}${suffix}.json`);
    const cfBase = dataPath(`cache/region_capacity_${regionId}.json`);
    fetchSummary(regionId)
      .then(async summary => {
        const facts = summary?.plants?.[SOURCE_KEY[suffix]];
        // A summary that lists no such source means the file is not there.
        if (summary && !facts) throw new Error(`no ${f}`);
        // The map may have opened on this source already; the capacity below
        // is still this effect's to set.
        if (plantsShownRef.current !== plantSource) {
          const data = facts ? null : await fetchData(dataPath(`cache/${f}`));
          map.getSource('plants').setData(data ?? absUrl(dataPath(`cache/${f}`)));
          plantsShownRef.current = plantSource;
          setPresentFuels(plantFacts(facts, data).fuels);
        }
        return Promise.all([
          suffix ? fetchData(cfBase).catch(() => null) : Promise.resolve(null),
          fetchData(cf).catch(() => null),
        ]);
      })
      .then(([base, primary]) => {
        if (!primary && !base) return;
        if (!primary) { setCapacity(base); return; }
        if (!base || !suffix) { setCapacity(primary); return; }
        setCapacity({ ...primary, countries: { ...(base.countries || {}), ...(primary.countries || {}) } });
      })
      .catch(() => {
        if (plantSource === 'gppd') { setGppdAvailable(false); setPlantSource('osm'); }
        if (plantSource === 'gem')  { setGemAvailable(false);  setPlantSource('osm'); }
      });
  }, [plantSource, regionId, mapReady]);


  // ── Download helpers ──────────────────────────────────────────────────────

  const handleDownloadPlants = useCallback(async (format = 'geojson') => {
    track('data_download', { type: 'plants', format, source: plantSource, region: regionId });
    const suffix = plantSource === 'gppd' ? '_gppd' : plantSource === 'gem' ? '_gem' : '';
    const url  = dataPath(`cache/region_plants_${regionId}${suffix}.geojson`);
    const data = await fetchData(url);
    if (format === 'csv') {
      const header = 'name,fuel,mw,country,status,lat,lon,source';
      const rows = data.features.map(f => {
        const p = f.properties;
        const [lon, lat] = f.geometry.coordinates;
        return [
          `"${(p.name || '').replace(/"/g, '""')}"`,
          p.fuel || '', p.mw || '', p.country || '', p.status || '',
          lat.toFixed(5), lon.toFixed(5), plantSource,
        ].join(',');
      });
      downloadBlob([header, ...rows].join('\n'), `plants_${regionId}${suffix}.csv`, 'text/csv');
    } else {
      downloadBlob(JSON.stringify(data), `plants_${regionId}${suffix}.geojson`, 'application/geo+json');
    }
  }, [plantSource, regionId]);


  // ── Min-kV filter ──────────────────────────────────────────────────────────
  // Dragging repaints only (cheap, no source re-parse); the real setFilter lands
  // once the drag settles, so hover, click and download agree with what is drawn.
  const minKvCommitRef = useRef(null);

  const applyMinKv = useCallback((kv, commit) => {
    const map = mapRef.current;
    if (!map) return;
    const baseOpacity = getT(theme).isDark ? 0.92 : 0.65;
    for (const bracket of VOLTAGE_BRACKETS) {
      const id = `lines-${bracket.key}`;
      if (!map.getLayer(id)) continue;
      // v === 0 means "OSM doesn't say", not "0 kV" — a numeric floor can't judge
      // it, so the untagged bracket answers to its own legend checkbox alone.
      if (bracket.untagged) continue;
      if (commit) {
        map.setFilter(id, kvFilterWithFloor(bracket, kv));
        map.setPaintProperty(id, 'line-opacity', baseOpacity);
      } else {
        map.setPaintProperty(id, 'line-opacity',
          ['case', ['>=', ['get', 'v'], kv * 1000], baseOpacity, 0]);
      }
    }
  }, [theme]);

  const handleMinKvChange = useCallback(kv => {
    setMinKv(kv);
    applyMinKv(kv, false);
    clearTimeout(minKvCommitRef.current);
    minKvCommitRef.current = setTimeout(() => applyMinKv(kv, true), 250);
  }, [applyMinKv]);

  useEffect(() => () => clearTimeout(minKvCommitRef.current), []);

  const handleDownloadLines = useCallback(async (format = 'geojson') => {
    track('data_download', { type: 'lines', format, region: regionId });
    const url  = dataPath(`cache/region_lines_${regionId}.geojson`);
    const data = await fetchData(url);
    // What you see is what you get: the legend toggles and the min-kV slider sit
    // next to this button, so the file matches the map rather than the raw cache.
    const feats = visibleLineFeatures(data.features, { minKv, kvsOff });
    if (format === 'csv') {
      downloadBlob(linesToCSV(feats), `lines_${regionId}.csv`, 'text/csv');
    } else {
      downloadBlob(JSON.stringify(linesToDownloadGeoJSON(feats)),
        `lines_${regionId}.geojson`, 'application/geo+json');
    }
  }, [regionId, minKv, kvsOff]);

  const handleDownloadCapacity = useCallback(() => {
    if (!capacity || !region) return;
    const fuels = Object.keys(FUEL_COLORS);
    const header = ['country', 'iso', ...fuels, 'total_mw'];
    const rows = region.countries.map(c => {
      const cd    = capacity.countries?.[c.iso] || {};
      const total = Object.values(cd).reduce((s, v) => s + v, 0);
      return [c.name, c.iso, ...fuels.map(f => (cd[f] || 0).toFixed(1)), total.toFixed(1)];
    });
    downloadBlob([header, ...rows].map(r => r.join(',')).join('\n'),
      `capacity_${regionId}.csv`, 'text/csv');
  }, [capacity, region, regionId]);

  const handleDownloadTariffs = useCallback(() => {
    if (!tariffs || !region) return;
    const rows = region.countries.map(c => {
      const d = tariffs.countries?.[c.iso] || {};
      return [c.name, c.iso,
        d.res != null ? Math.round(d.res * 1000) : '',
        d.ind != null ? Math.round(d.ind * 1000) : ''];
    });
    downloadBlob(['country,iso,residential_usd_mwh,industrial_usd_mwh', ...rows.map(r => r.join(','))].join('\n'),
      `tariffs_${regionId}.csv`, 'text/csv');
  }, [tariffs, region, regionId]);

  const handleDownloadAccess = useCallback(() => {
    if (!access || !region) return;
    const rows = region.countries.map(c => {
      const d = access.countries?.[c.iso] || {};
      return [c.name, c.iso, d.total ?? '', d.urban ?? '', d.rural ?? ''];
    });
    downloadBlob(['country,iso,total_pct,urban_pct,rural_pct', ...rows.map(r => r.join(','))].join('\n'),
      `access_${regionId}.csv`, 'text/csv');
  }, [access, region, regionId]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!region) return <div style={{ padding: 40, color: t.text }}>Loading…</div>;

  const dlBtn = {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '1px 4px', borderRadius: 3, color: t.lblMuted,
    fontSize: '0.6rem', fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', gap: 3,
  };

  if (region?.type === 'meta') return <MetaRegionPage region={region} />;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 46px)', position: 'relative' }}
      onMouseMove={e => { if (!isDrRef.current) return; setPanelWidth(Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, drStartW.current + (drStartX.current - e.clientX)))); }}
      onMouseUp={() => { isDrRef.current = false; }}
      onMouseLeave={() => { isDrRef.current = false; }}
    >
      <MapChat theme={theme} mapRef={mapRef} ready={mapReady} controller={{
        page: 'region', regionId, tab: activeTab, navigate,
        setTab: setActiveTab, setPlantSource, setMinMw: handleMinMw,
        showOnlyFuels: fuels => { for (const f of presentFuels) if (fuelsOff.has(f) === fuels.includes(f)) toggleFuel(f); },
      }} />
      {isMobile && layerPanelOpen && (
        <div onClick={() => setLayerPanelOpen(false)} style={{
          position: 'absolute', inset: 0, zIndex: 299, backgroundColor: 'rgba(0,0,0,0.35)',
        }} />
      )}
      <div style={isMobile ? {
        position: 'absolute', top: 0, left: 0, zIndex: 300, height: '100%',
        boxShadow: '2px 0 16px rgba(0,0,0,0.3)',
        display: layerPanelOpen ? 'block' : 'none',
      } : {}}>
        <LayerPanel
        theme={theme}
        fuelsOff={fuelsOff} statusOff={statusOff}
        kvsOff={kvsOff}
        linesOn={linesOn} plantsOn={plantsOn} subsOn={subsOn}
        minMw={minMw} circleScale={circleScale}
        plantSource={plantSource}
        gppdAvailable={gppdAvailable} gemAvailable={gemAvailable} regionId={regionId}
        gridNote={region?.grid_note}
        presentFuels={presentFuels}
        wbView={wbView} onWbView={setWbView}
        onToggleFuel={toggleFuel} onToggleStatus={toggleStatus}
        onToggleKv={toggleKv}
        onToggleLines={toggleLines} onTogglePlants={togglePlants}
        onToggleSubs={toggleSubs}
        loadCentersOn={loadCentersOn} lcMinPop={lcMinPop} lcCircleScale={lcCircleScale}
        onToggleLoadCenters={toggleLoadCenters} onLcMinPopChange={handleLcMinPop}
        onLcCircleScaleChange={handleLcCircleScale}
        onMinMwChange={handleMinMw} onCircleScaleChange={handleCircleScale}
        onSourceChange={s => { setPlantSource(s); track('plant_source_change', { source: s, region: regionId }); }}
        onDownloadPlants={handleDownloadPlants}
        onDownloadLines={handleDownloadLines}
        minKv={minKv} kvFloor={kvFloor} onMinKvChange={handleMinKvChange}
        presentKvs={presentKvs}
        countries={region?.countries}
        countriesOff={countriesOff}
        onToggleCountry={toggleCountry}
        onSelectAllCountries={selectAllCountries}
        onDeselectAllCountries={deselectAllCountries}
      />
      </div>

      <div style={{ position: 'relative', flex: 1 }}>
        <div ref={containerRef}
          style={{ width: '100%', height: 'calc(100vh - 46px)', backgroundColor: t.bg }} />
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 200, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {isMobile && (
            <button onClick={() => setLayerPanelOpen(o => !o)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 13px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${t.panelBorder}`,
              backgroundColor: t.panel,
              boxShadow: '0 1px 6px rgba(0,0,0,.22)', color: t.lbl,
              flexShrink: 0,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.3px' }}>Legend & Filter</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(74,143,204,1)" strokeWidth="2.8" strokeLinecap="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          )}
          {!isMobile && zonesAvailable && (
            <>
              {/* Potential Zonings toggle */}
              <button
                onClick={() => setMapMode(m => m === 'zones' ? 'countries' : 'zones')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: '0.58rem', letterSpacing: '0.5px', fontFamily: 'inherit',
                  padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${mapMode === 'zones' ? 'rgba(74,143,204,0.6)' : t.panelBorder}`,
                  backgroundColor: mapMode === 'zones' ? 'rgba(74,143,204,0.14)' : t.panel,
                  color: mapMode === 'zones' ? t.lbl : t.lblMuted,
                  fontWeight: mapMode === 'zones' ? 700 : 400,
                  boxShadow: '0 1px 4px rgba(0,0,0,.18)',
                  transition: 'all 0.15s',
                }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 2,
                  backgroundColor: mapMode === 'zones' ? 'rgba(74,143,204,0.8)' : t.panelBorder,
                  display: 'inline-block', transition: 'background 0.15s',
                }} />
                Potential Zonings
              </button>

              {/* Config selector — only when zone mode is active and multiple configs exist */}
              {mapMode === 'zones' && zoningConfigs.length > 1 && (
                <select
                  value={selectedSlug || ''}
                  onChange={e => setSelectedSlug(e.target.value)}
                  style={{
                    fontSize: '0.58rem', fontFamily: 'inherit',
                    padding: '5px 8px', borderRadius: 6,
                    border: `1px solid rgba(74,143,204,0.5)`,
                    backgroundColor: t.panel, color: t.lbl,
                    cursor: 'pointer',
                    boxShadow: '0 1px 4px rgba(0,0,0,.18)',
                    outline: 'none',
                  }}>
                  {zoningConfigs.map(cfg => (
                    <option key={cfg.slug} value={cfg.slug}>{cfg.name}</option>
                  ))}
                </select>
              )}

              {/* Corridor type toggles — only in zone mode */}
              {mapMode === 'zones' && [
                { label: 'Existing',   on: corrExistOn, color: '#1a5fa8', dash: null },
                { label: 'Committed',  on: corrCommOn,  color: '#e07b00', dash: '8 3' },
                { label: 'Candidate',  on: corrCandOn,  color: '#666',    dash: '2 4' },
              ].map(({ label, on, color, dash }) => (
                <button key={label} data-corridor={label} onClick={onCorridorToggle} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: '0.58rem', letterSpacing: '0.5px', fontFamily: 'inherit',
                  padding: '5px 9px', borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${on ? color + '99' : t.panelBorder}`,
                  backgroundColor: on ? color + '22' : t.panel,
                  color: on ? t.lbl : t.lblMuted,
                  fontWeight: on ? 700 : 400,
                  boxShadow: '0 1px 4px rgba(0,0,0,.18)',
                  transition: 'all 0.15s',
                }}>
                  <svg width="16" height="4" style={{ flexShrink: 0 }}>
                    <line x1="0" y1="2" x2="16" y2="2"
                      stroke={on ? color : t.panelBorder} strokeWidth="2.5"
                      strokeDasharray={dash || ''} strokeLinecap="round" />
                  </svg>
                  {label}
                </button>
              ))}
            </>
          )}
        </div>

        <div style={{
          position: 'absolute', top: 10, right: 12, zIndex: 100,
          backgroundColor: t.panel, border: `1px solid ${t.panelBorder}`,
          borderRadius: 6, padding: isMobile ? '8px 12px' : '6px 10px',
          boxShadow: '0 1px 8px rgba(0,0,0,.18)',
          display: 'flex', alignItems: 'center', gap: 7,
          pointerEvents: 'none',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
            <path d="M13 13l6 6"/>
          </svg>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 600, color: t.lbl, lineHeight: 1.2 }}>
              {isMobile ? 'Tap' : 'Click'} a country
            </div>
            <div style={{ fontSize: '0.55rem', color: t.muted, lineHeight: 1.3 }}>to explore its data</div>
          </div>
        </div>

        {/* Feature detail card */}
        {selFeature && (
          <div style={{
            position: 'absolute', bottom: 24, left: 16, zIndex: 20,
            backgroundColor: t.panel, border: `1px solid ${t.panelBorder}`,
            borderRadius: 8, padding: '10px 14px', minWidth: 180, maxWidth: 260,
            boxShadow: '0 2px 12px rgba(0,0,0,.22)',
            fontSize: '0.7rem', color: t.text,
          }}>
            <button onClick={() => setSelFeature(null)} style={{
              position: 'absolute', top: 6, right: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              color: t.lblMuted, fontSize: '0.9rem', lineHeight: 1, padding: 0,
            }}>✕</button>

            {selFeature.type === 'line' && (
              <>
                <div style={{ fontWeight: 700, marginBottom: 6, color: t.lbl }}>
                  {selFeature.props.nm || 'Transmission line'}
                </div>
                <Row label="Voltage" value={selFeature.props.voltageLabel} t={t} />
                {selFeature.km > 0 && (
                  <Row label="Length" value={`~${Math.round(selFeature.km)} km`} t={t} />
                )}
                {['op', 'c', 'f', 'l', 'st'].map(k => (
                  selFeature.props[k] ? (
                    <Row key={k} label={LINE_ATTR_LABELS[k]}
                      value={lineAttrText(k, selFeature.props[k])} t={t} />
                  ) : null
                ))}
                {selFeature.props.oid && (
                  <Row label="Source" t={t} value={
                    <a href={`https://www.openstreetmap.org/way/${selFeature.props.oid}`}
                      target="_blank" rel="noreferrer"
                      style={{ color: t.lblRow }}>OpenStreetMap ↗</a>
                  } />
                )}
              </>
            )}

            {selFeature.type === 'plant' && (() => {
              const p = selFeature.props;
              return (
                <>
                  <div style={{ fontWeight: 700, marginBottom: 6, color: t.lbl }}>
                    {p.name || 'Power plant'}
                  </div>
                  <Row label="Fuel" value={
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                      <span style={{ width:8, height:8, borderRadius:'50%', flexShrink:0,
                        backgroundColor: FUEL_COLORS[p.fuel] || '#888' }} />
                      {p.fuel}
                    </span>
                  } t={t} />
                  {p.mw > 0 && <Row label="Capacity" value={`${p.mw} MW`} t={t} />}
                  <Row label="Country" value={p.country} t={t} />
                  {p.status !== 'operating' && (
                    <Row label="Status" value={p.status} t={t} />
                  )}
                </>
              );
            })()}

            {selFeature.type === 'substation' && (() => {
              const p = selFeature.props;
              return (
                <>
                  <div style={{ fontWeight: 700, marginBottom: 6, color: t.lbl }}>
                    {p.name || 'Substation'}
                  </div>
                  {p.v > 0 && <Row label="Voltage" value={`${Math.round(p.v / 1000)} kV`} t={t} />}
                  {p.iso && <Row label="Country" value={p.iso} t={t} />}
                </>
              );
            })()}
          </div>
        )}

        {/* Back to the world view, and the Equal Earth export — top-left of the
            map (under Legend & Filter on phones) */}
        <div style={{
          position: 'absolute', zIndex: 60, display: 'flex', alignItems: 'flex-start', gap: 6,
          ...(isMobile ? { top: 56, left: 12 } : { top: 10, left: 12 }),
        }}>
          <WorldButton t={t} compact={isMobile} />
          <ExportControl
            mapRef={mapRef} ready={mapReady} t={t} compact={isMobile}
            style={{ position: 'relative', left: 0 }}
            title={`Regional Power Explorer — ${region.name}`}
            fileName={`regional-power-explorer-${regionId}`}
            defaultBasemap={wbView.canvas}
            sourceData={{ lines: () => fetchData(dataPath(regionDataFiles(regionId)[1])) }}
            legend={() => powerLegend({ presentFuels, fuelsOff, presentKvs, theme })}
          />
        </div>

        {/* ── Map disclaimer ── */}
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, pointerEvents: 'none',
          backgroundColor: t.isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.72)',
          borderRadius: 4, padding: '2px 10px',
          fontSize: '0.47rem', color: t.lblMuted, textAlign: 'center',
          whiteSpace: 'nowrap', letterSpacing: '0.3px',
        }}>
          Pilot · Indicative data · Partly AI-generated, not fact-checked · Boundaries for reference only · Unofficial
        </div>
      </div>

      {!isMobile && (
        <div style={{ width: 5, flexShrink: 0, cursor: 'col-resize', backgroundColor: 'transparent' }}
          onMouseDown={e => { isDrRef.current = true; drStartX.current = e.clientX; drStartW.current = panelWidth; e.preventDefault(); }} />
      )}

      {/* Right panel */}
      <div style={isMobile ? {
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
        height: sheetHeight,
        overflow: 'hidden',
        backgroundColor: t.panel, borderTop: `1px solid ${t.panelBorder}`,
        borderRadius: '12px 12px 0 0',
        boxShadow: '0 -6px 24px rgba(0,0,0,0.35)',
        transition: isDragging ? 'none' : 'height 0.25s ease',
      } : {
        width: panelWidth, height: 'calc(100vh - 46px)', overflowY: 'auto',
        padding: '18px 16px',
        backgroundColor: t.panel, borderLeft: `1px solid ${t.panelBorder}`,
        flexShrink: 0,
      }}>
        {isMobile && (
          <div
            onClick={() => setSheetHeight(h => h > 96 ? 96 : Math.round(window.innerHeight * 0.5))}
            onTouchStart={e => {
              dragRef.current = { startY: e.touches[0].clientY, startH: sheetHeight, currentH: sheetHeight };
              setIsDragging(true);
            }}
            style={{
              height: 96, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 20px', cursor: 'pointer', flexShrink: 0,
              borderBottom: sheetHeight > 96 ? `1px solid ${t.panelBorder}` : 'none',
              position: 'relative',
            }}>
            <div style={{
              position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
              width: 44, height: 5, borderRadius: 3,
              backgroundColor: t.muted, opacity: 0.7,
            }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: t.text }}>{region.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: t.lbl, letterSpacing: '0.3px' }}>
                {sheetHeight > 96 ? 'Close' : 'Data'}
              </span>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(74,143,204,1)" strokeWidth="2.8" strokeLinecap="round">
                {sheetHeight > 96 ? <polyline points="6 9 12 15 18 9"/> : <polyline points="6 15 12 9 18 15"/>}
              </svg>
            </div>
          </div>
        )}
        <div style={isMobile ? { overflowY: 'auto', height: sheetHeight - 96, padding: '12px 16px 24px' } : {}}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          <Link to="/" style={{ fontSize: '0.75rem', color: t.muted }}>World</Link>
          <span style={{ color: t.panelBorder, fontSize: '0.75rem' }}>/</span>
          <span style={{ fontSize: '0.75rem', color: t.lbl, fontWeight: 600 }}>{region.name}</span>
        </div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: t.text, marginBottom: 4 }}>
          {region.name}
        </h2>
        <p style={{ fontSize: '0.8rem', color: t.muted, marginBottom: 16 }}>
          {region.countries.length} countries
        </p>
        <div style={{ height: 3, borderRadius: 2, backgroundColor: region.color, width: 36, marginBottom: 20 }} />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 14 }}>
          {['Overview', 'Countries', 'Supply & Trade'].map(tab => {
            const active = activeTab === tab.toLowerCase();
            return (
              <button key={tab} onClick={() => { setActiveTab(tab.toLowerCase()); track('tab_change', { tab: tab.toLowerCase(), region: regionId }); }} style={{
                flex: 1, fontSize: '0.58rem', letterSpacing: '1px',
                textTransform: 'uppercase', fontFamily: 'inherit',
                padding: '4px 0', borderRadius: 4, cursor: 'pointer',
                border: `1px solid ${active ? t.lbl : t.panelBorder}`,
                backgroundColor: active ? 'rgba(128,160,192,0.12)' : 'transparent',
                color: active ? t.lbl : t.lblMuted,
                fontWeight: active ? 700 : 400,
              }}>{tab}</button>
            );
          })}
        </div>

        {activeTab === 'overview'        && <CapacityChart capacity={capacity} region={region} theme={theme} source={plantSource} tariffs={tariffs} access={access} plantCount={plantCount} tradeSnapshot={tradeSnapshot} />}
        {activeTab === 'supply & trade'  && <RegionSupplyTrade region={region} theme={theme} />}
        {activeTab === 'countries'       && <StatsPanel    capacity={capacity} region={region} theme={theme} source={plantSource} tariffs={tariffs} fleetAge={fleetAge} access={access} />}

        {/* Export section */}
        <div style={{ marginTop: 20, borderTop: `1px solid ${t.panelBorder}`, paddingTop: 12 }}>
          <span style={{ fontSize: '0.47rem', letterSpacing: '2px', fontWeight: 700, color: t.lblMuted, textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>
            Export Data
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {[
              { label: 'Plants GeoJSON',  handler: handleDownloadPlants },
              { label: 'Lines GeoJSON',   handler: handleDownloadLines  },
              { label: 'Capacity CSV',    handler: handleDownloadCapacity },
              tariffs && { label: 'Tariffs CSV', handler: handleDownloadTariffs },
              access  && { label: 'Access CSV',  handler: handleDownloadAccess  },
            ].filter(Boolean).map(({ label, handler }) => (
              <button key={label} onClick={handler} style={{
                ...dlBtn,
                border: `1px solid ${t.panelBorder}`,
                padding: '4px 6px', justifyContent: 'center',
                fontSize: '0.52rem', color: t.muted,
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                {label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: '0.47rem', color: t.lblMuted, marginTop: 6, fontStyle: 'italic' }}>
            Source: {plantSource.toUpperCase()} · {region.name}
          </p>
        </div>
        </div>{/* content wrapper */}
      </div>
    </div>
  );
}
