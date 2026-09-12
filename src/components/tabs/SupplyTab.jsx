import { dataPath } from '../../utils/paths';
import { useState, useEffect, useRef } from 'react';
import { FUEL_COLORS, getT } from '../../constants';
import ChartCaption from '../ChartCaption';
import { downloadBlob } from './chartHelpers';

// ── Chart palette (blue-teal-amber) ──────────────────────────────────────────
const P = {
  navyDark:  '#0D2B45',
  navyMid:   '#1A4B72',
  blue:      '#2478B4',
  blueMid:   '#3A98C8',
  blueLight: '#7EC8E0',
  icePale:   '#ACD8E8',
  tealDark:  '#0A5C50',
  teal:      '#0E8070',
  tealLight: '#2AADA0',
  amber:     '#E8B820',
  amberDark: '#C09010',
  grey:      '#7A8898',
};

function matchFuelColor(name) {
  const n = name.toLowerCase();
  if (n.includes('coal'))                                                   return FUEL_COLORS.coal;
  if (n.includes('gas'))                                                    return FUEL_COLORS.gas;
  if (n.includes('hydro') && (n.includes('ror') || n.includes('run')))     return '#1ABDE0';
  if (n.includes('hydro'))                                                  return FUEL_COLORS.hydro;
  if (n.includes('solar'))                                                  return FUEL_COLORS.solar;
  if (n.includes('geothermal'))                                             return FUEL_COLORS.geothermal;
  if (n.includes('wind'))                                                   return FUEL_COLORS.wind;
  if (n.includes('nuclear'))                                                return FUEL_COLORS.nuclear;
  if (n.includes('oil'))                                                    return FUEL_COLORS.oil;
  if (n.includes('biomass') || n.includes('bioenergy') || n.includes('wood')) return FUEL_COLORS.biomass;
  if (n.includes('waste') || n.includes('other') || n.includes('thermal')) return FUEL_COLORS.waste;
  return '#aaa';
}

// ── Partner colors ───────────────────────────────────────────────────────────
const PARTNER_COLORS = {
  'russia':       P.navyDark,
  'russia/ussr':  P.navyDark,
  'turkey':       P.amber,
  'turkiye':      P.amber,
  'azerbaijan':   P.blueMid,
  'armenia':      P.teal,
  'georgia':      P.blue,
  'bulgaria':     P.navyMid,
  'greece':       P.blueLight,
  'iran':         P.tealDark,
  'iraq':         P.amberDark,
  'syria':        P.grey,
  'turkmenistan': P.tealLight,
};

// Curated palette — blues, teals, slates, with amber accents.
// 30 entries so charts with many partners (e.g. UZB = 28) never repeat.
const _PALETTE = [
  '#2478B4','#7EC8E0','#1A4B72','#2AADA0','#3A98C8',
  '#ACD8E8','#0E8070','#4E79A7','#3CBFB0','#1E6DB8',
  '#88BDD8','#0A5C50','#5A9EC8','#6ACAD8','#0D5C8A',
  '#4ABCB0','#8AAEC0','#1A9080','#3A6878','#5888A0',
  '#4A8098','#2A5068','#6898B0','#0B7068','#7A9AB0',
  '#E8B820','#C09010','#D4A030','#7A8898','#A8986C',
];

// Build a per-chart color map guaranteeing all partners get distinct colors.
// Known partners get their fixed color; remaining partners pull from the
// curated palette in order (30 slots — no realistic chart will exceed this).
function buildPartnerColorMap(partners) {
  const colorMap = {};
  for (const p of partners) {
    const fixed = PARTNER_COLORS[p.toLowerCase()];
    if (fixed) colorMap[p] = fixed;
  }
  let i = 0;
  for (const p of partners) {
    if (!colorMap[p]) {
      colorMap[p] = _PALETTE[i % _PALETTE.length];
      i++;
    }
  }
  return colorMap;
}

