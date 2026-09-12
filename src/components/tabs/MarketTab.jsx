import { dataPath } from '../../utils/paths';
import { useState, useEffect, useMemo, useRef } from 'react';
import { getT } from '../../constants';
import ChartCaption from '../ChartCaption';
import { downloadBlob } from './chartHelpers';

// Which series show up as buttons, per sub-tab — Quantity reuses dam's and
// idm's colors below since they're the same underlying markets, just a
// different measure (matched MWh instead of price).
const SERIES_BY_TAB = {
  prices:   ['dam', 'idm', 'bpm'],
  quantity: ['dam_qty', 'idm_qty'],
};
const SERIES_COLOR = { dam: '#2478B4', idm: '#0E8070', bpm: '#C09010', dam_qty: '#2478B4', idm_qty: '#0E8070' };
const WHISKER_COLOR = '#B8BEC6'; // light neutral gray, deliberately not the series color — stays out of the way
// Ids are load-bearing (used throughout getPeriods/getChartPoints/computeStats)
// — only the display labels changed, to match what AXIS_TITLE already says
// each chart's points represent (one per year/month/day/hour respectively).
const GRANULARITIES = [['multiyear', 'Yearly'], ['year', 'Monthly'], ['month', 'Daily'], ['day', 'Hourly']];
const GRANULARITY_LABEL = Object.fromEntries(GRANULARITIES);
// Above this many bars, the Daily (per-day) bar+whisker chart gets visually
// cluttered — fall back to a plain mean line instead, same idea as Hourly.
const DAILY_BAR_MAX_POINTS = 60;
const SUB_TABS = [['prices', 'Prices'], ['quantity', 'Quantity']];
// DAM-only — only that series has EUR/USD alternatives in the data (dam_eur, dam_usd).
const CURRENCIES = [['try', 'TL'], ['eur', 'EUR'], ['usd', 'USD']];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// X-axis title — what each granularity's chart points actually represent.
const AXIS_TITLE = { multiyear: 'Year', year: 'Month', month: 'Day', day: 'Hour' };

// All timestamps in the source JSON are UTC (fixed-width ISO strings with a
// "+00:00" suffix), and the daily/monthly/yearly aggregates are bucketed by
// Turkey local time (UTC+3) on the backend. The Hourly view's raw-timestamp
// display, though, is a per-sub-tab choice: Prices keeps showing UTC via
// plain string slicing (unchanged — the user handles that conversion
// separately later), while Quantity converts to Istanbul local time via
// Intl, so its hourly chart/labels/day-grouping agree with the pre-bucketed
// daily/monthly/yearly aggregates instead of being offset from them. Every
// function below that touches an hourly ISO string takes a `useLocalTime`
// flag for this — true only when called from the Quantity sub-tab.
function toIstanbul(isoUtc) {
  const d = new Date(isoUtc);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
  // Intl can return hour "24" for local midnight instead of "00" — normalize.
  return { date: `${p.year}-${p.month}-${p.day}`, hour: p.hour === '24' ? '00' : p.hour };
}
// The "YYYY-MM-DD" day / "HH" hour an hourly ISO timestamp belongs to, in
// whichever of UTC (plain slicing) or Istanbul local time the caller needs.
function dayOf(iso, useLocalTime)  { return useLocalTime ? toIstanbul(iso).date : iso.slice(0, 10); }
function hourOf(iso, useLocalTime) { return useLocalTime ? toIstanbul(iso).hour : iso.slice(11, 13); }

