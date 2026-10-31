import { useState, useEffect } from 'react';
import { getT } from '../../constants';
import { dataPath } from '../../utils/paths';
import { fetchData } from '../../utils/dataCache';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Useful external RE-resource tools (sites we rely on / recommend)
const RE_LINKS = [
  ['Renewables.ninja', 'https://renewables.ninja', 'Hourly solar PV & wind output simulation, point-based'],
  ['Global Solar Atlas', 'https://globalsolaratlas.info', 'Solar resource & PV potential maps — ESMAP / World Bank'],
  ['Global Wind Atlas', 'https://globalwindatlas.info', 'Wind resource at several hub heights — DTU / World Bank'],
  ['NASA POWER', 'https://power.larc.nasa.gov', 'Solar & meteorological data, global API'],
  ['PVGIS', 'https://re.jrc.ec.europa.eu/pvg_tools/en/', 'PV performance & radiation — EU JRC'],
];

function LinkList({ items, t }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(([name, href, desc]) => (
        <a key={href} href={href} target="_blank" rel="noopener noreferrer"
          style={{ textDecoration: 'none', display: 'block' }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 600, color: 'rgba(74,143,204,0.9)' }}>
            {name} <span aria-hidden="true" style={{ fontWeight: 400 }}>↗</span>
          </span>
          <span style={{ display: 'block', fontSize: '0.5rem', color: t.lblMuted, lineHeight: 1.4, marginTop: 1 }}>{desc}</span>
        </a>
      ))}
    </div>
  );
}

