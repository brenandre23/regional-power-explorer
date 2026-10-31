"""
Compact files for the AI assistant's data tools (src/chat/dataServer.js).

The assistant reads only small JSON: the region plant and line files are up to
21 MB each and go to MapLibre by URL, so the tools must not download them per
question. This script reads them once and keeps what an analyst asks about.

Outputs (public/data/ai/):
    plants/<ISO3>.json   per plant source ('osm', 'gppd', 'gem'):
                         byStatus  {status: {fuel: [MW, plant count]}}
                         top       the 10 largest plants per status and fuel,
                                   as [name, fuel, MW, status, units]
    grid/<region>.json   lines        count, km and both by voltage class, and
                                      the 15 operators with the most km
                         substations  count, and count by voltage class
    zones/<ISO3>.json    per zone count in zones/index.json: each zone's
                         plants (OSM, as the Zoning tab counts them) and the
                         zone pairs the model connects

Run after any pipeline step that rewrites the region plant, line or zone files:
    python tools/prepare_ai.py
CI (.github/workflows/check-derived-data.yml) fails a pull request whose files
here don't match what this script writes.
"""
import json
import math
import re
import shutil
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "public" / "data"
CACHE = DATA / "cache"
OUT = DATA / "ai"
SOURCES = {"": "osm", "_gppd": "gppd", "_gem": "gem"}
TOP = 10
# Upper bounds in kV; a line or substation with no voltage tag is 'unknown'.
VOLTAGE_CLASSES = [(100, "<100 kV"), (220, "100-219 kV"), (330, "220-329 kV"),
                   (500, "330-499 kV"), (math.inf, ">=500 kV")]


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")


def voltage_class(volts):
    kv = (volts or 0) / 1000
    if kv <= 0:
        return "unknown"
    return next(label for bound, label in VOLTAGE_CLASSES if kv < bound)


def km(coords):
    """Length of a coordinate path in km (haversine)."""
    total = 0.0
    for (x1, y1), (x2, y2) in zip(coords, coords[1:]):
        p1, p2 = math.radians(y1), math.radians(y2)
        a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(x2 - x1) / 2) ** 2
        total += 2 * 6371.0 * math.asin(min(1.0, math.sqrt(a)))
    return total


def paths(geometry):
    if not geometry:
        return []
    if geometry["type"] == "LineString":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiLineString":
        return geometry["coordinates"]
    return []


def polygons(geometry):
    """A geometry's polygons, each a list of rings."""
    if not geometry:
        return []
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    if geometry["type"] == "GeometryCollection":
        return [p for g in geometry["geometries"] for p in polygons(g)]
    return []