function monthLabel(ym) { const [y, m] = ym.split('-'); return `${MONTH_ABBR[+m - 1]} ${y}`; }
function dayLabel(ymd) { const [y, m, d] = ymd.split('-'); return `${+d} ${MONTH_ABBR[+m - 1]} ${y}`; }
// Full-word versions, used in the chart tooltip (e.g. "4 August 2026").
function fullMonthLabel(ym) { const [y, m] = ym.split('-'); return `${MONTH_FULL[+m - 1]} ${y}`; }
function fullDayLabel(ymd) { const [y, m, d] = ymd.split('-'); return `${+d} ${MONTH_FULL[+m - 1]} ${y}`; }
function hourOfDayLabel(iso, useLocalTime) { return `${+hourOf(iso, useLocalTime)}:00`; } // "04:00" -> "4:00"
// Chart x-axis labels that disambiguate only when the selected range needs
// it — e.g. a single month's days just say "5", but once a Daily range
// crosses a month boundary that's ambiguous, so it becomes "5 Aug".
function monthPointLabel(ym, rangeStart, rangeEnd) {
  const [y, m] = ym.split('-');
  const spansYears = rangeStart.slice(0, 4) !== rangeEnd.slice(0, 4);
  return spansYears ? `${MONTH_ABBR[+m - 1]} '${y.slice(2)}` : MONTH_ABBR[+m - 1];
}
function dayPointLabel(ymd, rangeStart, rangeEnd) {
  const [, m, d] = ymd.split('-');
  const spansMonths = rangeStart.slice(0, 7) !== rangeEnd.slice(0, 7);
  return spansMonths ? `${+d} ${MONTH_ABBR[+m - 1]}` : `${+d}`;
}
// Axis label for a multi-day Hourly range — day only, no hour, since with
// hundreds of points only ~10 ticks get labeled anyway and "20 Jul 0:00"
// x10 overlaps into an unreadable mess; the tooltip still has the exact
// hour via hourLabel regardless of what the axis shows.
function shortDayLabel(iso, useLocalTime) {
  const [, m, d] = dayOf(iso, useLocalTime).split('-');
  return `${+d} ${MONTH_ABBR[+m - 1]}`;
}
function hourTimestampLabel(iso, useLocalTime) {
  const [y, m, d] = dayOf(iso, useLocalTime).split('-');
  const suffix = useLocalTime ? '' : ' UTC'; // no longer accurate once converted to Istanbul time
  return `${+d} ${MONTH_ABBR[+m - 1]} ${y}, ${hourOf(iso, useLocalTime)}:00${suffix}`;
}

function fmtPrice(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 1 });
}

function niceTicks(maxVal) {
  if (!maxVal || maxVal <= 0) return [0];
  const raw = maxVal / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const nice = [1, 2, 2.5, 5, 10].find(f => f * mag >= raw) * mag;
  // Round the axis top UP to the next nice step — never one full step beyond it.
  // Keeps niceTicks idempotent: niceTicks(niceTicks(x).pop()) === niceTicks(x),
  // so a tick can never land above the plot area.
  const top = Math.ceil(maxVal / nice - 1e-9) * nice;
  const ticks = [];
  for (let v = 0; v <= top + nice * 1e-9; v += nice) ticks.push(Math.round(v));
  return ticks;
}

function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null; }

// What the From/To range pickers choose from, per granularity — the same
// level as what gets charted for Yearly/Monthly/Daily, but for Hourly it's
// still whole days (picking two timestamps across a range of days via a
// dropdown isn't practical), which then charts every hour within them.
function getPeriods(block, granularity, useLocalTime) {
  if (!block) return [];
  if (granularity === 'multiyear') return Object.keys(block.yearly.mean).sort();
  if (granularity === 'year')      return Object.keys(block.monthly.mean).sort();
  if (granularity === 'month')     return Object.keys(block.daily.mean).sort();
  // Hourly picks from the rolling hourly window (block.hourly), NOT
  // block.daily.mean — that's permanent full history back to 2017 and would
  // let you "select" days with no hourly detail behind them at all.
  if (granularity === 'day') {
    const days = new Set(Object.keys(block.hourly || {}).map(h => dayOf(h, useLocalTime)));
    return [...days].sort();
  }
  return [];
}

function periodOptionLabel(granularity, p) {
  if (granularity === 'multiyear') return p;
  if (granularity === 'year')      return monthLabel(p);
  return dayLabel(p); // Daily's days and Hourly's day-range both use day strings
}

