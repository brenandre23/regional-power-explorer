import { mix } from './utils/color';

export const FUEL_COLORS = {
  solar:      '#FFD700',
  wind:       '#44DAEC',
  hydro:      '#1E9AF5',
  gas:        '#9A7040',
  coal:       '#808890',
  nuclear:    '#C8A8F0',
  oil:        '#7A7068',
  biomass:    '#52C860',
  geothermal: '#D4A820',
  diesel:     '#6A7888',
  waste:      '#8A9098',
  biogas:     '#72DC8A',
  wood:       '#7AC030',
};

export const FUEL_LABELS = {
  solar: 'Solar', wind: 'Wind', hydro: 'Hydro', gas: 'Gas',
  coal: 'Coal', nuclear: 'Nuclear', oil: 'Oil', biomass: 'Biomass',
  geothermal: 'Geothermal', diesel: 'Diesel', waste: 'Waste',
  biogas: 'Biogas', wood: 'Wood',
};

// `min`/`max` drive the MapLibre layer filters (see kvFilter below), so adding a
// bracket here is enough — the map pages derive everything from this list.
// v === 0 means the OSM way carries no voltage tag.
export const VOLTAGE_BRACKETS = [
  { min: 500_000, max: Infinity, width: 2.2,  label: '500 kV+',    key: '500',
    colors: { fog: '#0B7A85', paper: '#1A35A0', slate: '#AAEEFF', ink: '#FFEE33', forest: '#EAFF70', dusk: '#70FFD0' } },
  { min: 330_000, max: 500_000, width: 1.5,  label: '330–500 kV', key: '330',
    colors: { fog: '#0DA8B8', paper: '#2B52D8', slate: '#44D8F8', ink: '#FFD040', forest: '#C8E830', dusk: '#28E8A8' } },
  { min: 220_000, max: 330_000, width: 1.0,  label: '220–330 kV', key: '220',
    colors: { fog: '#3CC8D8', paper: '#5578EE', slate: '#00B0D0', ink: '#C8A000', forest: '#98B800', dusk: '#00B878' } },
  { min: 110_000, max: 220_000, width: 0.65, label: '110–220 kV', key: '110',
    colors: { fog: '#80DDE8', paper: '#8FAAEE', slate: '#007090', ink: '#906C00', forest: '#608000', dusk: '#007850' } },
  { min: 20_000,  max: 110_000, width: 0.45, label: '20–110 kV',  key: '20',
    colors: { fog: '#A8E8F0', paper: '#B4C6F4', slate: '#005070', ink: '#6A5000', forest: '#456000', dusk: '#005838' } },
  { min: 0,       max: 1,       width: 0.4,  label: 'Voltage n/a', key: 'unknown', untagged: true,
    colors: { fog: '#9FB0BC', paper: '#B0A894', slate: '#5A6675', ink: '#5E6068', forest: '#4A5A4E', dusk: '#565070' } },
];

/** MapLibre filter for one voltage bracket. Untagged lines (v === 0) are their own
 *  bracket, so every other one has to exclude them explicitly. */
export function kvFilter({ min, max, untagged }) {
  if (untagged) return ['==', ['get', 'v'], 0];
  return max === Infinity
    ? ['>=', ['get', 'v'], min]
    : ['all', ['>=', ['get', 'v'], min], ['<', ['get', 'v'], max]];
}

/** Bracket filter plus the min-kV slider floor. Untagged lines are exempt: v === 0
 *  means "OSM doesn't say", not "0 kV", so a numeric floor can't judge them — they
 *  answer to their own legend checkbox alone. */
export function kvFilterWithFloor(bracket, minKv) {
  const base = kvFilter(bracket);
  if (!minKv || bracket.untagged) return base;
  return ['all', base, ['>=', ['get', 'v'], minKv * 1000]];
}

/** Bracket a raw voltage falls into (v === 0 → the untagged bracket). */
export function bracketFor(v) {
  return VOLTAGE_BRACKETS.find(b => (b.untagged ? !v : v >= b.min && v < b.max))
    || VOLTAGE_BRACKETS[VOLTAGE_BRACKETS.length - 1];
}

/** Human-readable line attributes, shared by the hover popup and the downloads.
 *  Keys are the short ones written by tools/prepare_region_data.py. */
export const LINE_ATTR_LABELS = {
  nm: 'Name', op: 'Operator', c: 'Circuits', f: 'Frequency',
  l: 'Location', st: 'Status', oid: 'OSM id',
};

/** OSM tag values are user-supplied, so everything reaching setHTML goes through this. */
function escHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

/** Hover popup for a transmission line: OSM name, the substations it runs between,
 *  voltage, and whatever else OSM knows about it. */
