"""
Country renewable-resource figures for the RE Resources tab and the AI assistant.
The method, its caveats and how to rebuild are in docs/RE_RESOURCES_METHOD.md.

The tab used to ask Global Solar Atlas and Open-Meteo, from each visitor's
browser, about one point: the middle of the country's bounding box. For 46 of
179 countries that point is outside the country (the United States' is in
France), and the wind query had stopped working. This script computes country
figures once, over the whole country.

Sources:
    Solar   Global Solar Atlas country statistics (ESMAP / Solargis, CC BY 4.0):
            mean, median and percentiles over every ~250 m cell in the country.
            None above 60°N (Finland, Iceland): the atlas stops there.
    Wind    Global Wind Atlas v4 country rasters at 100 m (DTU / ESMAP, CC BY 4.0),
            read at a reduced overview level, masked to the World Bank country
            outline in public/data/geo/country/ and weighted by cell area.
    Monthly NASA POWER climatology (solar ALLSKY_SFC_SW_DWN, wind WS50M) at up
            to 12 points inside the outline. Only the shape is used: each
            profile is scaled so its mean equals the annual figure above.

Outputs (public/data/re/):
    <ISO3>.json   solar, wind and monthly blocks; see build() for the fields.

Downloads are cached in data-source/cache/re/ (git-ignored), so a rerun after an
interruption picks up where it stopped. Delete that folder to refresh from the
sources, about once a year when they publish new versions:
    pip install rasterio numpy
    python tools/prepare_re.py [ISO3 ...]
"""
import json
import math
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.transform import from_origin

ROOT = Path(__file__).resolve().parents[1]
GEO = ROOT / "public" / "data" / "geo" / "country"
OUT = ROOT / "public" / "data" / "re"
CACHE = ROOT / "data-source" / "cache" / "re"

GSA_API = "https://api.globalsolaratlas.info/country/"
GWA_TIF = "https://gwa.cdn.nazkamapps.com/country_tifs_v4/{code}_{layer}.tif"
POWER_API = ("https://power.larc.nasa.gov/api/temporal/climatology/point"
             "?parameters=ALLSKY_SFC_SW_DWN,WS50M&community=RE&format=JSON&latitude={lat}&longitude={lon}")
# Where the sources' codes differ from the World Bank ones.
GSA_CODES = {"KOS": "XKO"}
GWA_CODES = {"KOS": "XKX"}
GWA_LAYERS = {"speed": "wind-speed_100m", "powerDensity": "power-density_100m", "capacityFactor": "capacity-factor_IEC2"}
MAX_PIXELS = 4e6   # cells read per raster; picks the overview level
MONTH_POINTS = 12
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def get_json(url, cache_name, tries=4):
    """A JSON response, cached on disk; None for a 404."""
    path = CACHE / cache_name
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                data = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                data = None
                break
            if attempt == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == tries - 1:
                raise
        time.sleep(2 ** (attempt + 1))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")
    return data


def outline(iso):
    """The country's World Bank outline as a GeoJSON MultiPolygon."""
    topo = json.loads((GEO / f"{iso}.topo.json").read_text(encoding="utf-8"))
    (sx, sy), (tx, ty) = topo["transform"]["scale"], topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x, y = x + dx, y + dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(refs):
        pts = []
        for r in refs:
            a = arcs[r] if r >= 0 else arcs[~r][::-1]
            pts += a if not pts else a[1:]
        return pts

    polys = []
    for g in topo["objects"]["features"]["geometries"]:
        rings = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"] if g["type"] == "MultiPolygon" else []
        polys += [[ring(r) for r in p] for p in rings]
    return {"type": "MultiPolygon", "coordinates": polys}


def sample_points(geom):
    """Up to MONTH_POINTS cell centres inside the outline, spread over its area."""
    xs = [x for p in geom["coordinates"] for x, _ in p[0]]
    ys = [y for p in geom["coordinates"] for _, y in p[0]]
    west, north = math.floor(min(xs)), math.ceil(max(ys))
    for step in (0.5, 0.1, 0.02, 0.005):
        shape = (max(1, math.ceil((north - min(ys)) / step)), max(1, math.ceil((max(xs) - west) / step)))
        inside = ~geometry_mask([geom], shape, from_origin(west, north, step, step))
        rows, cols = np.nonzero(inside)
        if len(rows):
            idx = sorted(set(np.linspace(0, len(rows) - 1, min(MONTH_POINTS, len(rows))).round().astype(int)))
            return [(west + (cols[i] + 0.5) * step, north - (rows[i] + 0.5) * step) for i in idx]
    # A sliver too thin for any grid: the vertex average of the largest ring.
    big = max((p[0] for p in geom["coordinates"]), key=len)
    return [(sum(x for x, _ in big) / len(big), sum(y for _, y in big) / len(big))]


def stats(values, weights):
    order = np.argsort(values)
    v, w = values[order], weights[order]
    cum = np.cumsum(w) / w.sum()
    pct = lambda q: float(v[min(np.searchsorted(cum, q), len(v) - 1)])
    return {"mean": float(np.average(v, weights=w)), "median": pct(0.5), "p10": pct(0.1), "p90": pct(0.9)}


