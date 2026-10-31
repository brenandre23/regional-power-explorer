import { useEffect, useRef, useState } from 'react';

const BASEMAPS = [['clean', 'Clean'], ['detailed', 'Detailed'], ['satellite', 'Satellite']];

/**
 * "Export PNG" button with a small options panel: basemap and country names.
 * The export itself reads everything else from the live map; see
 * src/utils/equalEarthExport.js.
 *
 * @param {object} props
 * @param {React.RefObject<import('maplibre-gl').Map>} props.mapRef
 * @param {boolean} props.ready        the map has finished loading its layers
 * @param {object}  props.t            active theme
 * @param {string}  props.title        printed on the PNG
 * @param {string}  props.fileName     without extension
 * @param {() => object[]} [props.legend]  legend rows at export time
 * @param {Object<string, () => Promise<object>>} [props.sourceData]
 *        whole-feature loaders for the page's non-GeoJSON sources, by id
 * @param {string}  [props.defaultBasemap] the page's current basemap
 * @param {object}  [props.style]      positioning
 * @param {boolean} [props.compact]    phone-sized type
 */
export default function ExportControl({ mapRef, ready, t, title, fileName, legend, sourceData, defaultBasemap = 'clean', style, compact }) {
  const [open, setOpen] = useState(false);
  // The page's basemap until the user picks one here.
  const [picked, setBasemap] = useState(null);
  const basemap = picked ?? defaultBasemap;
  const [labels, setLabels] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (!ready) return null;

  const run = async () => {
    const map = mapRef.current;
    if (!map) return;
    setBusy(true); setError(null);
    try {
      const { exportEqualEarthPng, downloadBlob } = await import('../utils/equalEarthExport');
      const blob = await exportEqualEarthPng(map, { t, title, basemap, labels, legend: legend?.() || [], sourceData });
      downloadBlob(blob, `${fileName}-equal-earth.png`);
      setOpen(false);
    } catch (err) {
      console.error('Equal Earth export', err);
      // The cause too: the export depends on World Bank services a network
      // may block or slow, and the message is what a user can report.
      setError(`Export failed: ${err?.message || 'unknown error'}. Please try again.`);
    } finally {
      setBusy(false);
    }
  };

  const fs = compact ? '0.68rem' : '0.58rem';
  const panelStyle = {
    backgroundColor: t.panel, border: `1px solid ${t.panelBorder}`, borderRadius: 6,
    boxShadow: '0 1px 8px rgba(0,0,0,.18)', fontFamily: 'inherit', color: t.lbl,
  };
  const chip = active => ({
    flex: 1, fontSize: fs, padding: '4px 0', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${active ? 'rgba(74,143,204,0.6)' : t.panelBorder}`,
    background: active ? 'rgba(74,143,204,0.15)' : 'transparent', color: active ? t.lbl : t.muted,
  });

  return (
    <div ref={rootRef} style={{ position: 'absolute', zIndex: 60, ...style }}>
      <button onClick={() => setOpen(o => !o)} style={{
        ...panelStyle, padding: compact ? '7px 12px' : '5px 10px', fontSize: fs, fontWeight: 600, cursor: 'pointer',
      }}>
        Export PNG ▾
      </button>
      {open && (
        <div style={{ ...panelStyle, position: 'absolute', top: 'calc(100% + 6px)', ...(style?.left != null ? { left: 0 } : { right: 0 }), width: 210, padding: 10 }}>
          <div style={{ fontSize: fs, fontWeight: 600, marginBottom: 6 }}>Equal Earth map</div>
          <div style={{ fontSize: fs, color: t.muted, marginBottom: 4 }}>Basemap</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {BASEMAPS.map(([id, label]) => (
              <button key={id} onClick={() => setBasemap(id)} style={chip(basemap === id)}>{label}</button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: fs, marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)} />
            Country names
          </label>
          <button disabled={busy} onClick={run} style={{
            width: '100%', padding: '6px 0', borderRadius: 4, fontFamily: 'inherit', fontSize: fs, fontWeight: 600,
            border: '1px solid rgba(74,143,204,0.6)', background: 'rgba(74,143,204,0.9)', color: '#fff',
            cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
          }}>
            {busy ? 'Preparing PNG…' : 'Download PNG'}
          </button>
          {error && <div style={{ fontSize: fs, color: '#c0392b', marginTop: 6 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