export function linePopupHTML(props, endpointNames = []) {
  const title = props.nm
    ? `<b>${escHtml(props.nm)}</b><br>`
    : (endpointNames.filter(Boolean).length
        ? `<b>${endpointNames.filter(Boolean).map(escHtml).join(' — ')}</b><br>` : '');
  const volts = props.v
    ? `${Math.round(props.v / 1000)} kV`
    : 'voltage not tagged in OSM';
  const rest = ['op', 'c', 'f', 'l', 'st']
    .filter(k => props[k] !== undefined && props[k] !== null && props[k] !== '')
    .map(k => `${LINE_ATTR_LABELS[k]}: ${escHtml(lineAttrText(k, props[k]))}`);
  const lines = [volts, ...rest].join('<br>');
  return `${title}<span style="opacity:.75">${lines}</span>`;
}

/** The lines currently drawn on the map, in map order — what a download should
 *  contain, since the legend filters sit right next to the download button. */
export function visibleLineFeatures(features, { minKv = 0, kvsOff } = {}) {
  const off = kvsOff || new Set();
  return (features || []).filter(f => {
    const bracket = bracketFor(f.properties.v);
    if (off.has(bracket.key)) return false;
    if (bracket.untagged) return true;   // no voltage to compare a floor against
    return (f.properties.v || 0) >= minKv * 1000;
  });
}

/** Short storage keys → self-describing column names, and volts → kV. */
export function expandLineProps(props) {
  const out = {};
  if (props.oid) out.osm_id = props.oid;
  if (props.nm)  out.name = props.nm;
  if (props.op)  out.operator = props.op;
  out.voltage_kv = props.v ? Math.round(props.v / 1000) : '';
  if (props.c)   out.circuits = props.c;
  if (props.f)   out.frequency = props.f === '0' ? 'DC' : `${props.f} Hz`;
  if (props.l)   out.location = props.l;
  if (props.st)  out.status = props.st;
  return out;
}

export const LINE_CSV_COLUMNS =
  ['osm_id', 'name', 'operator', 'voltage_kv', 'circuits', 'frequency', 'location', 'status'];

/** RFC4180 quoting — OSM names and operators carry commas, quotes and newlines. */
export function csvCell(value) {
  const str = value == null ? '' : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** GeoJSON with readable property names, for the download only — the map keeps
 *  the short keys so the fetched file stays small. */
export function linesToDownloadGeoJSON(features) {
  return {
    type: 'FeatureCollection',
    features: features.map(f => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: expandLineProps(f.properties),
    })),
  };
}

export function linesToCSV(features) {
  const header = [...LINE_CSV_COLUMNS, 'geometry_wkt'].join(',');
  const rows = features.map(f => {
    const p = expandLineProps(f.properties);
    const wkt = `LINESTRING(${f.geometry.coordinates.map(([x, y]) => `${x} ${y}`).join(', ')})`;
    return [...LINE_CSV_COLUMNS.map(c => csvCell(p[c])), csvCell(wkt)].join(',');
  });
  return [header, ...rows].join('\n');
}

export function lineAttrText(key, value) {
  if (key === 'f') return value === '0' ? 'DC' : `${value} Hz AC`;
  if (key === 'st') return value === 'construction' ? 'Under construction' : value;
  return String(value);
}

