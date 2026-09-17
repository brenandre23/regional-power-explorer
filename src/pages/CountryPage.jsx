import { dataPath } from '../utils/paths';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { track } from '../analytics';
import maplibregl from 'maplibre-gl';
import { useTheme } from '../App';
import { getT, FUEL_COLORS, VOLTAGE_BRACKETS, kvFilterWithFloor, bracketFor, LINE_ATTR_LABELS, lineAttrText, linePopupHTML, visibleLineFeatures, linesToCSV, linesToDownloadGeoJSON, plantRadiusExpr, lcRadiusExpr, adaptiveMinMw, defaultNZones, PANEL_WIDTH_MIN, PANEL_WIDTH_DEFAULT, PANEL_WIDTH_MAX, BRIEFS_ENABLED } from '../constants';
import LayerPanel from '../components/LayerPanel';
import CountryOverview from '../components/CountryOverview';
import REResourcesTab from '../components/tabs/REResourcesTab';
import LoadTab from '../components/tabs/LoadTab';
import ZoningTab from '../components/tabs/ZoningTab';
import SupplyTab from '../components/tabs/SupplyTab';
import MarketTab from '../components/tabs/MarketTab';
import { buildWbStyle, applyWbView, useWbStyleBase, DEFAULT_WB_VIEW } from '../utils/wbStyle';
import { fetchGeo, fetchBboxes, fetchNdlsa, boundsFor, addCountriesSource, addNdlsaLayer, raiseBoundaries, fillAnchor } from '../utils/basemap';

// Same Google Apps Script web-app as ContactPage (writes to the shared Sheet).
// Brief-edit suggestions are tagged type='brief-edit' and routed to a "Brief Edits" tab.
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxKtNsfk0dX5SET9ajr4jZ0YK058f94jyjzTpiUFQZZkp9jTh6p_TtPiI6Gv6UeLhTx/exec';

const EDIT_LBL = { display: 'block', fontSize: '0.6rem', fontWeight: 600, color: '#5A6474', margin: '10px 0 3px', letterSpacing: '0.3px' };
const EDIT_INP = { width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '0.72rem', padding: '6px 8px', borderRadius: 4, border: '1px solid #D5DBE2', color: '#1B2A4A', resize: 'vertical' };
const EDIT_BTN_PRIMARY = { background: '#4A8FCC', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const EDIT_BTN_GHOST = { background: 'none', color: '#5A6474', border: '1px solid #D5DBE2', borderRadius: 4, padding: '6px 14px', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit' };

// Tab row typography — matches RegionPage's tab font exactly (0.58rem,
// 1px letter-spacing, bold only when active). "Supply & Trade" wraps to two
// centered lines at 7 tabs (e.g. Turkey, with Market + Brief both present);
// every other label stays on one line at this size.
const TAB_GAP_PX = 2;
const TAB_FONT_SIZE = '0.58rem';
const TAB_LETTER_SPACING = '1px';

function buildPlantFilter(fuel, mw, statusOff) {
  const clauses = [
    ['==', ['get', 'fuel'], fuel],
    ['>=', ['get', 'mw'], mw],
  ];
  if (statusOff.size > 0)
    clauses.push(['!', ['in', ['get', 'status'], ['literal', [...statusOff]]]]);
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

function Row({ label, value, t }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginBottom:3 }}>
      <span style={{ color: t.lblMuted, flexShrink:0 }}>{label}</span>
      <span style={{ color: t.lbl, fontWeight:600, textAlign:'right' }}>{value}</span>
    </div>
  );
}

