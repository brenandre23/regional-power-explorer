import { dataPath } from '../utils/paths';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FUEL_COLORS, getT } from '../constants';

const num = v => (Number.isFinite(v) ? v : 0);

// Supply-data fuel names (title case) → colour
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

export default function StatsPanel({ region, theme, source = 'osm', tariffs, fleetAge, access }) {
  const navigate = useNavigate();
  const t = getT(theme);

  // Per-country supply data (generation + capacity, by year) for the snapshot chart
  const [byCountry, setByCountry] = useState(null);
  const [view, setView] = useState('capacity');   // 'capacity' | 'generation'
  const [year, setYear] = useState(null);

  useEffect(() => {
    if (!region) return;
    setByCountry(null);
    let cancelled = false;
    const isos = region.countries.map(c => c.iso);
    Promise.all(isos.map(iso =>
      fetch(dataPath(`supply/${iso}.json`)).then(r => (r.ok ? r.json() : null)).catch(() => null),
    )).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach((d, i) => {
        if (!d) return;
        const entry = {};
        for (const key of ['generation', 'capacity']) {
          const g = d[key];
          if (!g?.years) continue;
          const byYear = {};
          g.years.forEach((y, yi) => {
            const fuels = {};
            for (const [f, arr] of Object.entries(g.fuels || {})) {
              const v = num(arr[yi]);
              if (v > 0) fuels[f] = v;
            }
            byYear[y] = { fuels, unit: g.unit };
          });
          entry[key] = byYear;
        }
        map[isos[i]] = entry;
      });
      setByCountry(map);
    });
    return () => { cancelled = true; };
  }, [region]);

  const sec = {
    fontSize: '0.5rem', letterSpacing: '2px', fontWeight: 700,
    color: t.lblMuted, textTransform: 'uppercase', marginBottom: 7, display: 'block',
  };

  // ── Snapshot bar chart (one bar per country, selected year & view) ──────────
  const snapshot = (() => {
    if (!byCountry) return { loading: true };
    // years available for this view (union across members)
    const yearsSet = new Set();
    const lasts = [];
    region.countries.forEach(c => {
      const v = byCountry[c.iso]?.[view];
      if (v) { Object.keys(v).forEach(y => yearsSet.add(+y)); lasts.push(Math.max(...Object.keys(v).map(Number))); }
    });
    const years = [...yearsSet].sort((a, b) => b - a);
    if (!years.length) return { years: [] };
    const defaultYear = lasts.length ? Math.min(...lasts) : years[0];  // latest year all have
    const yr = (year != null && yearsSet.has(year)) ? year : defaultYear;

    const rows = region.countries.map(c => {
      const fuels = byCountry[c.iso]?.[view]?.[yr]?.fuels || {};
      const total = Object.values(fuels).reduce((s, v) => s + v, 0);
      return { iso: c.iso, name: c.name, fuels, total };
    }).filter(r => r.total > 0).sort((a, b) => b.total - a.total);

    const unit = view === 'capacity' ? 'GW' : 'TWh';        // MW→GW, GWh→TWh (÷1000)
    const maxTotal = Math.max(...rows.map(r => r.total), 1);
    return { years, yr, rows, unit, maxTotal };
  })();

  const toggleBtn = (v, lbl) => (
    <button key={v} onClick={() => setView(v)} style={{
      fontSize: '0.47rem', letterSpacing: '0.5px', textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
      border: `1px solid ${view === v ? 'rgba(74,143,204,0.6)' : t.panelBorder}`,
      backgroundColor: view === v ? 'rgba(74,143,204,0.1)' : 'transparent',
      color: view === v ? t.lbl : t.lblMuted,
    }}>{lbl}</button>
  );

  // Per-country rows for fleet age / access (ordering + lookups, from props)
  const countryData = region.countries.map(c => ({
    iso: c.iso, name: c.name,
    tariff: tariffs?.countries?.[c.iso]?.res ?? null,
    age:    fleetAge?.countries?.[c.iso]?.avg_years ?? null,
    oldest: fleetAge?.countries?.[c.iso]?.oldest_year ?? null,
  }));
  const ageEntries = countryData.filter(c => c.age != null).sort((a, b) => b.age - a.age);
  const maxAge     = Math.max(...ageEntries.map(c => c.age), 1);

  return (
    <div>
      {/* ── Snapshot: capacity / generation by country ─────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {toggleBtn('capacity', 'Capacity')}
          {toggleBtn('generation', 'Generation')}
        </div>
        <div style={{ flex: 1 }} />
        {snapshot.years?.length > 0 && (
          <select
            value={snapshot.yr}
            onChange={e => setYear(+e.target.value)}
            style={{
              fontSize: '0.6rem', padding: '3px 6px', borderRadius: 4, fontFamily: 'inherit',
              border: `1px solid ${t.panelBorder}`, backgroundColor: t.panel, color: t.lbl, outline: 'none',
            }}
          >
            {snapshot.years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {snapshot.loading ? (
        <p style={{ fontSize: '0.7rem', color: t.muted, fontStyle: 'italic' }}>Loading…</p>
      ) : !snapshot.rows?.length ? (
        <p style={{ fontSize: '0.7rem', color: t.lblMuted, fontStyle: 'italic' }}>No {view} data available for this region.</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            {snapshot.rows.map(c => (
              <div key={c.iso} onClick={() => navigate(`/country/${c.iso}`)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: '0.56rem', fontWeight: 700, color: 'white', backgroundColor: region.color,
                  borderRadius: 3, padding: '1px 4px', flexShrink: 0, minWidth: 30, textAlign: 'center',
                }}>{c.iso}</span>
                <div style={{ flex: 1, height: 11, borderRadius: 3, backgroundColor: 'rgba(128,160,192,0.1)', display: 'flex', overflow: 'hidden' }}>
                  {Object.entries(c.fuels).sort(([, a], [, b]) => b - a).map(([fuel, v]) => (
                    <div key={fuel} title={fuel} style={{ width: `${(v / snapshot.maxTotal) * 100}%`, backgroundColor: matchFuelColor(fuel), opacity: 0.88, flexShrink: 0 }} />
                  ))}
                </div>
                <span style={{ fontSize: '0.56rem', color: t.muted, flexShrink: 0, minWidth: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {(c.total / 1000).toFixed(1)} {snapshot.unit}
                </span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.5rem', color: t.lblMuted, fontStyle: 'italic', marginBottom: 16, lineHeight: 1.5 }}>
            {view === 'capacity' ? 'Installed capacity' : 'Annual generation'} by country, {snapshot.yr} · source: Ember / ENTSO-E (supply data).
            {' '}Differs from the map &amp; Overview donut, which use plant databases (GPPD/GEM/OSM) — different methods, so totals don't match.
          </p>
        </>
      )}

      {/* ── Fleet age ────────────────────────── */}
      {ageEntries.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <span style={sec}>Fleet Age · MW-weighted avg</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {ageEntries.map(c => (
              <div key={c.iso}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: '0.6rem', color: t.lblRow }}>{c.iso}</span>
                  <span style={{ fontSize: '0.6rem', color: t.muted, fontVariantNumeric: 'tabular-nums' }}>
                    {c.age.toFixed(0)} yrs
                    {c.oldest && <span style={{ opacity: 0.6 }}> · oldest {c.oldest}</span>}
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(128,160,192,0.1)', overflow: 'hidden' }}>
                  <div style={{ width: `${(c.age / maxAge) * 100}%`, height: '100%', backgroundColor: '#C89420', opacity: 0.75, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.5rem', color: t.lblMuted, marginTop: 6, fontStyle: 'italic' }}>
            WRI GPPD v1.3 · ref. year {fleetAge.reference_year}
          </p>
        </div>
      )}

      {source === 'osm' && ageEntries.length === 0 && (
        <p style={{ fontSize: '0.5rem', color: t.lblMuted, fontStyle: 'italic', marginBottom: 8 }}>
          Fleet age available with GPPD source
        </p>
      )}

      {/* ── Electricity access ───────────────── */}
      {access && (() => {
        const withAccess = countryData.filter(c => access.countries?.[c.iso]?.total != null)
          .sort((a, b) => (access.countries[a.iso].total) - (access.countries[b.iso].total));
        if (!withAccess.length) return null;
        return (
          <div style={{ marginBottom: 10 }}>
            <span style={sec}>Electricity Access · Total %</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {withAccess.map(c => {
                const val = access.countries[c.iso].total;
                const color = val < 30 ? '#B83838' : val < 75 ? '#D4A820' : '#4A9E6A';
                return (
                  <div key={c.iso}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: '0.6rem', color: t.lblRow }}>{c.iso}</span>
                      <span style={{ fontSize: '0.6rem', fontWeight: 700, color }}>{val}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(128,160,192,0.1)', overflow: 'hidden' }}>
                      <div style={{ width: `${val}%`, height: '100%', backgroundColor: color, opacity: 0.75, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: '0.5rem', color: t.lblMuted, marginTop: 6, fontStyle: 'italic' }}>
              World Bank / SE4All · {access.year}
            </p>
          </div>
        );
      })()}

      {/* ── Footer attributions ──────────────── */}
      {tariffs && (
        <p style={{ fontSize: '0.5rem', color: t.lblMuted, fontStyle: 'italic', marginBottom: 2 }}>
          Tariff (res. USD/MWh) · {tariffs.year} · {tariffs.source}
        </p>
      )}
    </div>
  );
}
