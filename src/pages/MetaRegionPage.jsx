import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { useTheme } from '../App';
import { getT, mapStyle } from '../constants';
import { fetchCountries, addCountriesSource, raiseBoundaries } from '../utils/basemap';

export default function MetaRegionPage({ region }) {
  const { theme }  = useTheme();
  const t          = getT(theme);
  const navigate   = useNavigate();
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef([]);
  const [subregions, setSubregions] = useState([]);

  useEffect(() => {
    fetch('/data/regions.json').then(r => r.json()).then(d => {
      setSubregions((d.regions || []).filter(r => r.parent === region.id));
    });
  }, [region.id]);

  useEffect(() => {
    if (!containerRef.current || subregions.length === 0) return;

    const allIsos = region.countries.map(c => c.iso);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle(theme),
      center: [20, 5], zoom: 1.8,
      minZoom: 1, maxZoom: 6,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on('load', async () => {
      const countries = await fetchCountries('110m');
      addCountriesSource(map, countries);
      map.addLayer({ id: 'sids-fill', type: 'fill', source: 'countries',
        filter: ['in', ['get', 'ISO_A3'], ['literal', allIsos]],
        paint: { 'fill-color': region.color, 'fill-opacity': 0.18 },
      });
      map.addLayer({ id: 'sids-border', type: 'line', source: 'countries',
        filter: ['in', ['get', 'ISO_A3'], ['literal', allIsos]],
        paint: { 'line-color': region.color, 'line-width': 1.2, 'line-opacity': 0.6 },
      });

      raiseBoundaries(map);

      markersRef.current = subregions.map(sub => {
        const el = document.createElement('div');
        el.className = 'meta-cluster';
        el.innerHTML = `
          <div class="meta-cluster-ring"></div>
          <div class="meta-cluster-inner">
            <div class="meta-cluster-count">${sub.countries.length}</div>
            <div class="meta-cluster-unit">countries</div>
          </div>
          <div class="meta-cluster-label">${sub.name.replace(' SIDS', '')}</div>
        `;
        el.addEventListener('click', () => navigate(`/region/${sub.id}`));
        return new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(sub.center)
          .addTo(map);
      });
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
    };
  }, [subregions, region, theme]);

  const clusterColor = region.color;

  return (
    <div style={{ height: 'calc(100vh - 46px)', position: 'relative', backgroundColor: t.bg }}>
      <style>{`
        .meta-cluster {
          position: relative; width: 80px; height: 80px;
          display: flex; flex-direction: column; align-items: center;
          cursor: pointer;
        }
        .meta-cluster-ring {
          position: absolute; top: 4px; left: 10px;
          width: 60px; height: 60px; border-radius: 50%;
          border: 2px solid ${clusterColor};
          animation: meta-pulse 2.4s ease-out infinite;
          pointer-events: none;
        }
        .meta-cluster-inner {
          position: relative; z-index: 1;
          width: 58px; height: 58px; border-radius: 50%;
          margin: 5px auto 0;
          background: ${clusterColor};
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          box-shadow: 0 3px 14px rgba(0,0,0,0.35);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .meta-cluster:hover .meta-cluster-inner {
          transform: scale(1.1);
          box-shadow: 0 5px 22px rgba(0,0,0,0.45);
        }
        .meta-cluster-count {
          font-size: 18px; font-weight: 700; color: #fff; line-height: 1;
        }
        .meta-cluster-unit {
          font-size: 8px; color: rgba(255,255,255,0.7);
          text-transform: uppercase; letter-spacing: 0.5px; margin-top: 1px;
        }
        .meta-cluster-label {
          position: absolute; bottom: -18px; left: 50%;
          transform: translateX(-50%);
          white-space: nowrap; font-size: 11px; font-weight: 600;
          color: ${t.lbl}; letter-spacing: 0.2px;
          background: ${t.panel}ee; padding: 2px 7px;
          border-radius: 4px; border: 1px solid ${t.panelBorder};
          pointer-events: none;
        }
        @keyframes meta-pulse {
          0%   { transform: scale(1);   opacity: 0.5; }
          70%  { transform: scale(1.7); opacity: 0; }
          100% { transform: scale(1.7); opacity: 0; }
        }
      `}</style>

      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Info panel — top left */}
      <div style={{
        position: 'absolute', top: 10, left: 10, zIndex: 100,
        backgroundColor: t.panel, border: `1px solid ${t.panelBorder}`,
        borderRadius: 8, padding: '12px 16px', maxWidth: 270,
        boxShadow: '0 2px 12px rgba(0,0,0,0.22)',
      }}>
        <Link to="/" style={{
          fontSize: '0.55rem', color: t.lblMuted, textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8,
        }}>
          ← All regions
        </Link>
        <div style={{ fontSize: '0.45rem', letterSpacing: '2px', fontWeight: 700,
          color: t.lblMuted, textTransform: 'uppercase', marginBottom: 3 }}>
          UN Grouping
        </div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: t.text, marginBottom: 6, lineHeight: 1.15 }}>
          Small Island<br />Developing States
        </div>
        <div style={{ fontSize: '0.63rem', color: t.lblMuted, lineHeight: 1.55, marginBottom: 10 }}>
          {region.countries.length} island states across 3 ocean basins.
          No physical grid interconnection — each basin is explored separately.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {subregions.map(sub => (
            <button key={sub.id} onClick={() => navigate(`/region/${sub.id}`)} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: '0.65rem', padding: '6px 10px', borderRadius: 5, cursor: 'pointer',
              border: `1px solid ${clusterColor}55`,
              backgroundColor: `${clusterColor}12`,
              color: t.lbl, fontFamily: 'inherit', fontWeight: 500,
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = `${clusterColor}25`}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = `${clusterColor}12`}
            >
              <span>{sub.name.replace(' SIDS', '')}</span>
              <span style={{ color: t.lblMuted, fontSize: '0.58rem' }}>{sub.countries.length} countries →</span>
            </button>
          ))}
        </div>
      </div>

      {/* Click hint — top right */}
      <div style={{
        position: 'absolute', top: 10, right: 12, zIndex: 100,
        backgroundColor: t.panel, border: `1px solid ${t.panelBorder}`,
        borderRadius: 6, padding: '6px 10px',
        boxShadow: '0 1px 8px rgba(0,0,0,.18)',
        display: 'flex', alignItems: 'center', gap: 7,
        pointerEvents: 'none',
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.muted}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
          <path d="M13 13l6 6"/>
        </svg>
        <div>
          <div style={{ fontSize: '0.62rem', fontWeight: 600, color: t.lbl, lineHeight: 1.2 }}>Click a cluster</div>
          <div style={{ fontSize: '0.55rem', color: t.muted, lineHeight: 1.3 }}>to explore the sub-region</div>
        </div>
      </div>
    </div>
  );
}
