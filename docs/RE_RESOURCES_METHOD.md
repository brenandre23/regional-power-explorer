# Renewable resources: method

How the explorer's country solar and wind figures are made. They appear in the
country page's RE tab and in the AI assistant (`data__re_resources`), both
read from `public/data/re/<ISO3>.json`. `tools/prepare_re.py` writes these files.

## Why it changed (October 2026)

The RE tab used to ask two outside services, from each visitor's browser, about
**one point**: the middle of the country's bounding box.

- For 46 of 179 countries that point lies outside the country. It lands in
  France for the United States (whose box spans the 180° meridian), in the
  Atlantic for Fiji, near Salzburg for the United Kingdom (the Cyprus bases
  stretch its box), and in the Pacific for Chile (Easter Island). On land, the
  tab showed another country's figures without saying so. At sea, it showed
  nothing.
- Even inside the country, one ~250 m solar cell or one ~28 km wind cell
  stood in for the whole country.
- The wind query asked Open-Meteo for a `monthly` series it does not offer. It
  failed every time, so the wind section never showed.
- Every page view sent the visitor's browser to Solargis and Open-Meteo,
  against the Design Studio rule that no visitor data goes to a third party.

The figures are now computed once, over the whole country, and published with
the app.

## What each figure is

All figures describe the **whole country**: every cell inside it, each weighted
by its area. They are not limited to land where a plant could be built (no
exclusion of protected areas, slopes, cities or water). For each figure the file
gives the **mean**, the **median**, **p10** and **p90**. p90 is shown as
"best 10%": the value the best tenth of the country reaches or exceeds.

### Solar: Global Solar Atlas country statistics

- **Source:** Global Solar Atlas (ESMAP / World Bank, data by Solargis,
  CC BY 4.0). The atlas computes these statistics itself, over every ~250 m
  cell in the country, and publishes them at
  `api.globalsolaratlas.info/country/<code>`. Kenya has 681,699 cells.
- **Figures:** GHI and DNI (kWh/m²/yr) and PV output, PVOUT (kWh/kWp/yr).
  The atlas publishes daily totals; the file has yearly ones (× 365).
- **PV capacity factor** = PVOUT × 365 / 8760, from the mean.
- **Also kept:** the optimal panel tilt and the mean air temperature.
- **Gaps:** the atlas stops at 60°N, so Finland and Iceland have no solar
  figures. The tab and the assistant say so.
- **Boundaries:** these statistics use the atlas's own country outlines, which
  can differ slightly from the World Bank's. The statistics are dated 2020;
  the atlas's point service has since been updated (data to 2025), so country
  figures may differ from today's point values by a few percent.

### Wind: Global Wind Atlas v4

- **Source:** Global Wind Atlas v4 (DTU / ESMAP, CC BY 4.0). The country
  rasters are ~250 m cells, 100 m above ground.
- **Figures:** mean wind speed (m/s), power density (W/m²), and the capacity
  factor of an IEC class 2 turbine (%).
- **How it is averaged:**
  1. The script reads each country raster directly from the atlas's file
     server, at a reduced overview level so that at most ~4 million cells are
     read. That gives cells of about 0.8 km (Kenya) to 8 km (the United
     States). At that scale the averaging changes country averages very
     little.
  2. It keeps only cells inside the **World Bank country outline**
     (`public/data/geo/country/`).
  3. It weights each cell by cos(latitude), its relative area on a
     longitude/latitude grid, and computes the mean, median and percentiles.
- **Capacity factor caveat:** it is modelled for one turbine type at every
  location, including places nobody would build. Real fleet averages are
  usually lower; the UK comes out at 47%. The tab and the assistant both say so.

### Monthly profiles: NASA POWER, shape only

- **Source:** NASA POWER climatology: solar `ALLSKY_SFC_SW_DWN` and wind
  `WS50M` (50 m), with cells of 0.5–1°.
- **Points:** up to 12 per country, spread over its area. The outline is laid
  on a 0.5° grid, and cells inside it are picked evenly, so a region holding
  a fifth of the country gets about a fifth of the points. Small countries
  fall back to finer grids (0.1°, 0.02°, 0.005°), so the smallest islands get
  a single point (Tuvalu).
- **Scaling:** the points' monthly values are averaged. **Only the seasonal
  shape is kept**: the profile is scaled so that its 12-month mean equals the
  atlas's annual figure (GHI from the solar atlas, 100 m wind speed from the
  wind atlas). So the monthly wind chart is NASA POWER's 50 m seasonality at
  the wind atlas's 100 m level.
- **Without solar statistics** (Finland, Iceland), there is no monthly solar
  curve either, because there is nothing to scale it to.

## The file

```text
public/data/re/<ISO3>.json
  iso, scope
  solar    source, updated, ghi/dni/pvout {mean, median, p10, p90},
           units, pvCapacityFactorPct, optimalTiltDeg, meanTempC     (or null)
  wind     source, speed/powerDensity/capacityFactorPct {mean, median, p10, p90},
           units, cellKm                                             (or null)
  monthly  source, points, ghiDaily[12], windSpeed100m[12]           (or null)
```

## Rebuilding

These are long-term averages. They change only when the atlases publish new
versions, about once a year at most. To rebuild:

```bash
pip install rasterio numpy
rm -rf data-source/cache/re
python tools/prepare_re.py            # all countries, ~30 minutes
python tools/prepare_re.py KEN GHA    # or just some
```

Every download is cached in `data-source/cache/re/` (git-ignored), so an
interrupted run resumes where it stopped. Delete the cache to fetch new source
versions. Check the git diff of `public/data/re/` before committing: a new atlas
version shows up there as changed numbers.

## Not included (possible next steps)

- **Practical potential:** averages over buildable land only, excluding
  protected areas, steep slopes, cities and water, as ESMAP reports it.
- **Provinces:** Global Solar Atlas also publishes statistics per admin-1
  region (47 for Kenya).
- **Year-to-year variability:** a separate time series (for example ERA5),
  for questions such as "how weak was the 2021 wind year?".
