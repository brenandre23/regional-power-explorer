import { dataPath } from '../utils/paths';
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../App';
import { getT } from '../constants';


const SOURCES = [
  {
    category: 'Electricity Demand',
    rows: [
      {
        layer:   'Annual demand · demand trend · peak demand',
        source:  'Country supply data files (national sources, Ember, OWID)',
        abbr:    'National / Ember / WDI',
        version: 'Per country',
        updated: '2022–2025',
        freq:    'Annual',
        coverage:'Most countries; source varies by country — see badge in Load tab',
        quality: 'Variable — source reliability differs by country. Official TSO data where available; cross-validated estimates elsewhere.',
        anchor:  '#method-demand',
        url:     'https://data.worldbank.org',
      },
    ],
  },
  {
    category: 'Generation & Trade Statistics',
    rows: [
      {
        layer:   'Generation mix · installed capacity · cross-border flows',
        source:  'ENTSO-E Transparency Platform',
        abbr:    'ENTSO-E',
        version: 'A75 / A68 / A11',
        updated: '2024–2025',
        freq:    'Annual / monthly',
        coverage:'European countries (EU + neighbours)',
        quality: 'Good — official TSO-reported data. Covers generation by fuel type, capacity, and bilateral trade flows.',
        url:     'https://transparency.entsoe.eu',
      },
      {
        layer:   'Generation mix · installed capacity · electricity trade (Turkiye)',
        source:  'Turkish Electricity Transmission Company',
        abbr:    'TEİAŞ',
        version: '—',
        updated: '2024',
        freq:    'Annual',
        coverage:'Turkiye',
        quality: 'Good — official national statistics. Files 9, 26, 63 from TEİAŞ statistical yearbook.',
        url:     'https://www.teias.gov.tr',
      },
      {
        layer:   'Generation mix · installed capacity · electricity trade (Azerbaijan)',
        source:  'State Statistical Committee of Azerbaijan',
        abbr:    'SSC Azerbaijan',
        version: '—',
        updated: '2024–2025',
        freq:    'Annual',
        coverage:'Azerbaijan',
        quality: 'Good — official national statistics. Tables 5.3 & 5.4. Trade supplemented by Caliber.az / Galt & Taggart.',
        url:     'https://stat.gov.az',
      },
      {
        layer:   'Generation mix · installed capacity · electricity trade (Georgia)',
        source:  'ESCO Georgia · GNERC',
        abbr:    'ESCO / GNERC',
        version: '—',
        updated: '2024–2025',
        freq:    'Annual',
        coverage:'Georgia',
        quality: 'Good — ESCO annual electricity balance; trade from GNERC annual reports.',
        url:     'https://gnerc.org',
      },
    ],
  },
  {
    category: 'Power Plants',
    rows: [
      {
        layer:   'Plants · capacity',
        source:  'OpenStreetMap',
        abbr:    'OSM',
        version: '—',
        updated: 'Continuous',
        freq:    'Daily',
        coverage:'Global',
        quality: 'Variable — good density in Europe/Asia, sparse in Sub-Saharan Africa. Often missing MW values.',
        url:     'https://www.openstreetmap.org',
      },
      {
        layer:   'Plants · capacity · fleet age',
        source:  'WRI Global Power Plant Database',
        abbr:    'GPPD v1.3',
        version: 'v1.3',
        updated: '2021',
        freq:    'Ad hoc',
        coverage:'Global (~35 k plants)',
        quality: 'Good all-around coverage. Threshold ~1 MW. Frozen since 2021.',
        url:     'https://datasets.wri.org/dataset/globalpowerplantdatabase',
      },
      {
        layer:   'Plants · status (operating / construction / planned)',
        source:  'Global Energy Monitor',
        abbr:    'GEM',
        version: '2024–2025',
        updated: '2024–2025',
        freq:    'Semi-annual',
        coverage:'Global — fossil & RE trackers',
        quality: 'Best for fossil fuels (unit-level). Actively maintained. Requires manual download.',
        url:     'https://globalenergymonitor.org',
      },
    ],
  },
  {
    category: 'Grid Infrastructure',
    rows: [
      {
        layer:   'Transmission lines · substations',
        source:  'OpenStreetMap',
        abbr:    'OSM',
        version: '—',
        updated: 'Continuous',
        freq:    'Daily',
        coverage:'Global',
        quality: 'Best available open source. Coverage varies significantly by country.',
        url:     'https://www.openstreetmap.org',
      },
    ],
  },
  {
    category: 'Electricity Access',
    rows: [
      {
        layer:   'Access rates (total · urban · rural)',
        source:  'World Bank / SE4All',
        abbr:    'WB / SE4All',
        version: '—',
        updated: '~2022–2023',
        freq:    'Annual',
        coverage:'Global',
        quality: 'Official national statistics. Some countries report with 1–3 year lag.',
        url:     'https://trackingsdg7.esmap.org',
      },
    ],
  },
  {
    category: 'Electricity Tariffs',
    rows: [
      {
        layer:   'Residential · industrial tariffs',
        source:  'Various (IRENA, national utilities, ESMAP)',
        abbr:    'Mixed',
        version: '—',
        updated: '2022–2024',
        freq:    'Irregular',
        coverage:'Partial — not all countries covered',
        quality: 'Compiled manually. Precision varies. Use as indicative only.',
        url:     'https://www.irena.org',
      },
    ],
  },
  {
    category: 'RE Resources',
    rows: [
      {
        layer:   'Solar GHI · DNI · PVOUT · monthly profile',
        source:  'Global Solar Atlas',
        abbr:    'Solar Atlas',
        version: '—',
        updated: 'Continuous',
        freq:    'On demand (API)',
        coverage:'Global',
        quality: 'Good — established public dataset. Point query REST API.',
        anchor:  '#method-solar',
        url:     'https://globalsolaratlas.info',
      },
      {
        layer:   'Wind speed 100m · monthly profile',
        source:  'ERA5 via Open-Meteo',
        abbr:    'ERA5 / Open-Meteo',
        version: '2014–2023',
        updated: '2024',
        freq:    'On demand (API)',
        coverage:'Global',
        quality: 'Good — ERA5 reanalysis, 0.25° resolution. Hellman correction to 100m applied.',
        anchor:  '#method-wind',
        url:     'https://open-meteo.com',
      },
      {
        layer:   'Electricity consumption per capita',
        source:  'World Bank WDI',
        abbr:    'WB WDI',
        version: '—',
        updated: '~2022',
        freq:    'Annual',
        coverage:'Global',
        quality: 'Good — official national statistics. Some lag.',
        url:     'https://data.worldbank.org',
      },
    ],
  },
  {
    category: 'Geography',
    rows: [
      {
        layer:   'Country boundaries',
        source:  'World Bank Official Boundaries',
        abbr:    'WB Admin 0',
        version: '10m',
        updated: '2025',
        freq:    'Ad hoc',
        coverage:'Global',
        quality: 'World Bank approved Admin 0 boundaries, consistent with WB cartographic policy on disputed areas.',
        url:     'https://datacatalog.worldbank.org/search/dataset/0038272',
      },
      {
        layer:   'Non-determined status areas',
        source:  'World Bank Global Administrative Divisions',
        abbr:    'WB-GAD disputes',
        version: 'Medium res.',
        updated: '2025',
        freq:    'Ad hoc',
        coverage:'Global',
        quality: 'Areas the Bank attributes to no country. Drawn as land, with no country of their own.',
        url:     'https://datacatalog.worldbank.org/search/dataset/0038272',
      },
      {
        layer:   'Boundary line styles',
        source:  'World Bank Global Administrative Divisions',
        abbr:    'WB-GAD Admin 0 boundaries',
        version: 'Medium res.',
        updated: '2025',
        freq:    'Ad hoc',
        coverage:'Global',
        quality: "The Bank's own dashed, tightly dashed and dotted styles, traced onto the Admin 0 edges above.",
        url:     'https://datacatalog.worldbank.org/search/dataset/0038272',
      },
      {
        layer:   'Admin-1 boundaries',
        source:  'World Bank Global Administrative Divisions',
        abbr:    'WB-GAD ADM1',
        version: 'Medium res.',
        updated: '2025',
        freq:    'Ad hoc',
        coverage:'Balkans, Black Sea, Central Asia',
        quality: "The Bank's own level-1 divisions, consistent with the Admin 0 layer above.",
        url:     'https://datacatalog.worldbank.org/search/dataset/0038272',
      },
    ],
  },
];