// Default range shown the first time a granularity is selected (or when the
// previous range doesn't carry over, e.g. after switching granularity).
function defaultRange(periods, granularity) {
  if (!periods.length) return [null, null];
  const last = periods[periods.length - 1];
  if (granularity === 'multiyear') return [periods[0], last];       // full history, as before
  if (granularity === 'year')      return [periods[Math.max(0, periods.length - 12)], last]; // last 12 months
  if (granularity === 'month')     return [periods[Math.max(0, periods.length - 30)], last]; // last 30 days
  return [last, last]; // Hourly: most recent single day, as before
}

function rangeLabel(granularity, start, end) {
  if (!start || !end) return '';
  const fmt = granularity === 'multiyear' ? (x => x) : granularity === 'year' ? monthLabel : dayLabel;
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

function statsFromKeys(meanMap, minMap, maxMap, keys) {
  if (!keys.length) return null;
  return {
    avg: avg(keys.map(k => meanMap[k])),
    min: Math.min(...keys.map(k => minMap[k])),
    max: Math.max(...keys.map(k => maxMap[k])),
  };
}

// periodStart/periodEnd are always the same "shape" of key as the aggregate
// being filtered (years for yearly, 'YYYY-MM' for monthly, 'YYYY-MM-DD' for
// daily) — plain string comparison sorts these the same as chronological
// order, so a simple range filter works without parsing dates.
function computeStats(block, granularity, periodStart, periodEnd, useLocalTime) {
  if (!block || !periodStart || !periodEnd) return null;
  if (granularity === 'multiyear') {
    const keys = Object.keys(block.yearly.mean).filter(k => k >= periodStart && k <= periodEnd);
    return statsFromKeys(block.yearly.mean, block.yearly.min, block.yearly.max, keys);
  }
  if (granularity === 'year') {
    const keys = Object.keys(block.monthly.mean).filter(k => k >= periodStart && k <= periodEnd);
    return statsFromKeys(block.monthly.mean, block.monthly.min, block.monthly.max, keys);
  }
  if (granularity === 'month') {
    const keys = Object.keys(block.daily.mean).filter(k => k >= periodStart && k <= periodEnd);
    return statsFromKeys(block.daily.mean, block.daily.min, block.daily.max, keys);
  }
  if (granularity === 'day') {
    const keys = Object.keys(block.hourly).filter(k => {
      const day = dayOf(k, useLocalTime);
      return day >= periodStart && day <= periodEnd;
    });
    if (!keys.length) return null;
    const vals = keys.map(k => block.hourly[k]);
    return { avg: avg(vals), min: Math.min(...vals), max: Math.max(...vals) };
  }
  return null;
}

function getChartPoints(block, granularity, periodStart, periodEnd, useLocalTime) {
  if (!block || !periodStart || !periodEnd) return { mode: 'band', points: [] };
  if (granularity === 'multiyear') {
    const years = Object.keys(block.yearly.mean).filter(k => k >= periodStart && k <= periodEnd).sort();
    return { mode: 'band', points: years.map(y => ({
      label: y, fullLabel: y, mean: block.yearly.mean[y], min: block.yearly.min[y], max: block.yearly.max[y],
    })) };
  }
  if (granularity === 'year') {
    const months = Object.keys(block.monthly.mean).filter(k => k >= periodStart && k <= periodEnd).sort();
    return { mode: 'band', points: months.map(m => ({
      label: monthPointLabel(m, periodStart, periodEnd), fullLabel: fullMonthLabel(m),
      mean: block.monthly.mean[m], min: block.monthly.min[m], max: block.monthly.max[m],
    })) };
  }
  if (granularity === 'month') {
    const days = Object.keys(block.daily.mean).filter(k => k >= periodStart && k <= periodEnd).sort();
    const points = days.map(d => ({
      label: dayPointLabel(d, periodStart, periodEnd), fullLabel: fullDayLabel(d),
      mean: block.daily.mean[d], min: block.daily.min[d], max: block.daily.max[d],
    }));
    // Too many bars to read cleanly — fall back to a plain mean line (still
    // has min/max for the tooltip, just not drawn as bars+whiskers).
    if (points.length > DAILY_BAR_MAX_POINTS) {
      return { mode: 'line', points: points.map(p => ({ ...p, value: p.mean })) };
    }
    return { mode: 'band', points };
  }
  if (granularity === 'day') {
    const hours = Object.keys(block.hourly).filter(k => {
      const day = dayOf(k, useLocalTime);
      return day >= periodStart && day <= periodEnd;
    }).sort();
    const multiDay = periodStart !== periodEnd;
    return { mode: 'line', points: hours.map(h => ({
      label: multiDay ? shortDayLabel(h, useLocalTime) : hourOfDayLabel(h, useLocalTime),
      fullLabel: fullDayLabel(dayOf(h, useLocalTime)), hourLabel: hourOfDayLabel(h, useLocalTime),
      value: block.hourly[h],
    })) };
  }
  return { mode: 'band', points: [] };
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, unit, sub, t }) {
  return (
    <div style={{ padding: '8px 10px', borderRadius: 5, backgroundColor: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
      <div style={{ fontSize: '0.5rem', color: t.lblMuted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.08rem', fontWeight: 700, color: t.lbl, lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: '0.56rem', fontWeight: 400, color: t.lblMuted, marginLeft: 3 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: '0.54rem', color: t.lblMuted, marginTop: 4 }}>{sub || ' '}</div>
    </div>
  );
}

// ── Chart: shaded min-max band + mean line (or a plain line for Day) ─────────
function PriceChart({ mode, points, color, unit, t, hoveredI, onHover, xAxisLabel }) {
  const W = 300, H = 168, pL = 42, pR = 8, pT = 10, pB = 30;
  const iW = W - pL - pR, iH = H - pT - pB;
  const n = points.length;
  if (!n) return null;

  const vals = mode === 'band'
    ? points.flatMap(p => [p.mean, p.min, p.max]).filter(v => v != null)
    : points.map(p => p.value).filter(v => v != null);
  const maxVal = Math.max(...vals, 1);
  const ticks   = niceTicks(maxVal);
  const axisMax = ticks[ticks.length - 1] || 1;
  const toY = v => pT + iH - (v / axisMax) * iH;
  const toX = i => n === 1 ? pL + iW / 2 : pL + (i / (n - 1)) * iW;
  const slotW = iW / n;
  // Bars sit centered in their own slot (matching the hover rects below);
  // the Day line chart keeps the edge-to-edge toX spread instead.
  const barW    = Math.max(slotW * 0.55, 1.5);
  const barX    = i => pL + i * slotW + (slotW - barW) / 2;
  const slotMid = i => pL + i * slotW + slotW / 2;
  const xPos    = i => mode === 'band' ? slotMid(i) : toX(i);

  let linePts = null;
  if (mode !== 'band') {
    linePts = points.map((p, i) => p.value != null ? `${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}` : null).filter(Boolean).join(' ');
  }

  const labelStep = n > 20 ? Math.ceil(n / 10) : n > 10 ? 2 : 1;
  const hlFill = t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const whiskerCapW = barW * 0.55;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <text transform={`translate(9,${pT + iH / 2}) rotate(-90)`} textAnchor="middle" fill={t.lblMuted} fontSize={6}>{unit}</text>
      {ticks.map(tick => (
        <g key={tick}>
          {tick > 0 && <line x1={pL} x2={pL + iW} y1={toY(tick)} y2={toY(tick)} stroke={t.panelBorder} strokeWidth={0.4} strokeDasharray="2,3" />}
          <text x={pL - 3} y={toY(tick) + 3} textAnchor="end" fill={t.lblMuted} fontSize={6.5}>{fmtPrice(tick)}</text>
        </g>
      ))}
      <line x1={pL} x2={pL} y1={pT} y2={pT + iH} stroke={t.lblMuted} strokeWidth={0.4} />
      <line x1={pL} x2={pL + iW} y1={pT + iH} y2={pT + iH} stroke={t.lblMuted} strokeWidth={0.4} />

      {hoveredI != null && <rect x={pL + hoveredI * slotW} y={pT} width={slotW} height={iH} fill={hlFill} />}

      {mode === 'band' && points.map((p, i) => p.mean == null ? null : (
        <rect key={`bar${i}`} x={barX(i)} y={toY(p.mean)} width={barW}
          height={Math.max(pT + iH - toY(p.mean), 0.5)} fill={color} opacity={hoveredI === i ? 1 : 0.85} />
      ))}
      {mode === 'band' && points.map((p, i) => {
        if (p.min == null || p.max == null) return null;
        const cx = slotMid(i);
        const yMin = toY(p.min), yMax = toY(p.max);
        return (
          <g key={`wh${i}`}>
            <line x1={cx} x2={cx} y1={yMax} y2={yMin} stroke={WHISKER_COLOR} strokeWidth={0.7} />
            <line x1={cx - whiskerCapW / 2} x2={cx + whiskerCapW / 2} y1={yMax} y2={yMax} stroke={WHISKER_COLOR} strokeWidth={0.7} />
            <line x1={cx - whiskerCapW / 2} x2={cx + whiskerCapW / 2} y1={yMin} y2={yMin} stroke={WHISKER_COLOR} strokeWidth={0.7} />
          </g>
        );
      })}
      {mode === 'line' && linePts && <polyline points={linePts} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />}

      {points.map((p, i) => i % labelStep === 0 && (
        <text key={i} x={xPos(i)} y={pT + iH + 9} textAnchor="middle" fill={hoveredI === i ? t.lbl : t.lblMuted} fontSize={5.8}>{p.label}</text>
      ))}

      {xAxisLabel && (
        <text x={pL + iW / 2} y={pT + iH + 19} textAnchor="middle" fill={t.lblMuted} fontSize={6} fontStyle="italic">
          {xAxisLabel}
        </text>
      )}

      {points.map((p, i) => (
        <rect key={`h${i}`} x={pL + i * slotW} y={pT} width={slotW} height={iH}
          fill="transparent" style={{ cursor: 'default' }}
          onMouseEnter={e => onHover(i, e)} onMouseLeave={() => onHover(null, null)} />
      ))}
    </svg>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function MarketTab({ iso, theme }) {
  const t = getT(theme);

  const [subTab,       setSubTab]      = useState('prices');
  const [data,        setData]        = useState(null);
  const [loading,      setLoading]     = useState(true);
  const [series,       setSeries]      = useState('dam');
  const [currency,     setCurrency]    = useState('try'); // 'try' | 'eur' | 'usd' — DAM only, remembered across series switches
  const [granularity,  setGranularity] = useState('multiyear');
  const [periodStart,  setPeriodStart] = useState(null);
  const [periodEnd,    setPeriodEnd]   = useState(null);
  const [exportScope,  setExportScope] = useState('selected'); // 'selected' | 'full' — CSV export range
  const [tip,          setTip]         = useState(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!iso) return;
    setLoading(true); setData(null);
    setSubTab('prices'); setSeries(SERIES_BY_TAB.prices[0]); setCurrency('try'); setGranularity('multiyear');
    setPeriodStart(null); setPeriodEnd(null); setExportScope('selected'); setTip(null);
    fetch(dataPath(`market/${iso}.json`))
      .then(r => { if (!r.ok) throw new Error('404'); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [iso]);

  const activeSeries = SERIES_BY_TAB[subTab];
  // Hourly raw-timestamp display/day-grouping: Prices stays UTC (unchanged —
  // handled separately later); Quantity converts to Istanbul local time so
  // its Hourly view agrees with the local-time daily/monthly/yearly buckets.
  const useLocalTime = subTab === 'quantity';

  // dam_eur / dam_usd are separate top-level keys with the same shape as dam
  // (and their own unit) — idm/bpm and the Quantity series have no currency
  // alternatives, so this only kicks in for series === 'dam' specifically.
  const dataKey = series === 'dam' && currency !== 'try' ? `dam_${currency}` : series;
  const block = data?.[dataKey] ?? null;

  const periods = useMemo(() => getPeriods(block, granularity, useLocalTime), [block, granularity, useLocalTime]);

  // Default range whenever granularity changes; on a series switch with the
  // same granularity a still-valid custom range stays put instead of
  // snapping back to the default. Can't tell these apart just by checking
  // periods.includes(prev) — Daily and Hourly both key on plain 'YYYY-MM-DD'
  // strings, so a Daily range can look like a "still valid" Hourly one even
  // though it's a different granularity entirely — so granularity changes
  // are tracked explicitly instead of inferred from key format collisions.
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

  const stats       = useMemo(() => computeStats(block, granularity, periodStart, periodEnd, useLocalTime), [block, granularity, periodStart, periodEnd, useLocalTime]);
  const chartPoints = useMemo(() => getChartPoints(block, granularity, periodStart, periodEnd, useLocalTime), [block, granularity, periodStart, periodEnd, useLocalTime]);
  const latestHourly = useMemo(() => {
    if (!block?.hourly) return null;
    const keys = Object.keys(block.hourly);
    if (!keys.length) return null;
    const latestKey = keys.reduce((a, b) => (a > b ? a : b));
    return { ts: latestKey, value: block.hourly[latestKey] };
  }, [block]);

  if (loading) return <p style={{ fontSize: '0.7rem', color: t.lblMuted, marginTop: 8 }}>Loading…</p>;
  if (!data)   return <p style={{ fontSize: '0.7rem', color: t.lblMuted, marginTop: 8, fontStyle: 'italic' }}>No market data available for this country.</p>;

  const unit = block?.unit || 'TL/MWh';

  // Underline-style sub-tabs (a tab strip, not standalone pill buttons) —
  // reads as a tab set even with just one entry, and more (e.g.
  // "Consumption") can be added to SUB_TABS without restyling.
  const subTabBtnStyle = active => ({
    fontSize: '0.56rem', letterSpacing: '0.5px', textTransform: 'uppercase', fontWeight: active ? 700 : 400,
    padding: '0 2px 7px', cursor: 'pointer', fontFamily: 'inherit',
    background: 'none', border: 'none', borderBottom: `2px solid ${active ? 'rgba(74,143,204,0.9)' : 'transparent'}`,
    color: active ? t.lbl : t.lblMuted,
  });

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

  // Exports whatever granularity + range is currently on screen, using the
  // same range-filter logic as the chart/KPIs — not always the full daily
  // history regardless of what's selected. exportScope picks between the
  // range currently on screen and the full range available for this
  // granularity (periods[0]..periods[last] — for Hourly that's still
  // capped to the 90-day window, since nothing wider actually exists).
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
        const day = dayOf(k, useLocalTime);
        return day >= fromKey && day <= toKey;
      }).sort();
      header = 'timestamp,price';
      rows = keys.map(k => [k, block.hourly[k]].join(','));
    }
    downloadBlob([header, ...rows].join('\n'), `market_${dataKey}_${granularity}_${exportScope}_${iso}.csv`, 'text/csv');
  };

  const kpi1Label = `Average · ${rangeLabel(granularity, periodStart, periodEnd)}`;

  const tooltip = (() => {
    if (!tip) return null;
    const p = chartPoints.points[tip.i];
    if (!p) return null;
    const TW = 148;
    const left = tip.x > 170 ? tip.x - TW - 6 : tip.x + 8;
    const top  = Math.max(tip.y - 30, 0);
    // Hourly points carry hourLabel; both the bar chart and the dense-Daily
    // fallback line carry mean/min/max — check point shape, not chart mode,
    // since 'line' rendering covers both an aggregate fallback and Hourly.
    const isHourly = p.hourLabel != null;
    const row = (label, value, muted) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: muted ? '0.52rem' : '0.55rem', color: muted ? t.lblMuted : t.lbl }}>
        <span style={{ color: t.lblMuted }}>{label}</span>
        <span>{value} <span style={{ fontSize: '0.46rem', color: t.lblMuted }}>{unit}</span></span>
      </div>
    );
    return (
      <div style={{
        position: 'absolute', left, top, width: TW, pointerEvents: 'none', zIndex: 10,
        backgroundColor: t.panel, border: `1px solid ${t.panelBorder}`,
        borderRadius: 4, padding: '6px 8px', boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontWeight: 700, fontSize: '0.56rem', color: t.lbl, marginBottom: 3 }}>
          <span style={{ fontWeight: 400, color: t.lblMuted }}>Date: </span>{p.fullLabel}
        </div>
        {isHourly ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.52rem', color: t.lblMuted, marginBottom: 2 }}>
              <span>Hour</span><span>{p.hourLabel}</span>
            </div>
            {row('Price', fmtPrice(p.value))}
          </>
        ) : (
          <>
            {row('Mean', fmtPrice(p.mean))}
            {row('Min', fmtPrice(p.min), true)}
            {row('Max', fmtPrice(p.max), true)}
          </>
        )}
      </div>
    );
  })();

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, borderBottom: `1px solid ${t.panelBorder}` }}>
        {SUB_TABS.map(([id, lbl]) => (
          <button key={id} onClick={() => { setSubTab(id); setSeries(SERIES_BY_TAB[id][0]); setTip(null); }}
            style={subTabBtnStyle(subTab === id)}>{lbl}</button>
        ))}
      </div>

      {(subTab === 'prices' || subTab === 'quantity') && (
        <>
          {/* Series toggle — full dataset name, 2 lines, slightly narrower than the panel, centered */}
          <div style={{ display: 'flex', gap: 4, width: '93%', margin: '0 auto 10px' }}>
            {activeSeries.map(s => {
              const [line1, line2 = ''] = (data[s]?.label || s.toUpperCase()).split(' — ');
              const active = series === s;
              return (
                <button key={s} onClick={() => { setSeries(s); setTip(null); }} style={{
                  flex: 1, padding: '7px 4px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${active ? 'rgba(74,143,204,0.6)' : t.panelBorder}`,
                  backgroundColor: active ? 'rgba(74,143,204,0.1)' : 'transparent',
                  textAlign: 'center', lineHeight: 1.3,
                }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: active ? t.lbl : t.lblMuted }}>{line1}</div>
                  <div style={{ fontSize: '0.58rem', fontWeight: 400, color: t.lblMuted, marginTop: 2 }}>{line2}</div>
                </button>
              );
            })}
          </div>

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
            <KpiCard label={kpi1Label} value={fmtPrice(stats?.avg)} unit={unit}
              sub={stats ? `Min ${fmtPrice(stats.min)} · Max ${fmtPrice(stats.max)}` : 'No data'} t={t} />
            <KpiCard label="Latest Price" value={fmtPrice(latestHourly?.value)} unit={unit}
              sub={latestHourly ? hourTimestampLabel(latestHourly.ts, useLocalTime) : 'No data'} t={t} />
          </div>

          {/* Currency toggle — DAM only, IDM/BPM have no EUR/USD in the data */}
          {series === 'dam' && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {CURRENCIES.map(([c, lbl]) => (
                <button key={c} onClick={() => setCurrency(c)} style={toggleBtnStyle(currency === c)}>{lbl}</button>
              ))}
            </div>
          )}

          {/* Chart */}
          {chartPoints.points.length ? (
            <div ref={chartRef} style={{ position: 'relative' }}>
              <PriceChart mode={chartPoints.mode} points={chartPoints.points} color={SERIES_COLOR[series]}
                unit={unit} t={t} hoveredI={tip?.i ?? null} onHover={handleHover} xAxisLabel={AXIS_TITLE[granularity]} />
              {tooltip}
            </div>
          ) : (
            <p style={{ fontSize: '0.62rem', color: t.lblMuted, fontStyle: 'italic', padding: '12px 0' }}>No data for this period.</p>
          )}

          <ChartCaption source={data.source} t={t} />

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
            <button style={dlBtnStyle} onClick={handleDownload}>{series.toUpperCase()} {GRANULARITY_LABEL[granularity]} CSV</button>
          </div>
        </>
      )}
    </div>
  );
}