export const THEMES = {
  fog: {
    isDark: false, label: 'Fog', swatch: '#D8E2EC', cartoBg: 'light_all', cartoLabels: 'light_only_labels',
    bg: '#EEF3F7', land: '#D8E2EC',
    panel: '#FFFFFF', panelBorder: '#DEE5EE',
    text: '#2C3E52', muted: '#7A9AB0',
    hr: '#E8EDF2', cardBg: '#F5F7FA', cardBorder: '#DEE5EE',
    lbl: '#2C3E52', lblMuted: '#7A9AB0', lblRow: '#3A5A78',
    worldBdr: 'rgba(160,180,200,0.7)', worldBdrW: 0.4,
    rgnBdr: 'rgba(80,105,140,0.75)', rgnBdrW: 1.0, rgnOp: 0.28,
    navBg: '#F5F7FA', navHint: '#5A7A9A',
    highlight: { fill: 'rgba(95,130,170,1)', border: 'rgba(65,100,145,0.75)', borderW: 1.0 },
  },
  slate: {
    isDark: true, label: 'Slate', swatch: '#0E1B2E', cartoBg: 'dark_all', cartoLabels: 'dark_only_labels',
    bg: '#060B17', land: '#0E1B2E',
    panel: '#0A1828', panelBorder: '#1A3A54',
    text: '#C8DFF0', muted: '#5A8AAA',
    hr: '#1A3A54', cardBg: '#060B17', cardBorder: '#1A3A54',
    lbl: '#A8C8E0', lblMuted: '#4A7A9A', lblRow: '#8BBDD8',
    worldBdr: 'rgba(55,100,155,0.5)', worldBdrW: 0.5,
    rgnBdr: 'rgba(200,225,255,0.65)', rgnBdrW: 1.1, rgnOp: 0.30,
    navBg: '#070D1B', navHint: '#7AAAC8',
    highlight: { fill: 'rgba(55,110,185,1)', border: 'rgba(130,200,255,0.75)', borderW: 1.2 },
  },
  ink: {
    isDark: true, label: 'Ink', swatch: '#252830', cartoBg: 'dark_all', cartoLabels: 'dark_only_labels',
    bg: '#0D0E12', land: '#16181F',
    panel: '#111318', panelBorder: '#252830',
    text: '#E8EAF0', muted: '#6B6E82',
    hr: '#252830', cardBg: '#0D0E12', cardBorder: '#252830',
    lbl: '#C8CBD8', lblMuted: '#555870', lblRow: '#A8ABB8',
    worldBdr: 'rgba(80,85,110,0.5)', worldBdrW: 0.5,
    rgnBdr: 'rgba(180,185,210,0.60)', rgnBdrW: 1.1, rgnOp: 0.25,
    navBg: '#0A0B0F', navHint: '#9A9DB8',
    highlight: { fill: 'rgba(120,130,200,1)', border: 'rgba(200,200,200,0.72)', borderW: 1.2 },
  },
  paper: {
    isDark: false, label: 'Paper', swatch: '#E8E0CC', cartoBg: 'light_all', cartoLabels: 'light_only_labels',
    bg: '#F5F0E8', land: '#E8E0CC',
    panel: '#FBF8F2', panelBorder: '#DDD5C4',
    text: '#2A2218', muted: '#8A7A64',
    hr: '#DDD5C4', cardBg: '#F5F0E8', cardBorder: '#DDD5C4',
    lbl: '#2A2218', lblMuted: '#8A7A64', lblRow: '#4A3828',
    worldBdr: 'rgba(140,120,90,0.55)', worldBdrW: 0.4,
    rgnBdr: 'rgba(100,80,50,0.65)', rgnBdrW: 1.0, rgnOp: 0.25,
    navBg: '#F0E8D8', navHint: '#6A5A48',
    highlight: { fill: 'rgba(160,120,70,1)', border: 'rgba(120,85,40,0.75)', borderW: 1.0 },
  },
  forest: {
    isDark: true, label: 'Forest', swatch: '#0F2014', cartoBg: 'dark_all', cartoLabels: 'dark_only_labels',
    bg: '#08120A', land: '#0F2014',
    panel: '#0C1810', panelBorder: '#1C3824',
    text: '#C0DCC4', muted: '#508058',
    hr: '#1C3824', cardBg: '#08120A', cardBorder: '#1C3824',
    lbl: '#A0C8A8', lblMuted: '#407048', lblRow: '#80B090',
    worldBdr: 'rgba(40,100,55,0.55)', worldBdrW: 0.5,
    rgnBdr: 'rgba(150,220,165,0.60)', rgnBdrW: 1.1, rgnOp: 0.28,
    navBg: '#060E08', navHint: '#78B888',
    highlight: { fill: 'rgba(60,180,90,1)', border: 'rgba(100,220,130,0.75)', borderW: 1.2 },
  },
  dusk: {
    isDark: true, label: 'Dusk', swatch: '#1A1530', cartoBg: 'dark_all', cartoLabels: 'dark_only_labels',
    bg: '#0E0A1A', land: '#1A1530',
    panel: '#120E20', panelBorder: '#2A2448',
    text: '#D8D4F0', muted: '#7870A0',
    hr: '#2A2448', cardBg: '#0E0A1A', cardBorder: '#2A2448',
    lbl: '#B8B4E0', lblMuted: '#605890', lblRow: '#9890C8',
    worldBdr: 'rgba(80,70,130,0.55)', worldBdrW: 0.5,
    rgnBdr: 'rgba(180,170,240,0.60)', rgnBdrW: 1.1, rgnOp: 0.28,
    navBg: '#0A0814', navHint: '#9888C8',
    highlight: { fill: 'rgba(140,100,220,1)', border: 'rgba(180,150,255,0.75)', borderW: 1.2 },
  },
};

export const THEME_LIST = ['fog', 'paper', 'slate', 'ink', 'forest', 'dusk'];

export function getT(theme) {
  return THEMES[theme] || THEMES.fog;
}

export const WB_BASEMAP_STYLE_URL =
  'https://www.arcgis.com/sharing/rest/content/items/dcc1c1c0f97f4e458199888b0fc63896/resources/styles/root.json';

