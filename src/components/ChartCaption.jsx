// ── Shared chart source attribution ──────────────────────────────────────────
// Every chart that shows numbers a reader might quote must say where they come
// from. Previously this lived inside SupplyTab, so the country pages were
// attributed but the region pages were not — a reader landing on a region chart
// had no way to know whether they were looking at metered flows or customs
// declarations. Extracted here so both use the same wording and the same
// reliability vocabulary.

// Reliability tiers:
//   high   — official statistics (national statistics, or the system operator's own)
//   medium — declared or modelled figures; right order of magnitude, not audited
//   low    — partial coverage; treat as indicative only
export function getSourceMeta(src) {
  if (!src) return { short: '—', rel: null, note: '' };
  const s = src.toLowerCase();
  // Grid-operator data, but some cross-border flows are under-counted and annual
  // totals miss generators (docs/TRADE_AUDIT.md, public/data/methodology.md).
  if (s.includes('entso-e'))                      return { short: 'ENTSO-E',          rel: 'low',    note: 'Metered grid-operator data; some cross-border flows are under-counted (audit in progress)' };
  if (s.includes('eapp'))                         return { short: 'EAPP Secretariat', rel: 'high',   note: 'Official annual interconnection statistics' };
  if (s.includes('teias') || s.includes('epias')) return { short: 'TEIAS/EPIAS',      rel: 'high',   note: 'Official Turkish TSO data' };
  // OWID's strings also name Ember, so they are matched first.
  if (s.includes('owid') || s.includes('our world in data')) return { short: 'OWID/Ember', rel: 'medium', note: 'Cross-validated estimates; small countries may be approximate' };
  if (s.includes('ember'))                        return { short: 'Ember',            rel: 'high',   note: 'National statistics compiled by Ember; small countries may be approximate' };
  if (s.includes('comtrade'))                     return { short: 'Comtrade HS 2716', rel: 'medium', note: 'Customs declarations, not metered flows — volumes are largely UN-estimated from declared values, and a year with no declaration reads as zero rather than as missing' };
  if (s.includes('wdi') || s.includes('world bank')) return { short: 'WB WDI',        rel: 'medium', note: 'Derived from per-capita electricity use × population' };
  if (s.includes('grid review') || s.includes('status review')) return { short: 'Grid review', rel: 'low', note: 'Desk review of national grid documentation; no bilateral time series' };
  // Unknown source: assume it is a named official/national source — show it
  // as-is with no reliability flag (don't claim "Estimated" unless we know it).
  const short = src.split('—')[0].split('(')[0].trim();
  return { short: short.length > 28 ? short.slice(0, 25) + '…' : short, rel: null, note: '' };
}

const _REL_STYLE = {
  high:   { color: '#1A9060', label: 'Official'  },
  medium: { color: '#B87820', label: 'Estimated' },
  low:    { color: '#B84040', label: 'Partial'   },
};

const _RANK = { high: 0, medium: 1, low: 2 };

// Worst reliability wins: a chart mixing metered ENTSO-E data with Comtrade
// customs declarations is only as trustworthy as its weakest input, so the
// badge must not advertise the best one.
function weakest(metas) {
  let worst = null;
  for (const m of metas) {
    if (!m.rel) continue;
    if (!worst || _RANK[m.rel] > _RANK[worst.rel]) worst = m;
  }
  return worst;
}

/**
 * Source caption for a chart.
 *
 * @param source   single source string (country-level charts)
 * @param sources  array of source strings (region charts aggregate members)
 * @param extra    optional caveat appended after the source notes
 */
export default function ChartCaption({ source, sources, extra, t }) {
  const list = (sources?.length ? sources : [source]).filter(Boolean);
  if (!list.length && !extra) return null;

  const uniq = [...new Set(list)];
  const metas = uniq.map(getSourceMeta);
  const flagMeta = weakest(metas);
  const flag = (flagMeta && flagMeta.rel !== 'high') ? _REL_STYLE[flagMeta.rel] : null;

  // One source → print it in full, as the country pages always have.
  // Several → print the short names, so the caption stays one line.
  const label = uniq.length === 1
    ? uniq[0]
    : metas.map(m => m.short).filter((v, i, a) => a.indexOf(v) === i).join(' · ');

  // Show every distinct caveat, not just the worst one — a mixed chart can be
  // "Estimated" for one reason in Europe and another in West Africa.
  const notes = [...new Set(metas.filter(m => m.rel && m.rel !== 'high' && m.note).map(m => m.note))];

  return (
    <p style={{ margin: '6px 0 0', fontSize: '0.5rem', color: t.lblMuted, lineHeight: 1.45 }}>
      <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.44rem', opacity: 0.8 }}>Source </span>
      <span style={{ fontStyle: 'italic' }}>{label || 'Not specified'}</span>
      {flag && (
        <span title={notes.join('. ')} style={{
          marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 2,
          fontSize: '0.4rem', padding: '1px 5px', borderRadius: 3,
          background: `${flag.color}18`, color: flag.color, fontWeight: 700, letterSpacing: '0.3px',
        }}>
          <span style={{ fontSize: '0.46rem', lineHeight: 1 }}>●</span>{flag.label}
        </span>
      )}
      {(notes.length > 0 || extra) && (
        <span style={{ display: 'block', marginTop: 2, fontStyle: 'italic', opacity: 0.85, fontSize: '0.46rem' }}>
          {notes.join('. ')}{notes.length ? '. ' : ''}{extra}
        </span>
      )}
    </p>
  );
}
