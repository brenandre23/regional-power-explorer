import { dataPath } from '../../utils/paths';
import { fetchData } from '../../utils/dataCache';
import { useState, useEffect, useMemo, useRef } from 'react';
import { getT } from '../../constants';
import ChartCaption, { getSourceMeta } from '../ChartCaption';
import {
  downloadBlob, GRANULARITIES, GRANULARITY_LABEL, AXIS_TITLE,
  dayOf, hourTimestampLabel, fmtValue, getPeriods, periodOptionLabel,
  defaultRange, rangeLabel, computeStats, getChartPoints,
} from './chartHelpers';
import { KpiCard, SeriesChart, ChartTooltip } from './MarketChartComponents';

// Useful external electricity-demand data sources
const DEMAND_LINKS = [
  ['Ember', 'https://ember-energy.org/data/', 'Electricity demand & generation by country, yearly'],
  ['Our World in Data', 'https://ourworldindata.org/electricity-mix', 'Electricity consumption, totals & per capita'],
  ['ENTSO-E Transparency', 'https://transparency.entsoe.eu', 'Hourly actual load & forecasts — Europe'],
  ['IEA — Electricity', 'https://www.iea.org/data-and-statistics', 'Global electricity statistics & demand'],
];

const ISO3_TO_ISO2 = {
  TUR:'TR', ROU:'RO', BGR:'BG', GEO:'GE', ARM:'AM', AZE:'AZ',
  SEN:'SN', GMB:'GM', GNB:'GW', GIN:'GN', SLE:'SL', LBR:'LR', CIV:'CI', GHA:'GH',
  TGO:'TG', BEN:'BJ', NGA:'NG', NER:'NE', MLI:'ML', BFA:'BF', MRT:'MR', CPV:'CV',
  CMR:'CM', CAF:'CF', TCD:'TD', COD:'CD', COG:'CG', GAB:'GA', GNQ:'GQ', STP:'ST',
  EGY:'EG', LBY:'LY', SDN:'SD', SSD:'SS', ETH:'ET', DJI:'DJ', KEN:'KE', TZA:'TZ',
  SOM:'SO', UGA:'UG', RWA:'RW', BDI:'BI',
  ZAF:'ZA', ZWE:'ZW', ZMB:'ZM', BWA:'BW', MOZ:'MZ', MWI:'MW', NAM:'NA', LSO:'LS',
  SWZ:'SZ', MDG:'MG', AGO:'AO',
  MAR:'MA', DZA:'DZ', TUN:'TN', JOR:'JO', LBN:'LB', SYR:'SY', IRQ:'IQ', SAU:'SA',
  YEM:'YE', OMN:'OM', ARE:'AE', QAT:'QA', BHR:'BH', KWT:'KW', PSE:'PS',
  ALB:'AL', BIH:'BA', MKD:'MK', MNE:'ME', SRB:'RS', KOS:'XK',
  IND:'IN', PAK:'PK', BGD:'BD', LKA:'LK', NPL:'NP', BTN:'BT', AFG:'AF', MDV:'MV',
  KAZ:'KZ', KGZ:'KG', TJK:'TJ', TKM:'TM', UZB:'UZ',
  // European Union
  AUT:'AT', BEL:'BE', HRV:'HR', CYP:'CY', CZE:'CZ', DNK:'DK', EST:'EE',
  FIN:'FI', FRA:'FR', DEU:'DE', GRC:'GR', HUN:'HU', IRL:'IE', ITA:'IT',
  LVA:'LV', LTU:'LT', LUX:'LU', MLT:'MT', NLD:'NL', POL:'PL', PRT:'PT',
  SVK:'SK', SVN:'SI', ESP:'ES', SWE:'SE',
  // SIEPAC
  GTM:'GT', HND:'HN', SLV:'SV', NIC:'NI', CRI:'CR', PAN:'PA',
  // ASEAN (fallback if supply JSON demand field is empty)
  BRN:'BN', KHM:'KH', IDN:'ID', LAO:'LA', MYS:'MY', MMR:'MM',
  PHL:'PH', SGP:'SG', THA:'TH', VNM:'VN',
};

const ENTSOE_ISO3 = new Set(['ROU','BGR','TUR','ALB','BIH','MKD','MNE','SRB','KOS',
  'GEO','ARM','AZE','MAR','DZA','TUN','EGY']);