def in_ring(x, y, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def in_polygons(x, y, polys):
    return any(in_ring(x, y, rings[0]) and not any(in_ring(x, y, h) for h in rings[1:]) for rings in polys)


def plant_rows(path):
    for f in load(path).get("features", []):
        p = f.get("properties") or {}
        if p.get("country"):
            yield p, (f.get("geometry") or {}).get("coordinates")


def prepare_plants(regions):
    """Every country's plants, from the first region file that lists it."""
    countries = {}  # iso -> {source: [props]}
    for region in regions:
        for suffix, source in SOURCES.items():
            path = CACHE / f"region_plants_{region}{suffix}.geojson"
            if not path.exists():
                continue
            rows = defaultdict(list)
            for p, _ in plant_rows(path):
                rows[p["country"]].append(p)
            for iso, plants in rows.items():
                countries.setdefault(iso, {}).setdefault(source, plants)

    for iso, sources in countries.items():
        out = {}
        for source, plants in sources.items():
            by_status = defaultdict(lambda: defaultdict(lambda: [0.0, 0]))
            groups = defaultdict(list)
            for p in plants:
                status, fuel, mw = p.get("status") or "unknown", p.get("fuel") or "unknown", p.get("mw") or 0
                cell = by_status[status][fuel]
                cell[0] += mw
                cell[1] += 1
                groups[status, fuel].append(p)
            top = []
            for (status, fuel), group in groups.items():
                # GEM lists a plant unit by unit: one row per named plant.
                named = defaultdict(lambda: [0.0, 0])
                for p in group:
                    cell = named[p.get("name") or ""]
                    cell[0] += p.get("mw") or 0
                    cell[1] += 1
                top += [[name, fuel, round(mw, 1), status, units]
                        for name, (mw, units) in sorted(named.items(), key=lambda kv: -kv[1][0])[:TOP]]
            out[source] = {
                "byStatus": {s: {f: [round(mw, 1), n] for f, (mw, n) in fuels.items()} for s, fuels in by_status.items()},
                "top": sorted(top, key=lambda r: r[2], reverse=True),
            }
        write(OUT / "plants" / f"{iso}.json", out)
    return len(countries)


def prepare_grid(region):
    out = {}
    lines = CACHE / f"region_lines_{region}.geojson"
    if lines.exists():
        by_class = defaultdict(lambda: [0, 0.0])
        operators = defaultdict(float)
        count, total = 0, 0.0
        for f in load(lines).get("features", []):
            p = f.get("properties") or {}
            length = sum(km(c) for c in paths(f.get("geometry")))
            cell = by_class[voltage_class(p.get("v"))]
            cell[0] += 1
            cell[1] += length
            if p.get("op"):
                operators[p["op"]] += length
            count += 1
            total += length
        out["lines"] = {
            "count": count, "km": round(total),
            "byVoltage": {c: {"count": n, "km": round(k)} for c, (n, k) in by_class.items()},
            "topOperatorsKm": [[op, round(k)] for op, k in sorted(operators.items(), key=lambda kv: -kv[1])[:15]],
        }
    subs = CACHE / f"region_substations_{region}.geojson"
    if subs.exists():
        by_class = defaultdict(int)
        feats = load(subs).get("features", [])
        for f in feats:
            by_class[voltage_class((f.get("properties") or {}).get("v"))] += 1
        out["substations"] = {"count": len(feats), "byVoltage": dict(by_class)}
    if out:
        write(OUT / "grid" / f"{region}.json", out)


def prepare_zones(regions):
    index = load(DATA / "zones" / "index.json")
    plants = {}  # iso -> [(x, y, fuel, mw)] from the first OSM file that lists it
    for region in regions:
        path = CACHE / f"region_plants_{region}.geojson"
        if not path.exists():
            continue
        rows = defaultdict(list)
        for p, xy in plant_rows(path):
            if xy:
                rows[p["country"]].append((xy[0], xy[1], p.get("fuel") or "unknown", p.get("mw") or 0))
        for iso, r in rows.items():
            plants.setdefault(iso, r)

    for iso, counts in index.items():
        configs = {}
        for n in counts:
            label = f"{iso}_{n}z"
            path = DATA / "zones" / f"{label}_zones.geojson"
            if not path.exists():
                continue
            zones = [(f["properties"]["zone_name"], polygons(f.get("geometry"))) for f in load(path)["features"]]
            stats = {name: {"mw": 0.0, "plants": 0, "byFuelMw": defaultdict(float)} for name, _ in zones}
            for x, y, fuel, mw in plants.get(iso, []):
                name = next((name for name, polys in zones if in_polygons(x, y, polys)), None)
                if name:
                    s = stats[name]
                    s["mw"] += mw
                    s["plants"] += 1
                    s["byFuelMw"][fuel] += mw
            topo = DATA / "zones" / f"{label}_topo.json"
            configs[str(n)] = {
                "zones": {name: {"mw": round(s["mw"], 1), "plants": s["plants"],
                                 "byFuelMw": {f: round(v, 1) for f, v in s["byFuelMw"].items() if v > 0}}
                          for name, s in stats.items()},
                "links": [[t["z"], t["zz"]] for t in (load(topo) if topo.exists() else [])],
            }
        if configs:
            write(OUT / "zones" / f"{iso}.json", configs)


def main():
    # Region order from regions.json, so a country in several regions is read
    # from its main one; then any region file regions.json doesn't name.
    listed = [r["id"] for r in load(DATA / "regions.json")["regions"]]
    # Skip the *_first.geojson first-pass layers prepare_region_summary.py writes.
    found = {m.group(1) for p in CACHE.glob("region_*.geojson")
             if not p.stem.endswith("_first")
             and (m := re.match(r"region_(?:lines|plants|substations)_(.+?)(?:_gppd|_gem)?\.geojson$", p.name))}
    regions = [r for r in listed if r in found] + sorted(found - set(listed))

    # Start empty, so a country or region that is gone leaves no stale file.
    for sub in ("plants", "grid", "zones"):
        shutil.rmtree(OUT / sub, ignore_errors=True)
    print(f"plants: {prepare_plants(regions)} countries")
    for region in regions:
        prepare_grid(region)
    print(f"grid: {len(list((OUT / 'grid').glob('*.json')))} regions")
    prepare_zones(regions)
    print(f"zones: {len(list((OUT / 'zones').glob('*.json')))} countries")


if __name__ == "__main__":
    main()
