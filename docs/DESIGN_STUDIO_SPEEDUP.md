# Regional Power Explorer: Design Studio speed-up plan

Plan for making the app fast on the World Bank Design Studio servers. Written 2026-10-20 against `main` @ `4aa9abc`. **Not implemented yet.**

## Why

Measured on the internal site (`designstudiodevint.worldbank.org/regional-power-explorer/`):
- The server compresses **nothing**: JS, JSON and GeoJSON are all sent raw. `.geojson` gets no `Content-Type` at all.
- `data/cache/region_lines_eu.geojson` is 20.8 MB raw and took **16.8 s**. Gzipped, it is 1.8 MB (GeoJSON shrinks 10–13×).
- `.htaccess` is ignored, so we can't turn compression on ourselves. Pre-compressed files are the only route until IT acts (request item 8).

## Already done on `main`

- Routing is hash-based (`HashRouter` in `src/App.jsx`), so deep links and refresh already work.
- The PMTiles line tiles from the 6 Oct build are gone. Region maps now give MapLibre the big GeoJSON **by URL**, so it fetches and parses them in its own worker (commit `35da33b`, which avoids a ~1 s main-thread freeze). Keep that.

## Plan

### 1. Serve pre-gzipped data through a service worker (main change)

MapLibre fetches the big files inside its own worker, so a page-level unzip helper can't reach those requests, and parsing on the page brings the freeze back. A service worker sees every request from the page, including MapLibre's worker, the `HEAD` probes and the `notes/*.html` iframes.

- **`vite.config.js`:** add a plugin (`closeBundle`, Design Studio build only, i.e. `BASE !== '/'`) that:
  - gzips (level 9) every `dist/data/**/*.{json,geojson,html}` ≥ 4 KB that shrinks by at least 10%, writing `<file>.gz` next to it;
  - writes `dist/sw.js` with that list embedded.
  - **Keep the raw files.** They're the fallback for the first visit before the worker takes over, and for browsers without service workers (e.g. Firefox private windows).
- **`sw.js`:**
  - On install: `skipWaiting()`. On activate: `clients.claim()`.
  - On fetch: if it's a same-origin `GET` under `BASE + 'data/'` and the path is in the list, fetch `path + '.gz'` and return `new Response(res.body.pipeThrough(new DecompressionStream('gzip')), { headers: { 'Content-Type': <by extension> } })`.
  - Otherwise, or if the `.gz` fetch fails, fall back to `fetch(event.request)`.
  - `HEAD` requests pass straight through.
- **`src/main.jsx`:** `if (import.meta.env.PROD && import.meta.env.BASE_URL !== '/' && 'serviceWorker' in navigator) navigator.serviceWorker.register(appPath('sw.js'), { scope: import.meta.env.BASE_URL })`.
- **No change needed** in `dataCache.js`, `dataGuard.js` or the MapLibre `setData(url)` calls; the service worker is transparent to all of them.
- **Expected effect:** Europe region page data goes from ~30 MB to ~2.5 MB; ~17 s becomes ~1.5–2 s on the internal site. Repeat visits use the browser cache as before.

### 2. Country pages: load the country, not the whole region

`CountryPage.jsx:268–272` fetches the whole region's `region_plants/lines/substations/admin1_<region>.geojson` and filters to one country.
- In `tools/`, write per-country files (e.g. `cache/country_plants_<ISO>.geojson`, `country_lines_<ISO>.geojson`, `country_substations_<ISO>.geojson`) and switch `CountryPage` to them, keeping the region file as a fallback where a country file is missing.
- Also check `ZoningTab.jsx:79–81`, which loads the same region files.
- Item 1 already cuts most of the bytes; this saves the rest (and parse time) for big regions.

### 3. ~~Use PMTiles for lines~~: dropped

They're no longer in `main`.

### 4. Hash routing: already done

### 5. Pre-compress JS/CSS: skipped for now (the user's decision)

### 6. Trim the deployment

- Remove the `iisConfig()` plugin (`web.config`) from `vite.config.js`. The server is Apache, not IIS, so it's ignored.
- Fonts: `@fontsource/open-sans/{400,500,600,700}.css` emits 9 subsets × 2 formats (~144 files). Import only the subsets the UI needs (e.g. `latin`, `latin-ext`) and drop the `.woff` fallbacks, which modern browsers don't use. That's fewer files, which matters because every release step copies files one at a time.
- Check `public/fonts/` and `public/vendor/chart.js` for duplicates of bundled assets.

## Check after building

- `npm run lint` and `npm run build`. Then confirm `dist/sw.js` exists, `dist/data/cache/region_lines_eu.geojson.gz` is ~1.8 MB, and the raw file is still there.
- `npm run preview` → DevTools → Application → Service Workers shows it active. Then on the Network tab, a region page should show `.gz` requests answered by the service worker.
- Deploy to the internal site first (`gsdpublish-deploy-dev`, folder `regional-power-explorer\` at the share root) and compare load times with the numbers above.