const PROFILE_EUROPEAN = [42,38,35,33,32,33,38,56,75,82,85,86,87,87,85,83,84,88,93,96,91,78,65,52];


const _REL_STYLE = {
  high:   { color: '#1A9060', label: 'Official'  },
  medium: { color: '#B87820', label: 'Estimated' },
  low:    { color: '#B84040', label: 'Partial'   },
};

function SourceBadge({ source, t }) {
  const { short, rel, note } = getSourceMeta(source);
  const rs = rel ? _REL_STYLE[rel] : null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: '0.46rem', color: t.lblMuted, fontStyle: 'italic' }}>{short}</span>
      {rs && (
        <span title={note || rs.label} style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          fontSize: '0.38rem', padding: '1px 4px', borderRadius: 3,
          background: `${rs.color}18`, color: rs.color,
          fontWeight: 700, letterSpacing: '0.3px', cursor: 'default',
        }}>
          <span style={{ fontSize: '0.45rem', lineHeight: 1 }}>●</span>
          {rs.label}
        </span>
      )}
    </span>
  );
}

function linearFit(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const sx  = pts.reduce((s, [x])    => s + x,     0);
  const sy  = pts.reduce((s, [, y])  => s + y,     0);
  const sxy = pts.reduce((s, [x, y]) => s + x * y, 0);
  const sxx = pts.reduce((s, [x])    => s + x * x, 0);
  const denom = n * sxx - sx * sx;
  if (!denom) return null;
  const m = (n * sxy - sx * sy) / denom;
  const b = (sy - m * sx) / n;
  return { m, b };
}

function fmtTWh(v) {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 10)   return v.toFixed(0);
  return v.toFixed(1);
}

function TrendChart({ historical, projected, t }) {
  if (!historical.length) return null;
  const all     = [...historical, ...projected];
  const years   = all.map(([y]) => y);
  const vals    = all.map(([, v]) => v);
  const minYear = Math.min(...years), maxYear = Math.max(...years);
  const maxVal  = Math.max(...vals) * 1.12;
  const W = 226, H = 72, pL = 34, pR = 6, pT = 6, pB = 18;
  const iW = W - pL - pR, iH = H - pT - pB;
  const toX = y => pL + ((y - minYear) / (maxYear - minYear || 1)) * iW;
  const toY = v => pT + iH - (v / maxVal) * iH;
  const histPts = historical.map(([y, v]) => `${toX(y).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const projStart = historical[historical.length - 1];
  const projPts = projected.length
    ? [`${toX(projStart[0]).toFixed(1)},${toY(projStart[1]).toFixed(1)}`,
       ...projected.map(([y, v]) => `${toX(y).toFixed(1)},${toY(v).toFixed(1)}`)].join(' ')
    : null;
  const tickVals = [0, +(maxVal * 0.5).toFixed(1), +maxVal.toFixed(1)];
  const midProjYear = projected.length ? projected[Math.floor(projected.length / 2)][0] : null;
  const midProjVal  = projected.length ? projected[Math.floor(projected.length / 2)][1] : null;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      {tickVals.map(v => {
        const y = toY(v);
        return (
          <g key={v}>
            <line x1={pL} y1={y} x2={pL + iW} y2={y}
              stroke={t.panelBorder} strokeWidth={0.26} strokeDasharray="2,2" />
            <text x={pL - 2} y={y + 3} textAnchor="end" fill={t.lblMuted} fontSize={4.2}>
              {fmtTWh(v)}
            </text>
          </g>
        );
      })}
      <text transform={`translate(8, ${pT + iH / 2}) rotate(-90)`}
        textAnchor="middle" fill={t.lblMuted} fontSize={3.9}>TWh/yr</text>
      <polyline points={histPts} fill="none" stroke="#3887C4"
        strokeWidth={0.8} strokeLinejoin="round" strokeLinecap="round" />
      {projPts && (
        <>
          <polyline points={projPts} fill="none" stroke="#3887C4"
            strokeWidth={0.75} strokeDasharray="4,3" strokeLinejoin="round"
            strokeLinecap="round" opacity={0.55} />
          {midProjVal != null && (
            <text x={toX(midProjYear)} y={toY(midProjVal) - 5}
              textAnchor="middle" fill={t.lblMuted} fontSize={3.9} fontStyle="italic">
              projected
            </text>
          )}
        </>
      )}
      {[minYear, Math.round((minYear + maxYear) / 2), maxYear].map(yr => (
        <text key={yr} x={toX(yr)} y={H - 2} textAnchor="middle" fill={t.lblMuted} fontSize={3.75}>
          {yr}
        </text>
      ))}
    </svg>
  );
}

function ProfileChart({ profile, color, t }) {
  const W = 226, H = 56, pL = 10, pR = 6, pT = 6, pB = 18;
  const iW = W - pL - pR, iH = H - pT - pB;
  const maxV = Math.max(...profile);
  const toX = i => pL + (i / (profile.length - 1)) * iW;
  const toY = v => pT + iH - (v / maxV) * iH;
  const pts = profile.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const fill = [
    `${pL},${pT + iH}`,
    ...profile.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`),
    `${pL + iW},${pT + iH}`,
  ].join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <polygon points={fill} fill={color} opacity={0.12} />
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth={0.8} strokeLinejoin="round" strokeLinecap="round" />
      {[0, 6, 12, 18, 23].map(h => (
        <text key={h} x={toX(h)} y={H - 3} textAnchor="middle" fill={t.lblMuted} fontSize={3.75}>
          {h}h
        </text>
      ))}
    </svg>
  );
}