// Source attribution now lives in ../ChartCaption so the region pages can use
// the same wording and reliability vocabulary.

// ── Shared helpers ───────────────────────────────────────────────────────────
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

const fmt = v =>
  v == null ? '—'
  : v >= 1e6  ? `${(v / 1e6).toFixed(1)}M`
  : v >= 1000 ? `${(v / 1000).toFixed(0)}k`
  : v.toFixed(1);

// ── Supply stacked bar chart ─────────────────────────────────────────────────
function StackedBarChart({ section, demandKey, hiddenFuels, hoveredYi, onColHover, t }) {
  const W = 300, H = 185, pL = 40, pR = 6, pT = 8, pB = 28;
  const iW = W - pL - pR, iH = H - pT - pB;

  const { years, fuels, unit } = section;
  const demand   = section[demandKey] || [];
  const allFuels = Object.keys(fuels);
  const visFuels = allFuels.filter(f => !hiddenFuels.has(f));

  const totals     = years.map((_, yi) => visFuels.reduce((s, f) => s + (fuels[f][yi] ?? 0), 0));
  const demandVals = demand.filter(v => v != null);
  const maxVal     = Math.max(...totals, demandVals.length ? Math.max(...demandVals) : 0, 1);

  const ticks   = niceTicks(maxVal);
  const axisMax = ticks[ticks.length - 1] || 1;
  const toY     = v => pT + iH - (v / axisMax) * iH;
  const slotW   = iW / years.length;
  const barW    = Math.max(slotW * 0.76, 1.5);
  const barX    = i => pL + i * slotW + (slotW - barW) / 2;

  const dPts = demand
    .map((v, i) => v != null ? `${(barX(i) + barW / 2).toFixed(1)},${toY(v).toFixed(1)}` : null)
    .filter(Boolean).join(' ');

  const yrStep = years.length > 15 ? 5 : years.length > 8 ? 2 : 1;
  const hlFill = t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <text transform={`translate(8,${pT + iH / 2}) rotate(-90)`}
        textAnchor="middle" fill={t.lblMuted} fontSize={6}>{unit}</text>
      {ticks.map(tick => (
        <g key={tick}>
          {tick > 0 && <line x1={pL} x2={pL + iW} y1={toY(tick)} y2={toY(tick)}
            stroke={t.panelBorder} strokeWidth={0.4} strokeDasharray="2,3" />}
          <text x={pL - 3} y={toY(tick) + 3} textAnchor="end" fill={t.lblMuted} fontSize={6.5}>{fmt(tick)}</text>
        </g>
      ))}
      <line x1={pL} x2={pL} y1={pT} y2={pT + iH} stroke={t.lblMuted} strokeWidth={0.4} />
      <line x1={pL} x2={pL + iW} y1={pT + iH} y2={pT + iH} stroke={t.lblMuted} strokeWidth={0.4} />
      {years.map((yr, yi) => {
        let base = 0;
        const x = barX(yi);
        return (
          <g key={yr}>
            {hoveredYi === yi && <rect x={pL + yi * slotW} y={pT} width={slotW} height={iH} fill={hlFill} />}
            {allFuels.map(f => {
              if (hiddenFuels.has(f)) return null;
              const v = fuels[f][yi] ?? 0;
              if (v <= 0) return null;
              const h = (v / axisMax) * iH;
              const y = toY(base + v);
              base += v;
              return <rect key={f} x={x} y={y} width={barW} height={Math.max(h, 0.3)}
                fill={matchFuelColor(f)} opacity={hoveredYi === yi ? 1 : 0.88} />;
            })}
            {yr % yrStep === 0 && (
              <text x={x + barW / 2} y={pT + iH + 9} textAnchor="middle"
                fill={hoveredYi === yi ? t.lbl : t.lblMuted} fontSize={5.8}>{yr}</text>
            )}
            <rect x={pL + yi * slotW} y={pT} width={slotW} height={iH}
              fill="transparent" style={{ cursor: 'default' }}
              onMouseEnter={e => onColHover(yi, e)}
              onMouseLeave={() => onColHover(null, null)} />
          </g>
        );
      })}
      {dPts && <polyline points={dPts} fill="none" stroke={t.lbl}
        strokeWidth={1.2} strokeDasharray="3,2" opacity={0.7}
        strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
}

// ── Trade diverging bar chart ────────────────────────────────────────────────
function TradeChart({ data, hiddenPartners, hoveredYi, onColHover, t, colorMap }) {
  const W = 300, H = 185, pL = 40, pR = 6, pT = 8, pB = 28;
  const iW = W - pL - pR, iH = H - pT - pB;

  const { years } = data;
  const imp = data.imports || {};
  const exp = data.exports || {};
  const impPartners = Object.keys(imp);
  const expPartners = Object.keys(exp);
  const visImpP = impPartners.filter(p => !hiddenPartners.has(p));
  const visExpP = expPartners.filter(p => !hiddenPartners.has(p));

  const maxImp = Math.max(...years.map((_, yi) => visImpP.reduce((s, p) => s + (imp[p][yi] ?? 0), 0)), 1);
  const maxExp = Math.max(...years.map((_, yi) => visExpP.reduce((s, p) => s + (exp[p][yi] ?? 0), 0)), 1);

  const impTicks = niceTicks(maxImp);
  const expTicks = niceTicks(maxExp);
  const axisImp  = impTicks[impTicks.length - 1] || 1;
  const axisExp  = expTicks[expTicks.length - 1] || 1;

  const importH = iH * axisImp / (axisImp + axisExp);
  const exportH = iH - importH;
  const zeroY   = pT + importH;

  const toY = v => v >= 0
    ? zeroY - (v / axisImp) * importH
    : zeroY + (-v / axisExp) * exportH;

  const slotW  = iW / years.length;
  const barW   = Math.max(slotW * 0.76, 1.5);
  const barX   = i => pL + i * slotW + (slotW - barW) / 2;
  const yrStep = years.length > 15 ? 5 : years.length > 8 ? 2 : 1;
  const hlFill = t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  const netPts = years.map((_, yi) => {
    const ti = visImpP.reduce((s, p) => s + (imp[p][yi] ?? 0), 0);
    const te = visExpP.reduce((s, p) => s + (exp[p][yi] ?? 0), 0);
    return `${(barX(yi) + barW / 2).toFixed(1)},${toY(ti - te).toFixed(1)}`;
  }).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <text transform={`translate(8,${pT + iH / 2}) rotate(-90)`}
        textAnchor="middle" fill={t.lblMuted} fontSize={6}>GWh</text>

      {/* import ticks */}
      {impTicks.slice(1).map(tick => (
        <g key={`i${tick}`}>
          <line x1={pL} x2={pL + iW} y1={toY(tick)} y2={toY(tick)}
            stroke={t.panelBorder} strokeWidth={0.4} strokeDasharray="2,3" />
          <text x={pL - 3} y={toY(tick) + 3} textAnchor="end" fill={t.lblMuted} fontSize={6}>{fmt(tick)}</text>
        </g>
      ))}

      {/* export ticks */}
      {expTicks.slice(1).map(tick => (
        <g key={`e${tick}`}>
          <line x1={pL} x2={pL + iW} y1={toY(-tick)} y2={toY(-tick)}
            stroke={t.panelBorder} strokeWidth={0.4} strokeDasharray="2,3" />
          <text x={pL - 3} y={toY(-tick) + 3} textAnchor="end" fill={t.lblMuted} fontSize={6}>−{fmt(tick)}</text>
        </g>
      ))}

      {/* zero line */}
      <line x1={pL} x2={pL + iW} y1={zeroY} y2={zeroY} stroke={t.lblMuted} strokeWidth={0.7} />
      <text x={pL - 3} y={zeroY + 3} textAnchor="end" fill={t.lblMuted} fontSize={6}>0</text>

      {/* axes */}
      <line x1={pL} x2={pL} y1={pT} y2={pT + iH} stroke={t.lblMuted} strokeWidth={0.4} />
      <line x1={pL} x2={pL + iW} y1={pT + iH} y2={pT + iH} stroke={t.lblMuted} strokeWidth={0.4} />

      {/* columns */}
      {years.map((yr, yi) => {
        const x = barX(yi);
        let impBase = 0, expBase = 0;
        return (
          <g key={yr}>
            {hoveredYi === yi && <rect x={pL + yi * slotW} y={pT} width={slotW} height={iH} fill={hlFill} />}

            {impPartners.map(p => {
              if (hiddenPartners.has(p)) return null;
              const v = imp[p][yi] ?? 0;
              if (v <= 0) return null;
              const h = (v / axisImp) * importH;
              const y = zeroY - ((impBase + v) / axisImp) * importH;
              impBase += v;
              return <rect key={`i${p}`} x={x} y={y} width={barW} height={Math.max(h, 0.3)}
                fill={colorMap[p] ?? '#aaa'} opacity={hoveredYi === yi ? 1 : 0.88} />;
            })}

            {expPartners.map(p => {
              if (hiddenPartners.has(p)) return null;
              const v = exp[p][yi] ?? 0;
              if (v <= 0) return null;
              const h = (v / axisExp) * exportH;
              const y = zeroY + (expBase / axisExp) * exportH;
              expBase += v;
              return <rect key={`e${p}`} x={x} y={y} width={barW} height={Math.max(h, 0.3)}
                fill={colorMap[p] ?? '#aaa'} opacity={hoveredYi === yi ? 1 : 0.88} />;
            })}

            {yr % yrStep === 0 && (
              <text x={x + barW / 2} y={pT + iH + 9} textAnchor="middle"
                fill={hoveredYi === yi ? t.lbl : t.lblMuted} fontSize={5.8}>{yr}</text>
            )}

            <rect x={pL + yi * slotW} y={pT} width={slotW} height={iH}
              fill="transparent" style={{ cursor: 'default' }}
              onMouseEnter={e => onColHover(yi, e)}
              onMouseLeave={() => onColHover(null, null)} />
          </g>
        );
      })}

      {/* net balance line */}
      <polyline points={netPts} fill="none" stroke={t.lbl}
        strokeWidth={1.3} strokeDasharray="3,2" opacity={0.75}
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Reusable chart+legend wrapper ────────────────────────────────────────────
function ChartWithLegend({ chartRef, chart, legendItems, tooltip }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div ref={chartRef} style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        {chart}
        {tooltip}
      </div>
      <div style={{ flexShrink: 0, width: 72, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 10 }}>
        <span style={{ fontSize: '0.5rem', color: '#8A94A6', userSelect: 'none', lineHeight: 1, marginBottom: 1 }}>click to filter</span>
        {legendItems}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function SupplyTab({ iso, theme }) {
  const t = getT(theme);

  // supply state
  const [supplyData,    setSupplyData]    = useState(null);
  const [supplyLoading, setSupplyLoading] = useState(true);
  const [view,          setView]          = useState('generation');
  const [hiddenFuels,   setHiddenFuels]   = useState(new Set());
  const [supplyTip,     setSupplyTip]     = useState(null);
  const supplyRef = useRef(null);

  // trade state
  const [tradeData,       setTradeData]       = useState(null);
  const [tradeLoading,    setTradeLoading]     = useState(true);
  const [hiddenPartners,  setHiddenPartners]   = useState(new Set());
  const [tradeTip,        setTradeTip]         = useState(null);
  const tradeRef = useRef(null);

  useEffect(() => {
    if (!iso) return;
    setSupplyLoading(true); setSupplyData(null);
    setTradeLoading(true);  setTradeData(null);
    setHiddenFuels(new Set()); setHiddenPartners(new Set());

    fetch(dataPath(`supply/${iso}.json`))
      .then(r => { if (!r.ok) throw new Error('404'); return r.json(); })
      .then(d  => { setSupplyData(d); setSupplyLoading(false); })
      .catch(() => setSupplyLoading(false));

    fetch(dataPath(`trade/${iso}.json`))
      .then(r => { if (!r.ok) throw new Error('404'); return r.json(); })
      .then(d  => { setTradeData(d); setTradeLoading(false); })
      .catch(() => setTradeLoading(false));
  }, [iso]);

  const toggleFuel    = f => setHiddenFuels(prev    => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n; });
  const togglePartner = p => setHiddenPartners(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const makeHoverHandler = (setTip, ref) => (yi, e) => {
    if (yi === null) { setTip(null); return; }
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setTip({ yi, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const renderLegendBtn = (key, color, label, hidden, onToggle, dashed = false) => (
    <button key={key} onClick={() => onToggle(key)} className="legend-btn" style={{
      display: 'flex', alignItems: 'center', gap: 4,
      background: 'none', border: 'none', padding: '2px 3px',
      cursor: 'pointer', opacity: hidden ? 0.35 : 1, textAlign: 'left', width: '100%',
    }}>
      {dashed ? (
        <svg width="12" height="7" style={{ flexShrink: 0 }}>
          <line x1={0} y1={3.5} x2={12} y2={3.5} stroke={t.lbl} strokeWidth={1.2} strokeDasharray="3,2" opacity={0.75} />
        </svg>
      ) : (
        <div style={{ width: 7, height: 7, borderRadius: 1, flexShrink: 0, backgroundColor: color, opacity: 0.88, position: 'relative' }}>
          {hidden && (
            <svg style={{ position: 'absolute', top: -1, left: -1 }} width={9} height={9}>
              <line x1={1} y1={8} x2={8} y2={1} stroke={t.lbl} strokeWidth={1.2} />
            </svg>
          )}
        </div>
      )}
      <span style={{ fontSize: '0.54rem', color: hidden ? t.lblMuted : t.lbl, textDecoration: hidden && !dashed ? 'line-through' : 'none', lineHeight: 1.2 }}>{label}</span>
    </button>
  );

  const renderTooltip = (tip, rows, unit, extra) => {
    if (!tip) return null;
    const TW = 124;
    const left = tip.x > 140 ? tip.x - TW - 6 : tip.x + 8;
    const top  = Math.max(tip.y - 30, 0);
    return (
      <div style={{
        position: 'absolute', left, top, width: TW, pointerEvents: 'none', zIndex: 10,
        backgroundColor: t.panel, border: `1px solid ${t.panelBorder}`,
        borderRadius: 4, padding: '6px 8px', boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      }}>
        {rows}
        {extra}
      </div>
    );
  };

  // ── Supply section ──────────────────────────────────────────────────────────
  const supplySection = (() => {
    if (supplyLoading) return <p style={{ fontSize: '0.7rem', color: t.lblMuted, marginTop: 8 }}>Loading…</p>;
    if (!supplyData)   return <p style={{ fontSize: '0.7rem', color: t.lblMuted, marginTop: 8, fontStyle: 'italic' }}>No supply data available.</p>;

    const section     = view === 'generation' ? supplyData.generation : supplyData.capacity;
    const demandKey   = view === 'generation' ? 'demand' : 'peak_demand';
    const demandLabel = view === 'generation' ? 'Demand (grid)' : 'Peak demand';

    if (!section) return (
      <>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {[['generation', 'Generation'], ['capacity', 'Capacity']].map(([v, lbl]) => (
            <button key={v} onClick={() => { setView(v); setHiddenFuels(new Set()); setSupplyTip(null); }} style={{
              fontSize: '0.47rem', letterSpacing: '0.5px', textTransform: 'uppercase',
              padding: '3px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${view === v ? 'rgba(74,143,204,0.6)' : t.panelBorder}`,
              backgroundColor: view === v ? 'rgba(74,143,204,0.1)' : 'transparent',
              color: view === v ? t.lbl : t.lblMuted,
            }}>{lbl}</button>
          ))}
        </div>
        <p style={{ fontSize: '0.7rem', color: t.lblMuted, fontStyle: 'italic', marginTop: 8 }}>
          Capacity data not available for this country.
        </p>
      </>
    );

    const allFuels    = Object.keys(section.fuels);
    const hasDemand   = (section[demandKey] || []).some(v => v != null);

    const hoverHandler = makeHoverHandler(setSupplyTip, supplyRef);
    const tip = supplyTip;

    // tooltip content
    const tipContent = tip ? (() => {
      const yi = tip.yi;
      const yr = section.years[yi];
      const visFuels = allFuels.filter(f => !hiddenFuels.has(f));
      const rows = visFuels.map(f => ({ f, v: section.fuels[f][yi] ?? 0 })).filter(r => r.v > 0);
      const total = rows.reduce((s, r) => s + r.v, 0);
      const dVal  = (section[demandKey] || [])[yi];
      return { yr, rows, total, dVal };
    })() : null;

    return (
      <>
        {/* toggle */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {[['generation', 'Generation'], ['capacity', 'Capacity']].map(([v, lbl]) => (
            <button key={v} onClick={() => { setView(v); setHiddenFuels(new Set()); setSupplyTip(null); }} style={{
              fontSize: '0.47rem', letterSpacing: '0.5px', textTransform: 'uppercase',
              padding: '3px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${view === v ? 'rgba(74,143,204,0.6)' : t.panelBorder}`,
              backgroundColor: view === v ? 'rgba(74,143,204,0.1)' : 'transparent',
              color: view === v ? t.lbl : t.lblMuted,
            }}>{lbl}</button>
          ))}
        </div>

        <ChartWithLegend
          chartRef={supplyRef}
          chart={
            <StackedBarChart section={section} demandKey={demandKey} t={t}
              hiddenFuels={hiddenFuels} hoveredYi={tip?.yi ?? null} onColHover={hoverHandler} />
          }
          legendItems={<>
            {allFuels.map(f => renderLegendBtn(f, matchFuelColor(f), f, hiddenFuels.has(f), toggleFuel))}
            {hasDemand && renderLegendBtn('__demand__', null, demandLabel, false, () => {}, true)}
          </>}
          tooltip={renderTooltip(tip, tipContent && (
            <>
              <div style={{ fontWeight: 700, fontSize: '0.65rem', color: t.lbl, marginBottom: 4 }}>
                {tipContent.yr}
                <span style={{ fontWeight: 400, color: t.lblMuted, marginLeft: 6 }}>{fmt(tipContent.total)} {section.unit}</span>
              </div>
              {tipContent.rows.map(({ f, v }) => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 1, flexShrink: 0, backgroundColor: matchFuelColor(f) }} />
                  <span style={{ fontSize: '0.55rem', color: t.lblMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
                  <span style={{ fontSize: '0.58rem', color: t.lbl, flexShrink: 0 }}>{fmt(v)}</span>
                </div>
              ))}
            </>
          ), tipContent?.dVal != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${t.panelBorder}` }}>
              <svg width="10" height="6" style={{ flexShrink: 0 }}>
                <line x1={0} y1={3} x2={10} y2={3} stroke={t.lbl} strokeWidth={1.2} strokeDasharray="2,1.5" opacity={0.7} />
              </svg>
              <span style={{ fontSize: '0.55rem', color: t.lblMuted, flex: 1 }}>{demandLabel}</span>
              <span style={{ fontSize: '0.58rem', color: t.lbl, flexShrink: 0 }}>{fmt(tipContent.dVal)}</span>
            </div>
          ))}
        />

        <ChartCaption source={section.source} t={t} />
      </>
    );
  })();

  // ── Trade section ───────────────────────────────────────────────────────────
  const tradeSection = (() => {
    if (tradeLoading) return <p style={{ fontSize: '0.7rem', color: t.lblMuted }}>Loading…</p>;
    if (!tradeData)   return <p style={{ fontSize: '0.7rem', color: t.lblMuted, fontStyle: 'italic' }}>No cross-border trade data loaded yet for this country.</p>;

    // Explicit "no chart" states (isolated grids, jointly-reported zones, …)
    if (tradeData.status) {
      const badge = tradeData.status === 'none'   ? 'No interconnection'
                  : tradeData.status === 'merged' ? 'Reported jointly'
                  : 'Not available';
      return (
        <div style={{ fontSize: '0.62rem', lineHeight: 1.55, color: t.lblMuted }}>
          <span style={{
            display: 'inline-block', fontSize: '0.42rem', fontWeight: 700,
            letterSpacing: '0.5px', textTransform: 'uppercase', padding: '2px 6px',
            borderRadius: 3, marginBottom: 6,
            background: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: t.lblMuted,
          }}>{badge}</span>
          <p style={{ margin: 0 }}>{tradeData.note}</p>
          {tradeData.source && (
            <p style={{ margin: '5px 0 0', fontSize: '0.5rem', fontStyle: 'italic', opacity: 0.8 }}>
              Source: {tradeData.source}
            </p>
          )}
        </div>
      );
    }

    const imp = tradeData.imports || {};
    const exp = tradeData.exports || {};
    const allPartners = [...new Set([...Object.keys(imp), ...Object.keys(exp)])];
    const colorMap = buildPartnerColorMap(allPartners);

    const hoverHandler = makeHoverHandler(setTradeTip, tradeRef);
    const tip = tradeTip;

    const tipContent = tip ? (() => {
      const yi  = tip.yi;
      const yr  = tradeData.years[yi];
      const impRows = Object.keys(imp).filter(p => !hiddenPartners.has(p) && (imp[p][yi] ?? 0) > 0)
        .map(p => ({ p, v: imp[p][yi] ?? 0 }));
      const expRows = Object.keys(exp).filter(p => !hiddenPartners.has(p) && (exp[p][yi] ?? 0) > 0)
        .map(p => ({ p, v: exp[p][yi] ?? 0 }));
      const totalImp = impRows.reduce((s, r) => s + r.v, 0);
      const totalExp = expRows.reduce((s, r) => s + r.v, 0);
      return { yr, impRows, expRows, totalImp, totalExp, net: totalImp - totalExp };
    })() : null;

    const chart = (
      <ChartWithLegend
        chartRef={tradeRef}
        chart={
          <TradeChart data={tradeData} hiddenPartners={hiddenPartners}
            hoveredYi={tip?.yi ?? null} onColHover={hoverHandler} t={t} colorMap={colorMap} />
        }
        legendItems={<>
          {allPartners.map(p => renderLegendBtn(p, colorMap[p], p, hiddenPartners.has(p), togglePartner))}
          {renderLegendBtn('__net__', null, 'Net balance', false, () => {}, true)}
          <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px solid ${t.panelBorder}` }}>
            <span style={{ fontSize: '0.5rem', color: t.lblMuted, lineHeight: 1.3 }}>↑ imports{'\n'}↓ exports</span>
          </div>
        </>}
        tooltip={renderTooltip(tip, tipContent && (
          <>
            <div style={{ fontWeight: 700, fontSize: '0.65rem', color: t.lbl, marginBottom: 4 }}>
              {tipContent.yr}
              <span style={{ fontWeight: 400, color: parseFloat(tipContent.net) >= 0 ? '#4A9E6A' : '#C05050', marginLeft: 6, fontSize: '0.58rem' }}>
                {tipContent.net >= 0 ? '+' : ''}{fmt(tipContent.net)} net
              </span>
            </div>
            {tipContent.impRows.length > 0 && (
              <div style={{ fontSize: '0.52rem', color: t.lblMuted, marginBottom: 2, fontWeight: 600 }}>Imports</div>
            )}
            {tipContent.impRows.map(({ p, v }) => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: 1, flexShrink: 0, backgroundColor: colorMap[p] }} />
                <span style={{ fontSize: '0.55rem', color: t.lblMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</span>
                <span style={{ fontSize: '0.58rem', color: t.lbl, flexShrink: 0 }}>{fmt(v)}</span>
              </div>
            ))}
            {tipContent.expRows.length > 0 && (
              <div style={{ fontSize: '0.52rem', color: t.lblMuted, margin: '4px 0 2px', fontWeight: 600 }}>Exports</div>
            )}
            {tipContent.expRows.map(({ p, v }) => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: 1, flexShrink: 0, backgroundColor: colorMap[p] }} />
                <span style={{ fontSize: '0.55rem', color: t.lblMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</span>
                <span style={{ fontSize: '0.58rem', color: t.lbl, flexShrink: 0 }}>{fmt(v)}</span>
              </div>
            ))}
          </>
        ), null)}
      />
    );

    return (
      <>
        {chart}
        <ChartCaption source={tradeData.source} t={t} />
      </>
    );
  })();

  // ── Download helpers ─────────────────────────────────────────────────────────
  const handleDownloadSupply = () => {
    if (!supplyData) return;
    const gen = supplyData.generation;
    if (!gen) return;
    const fuels = Object.keys(gen.fuels);
    const header = ['year', ...fuels.map(f => `${f}_gwh`), 'demand_gwh'].join(',');
    const rows = gen.years.map((yr, i) => [
      yr,
      ...fuels.map(f => (gen.fuels[f]?.[i] ?? '').toString()),
      (gen.demand?.[i] ?? '').toString(),
    ].join(','));
    downloadBlob([header, ...rows].join('\n'), `supply_generation_${iso}.csv`, 'text/csv');
  };

  const handleDownloadTrade = () => {
    if (!tradeData) return;
    const { years, imports = {}, exports = {} } = tradeData;
    const impP = Object.keys(imports);
    const expP = Object.keys(exports);
    const allP = [...new Set([...impP, ...expP])];
    const header = ['year', ...allP.map(p => `imp_${p}_gwh`), ...allP.map(p => `exp_${p}_gwh`), 'net_gwh'].join(',');
    const rows = years.map((yr, i) => {
      const impVals = allP.map(p => (imports[p]?.[i] ?? 0));
      const expVals = allP.map(p => (exports[p]?.[i] ?? 0));
      const net = impVals.reduce((s, v) => s + v, 0) - expVals.reduce((s, v) => s + v, 0);
      return [yr, ...impVals, ...expVals, net.toFixed(1)].join(',');
    });
    downloadBlob([header, ...rows].join('\n'), `trade_flows_${iso}.csv`, 'text/csv');
  };

  const dlBtnStyle = {
    fontSize: '0.52rem', letterSpacing: '0.5px', padding: '4px 9px', borderRadius: 3,
    cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${t.panelBorder}`,
    backgroundColor: 'transparent', color: t.lblMuted,
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {supplySection}

      <div style={{ borderTop: `1px solid ${t.panelBorder}`, marginTop: 16, paddingTop: 12 }}>
        <span style={{ fontSize: '0.45rem', letterSpacing: '2px', fontWeight: 700, color: t.lblMuted, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
          Cross-border Flows
        </span>
        {tradeSection}
      </div>

      {(supplyData?.generation || tradeData) && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${t.panelBorder}`, paddingTop: 12 }}>
          <span style={{ fontSize: '0.47rem', letterSpacing: '2px', fontWeight: 700, color: t.lblMuted, textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>
            Export Data
          </span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {supplyData?.generation && (
              <button style={dlBtnStyle} onClick={handleDownloadSupply}>Generation CSV</button>
            )}
            {tradeData && (
              <button style={dlBtnStyle} onClick={handleDownloadTrade}>Trade flows CSV</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