function downloadBlob(content, filename, type = 'application/octet-stream') {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Ray-casting point-in-polygon (handles Polygon + MultiPolygon)
function pointInRing(pt, ring) {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
function pointInFeature(pt, feature) {
  const g = feature.geometry;
  if (g.type === 'Polygon')
    return g.coordinates.some(ring => pointInRing(pt, ring));
  if (g.type === 'MultiPolygon')
    return g.coordinates.some(poly => poly.some(ring => pointInRing(pt, ring)));
  return false;
}

export default function CountryPage() {
  const { iso }      = useParams();
  const { theme }    = useTheme();
  const t            = getT(theme);

  const containerRef = useRef(null);
  const mapRef       = useRef(null);

  const [info,         setInfo]         = useState(null);  // { country, region }
  const [presentFuels, setPresentFuels] = useState(new Set());
  const [fuelsOff,     setFuelsOff]     = useState(new Set());
  const [statusOff,    setStatusOff]    = useState(new Set(['planned']));
  const [kvsOff,       setKvsOff]       = useState(new Set());
  const [linesOn,      setLinesOn]      = useState(true);
  const [plantsOn,     setPlantsOn]     = useState(true);
  const [subsOn,       setSubsOn]       = useState(false);
  const [minMw,        setMinMw]        = useState(100);
  const [circleScale,  setCircleScale]  = useState(1.0);
  const [plantSource,        setPlantSource]        = useState('gem');
  const [selFeature,         setSelFeature]         = useState(null);
  const [gppdAvailable,      setGppdAvailable]      = useState(null);
  const [gemAvailable,       setGemAvailable]       = useState(null);
  const [capacity,           setCapacity]           = useState(null);
  const [fleetAge,           setFleetAge]           = useState(null);
  const [tariffs,            setTariffs]            = useState(null);
  const [access,             setAccess]             = useState(null);
  const [filteredPlantsData, setFilteredPlantsData] = useState(null);
  const [filteredLinesData,  setFilteredLinesData]  = useState(null);
  const [minKv,            setMinKv]            = useState(0);
  const [kvFloor,          setKvFloor]          = useState(110);
  const [presentKvs,       setPresentKvs]       = useState(null);
  const [countryCenter,      setCountryCenter]      = useState(null);
  const [countryReady,       setCountryReady]       = useState(false);
  const [activeTab,          setActiveTab]          = useState('overview');
  const [panelWidth,         setPanelWidth]         = useState(PANEL_WIDTH_DEFAULT); // same starting size as RegionPage
  const isDrRef   = useRef(false);
  const drStartX  = useRef(0);
  const drStartW  = useRef(0);
  const [wbView,             setWbView]             = useState(DEFAULT_WB_VIEW);
  const wbViewRef = useRef(wbView);   // what a rebuilt map (theme change) starts from
  const wbBase = useWbStyleBase();
  const [loadCentersOn,      setLoadCentersOn]      = useState(true);
  const [lcMinPop,           setLcMinPop]           = useState(300_000);
  const [lcCircleScale,      setLcCircleScale]      = useState(1.0);
  const [zoneMode,           setZoneMode]           = useState('plain');
  const [nZones,             setNZones]             = useState(null);
  const [zonesIndex,         setZonesIndex]         = useState(null);
  const [zoneLabelsOn,       setZoneLabelsOn]       = useState(false);
  const [zoneCorridorsOn,    setZoneCorridorsOn]    = useState(false);
  const [hasNote,    setHasNote]    = useState(null);
  const [marketAvailable, setMarketAvailable] = useState(null);
  const [noteOpen,   setNoteOpen]   = useState(false);
  const noteIframeRef = useRef(null);
  const [editOpen,   setEditOpen]   = useState(false);
  const [editForm,   setEditForm]   = useState({ passage: '', suggestion: '', firstName: '', lastName: '', email: '' });
  const [editStatus, setEditStatus] = useState('idle');

  // Open the "suggest an edit" form, pre-filling any text the user highlighted in
  // the briefing note (same-origin iframe → we can read its selection).
  const openEditSuggestion = () => {
    let passage = '';
    try { passage = noteIframeRef.current?.contentWindow?.getSelection?.().toString().trim() || ''; } catch { /* guard */ }
    setEditForm({ passage, suggestion: '', firstName: '', lastName: '', email: '' });
    setEditStatus('idle');
    setEditOpen(true);
  };

  async function submitEditSuggestion(e) {
    e.preventDefault();
    if (!editForm.suggestion.trim()) return;
    setEditStatus('sending');
    try {
      await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST', mode: 'no-cors',
        body: new URLSearchParams({
          type: 'brief-edit',
          country: country?.name || '', iso,
          passage: editForm.passage, suggestion: editForm.suggestion,
          name: `${editForm.firstName} ${editForm.lastName}`.trim(),
          firstName: editForm.firstName, lastName: editForm.lastName,
          email: editForm.email,
          url: window.location.href,
          source: 'Regional Power Explorer',
        }),
      });
      setEditStatus('sent');
    } catch {
      setEditStatus('error');
    }
  }
  const mapReadyRef        = useRef(false);
  const countryFeatureRef  = useRef(null);
  const adaptiveMinRef     = useRef(0);   // adaptive default min-MW for this country
  const [isMobile,        setIsMobile]        = useState(() => window.innerWidth < 700);
  const [layerPanelOpen,  setLayerPanelOpen]  = useState(false);
  const [sheetHeight,     setSheetHeight]     = useState(96);
  const [isDragging,      setIsDragging]      = useState(false);
  const dragRef = useRef(null);

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

  // Static data — fetch once
  useEffect(() => {
    fetch(dataPath('tariffs.json')).then(r => r.json()).then(setTariffs).catch(() => {});
    fetch(dataPath('access.json')).then(r => r.json()).then(setAccess).catch(() => {});
    fetch(dataPath('zones/index.json')).then(r => r.json()).then(setZonesIndex).catch(() => setZonesIndex({}));
  }, []);

  useEffect(() => {
    fetch(dataPath('regions.json')).then(r => r.json()).then(d => {
      for (const region of (d.regions || [])) {
        if (region.type === 'meta') continue; // meta-regions have no cache files
        const country = region.countries.find(c => c.iso === iso);
        if (country) {
          setInfo({ country, region });
          // Check GPPD and GEM availability for this region
          fetch(dataPath(`cache/region_plants_${region.id}_gppd.geojson`), { method: 'HEAD' })
            .then(r => setGppdAvailable(r.ok))
            .catch(() => setGppdAvailable(false));
          fetch(dataPath(`cache/region_plants_${region.id}_gem.geojson`), { method: 'HEAD' })
            .then(r => setGemAvailable(r.ok))
            .catch(() => setGemAvailable(false));
          if (BRIEFS_ENABLED) {
            fetch(dataPath(`notes/${iso}.html`), { method: 'HEAD' })
              .then(r => setHasNote(r.ok))
              .catch(() => setHasNote(false));
          } else {
            setHasNote(false);
          }
          fetch(dataPath(`market/${iso}.json`), { method: 'HEAD' })
            // Dev server (and some static hosts) return 200 + index.html for
            // any unmatched path, so r.ok alone can't tell a real JSON file
            // from the SPA fallback — only every country having a notes file
            // kept that same flaw invisible in the hasNote check above.
            .then(r => setMarketAvailable(r.ok && (r.headers.get('content-type') || '').includes('json')))
            .catch(() => setMarketAvailable(false));
          return;
        }
      }
    });
    setFuelsOff(new Set()); setStatusOff(new Set()); setKvsOff(new Set());
    setLinesOn(true); setPlantsOn(true); setSubsOn(false); setMinMw(100); setCircleScale(1.0);
    setLcCircleScale(1.0);
    setPlantSource('gem'); setGppdAvailable(null); setGemAvailable(null); setCountryCenter(null);
    setZoneMode('plain'); setNZones(null); setZoneLabelsOn(false);
    setHasNote(null); setNoteOpen(false); setCountryReady(false);
    setMarketAvailable(null);
    mapReadyRef.current = false;
    countryFeatureRef.current = null;
    track('country_view', { iso });
  }, [iso]);

  useEffect(() => {
    if (!containerRef.current || !info || !wbBase) return;
    const { region } = info;
    const tv = getT(theme);

    let disposed = false;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildWbStyle(wbBase, tv, wbViewRef.current),
      center: [0, 20], zoom: 2,
      minZoom: 1, maxZoom: 16,
      attributionControl: false,
    });
    mapRef.current = map;

    const popup = new maplibregl.Popup({
      closeButton: false, closeOnClick: false, offset: 10,
      className: `popup-${theme}`,
    });

    map.on('load', async () => {
      const [countries, bboxes, ndlsa, plantsGJ, linesGJ, subsGJ, lcGJ, admin1GJ] = await Promise.all([
        fetchGeo('country', iso),
        fetchBboxes(),
        fetchNdlsa(),
        fetch(dataPath(`cache/region_plants_${region.id}.geojson`)).then(r => r.json()),
        fetch(dataPath(`cache/region_lines_${region.id}.geojson`)).then(r => r.json()),
        fetch(dataPath(`cache/region_substations_${region.id}.geojson`)).then(r => r.json()).catch(() => ({ type: 'FeatureCollection', features: [] })),
        fetch(dataPath(`region_load_centers_${region.id}.geojson`)).then(r => r.json()).catch(() => ({ type: 'FeatureCollection', features: [] })),
        fetch(dataPath(`cache/region_admin1_${region.id}.geojson`)).then(r => r.ok ? r.json() : { type: 'FeatureCollection', features: [] }).catch(() => ({ type: 'FeatureCollection', features: [] })),
      ]);

      if (disposed) return;
      const bounds = boundsFor(bboxes, 'countries', iso, 0.8);
      if (bounds) {
        map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 9 });
        setCountryCenter({
          lon: (bounds[0][0] + bounds[1][0]) / 2,
          lat: (bounds[0][1] + bounds[1][1]) / 2,
        });
      }

      // Filter plants strictly inside the country polygon (point-in-polygon)
      // Lines filtered by bbox (segments cross borders by nature)
      const countryFeature = countries.features.find(f => f.properties.ISO_A3 === iso);
      countryFeatureRef.current = countryFeature || null;
      setCountryReady(true);
      let filteredPlants = plantsGJ;
      let filteredLines  = linesGJ;
      let filteredSubs   = subsGJ;
      if (countryFeature) {
        filteredPlants = {
          ...plantsGJ,
          features: plantsGJ.features.filter(f =>
            pointInFeature(f.geometry.coordinates, countryFeature)
          ),
        };
        filteredLines = {
          ...linesGJ,
          features: linesGJ.features.filter(f =>
            f.geometry.coordinates.some(coord => pointInFeature(coord, countryFeature))
          ),
        };
        filteredSubs = {
          ...subsGJ,
          features: subsGJ.features.filter(f =>
            pointInFeature(f.geometry.coordinates, countryFeature)
          ),
        };
      }

      setFilteredPlantsData(filteredPlants);
      setFilteredLinesData(filteredLines);
      // Slider floor comes from the data itself: regions.yaml sets a different
      // min_kv per region, and this way the UI never promises voltages the file
      // doesn't hold.
      const taggedKv = filteredLines.features
        .map(f => f.properties.v)
        .filter(v => v > 0);
      const floorKv = taggedKv.length ? Math.floor(Math.min(...taggedKv) / 1000) : 110;
      setKvFloor(floorKv);
      // A theme switch rebuilds the map from scratch; keep whatever the slider
      // was set to as long as the new data can honour it, and only fall back to
      // the floor when it can't (first load, or a region with a higher floor).
      setMinKv(kv => (kv >= floorKv && kv <= 500 ? kv : floorKv));
      // Regions with a 110 kV floor hold no 33-110 kV and no untagged lines;
      // an empty legend row would just be a dead checkbox.
      setPresentKvs(new Set(filteredLines.features.map(f => bracketFor(f.properties.v).key)));

      // Adaptive default min-MW: show all of a small country (e.g. Madagascar),
      // cap big ones to the ~150 largest. Replaces the flat 100 MW default.
      const adaptMin = adaptiveMinMw(filteredPlants.features, 150);
      adaptiveMinRef.current = adaptMin;
      setMinMw(adaptMin);

      const filteredLc = {
        ...lcGJ,
        features: lcGJ.features.filter(f => f.properties.iso === iso),
      };

      addCountriesSource(map, countries);
      map.addSource('plants',       { type: 'geojson', data: filteredPlants });
      map.addSource('lines',        { type: 'geojson', data: filteredLines  });
      map.addSource('substations',  { type: 'geojson', data: filteredSubs   });
      map.addSource('load-centers', { type: 'geojson', data: filteredLc     });
      map.addSource('admin1',       { type: 'geojson', data: admin1GJ       });
      const hlFilter = ['==', ['get', 'ISO_A3'], iso];
      map.addSource('zone-fills',        { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('zone-lines',        { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('zone-corridors-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('zone-centroids-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('zone-outside',       { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });


      // Transmission lines
      for (const bracket of VOLTAGE_BRACKETS) {
        const { colors, width, key } = bracket;
        map.addLayer({
          id: `lines-${key}`,
          type: 'line',
          source: 'lines',
          filter: kvFilterWithFloor(bracket, minKv),
          paint: {
            'line-color': colors[theme] ?? colors.fog, 'line-width': width,
            'line-opacity': tv.isDark ? 0.92 : 0.65,
          },
        });
      }

      // Country highlight fill (below zones)
      const hl = tv.highlight;
      map.addLayer({
        id: 'country-fill',
        type: 'fill',
        source: 'countries',
        filter: hlFilter,
        paint: { 'fill-color': hl.fill, 'fill-opacity': 0.08 },
      }, fillAnchor(map));
      // The country takes the highlight; a non-determined area it is party to
      // comes out at half strength, see ndlsaFill(). Outlines come from the basemap.
      addNdlsaLayer(map, { ndlsa, colorForIso: c => (c === iso ? hl.fill : null),
        opacity: 0.08, before: fillAnchor(map), t: tv });

      // Admin-1 province/state boundaries (shown in 'admin' zone mode)
      map.addLayer({
        id: 'admin1-fills', type: 'fill', source: 'admin1',
        filter: ['==', ['get', 'ISO_A3'], iso],
        layout: { visibility: 'visible' },
        paint: { 'fill-color': '#7799bb', 'fill-opacity': 0.06 },
      });
      map.addLayer({
        id: 'admin1-borders', type: 'line', source: 'admin1',
        filter: ['==', ['get', 'ISO_A3'], iso],
        layout: { visibility: 'visible' },
        paint: { 'line-color': '#5577aa', 'line-width': 0.7, 'line-opacity': 0.35 },
      });

      // Plants
      const fuels = new Set();
      for (const f of plantsGJ.features) {
        const fuel = f.properties.fuel;
        if (fuel && FUEL_COLORS[fuel]) fuels.add(fuel);
      }
      setPresentFuels(fuels);

      for (const [fuel, color] of Object.entries(FUEL_COLORS)) {
        if (!fuels.has(fuel)) continue;
        map.addLayer({
          id: `plants-${fuel}`,
          type: 'circle',
          source: 'plants',
          filter: buildPlantFilter(fuel, adaptMin, new Set(['planned'])),
          paint: {
            'circle-radius':  plantRadiusExpr(),
            'circle-color':   color,
            'circle-opacity': 0.90,
            'circle-stroke-width': 0.6,
            'circle-stroke-color': 'rgba(0,0,0,0.3)',
          },
        });

        map.on('mouseenter', `plants-${fuel}`, e => {
          map.getCanvas().style.cursor = 'pointer';
          const p = e.features[0].properties;
          const name = p.name ? `<b>${p.name}</b><br>` : '';
          popup
            .setLngLat(e.features[0].geometry.coordinates)
            .setHTML(`${name}<span style="opacity:.75">${fuel} · ${p.mw} MW</span>`)
            .addTo(map);
        });
        map.on('mouseleave', `plants-${fuel}`, () => {
          map.getCanvas().style.cursor = ''; popup.remove();
        });
      }

      // ── Substations (tiny dimgrey squares via custom image) ──────────────────
      const sqSz = 5;
      const sqData = new Uint8Array(sqSz * sqSz * 4);
      for (let i = 0; i < sqSz * sqSz; i++) {
        sqData[i * 4] = 105; sqData[i * 4 + 1] = 105; sqData[i * 4 + 2] = 105;
        sqData[i * 4 + 3] = tv.isDark ? 160 : 130;
      }
      map.addImage('sub-sq', { width: sqSz, height: sqSz, data: sqData });
      map.addLayer({
        id: 'substations', type: 'symbol', source: 'substations',
        layout: { 'icon-image': 'sub-sq', 'icon-allow-overlap': true, 'icon-ignore-placement': true, visibility: 'none' },
        paint: { 'icon-opacity': 0.8 },
      });
      map.on('mouseenter', 'substations', e => {
        map.getCanvas().style.cursor = 'pointer';
        const p = e.features[0].properties;
        const name = p.name ? `<b>${p.name}</b><br>` : '';
        const kv = p.v ? `${Math.round(p.v / 1000)} kV` : '';
        popup.setLngLat(e.features[0].geometry.coordinates).setHTML(`${name}<span style="opacity:.75">Substation${kv ? ' · ' + kv : ''}</span>`).addTo(map);
      });
      map.on('mouseleave', 'substations', () => { map.getCanvas().style.cursor = ''; popup.remove(); });

      // ── Feature click → detail card ──────────────────────────────────────
      let clickedPoint = false;

      for (const fuel of Object.keys(FUEL_COLORS)) {
        map.on('click', `plants-${fuel}`, e => {
          clickedPoint = true;
          const p = e.features[0].properties;
          setSelFeature({ type: 'plant', props: { ...p, fuel } });
        });
      }
      map.on('click', 'substations', e => {
        clickedPoint = true;
        setSelFeature({ type: 'substation', props: e.features[0].properties });
      });
      const LINE_LAYERS = VOLTAGE_BRACKETS.map(b => `lines-${b.key}`);

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
          const geom = feat.geometry;
          const coords = geom.type === 'LineString' ? geom.coordinates : geom.coordinates.flat();
          const fromName = nearestSubName(coords[0]);
          const toName   = nearestSubName(coords[coords.length - 1]);
          popup.setLngLat(e.lngLat)
            .setHTML(linePopupHTML(feat.properties, [fromName, toName]))
            .addTo(map);
        });
        map.on('mousemove', `lines-${key}`, e => { popup.setLngLat(e.lngLat); });
        map.on('mouseleave', `lines-${key}`, () => { map.getCanvas().style.cursor = ''; popup.remove(); });
      }

      map.on('click', e => {
        if (clickedPoint) { clickedPoint = false; return; }
        clickedPoint = false;
        const { x, y } = e.point;
        const bbox = [[x - 8, y - 8], [x + 8, y + 8]];
        const active = LINE_LAYERS.filter(id => { try { return !!map.getLayer(id); } catch { return false; } });
        const lineFeats = active.length ? map.queryRenderedFeatures(bbox, { layers: active }) : [];
        if (lineFeats.length > 0) {
          const props   = lineFeats[0].properties;
          const v       = props.v;
          const bracket = bracketFor(v);
          const geom = lineFeats[0].geometry;
          const coords = geom.type === 'LineString' ? geom.coordinates : geom.coordinates.flat();
          setSelFeature({
            type:  'line',
            props: { ...props, voltageLabel: v ? `${Math.round(v / 1000)} kV` : bracket.label },
            km:    lineKm(coords),
          });
        } else {
          setSelFeature(null);
        }
      });

      // ── Off-model areas ──────────────────────────────────────────────────────
      // Parts of the country that belong to no dispatch zone because they sit
      // outside the modelled electrical system (CASA: the KEGOC Western zone, the
      // Afghan provinces off NEPS). Drawn grey and dashed under the zone layers so
      // the hole in the zoning explains itself instead of reading as missing data.
      // Loaded from <ISO>_<n>z_outside.geojson — countries without the file get an
      // empty source and nothing is shown.
      map.addLayer({
        id: 'zone-outside-fill', type: 'fill', source: 'zone-outside',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#9a9a9a', 'fill-opacity': 0.18 },
      });
      map.addLayer({
        id: 'zone-outside-border', type: 'line', source: 'zone-outside',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#7a7a7a', 'line-width': 1, 'line-dasharray': [2, 1.5], 'line-opacity': 0.7 },
      });
      map.addLayer({
        id: 'zone-outside-labels', type: 'symbol', source: 'zone-outside',
        layout: {
          visibility: 'none',
          'text-field': ['get', 'zone_name'],
          'text-size': 10,
          'text-anchor': 'center',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#5a5a5a',
          'text-halo-color': 'rgba(255,255,255,0.85)',
          'text-halo-width': 1.5,
        },
      });
      map.on('mouseenter', 'zone-outside-fill', e => {
        map.getCanvas().style.cursor = 'pointer';
        const { zone_name, zone_id, reason, area_km2 } = e.features[0].properties;
        const km2 = area_km2 ? ` — ${Number(area_km2).toLocaleString()} km²` : '';
        popup.setLngLat(e.lngLat)
          .setHTML(`<b>${zone_name || zone_id}</b><br><span style="opacity:.75">Not modelled${km2}</span>`
            + (reason ? `<br><span style="opacity:.6">${reason}</span>` : ''))
          .addTo(map);
      });
      map.on('mousemove', 'zone-outside-fill', e => { popup.setLngLat(e.lngLat); });
      map.on('mouseleave', 'zone-outside-fill', () => { map.getCanvas().style.cursor = ''; popup.remove(); });

      // ── Zone overlay (fill + border + labels + interzone lines) ──────────────
      map.addLayer({
        id: 'zone-fills', type: 'fill', source: 'zone-fills',
        layout: { visibility: 'none' },
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 },
      });
      map.addLayer({
        id: 'zone-borders', type: 'line', source: 'zone-fills',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#333', 'line-width': 0.9, 'line-opacity': 0.5 },
      });
      map.addLayer({
        id: 'zone-labels', type: 'symbol', source: 'zone-fills',
        layout: {
          visibility: 'none',
          'text-field': ['get', 'zone_name'],
          'text-size': 11,
          'text-anchor': 'center',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#111',
          'text-halo-color': 'rgba(255,255,255,0.9)',
          'text-halo-width': 2,
        },
      });
      map.addLayer({
        id: 'zone-links', type: 'line', source: 'zone-lines',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#444', 'line-width': 2.5, 'line-opacity': 0.6, 'line-dasharray': [5, 4] },
      });

      // Corridor capacity lines (existing only — no planned)
      const mwWidthExpr = ['interpolate', ['linear'], ['get', 'mw'], 0, 1.5, 500, 3.0, 2000, 6.0];
      map.addLayer({
        id: 'zone-corridors-ex', type: 'line', source: 'zone-corridors-src',
        filter: ['!', ['in', ['get', 'status'], ['literal', ['planned', 'candidate', 'long_term']]]],
        layout: { visibility: 'none' },
        paint: { 'line-color': '#1a5fa8', 'line-width': mwWidthExpr, 'line-opacity': 0.85 },
      });
      map.addLayer({
        id: 'zone-corridors-labels', type: 'symbol', source: 'zone-corridors-src',
        filter: ['!', ['in', ['get', 'status'], ['literal', ['planned', 'candidate', 'long_term']]]],
        layout: {
          visibility: 'none',
          'text-field': ['get', 'label'],
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
        id: 'zone-corridors-dots', type: 'circle', source: 'zone-centroids-src',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 4, 'circle-color': '#696969',
          'circle-opacity': 0.75,
          'circle-stroke-width': 1.2, 'circle-stroke-color': 'rgba(255,255,255,0.7)',
        },
      });

      // Country border on top of zone layers so it always covers zone outer edges
      map.addLayer({
        id: 'country-border',
        type: 'line',
        source: 'countries',
        filter: hlFilter,
        paint: { 'line-color': hl.border, 'line-width': hl.borderW + 0.4, 'line-opacity': 0.95 },
      });

      // ── Load centers ─────────────────────────────────────────────────────────
      map.addLayer({
        id: 'load-centers', type: 'circle', source: 'load-centers',
        filter: ['>=', ['get', 'pop'], 300_000],
        paint: {
          'circle-radius': lcRadiusExpr(),
          'circle-color': '#1a237e',
          'circle-opacity': 0.72,
          'circle-stroke-width': 1.2,
          'circle-stroke-color': 'rgba(255,255,255,0.65)',
        },
      });
      map.addLayer({
        id: 'load-centers-labels', type: 'symbol', source: 'load-centers',
        filter: ['>=', ['get', 'pop'], 300_000],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 9,
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#1a237e',
          'text-halo-color': 'rgba(255,255,255,0.88)',
          'text-halo-width': 1.5,
        },
      });
      map.on('mouseenter', 'load-centers', e => {
        map.getCanvas().style.cursor = 'pointer';
        const p = e.features[0].properties;
        const pop = p.pop >= 1_000_000
          ? `${(p.pop / 1_000_000).toFixed(1)}M`
          : `${Math.round(p.pop / 1_000)}k`;
        popup.setLngLat(e.features[0].geometry.coordinates).setHTML(`<b>${p.name}</b><br><span style="opacity:.75">${pop} pop.</span>`).addTo(map);
      });
      map.on('mouseleave', 'load-centers', () => { map.getCanvas().style.cursor = ''; popup.remove(); });

      mapReadyRef.current = true;

      raiseBoundaries(map);
      // Anything toggled while the map was still loading.
      applyWbView(map, wbViewRef.current);
    });

    return () => {
      disposed = true;
      mapReadyRef.current = false;
      popup.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [info, theme, wbBase]);

  // ── Basemap switcher ─────────────────────────────────────────────────────
  // The initial view is baked into the style; later changes are applied live.
  useEffect(() => {
    wbViewRef.current = wbView;
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    applyWbView(map, wbView);
  }, [wbView]);

  // ── Layer toggle handlers ────────────────────────────────────────────────

  const toggleFuel = useCallback(fuel => {
    const map = mapRef.current;
    if (!map || !map.getLayer(`plants-${fuel}`)) return;
    setFuelsOff(prev => {
      const next = new Set(prev);
      if (next.has(fuel)) { next.delete(fuel); map.setLayoutProperty(`plants-${fuel}`, 'visibility', 'visible'); }
      else                { next.add(fuel);    map.setLayoutProperty(`plants-${fuel}`, 'visibility', 'none');    }
      return next;
    });
  }, []);

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
      for (const fuel of presentFuels)
        if (!fuelsOff.has(fuel) && map.getLayer(`plants-${fuel}`))
          map.setLayoutProperty(`plants-${fuel}`, 'visibility', next ? 'visible' : 'none');
      return next;
    });
  }, [presentFuels, fuelsOff]);

  const toggleSubs = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('substations')) return;
    setSubsOn(prev => {
      const next = !prev;
      map.setLayoutProperty('substations', 'visibility', next ? 'visible' : 'none');
      return next;
    });
  }, []);

  const toggleStatus = useCallback(status => {
    const map = mapRef.current;
    if (!map) return;
    setStatusOff(prev => {
      const next = new Set(prev);
      next.has(status) ? next.delete(status) : next.add(status);
      for (const fuel of Object.keys(FUEL_COLORS)) {
        if (!map.getLayer(`plants-${fuel}`)) continue;
        map.setFilter(`plants-${fuel}`, buildPlantFilter(fuel, minMw, next));
      }
      return next;
    });
  }, [minMw]);

  const toggleLoadCenters = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setLoadCentersOn(prev => {
      const next = !prev;
      for (const id of ['load-centers', 'load-centers-labels']) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', next ? 'visible' : 'none');
      }
      return next;
    });
  }, []);

  const toggleZoneLabels = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('zone-labels')) return;
    setZoneLabelsOn(prev => {
      const next = !prev;
      map.setLayoutProperty('zone-labels', 'visibility', next ? 'visible' : 'none');
      return next;
    });
  }, []);

  const toggleZoneCorridors = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setZoneCorridorsOn(prev => {
      const next = !prev;
      for (const id of ['zone-corridors-ex', 'zone-corridors-labels', 'zone-corridors-dots']) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', next ? 'visible' : 'none');
      }
      return next;
    });
  }, []);

  const handleLcMinPop = useCallback(pop => {
    const map = mapRef.current;
    if (!map) return;
    setLcMinPop(pop);
    for (const id of ['load-centers', 'load-centers-labels']) {
      if (map.getLayer(id)) map.setFilter(id, ['>=', ['get', 'pop'], pop]);
    }
  }, []);

  const handleMinMw = useCallback(mw => {
    const map = mapRef.current;
    if (!map) return;
    setMinMw(mw);
    setStatusOff(prev => {
      for (const fuel of Object.keys(FUEL_COLORS)) {
        if (!map.getLayer(`plants-${fuel}`)) continue;
        map.setFilter(`plants-${fuel}`, buildPlantFilter(fuel, mw, prev));
      }
      return prev;
    });
  }, []);

  const handleCircleScale = useCallback(scale => {
    const map = mapRef.current;
    if (!map) return;
    setCircleScale(scale);
    for (const fuel of Object.keys(FUEL_COLORS)) {
      if (!map.getLayer(`plants-${fuel}`)) continue;
      map.setPaintProperty(`plants-${fuel}`, 'circle-radius', plantRadiusExpr(scale));
    }
  }, []);

  const handleLcCircleScale = useCallback(scale => {
    const map = mapRef.current;
    if (!map) return;
    setLcCircleScale(scale);
    if (map.getLayer('load-centers')) {
      map.setPaintProperty('load-centers', 'circle-radius', lcRadiusExpr(scale));
    }
  }, []);

  // ── Zone overlay ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || !map.getSource('zone-fills')) return;
    const ZONE_IDS  = ['zone-fills', 'zone-borders'];
    const OUT_IDS   = ['zone-outside-fill', 'zone-outside-border', 'zone-outside-labels'];
    const ADMIN_IDS = ['admin1-fills', 'admin1-borders'];

    const showAdmin = zoneMode === 'admin';
    for (const id of ADMIN_IDS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showAdmin ? 'visible' : 'none');
    }

    if (zoneMode !== 'modeling' || !nZones) {
      for (const id of [...ZONE_IDS, ...OUT_IDS]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      }
      for (const id of ['zone-corridors-ex', 'zone-corridors-labels', 'zone-corridors-dots']) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      }
      return;
    }

    const COLORS = ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac'];
    const label = `${iso}_${nZones}z`;

    Promise.all([
      fetch(dataPath(`zones/${label}_zones.geojson`)).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(dataPath(`zones/${label}_topo.json`)).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(dataPath(`zones/${label}_corridors.geojson`)).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(dataPath(`zones/${label}_outside.geojson`)).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([zonesGJ, topo, corridorsGJ, outsideGJ]) => {
      if (!zonesGJ || !map.getSource('zone-fills')) return;
      zonesGJ.features.forEach((f, i) => { f.properties.color = COLORS[i % COLORS.length]; });
      map.getSource('zone-fills').setData(zonesGJ);

      // Build interzone line geometries from centroids
      const centroids = {};
      for (const f of zonesGJ.features) {
        const name = f.properties.zone_name;
        const coords = f.geometry.type === 'Polygon'
          ? f.geometry.coordinates[0]
          : f.geometry.coordinates[0][0];
        centroids[name] = [
          coords.reduce((s, p) => s + p[0], 0) / coords.length,
          coords.reduce((s, p) => s + p[1], 0) / coords.length,
        ];
      }
      const lineFeatures = topo
        .filter(l => centroids[l.z] && centroids[l.zz])
        .map(l => ({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [centroids[l.z], centroids[l.zz]] },
          properties: l,
        }));
      map.getSource('zone-lines').setData({ type: 'FeatureCollection', features: lineFeatures });

      // Corridor capacity overlay — always update source (clear if no file for this zone count)
      const emptyGJ = { type: 'FeatureCollection', features: [] };
      if (map.getSource('zone-corridors-src'))
        map.getSource('zone-corridors-src').setData(corridorsGJ || emptyGJ);
      // Extract unique zone centroids from corridor endpoints
      const centroidMap = new Map();
      for (const f of (corridorsGJ?.features || [])) {
        const [s, e] = [f.geometry.coordinates[0], f.geometry.coordinates[f.geometry.coordinates.length - 1]];
        const ks = `${s[0]},${s[1]}`;
        const ke = `${e[0]},${e[1]}`;
        if (!centroidMap.has(ks)) centroidMap.set(ks, { type: 'Feature', geometry: { type: 'Point', coordinates: s }, properties: { zone: f.properties.zone_a } });
        if (!centroidMap.has(ke)) centroidMap.set(ke, { type: 'Feature', geometry: { type: 'Point', coordinates: e }, properties: { zone: f.properties.zone_b } });
      }
      if (map.getSource('zone-centroids-src'))
        map.getSource('zone-centroids-src').setData({ type: 'FeatureCollection', features: [...centroidMap.values()] });
      for (const id of ['zone-corridors-ex', 'zone-corridors-labels', 'zone-corridors-dots']) {
        if (map.getLayer(id))
          map.setLayoutProperty(id, 'visibility', zoneCorridorsOn ? 'visible' : 'none');
      }

      for (const id of ZONE_IDS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
      }

      // Off-model areas: shown only where the file exists, so the other countries
      // (fully covered by their zones) are untouched.
      const hasOutside = !!outsideGJ?.features?.length;
      if (map.getSource('zone-outside'))
        map.getSource('zone-outside').setData(outsideGJ || emptyGJ);
      for (const id of OUT_IDS) {
        if (map.getLayer(id))
          map.setLayoutProperty(id, 'visibility',
            hasOutside && (id !== 'zone-outside-labels' || zoneLabelsOn) ? 'visible' : 'none');
      }
      if (map.getLayer('zone-labels'))
        map.setLayoutProperty('zone-labels', 'visibility', zoneLabelsOn ? 'visible' : 'none');
    });
  }, [zoneMode, nZones, iso, zoneLabelsOn, zoneCorridorsOn]);

  // ── Plant source hot-swap ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource('plants') || !info || !countryReady) return;
    const suffix = plantSource === 'gppd' ? '_gppd' : plantSource === 'gem' ? '_gem' : '';
    const filename = `region_plants_${info.region.id}${suffix}.geojson`;
    fetch(dataPath(`cache/${filename}`))
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        const cf = countryFeatureRef.current;
        const filtered = {
          ...data,
          features: data.features.filter(f => pointInFeature(f.geometry.coordinates, cf)),
        };
        map.getSource('plants').setData(filtered);
        setFilteredPlantsData(filtered);
        const fuels = new Set(filtered.features.map(f => f.properties.fuel).filter(f => FUEL_COLORS[f]));
        setPresentFuels(fuels);
      })
      .catch(() => {
        if (plantSource === 'gppd') { setGppdAvailable(false); setPlantSource('osm'); }
        if (plantSource === 'gem')  { setGemAvailable(false);  setPlantSource('osm'); }
      });
  }, [plantSource, info, countryReady]);

  // Capacity summary for right panel
  // Always fetch GPKG base + primary source; merge countries (primary wins, GPKG fills gaps)
  useEffect(() => {
    if (!info) return;
    setCapacity(null);
    const capSuffix = plantSource === 'gppd' ? '_gppd' : plantSource === 'gem' ? '_gem' : '';
    const baseUrl    = dataPath(`cache/region_capacity_${info.region.id}.json`);
    const primaryUrl = capSuffix ? dataPath(`cache/region_capacity_${info.region.id}${capSuffix}.json`) : null;
    Promise.all([
      fetch(baseUrl).then(r => r.json()).catch(() => null),
      primaryUrl ? fetch(primaryUrl).then(r => r.json()).catch(() => null) : Promise.resolve(null),
    ]).then(([base, primary]) => {
      if (!base && !primary) return;
      if (!primary) { setCapacity(base); return; }
      if (!base)    { setCapacity(primary); return; }
      // Merge: primary-source wins per country, GPKG fills gaps
      setCapacity({ ...primary, countries: { ...(base.countries || {}), ...(primary.countries || {}) } });
    });
  }, [info, plantSource]);

  // Fleet age — GPPD only
  useEffect(() => {
    setFleetAge(null);
    if (!info || plantSource !== 'gppd') return;
    fetch(dataPath(`cache/region_age_${info.region.id}_gppd.json`))
      .then(r => r.ok ? r.json() : null)
      .then(setFleetAge)
      .catch(() => setFleetAge(null));
  }, [plantSource, info]);


  // ── Briefing note: close on Esc ──────────────────────────────────────────
  useEffect(() => {
    if (!noteOpen) return;
    const onKey = e => { if (e.key === 'Escape') setNoteOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [noteOpen]);

  // ── Download handlers ────────────────────────────────────────────────────

  const handleDownloadPlants = useCallback((format = 'geojson') => {
    if (!filteredPlantsData) return;
    track('data_download', { type: 'plants', format, source: plantSource, iso });
    const suffix = plantSource === 'gppd' ? '_gppd' : plantSource === 'gem' ? '_gem' : '';
    if (format === 'csv') {
      const header = 'name,fuel,mw,country,status,lat,lon,source';
      const rows = filteredPlantsData.features.map(f => {
        const p = f.properties;
        const [lon, lat] = f.geometry.coordinates;
        return [
          `"${(p.name || '').replace(/"/g, '""')}"`,
          p.fuel || '', p.mw || '', p.country || '',
          p.status || 'operating', lat.toFixed(5), lon.toFixed(5),
          plantSource,
        ].join(',');
      });
      downloadBlob([header, ...rows].join('\n'), `plants_${iso}${suffix}.csv`, 'text/csv');
    } else {
      downloadBlob(JSON.stringify(filteredPlantsData), `plants_${iso}.geojson`, 'application/geo+json');
    }
  }, [filteredPlantsData, iso, plantSource]);


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

  const handleDownloadLines = useCallback((format = 'geojson') => {
    if (!filteredLinesData) return;
    track('data_download', { type: 'lines', format, iso });
    // What you see is what you get: the legend toggles and the min-kV slider sit
    // next to this button, so the file matches the map rather than the raw cache.
    const feats = visibleLineFeatures(filteredLinesData.features, { minKv, kvsOff });
    if (format === 'csv') {
      downloadBlob(linesToCSV(feats), `lines_${iso}.csv`, 'text/csv');
    } else {
      downloadBlob(JSON.stringify(linesToDownloadGeoJSON(feats)),
        `lines_${iso}.geojson`, 'application/geo+json');
    }
  }, [filteredLinesData, iso, minKv, kvsOff]);

  if (!info) return <div style={{ padding: 40, color: t.text }}>Loading…</div>;

  const { country, region } = info;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 46px)', position: 'relative' }}
      onMouseMove={e => { if (!isDrRef.current) return; setPanelWidth(w => Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, drStartW.current + (drStartX.current - e.clientX)))); }}
      onMouseUp={() => { isDrRef.current = false; }}
      onMouseLeave={() => { isDrRef.current = false; }}
    >
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
        fuelsOff={fuelsOff} statusOff={statusOff} kvsOff={kvsOff}
        linesOn={linesOn} plantsOn={plantsOn} subsOn={subsOn}
        minMw={minMw} circleScale={circleScale}
        plantSource={plantSource} gppdAvailable={gppdAvailable} gemAvailable={gemAvailable} regionId={region.id} iso={iso}
        presentFuels={presentFuels}
        wbView={wbView} onWbView={setWbView}
        onToggleFuel={toggleFuel} onToggleStatus={toggleStatus} onToggleKv={toggleKv}
        onToggleLines={toggleLines} onTogglePlants={togglePlants}
        onToggleSubs={toggleSubs}
        loadCentersOn={loadCentersOn} lcMinPop={lcMinPop} lcCircleScale={lcCircleScale}
        onToggleLoadCenters={toggleLoadCenters} onLcMinPopChange={handleLcMinPop}
        onLcCircleScaleChange={handleLcCircleScale}
        onMinMwChange={handleMinMw} onCircleScaleChange={handleCircleScale}
        onSourceChange={s => { setPlantSource(s); track('plant_source_change', { source: s, iso }); }}
        onDownloadPlants={handleDownloadPlants}
        onDownloadLines={handleDownloadLines}
        minKv={minKv} kvFloor={kvFloor} onMinKvChange={handleMinKvChange}
        presentKvs={presentKvs}
      />
      </div>

      <div style={{ flex: 1, position: 'relative', height: 'calc(100vh - 46px)' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, backgroundColor: t.bg }} />
        {isMobile && (
          <button onClick={() => setLayerPanelOpen(o => !o)} style={{
            position: 'absolute', top: 10, left: 12, zIndex: 200,
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 13px', borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${t.panelBorder}`,
            backgroundColor: t.panel,
            boxShadow: '0 1px 6px rgba(0,0,0,.22)', color: t.lbl,
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

        {isMobile && (
          <div style={{
            position: 'absolute', top: 10, right: 12, zIndex: 5,
            backgroundColor: t.panel, border: `1px solid ${t.panelBorder}`,
            borderRadius: 6, padding: '8px 12px',
            boxShadow: '0 1px 6px rgba(0,0,0,.2)',
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: t.lbl }}>Tap a plant or line</div>
            <div style={{ fontSize: '0.65rem', color: t.muted, marginTop: 2 }}>to explore its data</div>
          </div>
        )}

        {/* ── Floating zone selector ── */}
        {zonesIndex !== null && (
          <div style={{
            position: 'absolute', top: 10, right: 10, zIndex: 10,
            backgroundColor: t.panel, border: `1px solid ${t.panelBorder}`,
            borderRadius: 6, padding: '8px 10px', minWidth: 130,
            boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
          }}>
            <span style={{
              fontSize: '0.44rem', letterSpacing: '2px', fontWeight: 700,
              color: t.lblMuted, textTransform: 'uppercase', display: 'block', marginBottom: 6,
            }}>Zones</span>
            <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
              {[['plain', 'Plain'], ['admin', 'Admin'], ['modeling', 'Clustering']].map(([mode, label]) => {
                const active = zoneMode === mode;
                const disabled = mode === 'modeling' && !(zonesIndex[iso]?.length);
                return (
                  <button key={mode} disabled={disabled}
                    onClick={() => {
                      setZoneMode(mode);
                      if (mode === 'modeling' && !nZones && zonesIndex[iso]?.length) {
                        setNZones(defaultNZones(zonesIndex[iso]));
                      }
                    }}
                    style={{
                      flex: 1, fontSize: '0.5rem', padding: '3px 0',
                      borderRadius: 3, cursor: disabled ? 'default' : 'pointer',
                      fontFamily: 'inherit', letterSpacing: '0.5px',
                      border: `1px solid ${active ? 'rgba(74,143,204,0.65)' : t.panelBorder}`,
                      backgroundColor: active ? 'rgba(74,143,204,0.13)' : 'transparent',
                      color: active ? t.lbl : t.lblMuted,
                      opacity: disabled ? 0.4 : 1,
                    }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {zoneMode === 'modeling' && zonesIndex[iso]?.length ? (
              <>
                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {zonesIndex[iso].map(n => (
                    <button key={n} onClick={() => setNZones(n)} style={{
                      fontSize: '0.48rem', padding: '2px 6px',
                      borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${nZones === n ? 'rgba(74,143,204,0.65)' : t.panelBorder}`,
                      backgroundColor: nZones === n ? 'rgba(74,143,204,0.13)' : 'transparent',
                      color: nZones === n ? t.lbl : t.lblMuted,
                    }}>
                      {n}z
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 5, borderTop: `1px solid ${t.panelBorder}`, paddingTop: 4, display: 'flex', gap: 3 }}>
                  <button onClick={toggleZoneLabels} style={{
                    fontSize: '0.48rem', padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                    fontFamily: 'inherit', flex: 1,
                    border: `1px solid ${zoneLabelsOn ? 'rgba(74,143,204,0.65)' : t.panelBorder}`,
                    backgroundColor: zoneLabelsOn ? 'rgba(74,143,204,0.13)' : 'transparent',
                    color: zoneLabelsOn ? t.lbl : t.lblMuted,
                  }}>
                    Labels
                  </button>
                  <button onClick={toggleZoneCorridors} style={{
                    fontSize: '0.48rem', padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                    fontFamily: 'inherit', flex: 1,
                    border: `1px solid ${zoneCorridorsOn ? 'rgba(74,143,204,0.65)' : t.panelBorder}`,
                    backgroundColor: zoneCorridorsOn ? 'rgba(74,143,204,0.13)' : 'transparent',
                    color: zoneCorridorsOn ? t.lbl : t.lblMuted,
                  }}>
                    Corridors
                  </button>
                </div>
              </>
            ) : zoneMode === 'modeling' ? (
              <p style={{ fontSize: '0.48rem', color: t.lblMuted, fontStyle: 'italic', margin: 0 }}>
                No zone data — run pipeline
              </p>
            ) : null}
          </div>
        )}

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
                {selFeature.km > 0 && <Row label="Length" value={`~${Math.round(selFeature.km)} km`} t={t} />}
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
                  {p.country && <Row label="Country" value={p.country} t={t} />}
                  {p.status && p.status !== 'operating' && (
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

      {/* ── Briefing note drawer (covers map area only) ── */}
      {noteOpen && hasNote && (
        <>
          <div
            onClick={() => setNoteOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 998,
              backgroundColor: 'rgba(0,0,0,0.38)',
            }}
          />
          <div style={{
            position: 'fixed',
            top: 46,
            left: isMobile ? 0 : 170,
            right: isMobile ? 0 : 268,
            bottom: 0,
            zIndex: 999,
            backgroundColor: '#fff',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 10px',
              borderBottom: '1px solid #E2E6EA',
              backgroundColor: '#F8F9FB',
              flexShrink: 0,
            }}>
              <button
                onClick={openEditSuggestion}
                title="Propose a correction to this briefing note"
                style={{
                  background: 'none', border: '1px solid #CFE0F0',
                  borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
                  fontSize: '0.65rem', color: '#4A8FCC', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                </svg>
                Suggest an edit
              </button>
              <button
                onClick={() => setNoteOpen(false)}
                style={{
                  background: 'none', border: '1px solid #E2E6EA',
                  borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
                  fontSize: '0.65rem', color: '#5A6474', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Close (Esc)
              </button>
            </div>
            <iframe
              ref={noteIframeRef}
              src={dataPath(`notes/${iso}.html`)}
              title={`${country.name} – Sector Briefing Note`}
              style={{ flex: 1, border: 'none', width: '100%' }}
            />
          </div>
        </>
      )}

      {/* ── Suggest-an-edit modal (posts to the Google Sheet via Apps Script) ── */}
      {editOpen && (
        <div onClick={() => setEditOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <form onClick={e => e.stopPropagation()} onSubmit={submitEditSuggestion} style={{
            width: 'min(520px, 100%)', maxHeight: '86vh', overflowY: 'auto',
            backgroundColor: '#fff', borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
            padding: '18px 20px', fontFamily: 'inherit',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1B2A4A', margin: 0 }}>Suggest an edit</h3>
              <span style={{ fontSize: '0.62rem', color: '#5A6474' }}>{country?.name} · {iso}</span>
            </div>
            <p style={{ fontSize: '0.66rem', color: '#5A6474', lineHeight: 1.5, margin: '0 0 12px' }}>
              Propose a correction to this briefing note. Tip: highlight text in the note before clicking to pre-fill the passage.
            </p>

            {editStatus === 'sent' ? (
              <div style={{ fontSize: '0.78rem', color: '#1f8a4c', padding: '14px 0' }}>
                ✓ Thanks — your suggestion was sent.
                <div style={{ marginTop: 14 }}>
                  <button type="button" onClick={() => setEditOpen(false)} style={EDIT_BTN_PRIMARY}>Close</button>
                </div>
              </div>
            ) : (
              <>
                <label style={EDIT_LBL}>Passage concerned <span style={{ color: '#9aa3af', fontWeight: 400 }}>(optional)</span></label>
                <textarea value={editForm.passage} onChange={e => setEditForm(f => ({ ...f, passage: e.target.value }))}
                  rows={2} placeholder="The original text to fix (auto-filled if you selected it)" style={EDIT_INP} />

                <label style={EDIT_LBL}>Suggested correction *</label>
                <textarea value={editForm.suggestion} onChange={e => setEditForm(f => ({ ...f, suggestion: e.target.value }))}
                  rows={4} required placeholder="What should it say / what's wrong?" style={EDIT_INP} />

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={EDIT_LBL}>First name</label>
                    <input value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} style={EDIT_INP} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={EDIT_LBL}>Last name</label>
                    <input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} style={EDIT_INP} />
                  </div>
                </div>
                <label style={EDIT_LBL}>Your email</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} style={EDIT_INP} />

                {editStatus === 'error' && <div style={{ fontSize: '0.66rem', color: '#c0392b', marginTop: 8 }}>Something went wrong — please try again.</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <button type="button" onClick={() => setEditOpen(false)} style={EDIT_BTN_GHOST}>Cancel</button>
                  <button type="submit" disabled={editStatus === 'sending' || !editForm.suggestion.trim()} style={EDIT_BTN_PRIMARY}>
                    {editStatus === 'sending' ? 'Sending…' : 'Submit suggestion'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

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
        backgroundColor: t.panel,
        borderLeft: `1px solid ${t.panelBorder}`,
        flexShrink: 0, display: 'flex', flexDirection: 'column',
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
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: t.text }}>{country.name}</span>
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
        <div style={isMobile ? { overflowY: 'auto', height: sheetHeight - 96, padding: '12px 16px 24px' } : { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* ── Fixed header ── */}
        <div style={{ padding: '14px 16px 0', flexShrink: 0 }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            <Link to="/" style={{ fontSize: '0.68rem', color: t.muted }}>World</Link>
            <span style={{ color: t.panelBorder, fontSize: '0.68rem' }}>/</span>
            <Link to={`/region/${region.id}`} style={{ fontSize: '0.68rem', color: t.muted }}>{region.name}</Link>
            <span style={{ color: t.panelBorder, fontSize: '0.68rem' }}>/</span>
            <span style={{ fontSize: '0.68rem', color: t.lbl, fontWeight: 600 }}>{country.name}</span>
          </div>

          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: t.text, marginBottom: 6 }}>
            {country.name}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{
              fontSize: '0.68rem', fontWeight: 600, color: 'white',
              backgroundColor: region.color, borderRadius: 4,
              padding: '2px 8px', display: 'inline-block',
            }}>
              {iso}
            </span>
            <div style={{ height: 3, width: 24, borderRadius: 2, backgroundColor: region.color }} />
          </div>

          {/* ── Tab buttons ── */}
          <div style={{ display: 'flex', gap: TAB_GAP_PX, marginBottom: 0 }}>
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'load',     label: 'Load' },
              { id: 'supply',   label: 'Supply & Trade' },
              ...(marketAvailable ? [{ id: 'market', label: 'Market' }] : []),
              { id: 're',       label: 'RE' },
              { id: 'zoning',   label: 'Zones' },
            ].map(({ id, label }) => {
              const active = activeTab === id;
              return (
                <button key={id} onClick={() => { setActiveTab(id); track('tab_change', { tab: id, iso }); }} style={{
                  flex: 1, fontSize: TAB_FONT_SIZE, letterSpacing: TAB_LETTER_SPACING, lineHeight: 1.15,
                  textTransform: 'uppercase', fontFamily: 'inherit', textAlign: 'center',
                  padding: '4px 0', borderRadius: '3px 3px 0 0',
                  cursor: 'pointer',
                  border: `1px solid ${active ? t.panelBorder : 'rgba(128,160,192,0.18)'}`,
                  borderBottom: active ? `1px solid ${t.panel}` : `1px solid ${t.panelBorder}`,
                  backgroundColor: active ? t.panel : 'transparent',
                  color: active ? t.lbl : t.lblMuted,
                  fontWeight: active ? 700 : 400,
                  position: 'relative', zIndex: active ? 2 : 1,
                }}>
                  {label}
                </button>
              );
            })}
            {hasNote && (
              <button
                onClick={() => setNoteOpen(o => !o)}
                title="Open sector briefing note"
                style={{
                  flex: 1, fontSize: TAB_FONT_SIZE, letterSpacing: TAB_LETTER_SPACING,
                  textTransform: 'uppercase', fontFamily: 'inherit',
                  padding: '4px 0', borderRadius: '3px 3px 0 0',
                  cursor: 'pointer',
                  border: `1px solid ${noteOpen ? t.panelBorder : 'rgba(128,160,192,0.18)'}`,
                  borderBottom: noteOpen ? `1px solid ${t.panel}` : `1px solid ${t.panelBorder}`,
                  backgroundColor: noteOpen ? t.panel : 'transparent',
                  color: noteOpen ? '#2E75B6' : t.lblMuted,
                  fontWeight: noteOpen ? 700 : 400,
                  position: 'relative', zIndex: noteOpen ? 2 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                }}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                Brief
              </button>
            )}
          </div>
          <div style={{ height: 1, backgroundColor: t.panelBorder, marginTop: -1, position: 'relative', zIndex: 0 }} />
        </div>

        {/* ── Scrollable tab content ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

          {activeTab === 'overview' && (
            <>
              <CountryOverview
                iso={iso}
                region={region}
                capacity={capacity}
                fleetAge={fleetAge}
                tariffs={tariffs}
                access={access}
                theme={theme}
                source={plantSource}
              />
              {/* Export */}
              <div style={{ marginTop: 16, borderTop: `1px solid ${t.panelBorder}`, paddingTop: 12 }}>
                <span style={{ fontSize: '0.47rem', letterSpacing: '2px', fontWeight: 700, color: t.lblMuted, textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>
                  Export Data
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {[
                    { label: 'Plants GeoJSON', fn: () => handleDownloadPlants('geojson') },
                    { label: 'Plants CSV',     fn: () => handleDownloadPlants('csv') },
                    { label: 'Lines GeoJSON',  fn: () => handleDownloadLines('geojson') },
                    { label: 'Lines CSV',      fn: () => handleDownloadLines('csv') },
                  ].map(({ label, fn }) => (
                    <button key={label} onClick={fn} style={{
                      background: 'none', border: `1px solid ${t.panelBorder}`,
                      borderRadius: 3, padding: '4px 6px', cursor: 'pointer',
                      fontSize: '0.52rem', color: t.muted, fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
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
                  Source: {plantSource.toUpperCase()} · {country.name} only
                </p>
              </div>
            </>
          )}

          {activeTab === 'supply' && (
            <SupplyTab iso={iso} theme={theme} />
          )}

          {activeTab === 'market' && marketAvailable && (
            <MarketTab iso={iso} theme={theme} />
          )}

          {activeTab === 're' && (
            <REResourcesTab center={countryCenter} theme={theme} />
          )}

          {activeTab === 'load' && (
            <LoadTab iso={iso} theme={theme} />
          )}

          {activeTab === 'zoning' && (
            <ZoningTab
              iso={iso} theme={theme} regionId={region.id}
              nZones={nZones}
              onSelectZones={(n) => { setZoneMode('modeling'); setNZones(n); }}
            />
          )}

          <div style={{ borderTop: `1px solid ${t.hr}`, paddingTop: 12, marginTop: 20 }}>
            <Link
              to={`/region/${region.id}`}
              style={{ fontSize: '0.72rem', color: region.color, display: 'flex', alignItems: 'center', gap: 5 }}
            >
              ← Back to {region.name}
            </Link>
          </div>
        </div>
        </div>{/* content wrapper */}
      </div>
    </div>
  );
}