// ── Annual demand — the Load tab's original (and still default) content:
// KPI cards, TEİAŞ/WDI trend chart with the 2035 linear projection, and the
// ENTSO-E daily load-shape chart. Unchanged from before the Real-time
// consumption sub-tab was added.
function AnnualDemand({ iso, theme }) {
  const t = getT(theme);
  const [pts,     setPts]     = useState(null); // [[year, TWh]]
  const [peakMW,  setPeakMW]  = useState(null); // from supply capacity data if available
  const [source,  setSource]  = useState(null); // data source label
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    setLoading(true); setError(false); setPts(null); setPeakMW(null); setSource(null);

    // Try supply JSON first (authoritative national source)
    fetchData(dataPath(`supply/${iso}.json`))
      .then(data => {
        const gen = data.generation;
        const cap = data.capacity;
        if (!gen?.demand || !gen?.years) throw new Error('no demand field');
        const merged = gen.years
          .map((yr, i) => gen.demand[i] != null ? [yr, +(gen.demand[i] / 1000).toFixed(3)] : null)
          .filter(Boolean);
        if (!merged.length) throw new Error('empty');
        setPts(merged);
        // Use actual peak from capacity section if available
        if (cap?.peak_demand?.length) {
          const lastPeak = [...cap.peak_demand].reverse().find(v => v != null);
          if (lastPeak != null) setPeakMW(lastPeak);
        }
        setSource(gen.source || data.country);
        setLoading(false);
      })
      .catch(() => {
        // Fallback: WB WDI
        const iso2 = ISO3_TO_ISO2[iso];
        if (!iso2) { setError(true); setLoading(false); return; }

        const wdi = url => fetch(url).then(r => { if (!r.ok) throw new Error(); return r.json(); })
          .then(([, rows]) =>
            (rows || []).filter(r => r.value != null)
              .map(r => [parseInt(r.date), r.value])
              .sort(([a], [b]) => a - b)
          );

        const base = `https://api.worldbank.org/v2/country/${iso2}/indicator`;
        Promise.all([
          wdi(`${base}/EG.USE.ELEC.KH.PC?format=json&per_page=60&mrv=35`),
          wdi(`${base}/SP.POP.TOTL?format=json&per_page=60&mrv=35`),
        ])
          .then(([pc, pop]) => {
            const popMap = new Map(pop.map(([y, v]) => [y, v]));
            const merged = pc
              .filter(([y]) => popMap.has(y))
              .map(([y, kwh_cap]) => [y, +(kwh_cap * popMap.get(y) / 1e9).toFixed(3)]);
            setPts(merged);
            setSource('WB WDI');
            setLoading(false);
          })
          .catch(() => { setError(true); setLoading(false); });
      });
  }, [iso]);

  const historical = pts || [];
  let projected = [];
  let cagr = null;
  if (historical.length >= 3) {
    const fit = linearFit(historical);
    if (fit) {
      const lastYear = historical[historical.length - 1][0];
      projected = Array.from({ length: 11 }, (_, i) => {
        const yr = lastYear + i + 1;
        return [yr, Math.max(0, +(fit.m * yr + fit.b).toFixed(3))];
      });
    }
    const v0 = historical[0][1], v1 = historical[historical.length - 1][1];
    const n  = historical[historical.length - 1][0] - historical[0][0];
    if (v0 > 0 && n > 0) cagr = ((Math.pow(v1 / v0, 1 / n) - 1) * 100).toFixed(1);
  }

  const lastTWh  = historical.length ? historical[historical.length - 1][1] : null;
  const lastYear = historical.length ? historical[historical.length - 1][0] : null;
  // Peak: use actual from supply data if available, otherwise estimate from load factor
  const peakGW = peakMW != null
    ? (peakMW / 1000).toFixed(1)
    : lastTWh != null ? (lastTWh * 1000 / (8760 * 0.55)).toFixed(1) : null;
  const peakEstimated = peakMW == null;

  const hasEntsoe = ENTSOE_ISO3.has(iso);

  const sec = {
    fontSize: '0.45rem', letterSpacing: '2px', fontWeight: 700,
    color: t.lblMuted, textTransform: 'uppercase', marginBottom: 6, display: 'block',
  };

  const legend = (color, dash, label) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <svg width={18} height={6}>
        <line x1={0} y1={3} x2={18} y2={3} stroke={color}
          strokeWidth={1.5} strokeDasharray={dash || undefined} opacity={dash ? 0.6 : 1} />
      </svg>
      <span style={{ fontSize: '0.46rem', color: t.lblMuted }}>{label}</span>
    </div>
  );

  return (
    <div>
      {/* ── Total demand ─────────────────────── */}
      <span style={sec}>Electricity Demand</span>

      {loading && <p style={{ fontSize: '0.62rem', color: t.muted, fontStyle: 'italic' }}>Loading…</p>}
      {error   && <p style={{ fontSize: '0.62rem', color: t.muted, fontStyle: 'italic' }}>No data available.</p>}
      {!loading && !error && historical.length === 0 && (
        <p style={{ fontSize: '0.62rem', color: t.muted, fontStyle: 'italic' }}>No data available.</p>
      )}

      {historical.length > 0 && (
        <>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 8 }}>
            <div style={{ padding: '6px 8px', borderRadius: 5, backgroundColor: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
              <div style={{ fontSize: '0.42rem', color: t.lblMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 2 }}>
                Annual Demand
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: t.lbl }}>
                {lastTWh != null ? `${fmtTWh(lastTWh)} TWh` : '—'}
              </div>
              <div style={{ fontSize: '0.42rem', color: t.lblMuted }}>{lastYear}</div>
            </div>
            <div style={{ padding: '6px 8px', borderRadius: 5, backgroundColor: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
              <div style={{ fontSize: '0.42rem', color: t.lblMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 2 }}>
                Peak Demand
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: t.lbl }}>
                {peakGW != null ? `${peakEstimated ? '~' : ''}${peakGW} GW` : '—'}
              </div>
              <div style={{ fontSize: '0.42rem', color: t.lblMuted }}>
                {peakEstimated ? 'est. LF = 55%' : lastYear}
              </div>
            </div>
          </div>

          <TrendChart historical={historical} projected={projected} t={t} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              {legend('#3887C4', null,  `Historical (${source || ''})`)}
              {legend('#3887C4', '4,3', 'Linear extrap.')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {cagr != null && (
                <div style={{
                  fontSize: '0.55rem', color: parseFloat(cagr) >= 0 ? '#4A9E6A' : '#B83838',
                  fontWeight: 700, letterSpacing: '0.3px',
                }}>
                  {parseFloat(cagr) >= 0 ? '+' : ''}{cagr}%
                  <span style={{ fontSize: '0.44rem', color: t.lblMuted, fontWeight: 400, marginLeft: 2 }}>
                    CAGR
                  </span>
                </div>
              )}
              <button
                title="Download CSV"
                onClick={() => {
                  const allRows = [
                    ...historical.map(([year, val]) => `${year},${val},historical`),
                    ...projected.map(([year, val]) => `${year},${val},projected`),
                  ];
                  downloadBlob(
                    ['year,twh,type', ...allRows].join('\n'),
                    `electricity_demand_${iso}.csv`,
                    'text/csv'
                  );
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '1px 3px', borderRadius: 3, color: t.lblMuted,
                  display: 'inline-flex', alignItems: 'center', opacity: 0.7,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
            </div>
          </div>
          <p style={{ fontSize: '0.46rem', color: t.lblMuted, marginTop: 3, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <SourceBadge source={source} t={t} />
            <span>· {historical[0][0]}–{historical[historical.length - 1][0]}</span>
            {peakEstimated && <span>· Peak est. LF = 55%</span>}
          </p>
        </>
      )}

      {/* ── Daily load profile ────────────────── */}
      <div style={{ borderTop: `1px solid ${t.panelBorder}`, paddingTop: 10 }}>
        <span style={sec}>Daily Load Profile</span>
        {hasEntsoe ? (
          <>
            <ProfileChart profile={PROFILE_EUROPEAN} color="#74C0FC" t={t} />
            <p style={{ fontSize: '0.46rem', color: t.lblMuted, marginTop: 5, fontStyle: 'italic', lineHeight: 1.5 }}>
              Typical weekday · ENTSO-E shape
            </p>
          </>
        ) : (
          <p style={{ fontSize: '0.62rem', color: t.muted, fontStyle: 'italic' }}>
            No load profile available for this country.
          </p>
        )}
      </div>

      {/* ── Explore further — demand data sources ────── */}
      <div style={{ borderTop: `1px solid ${t.panelBorder}`, paddingTop: 12, marginTop: 14 }}>
        <span style={sec}>Explore further</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {DEMAND_LINKS.map(([name, href, desc]) => (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 600, color: 'rgba(74,143,204,0.9)' }}>
                {name} <span aria-hidden="true" style={{ fontWeight: 400 }}>↗</span>
              </span>
              <span style={{ display: 'block', fontSize: '0.5rem', color: t.lblMuted, lineHeight: 1.4, marginTop: 1 }}>{desc}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

const RT_CONS_COLOR = '#2E8B7E';

// ── Real-time consumption — EPIAS "rt-cons", hourly system-level consumption
// published ~2 hours behind. Reuses the exact Yearly/Monthly/Daily/Hourly
// chart machinery MarketTab's Prices/Quantity sub-tabs use (shared via
// chartHelpers.jsx / MarketChartComponents.jsx), just with a single series
// and no currency toggle.
function RealTimeConsumption({ iso, theme, marketData }) {
  const t = getT(theme);
  const [granularity,  setGranularity] = useState('multiyear');
  const [periodStart,  setPeriodStart] = useState(null);
  const [periodEnd,    setPeriodEnd]   = useState(null);
  const [exportScope,  setExportScope] = useState('selected');
  const [tip,          setTip]         = useState(null);
  const chartRef = useRef(null);

  const block = marketData?.rt_cons ?? null;
  const unit  = block?.unit || 'MWh';

  const periods = useMemo(() => getPeriods(block, granularity), [block, granularity]);

  const prevGranularityRef = useRef(granularity);
  useEffect(() => {
    const [defStart, defEnd] = defaultRange(periods, granularity);
    if (prevGranularityRef.current !== granularity) {
      prevGranularityRef.current = granularity;
      setPeriodStart(defStart);
      setPeriodEnd(defEnd);
      return;
    }
    setPeriodStart(prev => (prev && periods.includes(prev)) ? prev : defStart);
    setPeriodEnd(prev => (prev && periods.includes(prev)) ? prev : defEnd);
  }, [periods, granularity]);

  const stats       = useMemo(() => computeStats(block, granularity, periodStart, periodEnd), [block, granularity, periodStart, periodEnd]);
  const chartPoints = useMemo(() => getChartPoints(block, granularity, periodStart, periodEnd), [block, granularity, periodStart, periodEnd]);
  const latestHourly = useMemo(() => {
    if (!block?.hourly) return null;
    const keys = Object.keys(block.hourly);
    if (!keys.length) return null;
    const latestKey = keys.reduce((a, b) => (a > b ? a : b));
    return { ts: latestKey, value: block.hourly[latestKey] };
  }, [block]);

  const toggleBtnStyle = active => ({
    fontSize: '0.55rem', letterSpacing: '0.5px', textTransform: 'uppercase',
    padding: '3px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${active ? 'rgba(74,143,204,0.6)' : t.panelBorder}`,
    backgroundColor: active ? 'rgba(74,143,204,0.1)' : 'transparent',
    color: active ? t.lbl : t.lblMuted,
  });

  const selectStyle = {
    flex: 1, fontSize: '0.6rem', padding: '3px 6px', borderRadius: 4, fontFamily: 'inherit',
    border: `1px solid ${t.panelBorder}`, backgroundColor: t.panel, color: t.lbl, outline: 'none',
  };

  const dlBtnStyle = {
    fontSize: '0.52rem', letterSpacing: '0.5px', padding: '4px 9px', borderRadius: 3,
    cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${t.panelBorder}`,
    backgroundColor: 'transparent', color: t.lblMuted,
  };

  const handleHover = (i, e) => {
    if (i === null) { setTip(null); return; }
    if (!chartRef.current) return;
    const r = chartRef.current.getBoundingClientRect();
    setTip({ i, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const handleDownload = () => {
    if (!block || !periods.length) return;
    const [fromKey, toKey] = exportScope === 'full'
      ? [periods[0], periods[periods.length - 1]]
      : [periodStart, periodEnd];
    if (!fromKey || !toKey) return;
    let header, keys, rows;
    if (granularity === 'multiyear') {
      keys = Object.keys(block.yearly.mean).filter(k => k >= fromKey && k <= toKey).sort();
      header = 'year,mean,min,max';
      rows = keys.map(k => [k, block.yearly.mean[k], block.yearly.min[k], block.yearly.max[k]].join(','));
    } else if (granularity === 'year') {
      keys = Object.keys(block.monthly.mean).filter(k => k >= fromKey && k <= toKey).sort();
      header = 'month,mean,min,max';
      rows = keys.map(k => [k, block.monthly.mean[k], block.monthly.min[k], block.monthly.max[k]].join(','));
    } else if (granularity === 'month') {
      keys = Object.keys(block.daily.mean).filter(k => k >= fromKey && k <= toKey).sort();
      header = 'date,mean,min,max';
      rows = keys.map(k => [k, block.daily.mean[k], block.daily.min[k], block.daily.max[k]].join(','));
    } else {
      keys = Object.keys(block.hourly).filter(k => {
        const day = dayOf(k);
        return day >= fromKey && day <= toKey;
      }).sort();
      header = 'timestamp,consumption';
      rows = keys.map(k => [k, block.hourly[k]].join(','));
    }
    downloadBlob([header, ...rows].join('\n'), `realtime_consumption_${granularity}_${exportScope}_${iso}.csv`, 'text/csv');
  };

  if (!block) return <p style={{ fontSize: '0.7rem', color: t.lblMuted, marginTop: 8, fontStyle: 'italic' }}>No real-time consumption data available for this country.</p>;

  const kpi1Label = `Average · ${rangeLabel(granularity, periodStart, periodEnd)}`;

  return (
    <div>
      {/* Granularity toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {GRANULARITIES.map(([g, lbl]) => (
          <button key={g} onClick={() => { setGranularity(g); setTip(null); }}
            style={toggleBtnStyle(granularity === g)}>{lbl}</button>
        ))}
      </div>

      {/* Range nav — From/To, each constrained by the other's current value */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: '0.5rem', color: t.lblMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>From</span>
        <select
          value={periodStart ?? ''}
          onChange={e => { setPeriodStart(e.target.value); setTip(null); }}
          style={selectStyle}
        >
          {periods.filter(p => !periodEnd || p <= periodEnd).map(p => (
            <option key={p} value={p}>{periodOptionLabel(granularity, p)}</option>
          ))}
        </select>
        <span style={{ fontSize: '0.5rem', color: t.lblMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>To</span>
        <select
          value={periodEnd ?? ''}
          onChange={e => { setPeriodEnd(e.target.value); setTip(null); }}
          style={selectStyle}
        >
          {periods.filter(p => !periodStart || p >= periodStart).map(p => (
            <option key={p} value={p}>{periodOptionLabel(granularity, p)}</option>
          ))}
        </select>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
        <KpiCard label={kpi1Label} value={fmtValue(stats?.avg)} unit={unit}
          sub={stats ? `Min ${fmtValue(stats.min)} · Max ${fmtValue(stats.max)}` : 'No data'} t={t} />
        <KpiCard label="Latest Consumption" value={fmtValue(latestHourly?.value)} unit={unit}
          sub={latestHourly ? hourTimestampLabel(latestHourly.ts) : 'No data'} t={t} />
      </div>

      {/* Chart */}
      {chartPoints.points.length ? (
        <div ref={chartRef} style={{ position: 'relative' }}>
          <SeriesChart mode={chartPoints.mode} points={chartPoints.points} color={RT_CONS_COLOR}
            unit={unit} t={t} hoveredI={tip?.i ?? null} onHover={handleHover} xAxisLabel={AXIS_TITLE[granularity]} />
          <ChartTooltip tip={tip} points={chartPoints.points} unit={unit} t={t} valueLabel="Consumption" />
        </div>
      ) : (
        <p style={{ fontSize: '0.62rem', color: t.lblMuted, fontStyle: 'italic', padding: '12px 0' }}>No data for this period.</p>
      )}

      <ChartCaption
        source={marketData.source}
        t={t}
        extra="Hourly consumption as published by EPİAŞ, about 2 hours behind. Recent values may be revised. This is a separate, real-time EPİAŞ measure — not the same series as the annual TEİAŞ demand shown under Annual Demand."
      />

      {/* CSV download */}
      <div style={{ marginTop: 16, borderTop: `1px solid ${t.panelBorder}`, paddingTop: 12 }}>
        <span style={{ fontSize: '0.47rem', letterSpacing: '2px', fontWeight: 700, color: t.lblMuted, textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>
          Export Data
        </span>
        <div style={{ display: 'flex', gap: 4, marginBottom: 7 }}>
          <button onClick={() => setExportScope('selected')} style={toggleBtnStyle(exportScope === 'selected')}>Selected Range</button>
          <button onClick={() => setExportScope('full')} style={toggleBtnStyle(exportScope === 'full')}>Full Range</button>
        </div>
        <p style={{ fontSize: '0.46rem', color: t.lblMuted, margin: '0 0 7px' }}>
          {exportScope === 'full' && periods.length
            ? `Full range · ${periodOptionLabel(granularity, periods[0])} – ${periodOptionLabel(granularity, periods[periods.length - 1])}`
            : `Selected range · ${rangeLabel(granularity, periodStart, periodEnd)}`}
        </p>
        <button style={dlBtnStyle} onClick={handleDownload}>Real-Time Consumption {GRANULARITY_LABEL[granularity]} CSV</button>
      </div>
    </div>
  );
}

const LOAD_SUB_TABS = [['annual', 'Annual demand'], ['realtime', 'Real-time consumption']];

export default function LoadTab({ iso, theme }) {
  const t = getT(theme);
  const [loadSubTab, setLoadSubTab] = useState('annual');
  const [marketData, setMarketData] = useState(null);

  // Only used to decide whether the Real-time consumption sub-tab exists for
  // this country (same availability pattern as MarketTab: fetch and see
  // whether anything comes back) — reuses the same market/{iso}.json
  // MarketTab already fetches, rather than a new file, since rt_cons is just
  // one more series alongside the price/quantity ones already there.
  useEffect(() => {
    setLoadSubTab('annual');
    fetchData(dataPath(`market/${iso}.json`))
      .then(d => setMarketData(d))
      .catch(() => setMarketData(null));
  }, [iso]);

  const hasRtCons = !!Object.keys(marketData?.rt_cons?.hourly || {}).length;

  const subTabBtnStyle = active => ({
    fontSize: '0.56rem', letterSpacing: '0.5px', textTransform: 'uppercase', fontWeight: active ? 700 : 400,
    padding: '0 2px 7px', cursor: 'pointer', fontFamily: 'inherit',
    background: 'none', border: 'none', borderBottom: `2px solid ${active ? 'rgba(74,143,204,0.9)' : 'transparent'}`,
    color: active ? t.lbl : t.lblMuted,
  });

  return (
    <div>
      {hasRtCons && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 14, borderBottom: `1px solid ${t.panelBorder}` }}>
          {LOAD_SUB_TABS.map(([id, lbl]) => (
            <button key={id} onClick={() => setLoadSubTab(id)} style={subTabBtnStyle(loadSubTab === id)}>{lbl}</button>
          ))}
        </div>
      )}
      {loadSubTab === 'annual' && <AnnualDemand iso={iso} theme={theme} />}
      {loadSubTab === 'realtime' && hasRtCons && <RealTimeConsumption iso={iso} theme={theme} marketData={marketData} />}
    </div>
  );
}
