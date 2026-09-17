import { dataPath } from '../utils/paths';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { useTheme } from '../App';
import { getT } from '../constants';
import { buildWbStyle, useWbStyleBase } from '../utils/wbStyle';
import { fetchGeo, fetchNdlsa, addCountriesSource, regionFilter, addNdlsaLayer, raiseBoundaries, fillAnchor } from '../utils/basemap';

export default function WorldPage() {
  const { theme } = useTheme();
  const t = getT(theme);
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const metaMarkersRef = useRef([]);
  const metaActiveRef = useRef(null);
  const [regions, setRegions] = useState(null);
  const wbBase = useWbStyleBase();
  const [metaActive, setMetaActive] = useState(null); // region obj or null
  const [disambig, setDisambig] = useState(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 700);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    fetch(dataPath('regions.json')).then(r => r.json()).then(d => setRegions(d.regions));
  }, []);

  // --- Cluster marker helpers ---
  function buildClusterEl(sub, meta) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:80px;height:80px;display:flex;flex-direction:column;align-items:center;cursor:pointer;';

    const circle = document.createElement('div');
    circle.style.cssText = [
      'width:60px;height:60px;border-radius:50%;',
      `background:${meta.color};`,
      'display:flex;flex-direction:column;align-items:center;justify-content:center;',
      'box-shadow:0 3px 16px rgba(0,0,0,.45);',
      'transition:transform .15s,box-shadow .15s;margin:0 auto;',
    ].join('');

    const cnt = document.createElement('div');
    cnt.style.cssText = 'font-size:16px;font-weight:700;color:#fff;line-height:1;font-family:inherit;';
    cnt.textContent = sub.countries.length;

    const unit = document.createElement('div');
    unit.style.cssText = 'font-size:8px;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:.5px;margin-top:2px;font-family:inherit;';
    unit.textContent = 'countries';

    circle.appendChild(cnt);
    circle.appendChild(unit);
    wrap.appendChild(circle);

    const lbl = document.createElement('div');
    lbl.style.cssText = [
      'margin-top:5px;font-size:10px;font-weight:600;white-space:nowrap;font-family:inherit;',
      `color:${t.text};background:${t.panel};border:1px solid ${t.panelBorder};`,
      'padding:2px 8px;border-radius:4px;letter-spacing:.2px;',
    ].join('');
    lbl.textContent = sub.name.replace(' SIDS', '');
    wrap.appendChild(lbl);

    wrap.addEventListener('mouseenter', () => {
      circle.style.transform = 'scale(1.1)';
      circle.style.boxShadow = '0 5px 22px rgba(0,0,0,.55)';
    });
    wrap.addEventListener('mouseleave', () => {
      circle.style.transform = 'scale(1)';
      circle.style.boxShadow = '0 3px 16px rgba(0,0,0,.45)';
    });

    return wrap;
  }

  function applyMetaMarkers(meta, map) {
    metaMarkersRef.current.forEach(m => m.remove());
    metaMarkersRef.current = [];
    if (!meta || !map) return;
    const subs = (regions || []).filter(r => r.parent === meta.id);
    subs.forEach(sub => {
      if (!sub.center) return;
      const el = buildClusterEl(sub, meta);
      el.addEventListener('click', () => navigate(`/region/${sub.id}`));
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(sub.center)
        .addTo(map);
      metaMarkersRef.current.push(marker);
    });
  }

  function handleMetaToggle(r) {
    const next = metaActiveRef.current?.id === r.id ? null : r;
    metaActiveRef.current = next;
    setMetaActive(next);
    if (mapRef.current) applyMetaMarkers(next, mapRef.current);
  }

  // Main map effect
  useEffect(() => {
    if (!containerRef.current || !regions || !wbBase) return;

    const isoToRegions = {};
    // Areas the Bank attributes to no country carry no code, so they are keyed
    // on WB_NAME instead. See regions.json `non_determined`.
    const areaToRegions = {};
    const available = regions.filter(r => r.status === 'available');
    for (const r of available) {
      if (r.type === 'meta') continue;
      for (const c of r.countries) {
        if (!isoToRegions[c.iso]) isoToRegions[c.iso] = [];
        isoToRegions[c.iso].push({ id: r.id, name: r.name, color: r.color, countryName: c.name });
      }
      for (const area of r.non_determined || []) {
        if (!areaToRegions[area]) areaToRegions[area] = [];
        areaToRegions[area].push({ id: r.id, name: r.name, color: r.color, countryName: area });
      }
    }
    const availableIsos = Object.keys(isoToRegions);
    const regionsFor = p =>
      (p.STATUS === 'non-determined' ? areaToRegions[p.WB_NAME] : isoToRegions[p.ISO_A3]) || [];
    // A country's colour on this map is its first region's.
    const colorForIso = iso => isoToRegions[iso]?.[0].color || null;

    let disposed = false;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildWbStyle(wbBase, t),
      center: [20, 15],
      zoom: 2.2,
      minZoom: 1.5,
      maxZoom: 9,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on('movestart', () => setDisambig(null));

    map.on('load', async () => {
      const [countries, ndlsa] = await Promise.all([fetchGeo('world'), fetchNdlsa()]);
      if (disposed) return;
      addCountriesSource(map, countries);

      if (availableIsos.length) {
        const colorExpr = ['match', ['get', 'ISO_A3'],
          ...availableIsos.flatMap(iso => [iso, isoToRegions[iso][0].color]),
          'transparent',
        ];
        map.addLayer({
          id: 'region-fill',
          type: 'fill',
          source: 'countries',
          filter: regionFilter(availableIsos),
          paint: {
            'fill-color': colorExpr,
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.55, 0.28],
          },
        }, fillAnchor(map));
        map.addLayer({
          id: 'region-border',
          type: 'line',
          source: 'countries',
          filter: regionFilter(availableIsos),
          paint: { 'line-color': colorExpr, 'line-width': 0.9, 'line-opacity': 0.7 },
        });
      }
      // Every non-determined area, coloured from its parties; the basemap
      // draws their outlines. Under the region fill so a hovered country
      // never looks cut by its neighbour's area.
      addNdlsaLayer(map, { ndlsa, colorForIso, opacity: 0.28, hoverOpacity: 0.55, before: fillAnchor(map), t });

      let hoveredId = null;
      const popup = new maplibregl.Popup({
        closeButton: false, closeOnClick: false, offset: 8,
        className: `popup-${theme}`,
      });
      const hoverLayers = ['region-fill', 'ndlsa-fill'];

      map.on('mousemove', hoverLayers, e => {
        map.getCanvas().style.cursor = 'pointer';
        if (hoveredId !== null)
          map.setFeatureState({ source: 'countries', id: hoveredId }, { hover: false });
        hoveredId = e.features[0].id;
        map.setFeatureState({ source: 'countries', id: hoveredId }, { hover: true });

        const props = e.features[0].properties;
        const rs = regionsFor(props);
        const countryName = rs[0]?.countryName || props.WB_NAME || props.ISO_A3;
        const subtitle = rs.length > 1
          ? rs.map(r => r.name).join(' · ') + ' · click to choose'
          : rs.length === 1
            ? rs[0].name + ' · click to explore'
            : 'Non-determined legal status area';
        popup.setLngLat(e.lngLat)
          .setHTML(`<b>${countryName}</b><br><span style="opacity:0.65">${subtitle}</span>`)
          .addTo(map);
      });

      map.on('mouseleave', hoverLayers, () => {
        map.getCanvas().style.cursor = '';
        if (hoveredId !== null)
          map.setFeatureState({ source: 'countries', id: hoveredId }, { hover: false });
        hoveredId = null;
        popup.remove();
      });

      map.on('click', hoverLayers, e => {
        const props = e.features[0].properties;
        const iso = props.ISO_A3 || props.WB_NAME;
        const rs = regionsFor(props);
        if (rs.length === 0) return;
        if (rs.length === 1) {
          navigate(`/region/${rs[0].id}`);
        } else {
          const pixel = map.project(e.lngLat);
          setDisambig({ x: pixel.x, y: pixel.y, iso, regions: rs });
        }
      });

      raiseBoundaries(map);

      // Restore meta markers after map rebuild (e.g., theme change)
      if (metaActiveRef.current) applyMetaMarkers(metaActiveRef.current, map);
    });

    return () => {
      disposed = true;
      metaMarkersRef.current = []; // map.remove() detaches them
      mapRef.current?.remove();
      mapRef.current = null;
      setDisambig(null);
    };
  }, [regions, theme, wbBase]);

  // Build flattened legend items (main regions + sub-regions when meta is active)
  const legendItems = regions
    ? regions.flatMap(r => {
        if (r.type === 'sub') return [];
        const items = [r];
        if (r.type === 'meta' && metaActive?.id === r.id) {
          items.push(...regions.filter(s => s.parent === r.id));
        }
        return items;
      })
    : [];

  return (
    <div style={{ height: 'calc(100vh - 46px)', position: 'relative', backgroundColor: t.bg }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Disambiguation popover */}
      {disambig && (
        <>
          <div
            onClick={() => setDisambig(null)}
            style={{ position: 'absolute', inset: 0, zIndex: 9 }}
          />
          <div style={{
            position: 'absolute',
            left: disambig.x,
            top: disambig.y,
            transform: 'translate(-50%, -110%)',
            zIndex: 10,
            backgroundColor: t.panel,
            border: `1px solid ${t.panelBorder}`,
            borderRadius: 8,
            padding: '10px 12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            minWidth: 160,
          }}>
            <div style={{ fontSize: '0.5rem', letterSpacing: '2px', fontWeight: 700,
              color: t.lblMuted, textTransform: 'uppercase', marginBottom: 8 }}>
              {disambig.regions[0]?.countryName || disambig.iso} · Choose region
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {disambig.regions.map(r => (
                <button
                  key={r.id}
                  onClick={e => { e.stopPropagation(); setDisambig(null); navigate(`/region/${r.id}`); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'none', border: `1px solid ${r.color}44`,
                    borderRadius: 5, padding: '6px 10px', cursor: 'pointer',
                    color: t.text, fontSize: '0.72rem', fontWeight: 600,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = `${r.color}22`}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 2,
                    backgroundColor: r.color, flexShrink: 0 }} />
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Region legend */}
      {regions && !isMobile && (
        <div style={{
          position: 'absolute', bottom: 70, left: 24,
          backgroundColor: t.panel, border: `1px solid ${t.panelBorder}`,
          borderRadius: 8, padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 7,
        }}>
          <div style={{ fontSize: '0.52rem', letterSpacing: '2px', fontWeight: 700,
            color: t.lblMuted, textTransform: 'uppercase', marginBottom: 2 }}>
            Power Pools & Regions
          </div>
          {legendItems.map(r => {
            const isSub = r.type === 'sub';
            const isMeta = r.type === 'meta';
            const isActive = isMeta && metaActive?.id === r.id;
            return (
              <div
                key={r.id}
                onClick={() => {
                  if (isMeta) { handleMetaToggle(r); return; }
                  if (r.status === 'available') navigate(`/region/${r.id}`);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  paddingLeft: isSub ? 14 : 0,
                  cursor: r.status === 'available' ? 'pointer' : 'default',
                  opacity: r.status === 'available' ? 1 : 0.38,
                }}
              >
                <span style={{
                  width: isSub ? 6 : 9,
                  height: isSub ? 6 : 9,
                  borderRadius: (isMeta || isSub) ? '50%' : 2,
                  backgroundColor: r.color,
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: isSub ? '0.68rem' : '0.75rem', color: isSub ? t.muted : t.text }}>
                  {r.name}
                </span>
                {isMeta && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.58rem', color: t.muted, paddingLeft: 4 }}>
                    {isActive ? '▲' : '▼'}
                  </span>
                )}
                {!isMeta && !isSub && r.status !== 'available' && (
                  <span style={{ fontSize: '0.58rem', color: t.lblMuted }}>soon</span>
                )}
                {isSub && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.55rem', color: t.muted }}>→</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tap / Click hint — top right */}
      <div style={{
        position: 'absolute', top: 10, right: 12, zIndex: 50,
        backgroundColor: t.panel, border: `1px solid ${t.panelBorder}`,
        borderRadius: 6, padding: isMobile ? '8px 12px' : '6px 10px',
        boxShadow: '0 1px 8px rgba(0,0,0,.18)',
        display: 'flex', alignItems: 'center', gap: 7,
        pointerEvents: 'none',
      }}>
        <svg width={isMobile ? 15 : 13} height={isMobile ? 15 : 13} viewBox="0 0 24 24" fill="none" stroke={t.muted}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
          <path d="M13 13l6 6"/>
        </svg>
        <div>
          <div style={{ fontSize: isMobile ? '0.72rem' : '0.62rem', fontWeight: 600, color: t.lbl, lineHeight: 1.2 }}>
            {isMobile ? 'Tap a country or region' : 'Click a country or region'}
          </div>
          <div style={{ fontSize: isMobile ? '0.65rem' : '0.55rem', color: t.muted, lineHeight: 1.3 }}>
            to explore the power grid
          </div>
        </div>
      </div>

      {/* ── Map disclaimer ── */}
      <div style={{
        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        zIndex: 50, pointerEvents: 'none',
        backgroundColor: t.isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.72)',
        borderRadius: 4, padding: '2px 10px',
        fontSize: '0.47rem', color: t.lblMuted, textAlign: 'center',
        whiteSpace: 'nowrap', letterSpacing: '0.3px',
      }}>
        Pilot · Indicative data · Partly AI-generated, not fact-checked · Boundaries for reference only · Unofficial
      </div>
    </div>
  );
}