// The first World Bank political-boundary layer in the approved vector style.
// Anything that must sit under the Bank's boundary treatment (satellite
// imagery) is inserted before this layer; see src/utils/wbStyle.js.
export const WB_BOUNDARY_ANCHOR = 'Global Administrative Divisions/ADM0_Boundaries/Dotted';

// Non-determined area fills are policy, kept with the claimants in
// public/data/ndlsa.json; see ndlsaFill() in src/utils/basemap.js.
/** Fill for an area none of whose parties the page colours: a quiet grey off the land. */
export function ndlsaNeutralFill(t) {
  return mix(t.land, t.text, 0.22);
}

// Right-side detail panel (region + country pages) — draggable. Opens at
// PANEL_WIDTH_DEFAULT (old 520px cap + 2cm) and can be dragged smaller down
// to PANEL_WIDTH_MIN, or bigger up to PANEL_WIDTH_MAX (default + a further
// 4cm of headroom) — both cm figures @ 96 CSS px/in ÷ 2.54cm/in, rounded.
// Country briefing notes were drafted with AI assistance and are not fact-checked, so
// every note carries a line saying so under its header. That disclosure is the
// condition for showing them: the flag and the notes living under
// public/data/notes/ (where the build copies them into dist/) go together — turning
// this off again means moving the folder back out of public/ too, or the files stay
// reachable by direct URL.
export const BRIEFS_ENABLED = true;

export const PANEL_WIDTH_MIN = 220;
export const PANEL_WIDTH_DEFAULT = 596;
export const PANEL_WIDTH_MAX = 747;

export const PLANT_STATUSES = ['operating', 'construction', 'planned'];

// Adaptive default min-MW: keeps the map readable by showing at most ~maxMarkers
// of the largest plants, but returns 0 when there are fewer (so small countries
// like Madagascar show ALL their plants instead of being hidden by a flat 100 MW).
export function adaptiveMinMw(features, maxMarkers = 150) {
  const mws = (features || [])
    .map(f => f?.properties?.mw || 0)
    .filter(v => v > 0)
    .sort((a, b) => b - a);
  if (mws.length <= maxMarkers) return 0;
  const kth = mws[maxMarkers - 1];
  const step = kth >= 200 ? 25 : kth >= 50 ? 10 : 5;   // floor to a tidy value
  return Math.max(0, Math.floor(kth / step) * step);
}

// Per-country colors for preferred-zoning overlays — blues, greens, yellows (no orange/violet)
export const COUNTRY_ZONE_COLORS = {
  // Black Sea
  TUR: '#3D9BD4', ROU: '#52B788', ARM: '#E9C46A', AZE: '#2A9D8F', BGR: '#4895EF', GEO: '#90BE6D',
  // SAPP
  ZAF: '#1E88E5', ZWE: '#43A047', ZMB: '#FFD54F', BWA: '#26C6DA', MOZ: '#66BB6A',
  MWI: '#FFF176', NAM: '#29B6F6', LSO: '#A5D6A7', SWZ: '#80DEEA', AGO: '#B5EAD7', MDG: '#FFFFB5',
  // EAPP
  EGY: '#FFD700', ETH: '#2E86AB', KEN: '#57CC99', UGA: '#48CAE4', TZA: '#C7F2A4',
  RWA: '#80ED99', BDI: '#CFEE9E', SDN: '#F4D35E', SSD: '#A8E6CF', DJI: '#56CFE1',
  COD: '#5E9CF4', SOM: '#B8F2E6',
};

export function zoneColorExpr() {
  return ['match', ['get', 'country'],
    ...Object.entries(COUNTRY_ZONE_COLORS).flatMap(([iso, c]) => [iso, c]),
    '#888888',
  ];
}

export function fuelColorExpr() {
  return ['match', ['get', 'fuel'],
    ...Object.entries(FUEL_COLORS).flatMap(([f, c]) => [f, c]),
    '#888888',
  ];
}

export function plantRadiusExpr(scale = 1) {
  return [
    'interpolate', ['linear'], ['get', 'mw'],
    0,    2.5 * scale,
    50,   3.5 * scale,
    200,  5   * scale,
    500,  7.5 * scale,
    1000, 10  * scale,
    5000, 14  * scale,
  ];
}

export function lcRadiusExpr(scale = 1) {
  return [
    'interpolate', ['linear'], ['get', 'pop'],
    100_000,    3   * scale,
    500_000,    5   * scale,
    1_000_000,  7   * scale,
    5_000_000,  11  * scale,
    15_000_000, 16  * scale,
  ];
}

// Zoning: a 1-zone clustering has no inter-zone topology and no corridors by
// definition, so landing on it shows an empty map with no feedback. Prefer the
// smallest real subdivision.
export function defaultNZones(available) {
  if (!available?.length) return null;
  return available.find(n => n >= 2) ?? available[0];
}
