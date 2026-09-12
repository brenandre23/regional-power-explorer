import { dataPath } from '../utils/paths';
import { useState, useEffect, useRef } from 'react';
import { getT, FUEL_COLORS, COUNTRY_ZONE_COLORS } from '../constants';
import ChartCaption from './ChartCaption';

// ── helpers ───────────────────────────────────────────────────────────────────
const num = v => (Number.isFinite(v) ? v : 0);   // defensive: never NaN/Infinity

function downloadBlob(content, filename, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function niceTicks(maxVal) {
  if (!Number.isFinite(maxVal) || maxVal <= 0) return [0];
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
const fmt = v =>
  v == null || !Number.isFinite(v) ? '—'
  : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M`
  : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k`
  : `${Math.round(v)}`;

function matchFuelColor(name) {
  const n = name.toLowerCase();
  if (n.includes('coal')) return FUEL_COLORS.coal;
  if (n.includes('gas')) return FUEL_COLORS.gas;
  if (n.includes('hydro') && (n.includes('ror') || n.includes('run'))) return '#1ABDE0';
  if (n.includes('hydro')) return FUEL_COLORS.hydro;
  if (n.includes('solar')) return FUEL_COLORS.solar;
  if (n.includes('geothermal')) return FUEL_COLORS.geothermal;
  if (n.includes('wind')) return FUEL_COLORS.wind;
  if (n.includes('nuclear')) return FUEL_COLORS.nuclear;
  if (n.includes('oil')) return FUEL_COLORS.oil;
  if (n.includes('biomass') || n.includes('bioenergy') || n.includes('wood')) return FUEL_COLORS.biomass;
  if (n.includes('waste') || n.includes('other') || n.includes('thermal')) return FUEL_COLORS.waste;
  return '#9AA6B2';
}

const _PALETTE = [
  '#2478B4', '#E8B820', '#2AADA0', '#B8720A', '#4E79A7', '#0E8070',
  '#7EC8E0', '#C0506A', '#5A9EC8', '#1A9080', '#8AAEC0', '#6ACAD8',
  '#9A7040', '#3CBFB0', '#A8986C', '#5888A0', '#0D5C8A', '#7AC030',
];
const countryColor = (iso, i) => COUNTRY_ZONE_COLORS?.[iso] || _PALETTE[i % _PALETTE.length];

// ── aggregation ───────────────────────────────────────────────────────────────
function aggregateSupply(supplies, key) {
  // Only members that actually have this section, and keep a strict COMMON year
  // window [max(first years), min(last years)] so the same set of countries
  // contributes to every year — no artificial jump when a country's series
  // starts/ends mid-range.
  const members = supplies.filter(s => s?.[key]?.years?.length);
  if (!members.length) return null;
  let unit = key === 'capacity' ? 'MW' : 'GWh';
  members.forEach(s => { if (s[key].unit) unit = s[key].unit; });
  const start = Math.max(...members.map(s => s[key].years[0]));
  const end   = Math.min(...members.map(s => s[key].years[s[key].years.length - 1]));
  if (start > end) return { years: [], fuels: {}, demand: null, unit, nMembers: members.length, window: null };

  const years = [];
  for (let y = start; y <= end; y++) years.push(y);
  const fuels = {};
  const demand = years.map(() => 0);
  let hasDemand = false;
  for (const s of members) {
    const g = s[key];
    years.forEach((Y, yi) => {
      const idx = g.years.indexOf(Y);
      if (idx < 0) return;
      for (const [f, arr] of Object.entries(g.fuels || {})) {
        if (!fuels[f]) fuels[f] = years.map(() => 0);
        fuels[f][yi] += num(arr[idx]);
      }
      const d = g.demand?.[idx];
      if (d != null) { demand[yi] += num(d); hasDemand = true; }
    });
  }
  const entries = Object.entries(fuels)
    .filter(([, a]) => a.some(v => v > 0))
    .sort(([, a], [, b]) => b.reduce((s, v) => s + v, 0) - a.reduce((s, v) => s + v, 0));
  // Distinct upstream sources across contributing members — a region chart can
  // mix OWID/Ember with national statistics, and the caption must say so.
  const sources = [...new Set(members.map(s => s[key].source).filter(Boolean))];
  return { years, fuels: Object.fromEntries(entries), demand: hasDemand ? demand : null, unit, nMembers: members.length, window: [start, end], sources };
}

function aggregateNetTrade(tradeByIso, members) {
  // Members with usable bilateral flows
  const have = [];
  // Members absent from the chart, split by reason. "isolated" = no
  // interconnection at all (a real zero); "unreported" = interconnected but no
  // usable series in the source. Conflating the two would let a reader conclude
  // that a country does not trade when in fact nobody declared its flows.
  const isolated = [], unreported = [];
  members.forEach(({ iso, name }, i) => {
    const d = tradeByIso[iso];
    if (!d) { unreported.push(iso); return; }
    if (d.status) { isolated.push(iso); return; }
    const imp = d.imports || {}, exp = d.exports || {};
    if (!Object.keys(imp).length && !Object.keys(exp).length) { unreported.push(iso); return; }
    const net = {};
    d.years.forEach((Y, idx) => {
      const im = Object.values(imp).reduce((s, a) => s + num(a[idx]), 0);
      const ex = Object.values(exp).reduce((s, a) => s + num(a[idx]), 0);
      net[Y] = im - ex;                       // >0 net importer, <0 net exporter
    });
    have.push({ iso, name, net, color: countryColor(iso, i), years: d.years, source: d.source });
  });
  if (!have.length) return null;
  const sources = [...new Set(have.map(r => r.source).filter(Boolean))];
  // Strict common window across members that have data → no jump.
  const start = Math.max(...have.map(r => r.years[0]));
  const end   = Math.min(...have.map(r => r.years[r.years.length - 1]));
  if (start > end) return { years: [], rows: [], nMembers: have.length, window: null, sources, isolated, unreported };
  const years = [];
  for (let y = start; y <= end; y++) years.push(y);
  const rows = have.map(({ iso, name, net, color }) => ({ iso, name, color, net }));
  return { years, rows, nMembers: have.length, window: [start, end], sources, isolated, unreported };
}

// Spells out which members are missing and why, so an absent country is never
// read as a country that does not trade. Interconnectors between two unreported
// members (e.g. OMVS, CLSG in West Africa) are invisible on this chart.
function missingNote(net) {
  const bits = [];
  if (net.unreported?.length) {
    bits.push(`No usable series for ${net.unreported.join(', ')} — absent from the chart, `
            + 'which is not the same as no trade: flows between two such members do not appear at all');
  }
  if (net.isolated?.length) {
    bits.push(`${net.isolated.join(', ')} ${net.isolated.length > 1 ? 'have' : 'has'} no cross-border interconnection`);
  }
  return bits.length ? bits.join('. ') + '.' : '';
}

// ── hover wrapper + tooltip ───────────────────────────────────────────────────
function HoverChart({ t, render, tooltip }) {
  const ref = useRef(null);
  const [h, setH] = useState(null);                // { yi, x, y }
  const onHover = (yi, e) => {
    if (yi == null || !ref.current) { setH(null); return; }
    const r = ref.current.getBoundingClientRect();
    setH({ yi, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
  };
  const tip = h ? tooltip(h.yi) : null;
  const TW = 124;  // approx tooltip width — keep it inside the chart, not over the legend
  return (
    <div ref={ref} style={{ position: 'relative' }} onMouseLeave={() => setH(null)}>
      {render(h?.yi ?? null, onHover)}
      {tip && (
        <div style={{
          position: 'absolute',
          left: Math.max(2, Math.min(h.x + 12, (h.w || 200) - TW)),
          top: Math.max(h.y - 10, 0),
          background: t.panel, border: `1px solid ${t.panelBorder}`, borderRadius: 5,
          padding: '6px 8px', pointerEvents: 'none', zIndex: 20, width: TW,
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
        }}>{tip}</div>
      )}
    </div>
  );
}

// ── Diverging stacked bar: net trade by country ──────────────────────────────
function NetTradeChart({ data, hidden, hoveredYi, onHover, t }) {
  const W = 320, H = 190, pL = 42, pR = 8, pT = 10, pB = 24;
  const iW = W - pL - pR, iH = H - pT - pB;
  const { years } = data;
  const rows = data.rows.filter(r => !hidden?.has(r.iso));
  const posTot = years.map((Y) => rows.reduce((s, r) => s + Math.max(r.net[Y] || 0, 0), 0));
  const negTot = years.map((Y) => rows.reduce((s, r) => s + Math.min(r.net[Y] || 0, 0), 0));
  const posTicks = niceTicks(Math.max(...posTot, 1));
  const negTicks = niceTicks(Math.max(...negTot.map(v => -v), 1));
  const axisPos = posTicks[posTicks.length - 1] || 1;
  const axisNeg = negTicks[negTicks.length - 1] || 1;
  const posH = iH * axisPos / (axisPos + axisNeg);
  const negH = iH - posH;
  const zeroY = pT + posH;
  const toY = v => v >= 0 ? zeroY - (v / axisPos) * posH : zeroY + (-v / axisNeg) * negH;
  const slotW = iW / years.length;
  const barW = Math.max(slotW * 0.7, 1.5);
  const barX = i => pL + i * slotW + (slotW - barW) / 2;
  const yrStep = years.length > 15 ? 5 : years.length > 8 ? 2 : 1;
  const hlFill = t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <text transform={`translate(8,${pT + iH / 2}) rotate(-90)`} textAnchor="middle" fill={t.lblMuted} fontSize={6}>GWh net</text>
      {posTicks.slice(1).map(tk => (
        <g key={`p${tk}`}>
          <line x1={pL} x2={pL + iW} y1={toY(tk)} y2={toY(tk)} stroke={t.panelBorder} strokeWidth={0.4} strokeDasharray="2,3" />
          <text x={pL - 3} y={toY(tk) + 3} textAnchor="end" fill={t.lblMuted} fontSize={6}>{fmt(tk)}</text>
        </g>
      ))}
      {negTicks.slice(1).map(tk => (
        <g key={`n${tk}`}>
          <line x1={pL} x2={pL + iW} y1={toY(-tk)} y2={toY(-tk)} stroke={t.panelBorder} strokeWidth={0.4} strokeDasharray="2,3" />
          <text x={pL - 3} y={toY(-tk) + 3} textAnchor="end" fill={t.lblMuted} fontSize={6}>−{fmt(tk)}</text>
        </g>
      ))}
      <line x1={pL} x2={pL + iW} y1={zeroY} y2={zeroY} stroke={t.lblMuted} strokeWidth={0.7} />
      <text x={pL - 3} y={zeroY + 3} textAnchor="end" fill={t.lblMuted} fontSize={6}>0</text>
      <line x1={pL} x2={pL} y1={pT} y2={pT + iH} stroke={t.lblMuted} strokeWidth={0.4} />
      {years.map((Y, yi) => {
        const x = barX(yi);
        let posBase = 0, negBase = 0;
        return (
          <g key={Y}>
            {hoveredYi === yi && <rect x={pL + yi * slotW} y={pT} width={slotW} height={iH} fill={hlFill} />}
            {rows.map(r => {
              const v = num(r.net[Y]);
              if (v > 0) {
                const h = (v / axisPos) * posH, y = zeroY - ((posBase + v) / axisPos) * posH;
                posBase += v;
                return <rect key={r.iso} x={x} y={y} width={barW} height={Math.max(h, 0.3)} fill={r.color} opacity={hoveredYi === yi ? 1 : 0.88} />;
              }
              if (v < 0) {
                const h = (-v / axisNeg) * negH, y = zeroY + (negBase / axisNeg) * negH;
                negBase += -v;
                return <rect key={r.iso} x={x} y={y} width={barW} height={Math.max(h, 0.3)} fill={r.color} opacity={hoveredYi === yi ? 1 : 0.88} />;
              }
              return null;
            })}
            {Y % yrStep === 0 && <text x={x + barW / 2} y={pT + iH + 9} textAnchor="middle" fill={hoveredYi === yi ? t.lbl : t.lblMuted} fontSize={5.8}>{Y}</text>}
            <rect x={pL + yi * slotW} y={pT} width={slotW} height={iH} fill="transparent"
              onMouseMove={e => onHover(yi, e)} onMouseEnter={e => onHover(yi, e)} />
          </g>
        );
      })}
    </svg>
  );
}

// ── Stacked bar: generation / capacity by fuel ───────────────────────────────
function FuelChart({ section, hidden, hoveredYi, onHover, t }) {
  const W = 320, H = 190, pL = 42, pR = 8, pT = 10, pB = 24;
  const iW = W - pL - pR, iH = H - pT - pB;
  const { years, fuels, demand } = section;
  const allFuels = Object.keys(fuels).filter(f => !hidden?.has(f));
  const totals = years.map((_, yi) => allFuels.reduce((s, f) => s + num(fuels[f][yi]), 0));
  const dVals = (demand || []).filter(v => v != null);
  const ticks = niceTicks(Math.max(...totals, dVals.length ? Math.max(...dVals) : 0, 1));
  const axisMax = ticks[ticks.length - 1] || 1;
  const toY = v => pT + iH - (v / axisMax) * iH;
  const slotW = iW / years.length;
  const barW = Math.max(slotW * 0.7, 1.5);
  const barX = i => pL + i * slotW + (slotW - barW) / 2;
  const yrStep = years.length > 15 ? 5 : years.length > 8 ? 2 : 1;
  const hlFill = t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const dPts = demand
    ? demand.map((v, i) => v != null ? `${(barX(i) + barW / 2).toFixed(1)},${toY(num(v)).toFixed(1)}` : null).filter(Boolean).join(' ')
    : '';

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <text transform={`translate(8,${pT + iH / 2}) rotate(-90)`} textAnchor="middle" fill={t.lblMuted} fontSize={6}>{section.unit}</text>
      {ticks.map(tk => (
        <g key={tk}>
          {tk > 0 && <line x1={pL} x2={pL + iW} y1={toY(tk)} y2={toY(tk)} stroke={t.panelBorder} strokeWidth={0.4} strokeDasharray="2,3" />}
          <text x={pL - 3} y={toY(tk) + 3} textAnchor="end" fill={t.lblMuted} fontSize={6}>{fmt(tk)}</text>
        </g>
      ))}
      <line x1={pL} x2={pL} y1={pT} y2={pT + iH} stroke={t.lblMuted} strokeWidth={0.4} />
      <line x1={pL} x2={pL + iW} y1={pT + iH} y2={pT + iH} stroke={t.lblMuted} strokeWidth={0.4} />
      {years.map((Y, yi) => {
        let base = 0;
        const x = barX(yi);
        return (
          <g key={Y}>
            {hoveredYi === yi && <rect x={pL + yi * slotW} y={pT} width={slotW} height={iH} fill={hlFill} />}
            {allFuels.map(f => {
              const v = num(fuels[f][yi]);
              if (v <= 0) return null;
              const h = (v / axisMax) * iH, y = toY(base + v);
              base += v;
              return <rect key={f} x={x} y={y} width={barW} height={Math.max(h, 0.3)} fill={matchFuelColor(f)} opacity={hoveredYi === yi ? 1 : 0.88} />;
            })}
            {Y % yrStep === 0 && <text x={x + barW / 2} y={pT + iH + 9} textAnchor="middle" fill={hoveredYi === yi ? t.lbl : t.lblMuted} fontSize={5.8}>{Y}</text>}
            <rect x={pL + yi * slotW} y={pT} width={slotW} height={iH} fill="transparent"
              onMouseMove={e => onHover(yi, e)} onMouseEnter={e => onHover(yi, e)} />
          </g>
        );
      })}
      {dPts && <polyline points={dPts} fill="none" stroke={t.lbl} strokeWidth={1.2} strokeDasharray="3,2" opacity={0.7} />}
    </svg>
  );
}

// Chart on the left, filter legend on the right (same layout as the country tabs)
function ChartRow({ chart, legend }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>{chart}</div>
      <div style={{ flexShrink: 0, width: 78 }}>{legend}</div>
    </div>
  );
}

function legendBtn(key, color, label, hidden, onToggle, t, dashed) {
  return (
    <button key={key} onClick={onToggle ? () => onToggle(key) : undefined} style={{
      display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
      padding: '2px 2px', width: '100%', textAlign: 'left',
      cursor: onToggle ? 'pointer' : 'default', opacity: hidden ? 0.4 : 1, fontFamily: 'inherit',
    }}>
      {dashed ? (
        <svg width="12" height="6" style={{ flexShrink: 0 }}>
          <line x1="0" y1="3" x2="12" y2="3" stroke={t.lbl} strokeWidth="1.2" strokeDasharray="3,2" opacity="0.75" />
        </svg>
      ) : (
        <span style={{ width: 7, height: 7, borderRadius: 1, flexShrink: 0, background: color, opacity: 0.9 }} />
      )}
      <span style={{
        fontSize: '0.5rem', color: hidden ? t.lblMuted : t.lbl,
        textDecoration: hidden && !dashed ? 'line-through' : 'none',
        lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</span>
    </button>
  );
}

function SideLegend({ t, onAll, onNone, children }) {
  const mini = {
    fontSize: '0.42rem', letterSpacing: '0.3px', textTransform: 'uppercase',
    padding: '1px 5px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${t.panelBorder}`, background: 'transparent', color: t.lblMuted,
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: '0.45rem', color: '#8A94A6', lineHeight: 1, marginBottom: 1, userSelect: 'none' }}>click to filter</span>
      {(onAll || onNone) && (
        <div style={{ display: 'flex', gap: 3, marginBottom: 2 }}>
          <button onClick={onAll} style={mini}>All</button>
          <button onClick={onNone} style={mini}>None</button>
        </div>
      )}
      {children}
    </div>
  );
}

const secStyle = t => ({
  fontSize: '0.5rem', letterSpacing: '2px', fontWeight: 700,
  color: t.lblMuted, textTransform: 'uppercase', marginBottom: 7, display: 'block',
});
const tipRow = (t, color, label, val) => (
  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
    {color && <span style={{ width: 6, height: 6, borderRadius: 1, background: color, flexShrink: 0 }} />}
    <span style={{ fontSize: '0.52rem', color: t.lblMuted, flex: 1, whiteSpace: 'nowrap' }}>{label}</span>
    <span style={{ fontSize: '0.55rem', color: t.lbl, marginLeft: 6 }}>{fmt(val)}</span>
  </div>
);

// ── Main ──────────────────────────────────────────────────────────────────────
export default function RegionSupplyTrade({ region, theme }) {
  const t = getT(theme);
  const [supplies, setSupplies] = useState(null);
  const [tradeByIso, setTradeByIso] = useState(null);
  const [view, setView] = useState('generation');
  const [hiddenFuels, setHiddenFuels] = useState(new Set());
  const [hiddenCountries, setHiddenCountries] = useState(new Set());

  const toggleFuel = (f) => setHiddenFuels(p => { const n = new Set(p); n.has(f) ? n.delete(f) : n.add(f); return n; });
  const toggleCountry = (c) => setHiddenCountries(p => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n; });

  useEffect(() => {
    if (!region) return;
    setSupplies(null); setTradeByIso(null);
    let cancelled = false;
    const members = region.countries.map(c => ({ iso: c.iso, name: c.name }));
    Promise.all(members.map(({ iso }) =>
      Promise.all([
        fetch(dataPath(`supply/${iso}.json`)).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch(dataPath(`trade/${iso}.json`)).then(r => (r.ok ? r.json() : null)).catch(() => null),
      ]),
    )).then(results => {
      if (cancelled) return;
      const sup = [], trd = {};
      results.forEach(([s, tr], i) => { if (s) sup.push(s); trd[members[i].iso] = tr; });
      setSupplies(sup); setTradeByIso(trd);
    });
    return () => { cancelled = true; };
  }, [region]);

  if (!supplies || !tradeByIso) {
    return <p style={{ fontSize: '0.7rem', color: t.muted, fontStyle: 'italic' }}>Loading…</p>;
  }

  const members = region.countries.map(c => ({ iso: c.iso, name: c.name }));
  const memberCount = members.length;
  const supplySec = aggregateSupply(supplies, view);
  const net = aggregateNetTrade(tradeByIso, members);

  // ── exports (match the charts above) ──────────────────────────────────────
  const slug = (region.id || region.name || 'region').toString().toLowerCase().replace(/\s+/g, '_');
  const exportSupply = (key) => {
    const sec = aggregateSupply(supplies, key);
    if (!sec) return;
    const fuels = Object.keys(sec.fuels);
    const header = ['year', ...fuels.map(f => f.replace(/,/g, ' ')), ...(sec.demand ? ['demand'] : [])].join(',');
    const rows = sec.years.map((y, i) =>
      [y, ...fuels.map(f => num(sec.fuels[f][i]).toFixed(1)), ...(sec.demand ? [num(sec.demand[i]).toFixed(1)] : [])].join(','));
    downloadBlob([header, ...rows].join('\n'), `region_${slug}_${key}_${sec.unit.toLowerCase()}.csv`);
  };
  const exportNetTrade = () => {
    if (!net) return;
    const isos = net.rows.map(r => r.iso);
    const header = ['year', ...isos.map(i => `${i}_net_gwh`), 'region_net_gwh'].join(',');
    const rows = net.years.map(Y => {
      const vals = net.rows.map(r => num(r.net[Y]).toFixed(1));
      const tot = net.rows.reduce((s, r) => s + num(r.net[Y]), 0);
      return [Y, ...vals, tot.toFixed(1)].join(',');
    });
    downloadBlob([header, ...rows].join('\n'), `region_${slug}_net_trade_gwh.csv`);
  };
  const dlBtn = {
    fontSize: '0.52rem', letterSpacing: '0.5px', padding: '4px 9px', borderRadius: 3,
    cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${t.panelBorder}`,
    backgroundColor: 'transparent', color: t.lblMuted,
  };

  const toggleBtn = (v, lbl) => (
    <button key={v} onClick={() => { setView(v); setHiddenFuels(new Set()); }} style={{
      fontSize: '0.47rem', letterSpacing: '0.5px', textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
      border: `1px solid ${view === v ? 'rgba(74,143,204,0.6)' : t.panelBorder}`,
      backgroundColor: view === v ? 'rgba(74,143,204,0.1)' : 'transparent',
      color: view === v ? t.lbl : t.lblMuted,
    }}>{lbl}</button>
  );

  // supply tooltip
  const supplyTip = supplySec ? (yi) => {
    const rows = Object.keys(supplySec.fuels)
      .map(f => ({ f, v: num(supplySec.fuels[f][yi]) })).filter(r => r.v > 0 && !hiddenFuels.has(r.f))
      .sort((a, b) => b.v - a.v);
    if (!rows.length) return null;
    const total = rows.reduce((s, r) => s + r.v, 0);
    const dem = supplySec.demand?.[yi];
    return (
      <>
        <div style={{ fontWeight: 700, fontSize: '0.6rem', color: t.lbl, marginBottom: 3 }}>
          {supplySec.years[yi]}<span style={{ fontWeight: 400, color: t.lblMuted, marginLeft: 5 }}>{fmt(total)} {supplySec.unit}</span>
        </div>
        {rows.map(r => tipRow(t, matchFuelColor(r.f), r.f, r.v))}
        {dem != null && tipRow(t, t.lbl, 'Demand', dem)}
      </>
    );
  } : () => null;

  // trade tooltip
  const tradeTip = net ? (yi) => {
    const Y = net.years[yi];
    const imp = net.rows.filter(r => !hiddenCountries.has(r.iso) && num(r.net[Y]) > 0).sort((a, b) => b.net[Y] - a.net[Y]);
    const exp = net.rows.filter(r => !hiddenCountries.has(r.iso) && num(r.net[Y]) < 0).sort((a, b) => a.net[Y] - b.net[Y]);
    if (!imp.length && !exp.length) return null;
    return (
      <>
        <div style={{ fontWeight: 700, fontSize: '0.6rem', color: t.lbl, marginBottom: 3 }}>{Y}</div>
        {imp.length > 0 && <div style={{ fontSize: '0.48rem', color: t.lblMuted, fontWeight: 600, margin: '2px 0 1px' }}>Net importers</div>}
        {imp.map(r => tipRow(t, r.color, r.iso, r.net[Y]))}
        {exp.length > 0 && <div style={{ fontSize: '0.48rem', color: t.lblMuted, fontWeight: 600, margin: '3px 0 1px' }}>Net exporters</div>}
        {exp.map(r => tipRow(t, r.color, r.iso, r.net[Y]))}
      </>
    );
  } : () => null;

  return (
    <div>
      {/* ── Generation / Capacity by fuel (top) ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {toggleBtn('generation', 'Generation')}
          {toggleBtn('capacity', 'Capacity')}
        </div>
        {supplySec && supplySec.years.length ? (
          <>
            <ChartRow
              chart={<HoverChart t={t} tooltip={supplyTip}
                render={(hy, oh) => <FuelChart section={supplySec} hidden={hiddenFuels} hoveredYi={hy} onHover={oh} t={t} />} />}
              legend={
                <SideLegend t={t}
                  onAll={() => setHiddenFuels(new Set())}
                  onNone={() => setHiddenFuels(new Set(Object.keys(supplySec.fuels)))}>
                  {Object.keys(supplySec.fuels).map(f => legendBtn(f, matchFuelColor(f), f, hiddenFuels.has(f), toggleFuel, t))}
                  {supplySec.demand && legendBtn('__demand__', null, 'Demand', false, null, t, true)}
                </SideLegend>
              }
            />
            <p style={{ fontSize: '0.5rem', color: t.lblMuted, fontStyle: 'italic', marginTop: 6, lineHeight: 1.5 }}>
              Common years {supplySec.window[0]}–{supplySec.window[1]} · {supplySec.nMembers}/{memberCount} countries with data
              {supplySec.demand ? ' · dashed line = electricity demand' : ''}. Window kept identical for all members to avoid coverage jumps.
            </p>
            <ChartCaption sources={supplySec.sources} t={t} />
          </>
        ) : (
          <p style={{ fontSize: '0.7rem', color: t.lblMuted, fontStyle: 'italic' }}>
            {supplySec ? 'Not enough overlapping years across members for a comparable series.' : `No ${view} data available.`}
          </p>
        )}
      </div>

      {/* ── Cross-border trade: net by country (below) ── */}
      <div style={{ borderTop: `1px solid ${t.panelBorder}`, paddingTop: 14 }}>
        <span style={secStyle(t)}>Cross-border Trade · Net Position by Country</span>
        {net && net.years.length ? (
          <>
            <ChartRow
              chart={<HoverChart t={t} tooltip={tradeTip}
                render={(hy, oh) => <NetTradeChart data={net} hidden={hiddenCountries} hoveredYi={hy} onHover={oh} t={t} />} />}
              legend={
                <SideLegend t={t}
                  onAll={() => setHiddenCountries(new Set())}
                  onNone={() => setHiddenCountries(new Set(net.rows.map(r => r.iso)))}>
                  {net.rows.map(r => legendBtn(r.iso, r.color, r.iso, hiddenCountries.has(r.iso), toggleCountry, t))}
                </SideLegend>
              }
            />
            <p style={{ fontSize: '0.5rem', color: t.lblMuted, fontStyle: 'italic', marginTop: 6, lineHeight: 1.5 }}>
              Net imports (imports − exports) per member. Above zero = net importer, below = net exporter.
              Common years {net.window[0]}–{net.window[1]} · {net.nMembers}/{memberCount} countries with data (window kept identical for all to avoid jumps).
            </p>
            <ChartCaption sources={net.sources} t={t} extra={missingNote(net)} />
          </>
        ) : (
          <p style={{ fontSize: '0.7rem', color: t.lblMuted, fontStyle: 'italic' }}>
            {net ? 'Not enough overlapping years across members for a comparable series.' : 'No trade data available for this region.'}
          </p>
        )}
      </div>

      {/* ── Export the data behind these charts ── */}
      {(supplySec || net) && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${t.panelBorder}`, paddingTop: 12 }}>
          <span style={secStyle(t)}>Export Data</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {aggregateSupply(supplies, 'generation') && <button style={dlBtn} onClick={() => exportSupply('generation')}>Generation CSV</button>}
            {aggregateSupply(supplies, 'capacity') && <button style={dlBtn} onClick={() => exportSupply('capacity')}>Capacity CSV</button>}
            {net && <button style={dlBtn} onClick={exportNetTrade}>Net trade CSV</button>}
          </div>
        </div>
      )}
    </div>
  );
}