def wind(iso, geom):
    """Area-weighted Global Wind Atlas statistics inside the outline, or None."""
    cache = CACHE / f"gwa_{iso}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    code = GWA_CODES.get(iso, iso)
    out = {}
    env = rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                       GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2")
    with env:
        for key, layer in GWA_LAYERS.items():
            try:
                src = rasterio.open("/vsicurl/" + GWA_TIF.format(code=code, layer=layer))
            except rasterio.errors.RasterioIOError:
                return None
            with src:
                factor = max(1, math.ceil(math.sqrt(src.width * src.height / MAX_PIXELS)))
                shape = (max(1, src.height // factor), max(1, src.width // factor))
                data = src.read(1, out_shape=shape, resampling=Resampling.average).astype("float64")
                transform = src.transform * src.transform.scale(src.width / shape[1], src.height / shape[0])
                keep = ~geometry_mask([geom], shape, transform) & np.isfinite(data)
                if src.nodata is not None and np.isfinite(src.nodata):
                    keep &= data != src.nodata
                if not keep.any():
                    return None
                lats = transform.f + transform.e * (np.arange(shape[0]) + 0.5)
                weights = np.broadcast_to(np.cos(np.radians(lats))[:, None], shape)
                out[key] = stats(data[keep], weights[keep])
                out["cellKm"] = round(abs(transform.a) * 111.32, 2)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(out), encoding="utf-8")
    return out


def monthly(iso, geom):
    """Mean NASA POWER monthly climatology over points inside the outline."""
    ghi, ws = [], []
    points = sample_points(geom)
    for lon, lat in points:
        lon, lat = round(lon, 3), round(lat, 3)
        d = get_json(POWER_API.format(lat=lat, lon=lon), f"power_{lat}_{lon}.json")
        p = (d or {}).get("properties", {}).get("parameter", {})
        if p.get("ALLSKY_SFC_SW_DWN") and p.get("WS50M"):
            ghi.append([p["ALLSKY_SFC_SW_DWN"][m] for m in MONTHS])
            ws.append([p["WS50M"][m] for m in MONTHS])
    if not ghi:
        return None
    clean = lambda rows: [float(np.mean([r[i] for r in rows if r[i] is not None and r[i] > -900])) for i in range(12)]
    return len(ghi), clean(ghi), clean(ws)


def shape_to(profile, annual_mean):
    """Scale a monthly profile so its mean is annual_mean."""
    if not profile or annual_mean is None:
        return None
    k = annual_mean / (sum(profile) / 12)
    return [round(v * k, 2) for v in profile]


def build(iso):
    geom = outline(iso)
    gsa = get_json(GSA_API + GSA_CODES.get(iso, iso), f"gsa_{iso}.json")
    s = ((gsa or {}).get("dataset") or {}).get("solar")
    solar = None
    if s and s.get("data", {}).get("PVOUT_mean") is not None:
        d = s["data"]
        # The atlas gives daily totals; the tab and analysts use yearly ones.
        annual = lambda k: {q: round(d[f"{k}_{q}"] * 365) for q in ("mean", "median", "p10", "p90")}
        solar = {
            "source": "Global Solar Atlas country statistics (ESMAP / Solargis, CC BY 4.0)",
            "updated": time.strftime("%Y-%m-%d", time.gmtime(s["metadata"]["ts"] / 1000)),
            "ghi": annual("GHI"), "dni": annual("DNI"), "pvout": annual("PVOUT"),
            "units": {"ghi": "kWh/m²/yr", "dni": "kWh/m²/yr", "pvout": "kWh/kWp/yr"},
            "pvCapacityFactorPct": round(d["PVOUT_mean"] * 365 / 8760 * 100, 1),
            "optimalTiltDeg": d.get("OPTA_median"),
            "meanTempC": round(d["TEMP_mean"], 1) if d.get("TEMP_mean") is not None else None,
            "ghiDailyMean": d["GHI_mean"],
        }

    w = wind(iso, geom)
    wind_block = None
    if w:
        r = lambda st, k=1: {q: round(v, k) for q, v in st.items()}
        wind_block = {
            "source": "Global Wind Atlas v4 (DTU / ESMAP, CC BY 4.0), 100 m above ground",
            "speed": r(w["speed"]), "powerDensity": r(w["powerDensity"], 0),
            "capacityFactorPct": {q: round(v * 100, 1) for q, v in w["capacityFactor"].items()},
            "units": {"speed": "m/s", "powerDensity": "W/m²", "capacityFactorPct": "% (IEC class 2 turbine)"},
            "cellKm": w["cellKm"],
        }

    m = monthly(iso, geom)
    months = None
    if m:
        n, ghi, ws = m
        months = {
            "source": "NASA POWER climatology (ALLSKY_SFC_SW_DWN, WS50M); shape only, scaled to the annual figures",
            "points": n,
            "ghiDaily": shape_to(ghi, solar and solar.pop("ghiDailyMean")),
            "windSpeed100m": shape_to(ws, wind_block and wind_block["speed"]["mean"]),
        }
    if solar:
        solar.pop("ghiDailyMean", None)
    return {
        "iso": iso,
        "scope": "Whole country: every cell inside the outline, weighted by area. Not limited to land suitable for plants.",
        "solar": solar, "wind": wind_block, "monthly": months,
    }


def main():
    isos = sys.argv[1:] or sorted(p.name[:3] for p in GEO.glob("*.topo.json"))
    OUT.mkdir(parents=True, exist_ok=True)
    for iso in isos:
        out = build(iso)
        (OUT / f"{iso}.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        s, w = out["solar"], out["wind"]
        print(f"{iso}: PVOUT {s and s['pvout']['mean']} kWh/kWp/yr, wind {w and w['speed']['mean']} m/s, "
              f"monthly points {out['monthly'] and out['monthly']['points']}", flush=True)


if __name__ == "__main__":
    main()
