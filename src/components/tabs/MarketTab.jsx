import { dataPath } from '../../utils/paths';
import { fetchData } from '../../utils/dataCache';
import { useState, useEffect, useMemo, useRef } from 'react';
import { getT } from '../../constants';
import ChartCaption from '../ChartCaption';
import {
  downloadBlob, GRANULARITIES, GRANULARITY_LABEL, AXIS_TITLE,
  dayOf, hourTimestampLabel, fmtValue, getPeriods, periodOptionLabel,
  defaultRange, rangeLabel, computeStats, getChartPoints,
} from './chartHelpers';
import { KpiCard, SeriesChart, ChartTooltip } from './MarketChartComponents';

// Which series show up as buttons, per sub-tab — Quantity reuses dam's,
// idm's and bpm's colors below since they're the same underlying markets,
// just a different measure (matched/net MWh instead of price).
const SERIES_BY_TAB = {
  prices:   ['dam', 'idm', 'bpm'],
  quantity: ['dam_qty', 'idm_qty', 'bpm_net'],
};
const SERIES_COLOR = {
  dam: '#2478B4', idm: '#0E8070', bpm: '#C09010',
  dam_qty: '#2478B4', idm_qty: '#0E8070', bpm_net: '#C09010',
};
const SUB_TABS = [['prices', 'Prices'], ['quantity', 'Quantity']];
// DAM-only — only that series has EUR/USD alternatives in the data (dam_eur, dam_usd).
const CURRENCIES = [['try', 'TL'], ['eur', 'EUR'], ['usd', 'USD']];

// getPeriods/periodOptionLabel/defaultRange/rangeLabel/computeStats/
// getChartPoints/AXIS_TITLE/dayOf/hourTimestampLabel/fmtValue now live in
// chartHelpers.jsx, and KpiCard/SeriesChart/ChartTooltip in
// MarketChartComponents.jsx — both imported above — so LoadTab's Real-time
// consumption sub-tab can reuse them instead of duplicating ~250 lines.
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
    fetchData(dataPath(`market/${iso}.json`))
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [iso]);

  const activeSeries = SERIES_BY_TAB[subTab];

  // dam_eur / dam_usd are separate top-level keys with the same shape as dam
  // (and their own unit) — idm/bpm and the Quantity series have no currency
  // alternatives, so this only kicks in for series === 'dam' specifically.
  const dataKey = series === 'dam' && currency !== 'try' ? `dam_${currency}` : series;
  const block = data?.[dataKey] ?? null;

  const periods = useMemo(() => getPeriods(block, granularity), [block, granularity]);

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

  const stats       = useMemo(() => computeStats(block, granularity, periodStart, periodEnd), [block, granularity, periodStart, periodEnd]);
  const chartPoints = useMemo(() => getChartPoints(block, granularity, periodStart, periodEnd), [block, granularity, periodStart, periodEnd]);
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
        const day = dayOf(k);
        return day >= fromKey && day <= toKey;
      }).sort();
      header = 'timestamp,price';
      rows = keys.map(k => [k, block.hourly[k]].join(','));
    }
    downloadBlob([header, ...rows].join('\n'), `market_${dataKey}_${granularity}_${exportScope}_${iso}.csv`, 'text/csv');
  };

  const kpi1Label = `Average · ${rangeLabel(granularity, periodStart, periodEnd)}`;

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
            <KpiCard label={kpi1Label} value={fmtValue(stats?.avg)} unit={unit}
              sub={stats ? `Min ${fmtValue(stats.min)} · Max ${fmtValue(stats.max)}` : 'No data'} t={t} />
            <KpiCard label="Latest Price" value={fmtValue(latestHourly?.value)} unit={unit}
              sub={latestHourly ? hourTimestampLabel(latestHourly.ts) : 'No data'} t={t} />
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
              <SeriesChart mode={chartPoints.mode} points={chartPoints.points} color={SERIES_COLOR[series]}
                unit={unit} t={t} hoveredI={tip?.i ?? null} onHover={handleHover} xAxisLabel={AXIS_TITLE[granularity]} />
              <ChartTooltip tip={tip} points={chartPoints.points} unit={unit} t={t} valueLabel="Price" />
            </div>
          ) : (
            <p style={{ fontSize: '0.62rem', color: t.lblMuted, fontStyle: 'italic', padding: '12px 0' }}>No data for this period.</p>
          )}

          {series === 'bpm_net' && (
            <p style={{ fontSize: '0.56rem', color: t.lblMuted, lineHeight: 1.5, margin: '8px 0 0' }}>
              Net = Up regulation instructions minus Down regulation instructions. Positive: system short (net up-regulation). Negative: system surplus (net down-regulation).
            </p>
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