const QUALITY_COLOR = {
  'Good': '#40C057',
  'Variable': '#FCC419',
  'Partial': '#F03E3E',
};

function qualityChip(text, t) {
  const key = Object.keys(QUALITY_COLOR).find(k => text.startsWith(k));
  const color = QUALITY_COLOR[key] || '#888';
  return (
    <span style={{
      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
      backgroundColor: color, marginRight: 5, flexShrink: 0,
      verticalAlign: 'middle', marginTop: -1,
    }} />
  );
}

// Styled formula card: accent rail + label chip + equation, with the
// variable legend visually separated below a divider.
function Formula({ t, label, eq, note }) {
  const eqLines = Array.isArray(eq) ? eq : [eq];
  return (
    <div style={{
      background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
      border: `1px solid ${t.panelBorder}`,
      borderLeft: '3px solid rgba(74,143,204,0.75)',
      borderRadius: 8, padding: '14px 18px', marginBottom: 20,
    }}>
      {label && (
        <span style={{
          display: 'inline-block', fontSize: '0.5rem', letterSpacing: '1.5px',
          fontWeight: 700, textTransform: 'uppercase', color: 'rgba(74,143,204,0.85)',
          marginBottom: 12,
        }}>{label}</span>
      )}
      <div style={{
        fontFamily: "'DM Mono', monospace", fontSize: '0.74rem',
        color: t.text, lineHeight: 1.7, whiteSpace: 'pre',
      }}>
        {eqLines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
      {note && note.length > 0 && (
        <div style={{
          marginTop: 12, paddingTop: 10, borderTop: `1px solid ${t.panelBorder}`,
          fontFamily: "'DM Mono', monospace", fontSize: '0.58rem',
          color: t.lblMuted, lineHeight: 1.9, whiteSpace: 'pre',
        }}>
          {note.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

export default function AboutPage() {
  const { theme } = useTheme();
  const t = getT(theme);
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    fetch(dataPath('metadata.json')).then(r => r.ok ? r.json() : null).then(d => d && setMeta(d)).catch(() => {});
  }, []);

  // Scroll to a section when navigated to with a hash (e.g. /about#limitations).
  const location = useLocation();
  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }, [location]);

  const th = {
    fontSize: '0.5rem', letterSpacing: '1.5px', fontWeight: 700,
    color: t.lblMuted, textTransform: 'uppercase',
    padding: '6px 10px', textAlign: 'left',
    borderBottom: `1px solid ${t.panelBorder}`,
    whiteSpace: 'nowrap',
  };

  const td = {
    fontSize: '0.62rem', color: t.muted,
    padding: '8px 10px',
    borderBottom: `1px solid ${t.panelBorder}`,
    verticalAlign: 'top',
  };

  const sec = {
    fontSize: '0.5rem', letterSpacing: '2px', fontWeight: 700,
    color: t.lblMuted, textTransform: 'uppercase',
    marginBottom: 10, marginTop: 28, display: 'block',
  };

  return (
    <div style={{
      height: '100%', overflowY: 'auto',
      backgroundColor: t.bg, color: t.text,
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 32px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Link to="/" style={{ fontSize: '0.65rem', color: t.muted, letterSpacing: '1px' }}>
              ← Back to map
            </Link>
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: t.text, marginBottom: 8 }}>
            Data Sources
          </h1>
          <p style={{ fontSize: '0.75rem', color: t.muted, maxWidth: 620, lineHeight: 1.65 }}>
            The Regional Explorer aggregates open-access data from multiple sources.
            Coverage and accuracy vary by region; all figures are indicative.
          </p>
          {meta && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14,
              padding: '5px 12px', borderRadius: 20,
              backgroundColor: t.panel, border: `1px solid ${t.panelBorder}`,
              fontSize: '0.6rem', color: t.muted,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#40C057', flexShrink: 0, display: 'inline-block' }} />
              Data last refreshed:&nbsp;<strong style={{ color: t.lbl }}>
                {new Date(meta.lastUpdated + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </strong>
              &nbsp;·&nbsp;Target: semi-annual
            </div>
          )}
        </div>

        {/* Tables by category */}
        {SOURCES.map(({ category, rows }) => (
          <div key={category}>
            <span style={sec}>{category}</span>
            <div style={{
              borderRadius: 6, overflow: 'hidden',
              border: `1px solid ${t.panelBorder}`,
              marginBottom: 8,
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: t.panel }}>
                    <th style={th}>Layer</th>
                    <th style={th}>Source</th>
                    <th style={th}>Version</th>
                    <th style={th}>Last update</th>
                    <th style={th}>Frequency</th>
                    <th style={th}>Coverage</th>
                    <th style={{ ...th, whiteSpace: 'normal', minWidth: 200 }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={{
                      backgroundColor: i % 2 === 0 ? 'transparent' : (t.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)'),
                    }}>
                      <td style={{ ...td, color: t.lbl, fontWeight: 500 }}>{row.layer}</td>
                      <td style={td}>
                        <a href={row.url} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'rgba(74,143,204,0.85)', textDecoration: 'none' }}>
                          {row.abbr}
                        </a>
                        <div style={{ fontSize: '0.52rem', color: t.lblMuted, marginTop: 2 }}>
                          {row.source}
                        </div>
                      </td>
                      <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{row.version}</td>
                      <td style={{ ...td, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{row.updated}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{row.freq}</td>
                      <td style={td}>{row.coverage}</td>
                      <td style={{ ...td, color: t.lblMuted, lineHeight: 1.5 }}>
                        {qualityChip(row.quality, t)}
                        {row.quality}
                        {row.anchor && (
                          <div style={{ marginTop: 5 }}>
                            <a href={row.anchor}
                              style={{ fontSize: '0.52rem', color: 'rgba(74,143,204,0.85)', textDecoration: 'none' }}>
                              ↗ See methodology
                            </a>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* Legend */}
        <div style={{
          marginTop: 32, padding: '14px 16px', borderRadius: 6,
          border: `1px solid ${t.panelBorder}`,
          backgroundColor: t.panel,
        }}>
          <span style={{ ...sec, marginTop: 0, marginBottom: 8 }}>Quality indicator</span>
          <div style={{ display: 'flex', gap: 20 }}>
            {Object.entries(QUALITY_COLOR).map(([label, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />
                <span style={{ fontSize: '0.62rem', color: t.muted }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Methodology & Estimations ── */}
        <div style={{ marginTop: 48 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: t.text, marginBottom: 6 }}>
            Methodology &amp; Estimations
          </h2>
          <p style={{ fontSize: '0.72rem', color: t.muted, maxWidth: 660, lineHeight: 1.65, marginBottom: 32 }}>
            Some indicators displayed in the tool are not directly sourced but derived or estimated.
            This section documents the methods used so that results can be correctly interpreted.
          </p>

          {/* §1 Electricity Demand */}
          <div id="method-demand" style={{ marginBottom: 40 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: t.text, marginBottom: 6 }}>
              Electricity Demand
            </h3>
            <p style={{ fontSize: '0.72rem', color: t.muted, lineHeight: 1.7, marginBottom: 14, maxWidth: 660 }}>
              Annual demand is displayed in TWh/year in the Load tab. Data is sourced in the following priority order:
            </p>
            <ol style={{ paddingLeft: 18, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li style={{ fontSize: '0.72rem', color: t.muted, lineHeight: 1.65 }}>
                <strong style={{ color: t.lbl }}>National supply data file</strong> — per-country JSON with official figures
                from ENTSO-E, national TSOs, Ember, or OWID. Each file indicates its source; the Load tab displays
                an <em>Official</em> or <em>Estimated</em> badge accordingly.
              </li>
              <li style={{ fontSize: '0.72rem', color: t.muted, lineHeight: 1.65 }}>
                <strong style={{ color: t.lbl }}>WB WDI fallback</strong> — when no supply file exists, national
                demand is derived from two World Bank WDI indicators:
              </li>
            </ol>
            <Formula t={t} label="National demand · WDI fallback"
              eq="E_national [TWh] = kWh_capita × Population / 1 000 000 000"
              note={[
                'kWh_capita = WDI indicator EG.USE.ELEC.KH.PC',
                'Population = WDI indicator SP.POP.TOTL',
              ]} />

            <p style={{ fontSize: '0.72rem', color: t.muted, lineHeight: 1.7, marginBottom: 14, maxWidth: 660 }}>
              <strong style={{ color: t.lbl }}>Demand projection.</strong> When at least 3 years of data are
              available, an OLS (ordinary least squares) linear trend is fitted and extrapolated 10 years forward.
              The projected series is shown as a dashed line labelled "Linear extrap." It is a mechanical trend
              extension — not a scenario forecast. Actual demand will differ based on economic growth, efficiency,
              and structural change.
            </p>
            <Formula t={t} label="Demand projection · linear trend"
              eq="E(t) = m·t + b     (OLS fit on historical series)"
              note={[
                'm, b  estimated by minimising Σ(E_obs − E_fit)²',
                'projected for t = last_year + 1 … last_year + 10',
              ]} />

            <p style={{ fontSize: '0.72rem', color: t.muted, lineHeight: 1.7, marginBottom: 14, maxWidth: 660 }}>
              <strong style={{ color: t.lbl }}>Peak demand estimation.</strong> When peak demand is not directly
              available in the data, it is estimated from annual consumption using an assumed load factor (LF).
              Results are flagged with a ~ prefix and labelled "est. LF = 55%".
            </p>
            <Formula t={t} label="Peak demand · load factor"
              eq="P_peak [GW] = E_annual [TWh] × 1000 / (8760 h × LF)"
              note={['LF = 0.55  (assumed; typical developing-grid range 0.40–0.75)']} />
            <p style={{ fontSize: '0.62rem', color: t.lblMuted, fontStyle: 'italic', lineHeight: 1.6 }}>
              The load factor assumption is a rough approximation. For countries with strong seasonal
              variation or high AC penetration, actual LF may be significantly lower.
            </p>
          </div>

          {/* §2 Solar */}
          <div id="method-solar" style={{ marginBottom: 40 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: t.text, marginBottom: 6 }}>
              Solar Irradiance Resources
            </h3>
            <p style={{ fontSize: '0.72rem', color: t.muted, lineHeight: 1.7, marginBottom: 14, maxWidth: 660 }}>
              The RE Resources tab shows solar potential using two complementary approaches:
            </p>
            <p style={{ fontSize: '0.72rem', color: t.muted, lineHeight: 1.7, marginBottom: 10, maxWidth: 660 }}>
              <strong style={{ color: t.lbl }}>Point query</strong> — a single coordinate query to the{' '}
              <a href="https://globalsolaratlas.info" target="_blank" rel="noopener noreferrer"
                style={{ color: 'rgba(74,143,204,0.85)', textDecoration: 'none' }}>
                Global Solar Atlas REST API
              </a>{' '}
              (ESMAP / World Bank). Returns GHI, DNI, PVOUT, and a 12-month irradiance profile for the selected location.
            </p>
            <p style={{ fontSize: '0.72rem', color: t.muted, lineHeight: 1.7, marginBottom: 14, maxWidth: 660 }}>
              <strong style={{ color: t.lbl }}>Map grid overlay</strong> — fetched from the NASA POWER
              climatology API at 1°×1° resolution. The raw value is the average daily irradiance
              (kWh/m²/day); it is converted to an annual total:
            </p>
            <Formula t={t} label="Solar irradiance · annual GHI"
              eq="GHI_annual [kWh/m²/yr] = daily_mean [kWh/m²/day] × 365"
              note={[
                'Parameter : ALLSKY_SFC_SW_DWN  (NASA POWER RE community)',
                'Resolution: 1° × 1° grid cells  (~111 km at the equator)',
              ]} />
            <p style={{ fontSize: '0.62rem', color: t.lblMuted, fontStyle: 'italic', lineHeight: 1.6 }}>
              Grid values are long-term climatological means and do not reflect inter-annual variability.
              For detailed site assessment, use the point query or dedicated solar resource tools.
            </p>
          </div>

          {/* §3 Wind */}
          <div id="method-wind" style={{ marginBottom: 40 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: t.text, marginBottom: 6 }}>
              Wind Speed at 100 m
            </h3>
            <p style={{ fontSize: '0.72rem', color: t.muted, lineHeight: 1.7, marginBottom: 14, maxWidth: 660 }}>
              Modern wind turbines typically have hub heights of 80–140 m. Wind speed increases with
              altitude, so the 50 m data from NASA POWER must be corrected before comparing to turbine
              specifications. The tool uses the <strong style={{ color: t.lbl }}>Hellman power law</strong>,
              the standard engineering approximation for wind shear over open terrain:
            </p>
            <Formula t={t} label="Wind shear · Hellman power law"
              eq={[
                'v₁₀₀ = v₅₀ × (100 / 50)^α',
                '     = v₅₀ × 2^0.143',
                '     ≈ v₅₀ × 1.082',
              ]}
              note={[
                'v₅₀ = NASA POWER WS50M  (wind speed at 50m AGL, climatological mean)',
                'α   = 0.143  (Hellman exponent for open terrain, IEC standard)',
                'Grid : 0.5° × 0.5° cells  (~55 km at the equator)',
              ]} />
            <p style={{ fontSize: '0.62rem', color: t.lblMuted, fontStyle: 'italic', lineHeight: 1.6 }}>
              The Hellman exponent α = 0.143 assumes flat, open terrain. In practice α varies with
              surface roughness: lower over water (~0.10), higher in forested or urban areas (~0.25–0.40).
              Results should be treated as a regional screening tool, not a site-specific wind assessment.
            </p>
          </div>

          {/* §4 Load profile */}
          <div id="method-load-profile" style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: t.text, marginBottom: 6 }}>
              Daily Load Profile
            </h3>
            <p style={{ fontSize: '0.72rem', color: t.muted, lineHeight: 1.7, maxWidth: 660 }}>
              Hourly demand shape data is available only for countries with ENTSO-E metered data
              (EU member states and a set of neighbouring TSOs: Turkiye, Georgia, Armenia, Azerbaijan,
              Balkans, and North Africa HVDC partners). For these, the Load tab displays a typical
              European weekday profile — a 24-hour shape normalised to a peak index of 100, derived
              from ENTSO-E historical averages. The shape reflects a characteristic mid-morning plateau
              and an evening peak around 18–20h.
            </p>
            <p style={{ fontSize: '0.72rem', color: t.muted, lineHeight: 1.7, marginTop: 10, maxWidth: 660 }}>
              For all other countries, no hourly profile is available and the panel shows
              "No load profile available for this country." National TSO reports or IRENA country profiles
              are the best alternative sources for countries outside the ENTSO-E zone.
            </p>
          </div>
        </div>

        {/* ── Limitations & Disclaimer ── */}
        <div id="limitations" style={{
          marginTop: 48,
          border: `1px solid ${t.panelBorder}`,
          borderLeft: '3px solid rgba(252,196,25,0.8)',
          borderRadius: 10,
          background: t.isDark ? 'rgba(252,196,25,0.045)' : 'rgba(252,196,25,0.05)',
          padding: '20px 24px',
        }}>
          <h2 style={{
            fontSize: '1.05rem', fontWeight: 700, color: t.text, marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span aria-hidden="true" style={{ fontSize: '1rem' }}>⚠</span>
            Limitations &amp; Disclaimer
          </h2>
          <p style={{ fontSize: '0.72rem', color: t.muted, maxWidth: 640, lineHeight: 1.65, marginBottom: 18 }}>
            This tool aggregates third-party open data for analytical reference. Figures are
            indicative — a good basis for an overview and for data collection; where they inform
            planning or investment decisions, cross-check the key ones against the relevant
            national sources where feasible.
          </p>
          <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
            {[
              'Data is indicative only. Figures reflect the reference year of each source and may be 1–3 years behind current conditions.',
              'Coverage varies significantly by country. SIDS and fragile states have the most data gaps — supply data is often partial, grid data sparse, and tariff figures may be absent.',
              'Power plant databases (GPPD v1.3, GEM) typically omit plants below ~1 MW and may not reflect recent commissioning or decommissioning.',
              'Grid and infrastructure layers from OpenStreetMap are community-maintained: coverage and currency vary by region — some areas are richly mapped and current, others sparse or several years out of date.',
              'Electricity tariff data sourced from GlobalPetrolPrices.com is indicative only and may not reflect current regulated rates. Licence terms are under review.',
              'Load profiles are available only for countries with ENTSO-E hourly data. For all other countries the Load tab shows no intraday profile.',
              'Parts of this tool — narrative text and country summaries in particular — were drafted with AI assistance and have not been fully fact-checked. AI-generated text can state wrong figures confidently and can mis-handle contested or politically sensitive topics. Do not cite it as a source.',
              'Country boundaries are sourced from the World Bank Official Boundaries dataset (Admin 0) and are shown for reference purposes only. Areas the Bank attributes to no country — Western Sahara, Abyei, Arunachal Pradesh, the Kashmir area north of the line of control, the Kuril Islands and the UN buffer zone in Cyprus — are drawn as land belonging to no country. Their land boundaries, and the national boundaries the Bank itself draws broken, carry the dashed, tightly dashed and dotted styles of the Bank’s own reference map. Boundaries, colours, denominations and any other information shown do not imply any judgement on the legal status of any territory, or any endorsement or acceptance of any boundary or territorial delimitation.',
              'The findings, interpretations, and conclusions expressed in this tool are those of the author(s) alone. They do not represent the views of any institution, its governing bodies, or the governments they represent, and carry no institutional endorsement.',
            ].map((item, i) => (
              <li key={i} style={{ position: 'relative', paddingLeft: 18, fontSize: '0.72rem', color: t.muted, lineHeight: 1.65 }}>
                <span style={{ position: 'absolute', left: 0, top: 7, width: 6, height: 6, borderRadius: '50%', backgroundColor: 'rgba(252,196,25,0.75)' }} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p style={{ fontSize: '0.55rem', color: t.lblMuted, marginTop: 32, lineHeight: 1.7 }}>
          Regional Power Explorer · Pilot · Indicative data · partly AI-generated · unofficial ·{' '}
          Data licences: OSM (ODbL), GPPD (CC BY 4.0), GEM (CC BY 4.0), World Bank Official Boundaries (CC BY 4.0)
        </p>
      </div>
    </div>
  );
}
