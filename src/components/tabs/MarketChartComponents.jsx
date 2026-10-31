// Shared chart components for any tab charting an EPIAS-shaped time series
// block — extracted from MarketTab (Prices/Quantity) so LoadTab's Real-time
// consumption sub-tab can reuse the exact same KPI cards, bar+whisker/line
// chart and hover tooltip instead of duplicating them. Kept in their own
// file, separate from chartHelpers.jsx's plain functions, so a file mixing
// component + non-component exports doesn't break Vite's Fast Refresh (see
// the note at the top of chartHelpers.jsx).
import { niceTicks, fmtValue, WHISKER_COLOR } from './chartHelpers';

export function KpiCard({ label, value, unit, sub, t }) {
  return (
    <div style={{ padding: '8px 10px', borderRadius: 5, backgroundColor: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
      <div style={{ fontSize: '0.5rem', color: t.lblMuted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.08rem', fontWeight: 700, color: t.lbl, lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: '0.56rem', fontWeight: 400, color: t.lblMuted, marginLeft: 3 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: '0.54rem', color: t.lblMuted, marginTop: 4 }}>{sub || ' '}</div>
    </div>
  );
}

// ── Chart: shaded min-max band + mean line (or a plain line for Day) ─────────
export function SeriesChart({ mode, points, color, unit, t, hoveredI, onHover, xAxisLabel }) {
  const W = 300, H = 168, pL = 42, pR = 8, pT = 10, pB = 30;
  const iW = W - pL - pR, iH = H - pT - pB;
  const n = points.length;
  if (!n) return null;

  const vals = mode === 'band'
    ? points.flatMap(p => [p.mean, p.min, p.max]).filter(v => v != null)
    : points.map(p => p.value).filter(v => v != null);
  const maxVal = Math.max(...vals, 1);
  const minVal = Math.min(...vals, 0); // 0 for an all-positive series — bpm_net is the only one that can go lower
  const ticks   = niceTicks(minVal, maxVal);
  const axisMin = ticks[0];
  const axisMax = ticks[ticks.length - 1] || 1;
  const axisSpan = (axisMax - axisMin) || 1;
  // Reduces to the old pT + iH - (v / axisMax) * iH when axisMin is 0.
  const toY = v => pT + iH - ((v - axisMin) / axisSpan) * iH;
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
          {/* Zero gets its own more visible line below instead of a dashed gridline */}
          {tick !== 0 && <line x1={pL} x2={pL + iW} y1={toY(tick)} y2={toY(tick)} stroke={t.panelBorder} strokeWidth={0.4} strokeDasharray="2,3" />}
          <text x={pL - 3} y={toY(tick) + 3} textAnchor="end" fill={t.lblMuted} fontSize={6.5}>{fmtValue(tick)}</text>
        </g>
      ))}
      <line x1={pL} x2={pL} y1={pT} y2={pT + iH} stroke={t.lblMuted} strokeWidth={0.4} />
      <line x1={pL} x2={pL + iW} y1={pT + iH} y2={pT + iH} stroke={t.lblMuted} strokeWidth={0.4} />
      {/* Explicit zero baseline — only meaningfully different from the bottom
          border once the axis actually dips below zero (bpm_net). */}
      {axisMin < 0 && <line x1={pL} x2={pL + iW} y1={toY(0)} y2={toY(0)} stroke={t.lblMuted} strokeWidth={0.6} />}

      {hoveredI != null && <rect x={pL + hoveredI * slotW} y={pT} width={slotW} height={iH} fill={hlFill} />}

      {mode === 'band' && points.map((p, i) => {
        if (p.mean == null) return null;
        // Bars grow from the zero line, not always from the plot's bottom
        // edge — for an all-positive series toY(0) IS the bottom edge, so
        // this is the same bar as before; a negative mean grows downward.
        const y0 = toY(0), y1 = toY(p.mean);
        return (
          <rect key={`bar${i}`} x={barX(i)} y={Math.min(y0, y1)} width={barW}
            height={Math.max(Math.abs(y1 - y0), 0.5)} fill={color} opacity={hoveredI === i ? 1 : 0.85} />
        );
      })}
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

// ── Hover tooltip for SeriesChart — Date/Hour/value for Hourly points, or
// Date/Mean/Min/Max for every other granularity's bars. valueLabel names the
// single-value row for Hourly (e.g. "Price" or "Consumption").
export function ChartTooltip({ tip, points, unit, t, valueLabel = 'Value' }) {
  if (!tip) return null;
  const p = points[tip.i];
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
          {row(valueLabel, fmtValue(p.value))}
        </>
      ) : (
        <>
          {row('Mean', fmtValue(p.mean))}
          {row('Min', fmtValue(p.min), true)}
          {row('Max', fmtValue(p.max), true)}
        </>
      )}
    </div>
  );
}