function downloadBlob(content, filename, type = 'application/octet-stream') {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function LineChart({ data, color, yUnit, t }) {
  if (!data || data.length < 2) return null;
  const W = 226, H = 64, pL = 30, pR = 6, pT = 6, pB = 20;
  const iW = W - pL - pR, iH = H - pT - pB;
  const minV = Math.min(...data), maxV = Math.max(...data);
  const range = maxV - minV || 1;
  const toX = i => pL + (i / (data.length - 1)) * iW;
  const toY = v => pT + iH - ((v - minV) / range) * iH;
  const pts  = data.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const fill = [
    `${pL},${pT + iH}`,
    ...data.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`),
    `${pL + iW},${pT + iH}`,
  ].join(' ');
  const ticks = [minV, (minV + maxV) / 2, maxV];
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
        {ticks.map((v, i) => {
          const y = toY(v);
          return (
            <g key={i}>
              <line x1={pL} y1={y} x2={pL + iW} y2={y}
                stroke={t.panelBorder} strokeWidth={0.26} strokeDasharray="2,2" />
              <text x={pL - 2} y={y + 3} textAnchor="end" fill={t.lblMuted} fontSize={4.2}>
                {v.toFixed(1)}
              </text>
            </g>
          );
        })}
        <polygon points={fill} fill={color} opacity={0.12} />
        <polyline points={pts} fill="none" stroke={color}
          strokeWidth={0.8} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((v, i) => (
          <circle key={i} cx={toX(i)} cy={toY(v)} r={1.3} fill={color} />
        ))}
        {[0, 3, 6, 9, 11].map(i => (
          <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fill={t.lblMuted} fontSize={3.75}>
            {MONTH_LABELS[i]}
          </text>
        ))}
        {/* Y unit rotated label */}
        <text
          transform={`translate(8, ${pT + iH / 2}) rotate(-90)`}
          textAnchor="middle" fill={t.lblMuted} fontSize={3.9}
        >
          {yUnit}
        </text>
      </svg>
    </div>
  );
}

function Cards({ items, t }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 6 }}>
      {items.map(({ label, value, unit }) => (
        <div key={label} style={{
          padding: '6px 8px', borderRadius: 5,
          backgroundColor: t.cardBg, border: `1px solid ${t.cardBorder}`,
        }}>
          <div style={{ fontSize: '0.42rem', color: t.lblMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: t.lbl }}>{value ?? '—'}</div>
          <div style={{ fontSize: '0.42rem', color: t.lblMuted }}>{unit}</div>
        </div>
      ))}
    </div>
  );
}

// One CSV row per figure in public/data/re/<ISO3>.json.
function toCsv(re) {
  const rows = ['type,metric,statistic,value,unit'];
  const add = (type, block, key, unit) => block?.[key] && Object.entries(block[key])
    .forEach(([stat, v]) => rows.push(`${type},${key},${stat},${v},${unit}`));
  const { solar, wind, monthly } = re;
  if (solar) {
    add('solar', solar, 'ghi', 'kWh/m²/yr');
    add('solar', solar, 'dni', 'kWh/m²/yr');
    add('solar', solar, 'pvout', 'kWh/kWp/yr');
    rows.push(`solar,pv_capacity_factor,mean,${solar.pvCapacityFactorPct},%`);
  }
  if (wind) {
    add('wind', wind, 'speed', 'm/s @ 100m');
    add('wind', wind, 'powerDensity', 'W/m² @ 100m');
    add('wind', wind, 'capacityFactorPct', '% IEC class 2');
  }
  MONTH_LABELS.forEach((m, i) => {
    if (monthly?.ghiDaily) rows.push(`solar_monthly,GHI_daily,${m},${monthly.ghiDaily[i]},kWh/m²/d`);
    if (monthly?.windSpeed100m) rows.push(`wind_monthly,speed_100m,${m},${monthly.windSpeed100m[i]},m/s`);
  });
  return rows.join('\n');
}

// Country figures written by tools/prepare_re.py: averages over the whole
// country from Global Solar Atlas and Global Wind Atlas, with monthly shapes
// from NASA POWER. Nothing is fetched from outside the explorer.
export default function REResourcesTab({ iso, theme }) {
  const t = getT(theme);
  const [loaded, setLoaded] = useState({ iso: null, data: null });
  // undefined while this country's file loads, null when it has none.
  const re = loaded.iso === iso ? loaded.data : undefined;

  useEffect(() => {
    let live = true;
    fetchData(dataPath(`re/${iso}.json`))
      .then(data => { if (live) setLoaded({ iso, data }); })
      .catch(() => { if (live) setLoaded({ iso, data: null }); });
    return () => { live = false; };
  }, [iso]);

  const sec = {
    fontSize: '0.45rem', letterSpacing: '2px', fontWeight: 700,
    color: t.lblMuted, textTransform: 'uppercase', marginBottom: 6, display: 'block',
  };
  const note = { fontSize: '0.62rem', color: t.muted, fontStyle: 'italic' };
  const caption = { fontSize: '0.44rem', color: t.lblMuted, fontStyle: 'italic', margin: '3px 0 0', lineHeight: 1.5 };
  const link = (href, text) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ color: 'rgba(74,143,204,0.75)', textDecoration: 'none' }}>{text}</a>
  );
  const solar = re?.solar, wind = re?.wind, monthly = re?.monthly;

  return (
    <div>
      {re === undefined && <p style={note}>Loading resource data…</p>}
      {re === null && <p style={note}>No resource figures are published for this country.</p>}

      {re && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
            <p style={{ ...caption, margin: 0 }}>
              Country averages over the whole territory, weighted by area — not limited to land
              where a plant could be built. &ldquo;Best 10%&rdquo; is the value the best tenth of the country reaches.
            </p>
            <button
              title="Download RE data CSV"
              onClick={() => downloadBlob(toCsv(re), `re_resources_${iso}.csv`, 'text/csv')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '1px 3px', borderRadius: 3, color: t.lblMuted,
                display: 'inline-flex', alignItems: 'center', opacity: 0.7, flexShrink: 0,
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

          {/* ── Solar ─────────────────────────────── */}
          <span style={sec}>Solar Resource</span>
          {solar ? (
            <>
              <Cards t={t} items={[
                { label: 'GHI',   value: solar.ghi.mean,   unit: 'kWh/m²/yr' },
                { label: 'PVOUT', value: solar.pvout.mean, unit: 'kWh/kWp/yr' },
                { label: 'DNI',   value: solar.dni.mean,   unit: 'kWh/m²/yr' },
                { label: 'PV CF', value: `${solar.pvCapacityFactorPct}%`, unit: 'capacity factor' },
              ]} />
              <p style={{ ...caption, marginBottom: 10 }}>
                Best 10%: PVOUT ≥ {solar.pvout.p90} kWh/kWp/yr · median {solar.pvout.median}
              </p>
            </>
          ) : (
            <p style={note}>Global Solar Atlas publishes no statistics for this country (it stops at 60°N).</p>
          )}
          {monthly?.ghiDaily && (
            <>
              <span style={{ ...sec, marginBottom: 4 }}>Monthly GHI</span>
              <LineChart data={monthly.ghiDaily} color="#FFD43B" yUnit="kWh/m²/d" t={t} />
            </>
          )}
          <p style={{ ...caption, marginBottom: 14 }}>
            {link('https://globalsolaratlas.info', 'Global Solar Atlas')} (ESMAP / World Bank)
            {solar && ` country statistics, ${solar.updated}`}
          </p>

          {/* ── Wind ──────────────────────────────── */}
          <div style={{ borderTop: `1px solid ${t.panelBorder}`, paddingTop: 12 }}>
            <span style={sec}>Wind Resource</span>
            {wind ? (
              <>
                <Cards t={t} items={[
                  { label: 'Mean wind',     value: wind.speed.mean.toFixed(1),  unit: 'm/s @ 100m' },
                  { label: 'Wind CF',       value: `${wind.capacityFactorPct.mean}%`, unit: 'IEC class 2 turbine' },
                  { label: 'Power density', value: wind.powerDensity.mean,      unit: 'W/m² @ 100m' },
                  { label: 'Best 10%',      value: wind.speed.p90.toFixed(1),   unit: 'm/s @ 100m or more' },
                ]} />
              </>
            ) : (
              <p style={note}>No Global Wind Atlas figures for this country.</p>
            )}
            {monthly?.windSpeed100m && (
              <>
                <span style={{ ...sec, marginBottom: 4, marginTop: 4 }}>Monthly Wind Speed @ 100m</span>
                <LineChart data={monthly.windSpeed100m} color="#90AAC4" yUnit="m/s" t={t} />
              </>
            )}
            <p style={caption}>
              {link('https://globalwindatlas.info', 'Global Wind Atlas')} v4 (DTU / World Bank)
              {wind && ' · CF is modelled for one turbine type everywhere; real fleets usually run lower'}
              {monthly && <> · monthly shape from {link('https://power.larc.nasa.gov', 'NASA POWER')} at {monthly.points} {monthly.points === 1 ? 'point' : 'points'}, scaled to the annual averages</>}
            </p>
          </div>
        </>
      )}

      {/* ── Explore further — tools we use ────── */}
      <div style={{ borderTop: `1px solid ${t.panelBorder}`, paddingTop: 12, marginTop: 14 }}>
        <span style={sec}>Explore further</span>
        <LinkList items={RE_LINKS} t={t} />
      </div>
    </div>
  );
}
