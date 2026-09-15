import fs from 'node:fs';

function patch(path, replacements) {
  let text = fs.readFileSync(path, 'utf8');
  let changed = false;
  for (const [before, after] of replacements) {
    if (text.includes(after)) continue;
    if (!text.includes(before)) throw new Error(`Patch anchor not found in ${path}: ${before.slice(0, 90)}`);
    text = text.replace(before, after);
    changed = true;
  }
  if (changed) fs.writeFileSync(path, text);
  console.log(`${changed ? 'patched' : 'current'} ${path}`);
}

patch('src/pages/RegionPage.jsx', [
  ["import LayerPanel from '../components/LayerPanel';\n", "import LayerPanel from '../components/LayerPanel';\nimport MapChat from '../chat/MapChat';\n"],
  ["      raiseBoundaries(map);\n      setMapReady(true);", "      swapBasemap(map, basemap, theme);\n      if (basemap === 'satellite') toggleSatLabels(map, satLabels, theme);\n      raiseBoundaries(map);\n      setMapReady(true);"],
  ["    >\n      {isMobile && layerPanelOpen && (", `    >\n      <MapChat theme={theme} mapRef={mapRef} mapKey={mapReady ? mapRef.current : null} ready={mapReady} controller={{\n        page: 'region', regionId, tab: activeTab, navigate,\n        setTab: setActiveTab, setPlantSource, setMinMw: handleMinMw,\n        showOnlyFuels: fuels => { for (const f of presentFuels) if (fuelsOff.has(f) === fuels.includes(f)) toggleFuel(f); },\n      }} />\n      {isMobile && layerPanelOpen && (`],
]);

patch('src/pages/CountryPage.jsx', [
  ["import { useParams, Link } from 'react-router-dom';", "import { useParams, Link, useNavigate } from 'react-router-dom';"],
  ["import LayerPanel from '../components/LayerPanel';\n", "import LayerPanel from '../components/LayerPanel';\nimport MapChat from '../chat/MapChat';\n"],
  ["  const { iso }      = useParams();\n", "  const { iso }      = useParams();\n  const navigate     = useNavigate();\n"],
  ["  const mapReadyRef        = useRef(false);\n", "  const mapReadyRef        = useRef(false);\n  const [mapReady, setMapReady] = useState(false);\n"],
  ["    mapReadyRef.current = false;\n    countryFeatureRef.current = null;", "    mapReadyRef.current = false;\n    setMapReady(false);\n    countryFeatureRef.current = null;"],
  ["      mapReadyRef.current = true;\n\n      raiseBoundaries(map);", "      mapReadyRef.current = true;\n      setMapReady(true);\n\n      swapBasemap(map, basemap, theme);\n      if (basemap === 'satellite') toggleSatLabels(map, satLabels, theme);\n      raiseBoundaries(map);"],
  ["    return () => { mapReadyRef.current = false; popup.remove(); mapRef.current?.remove(); };", "    return () => { mapReadyRef.current = false; setMapReady(false); popup.remove(); mapRef.current?.remove(); };"],
  ["    >\n      {isMobile && layerPanelOpen && (", `    >\n      <MapChat theme={theme} mapRef={mapRef} mapKey={mapReady ? mapRef.current : null} ready={mapReady} controller={{\n        page: 'country', iso, regionId: info?.region?.id, tab: activeTab, navigate,\n        setTab: setActiveTab, setPlantSource, setMinMw: handleMinMw,\n        showOnlyFuels: fuels => { for (const f of presentFuels) if (fuelsOff.has(f) === fuels.includes(f)) toggleFuel(f); },\n      }} />\n      {isMobile && layerPanelOpen && (`],
]);

patch('src/components/LayerPanel.jsx', [
  ["              { id: 'minimal',   label: 'Minimal' },\n              { id: 'labeled',   label: 'Labeled' },", "              { id: 'minimal',   label: 'WB Clean' },\n              { id: 'labeled',   label: 'WB Labeled' },"],
]);

patch('src/index.css', [
  [".maplibregl-ctrl-bottom-right { display: none !important; }\n", ".maplibregl-ctrl-bottom-right { display: none !important; }\n.maplibregl-ctrl-bottom-right:has(.imaps-ai-chat-ctrl) { display: block !important; }\n"],
]);

patch('src/pages/MetaRegionPage.jsx', [
  ["import { fetchCountries, addCountriesSource } from '../utils/basemap';", "import { fetchCountries, addCountriesSource, raiseBoundaries } from '../utils/basemap';"],
  ["      });\n\n      markersRef.current = subregions.map(sub => {", "      });\n\n      raiseBoundaries(map);\n\n      markersRef.current = subregions.map(sub => {"],
]);
