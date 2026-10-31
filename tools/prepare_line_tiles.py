"""
Vector tiles for the region transmission lines, so the region page loads the
lines in view instead of a whole file -- Europe's is 21 MB and 110k lines.

Input:   public/data/cache/region_lines_<id>.geojson   (prepare_lines.py)
Outputs (public/data/tiles/):
    region_lines_<id>.pmtiles
        one layer, "lines": each line's geometry, its voltage v (the map's
        colours, filters and slider read it) and its number as the feature id
    region_lines_<id>_attrs.json
        {"keys": [...], "rows": [[...], ...]}: the rest of each line, row n-1
        for line n, which the hover popup and the click card read:
            nm op c f l st oid    as in the GeoJSON (LINE_ATTR_LABELS)
            km                    length of the whole line
            x0 y0 x1 y1           its two ends, which the popup names substations by
        A tile holds only its piece of a line, so length and ends come from
        here. Kept out of the tiles because they made them 4x larger: Europe's
        opening tile was 1.5 MB with every property, 0.34 MB without.

The GeoJSON files stay: downloads, the export, the chat, the zoning tab and
the country page read them.

Needs tippecanoe (2.17 or later for PMTiles). It is used from PATH, or else
from a Docker image built with:
    docker build -t rpe-tippecanoe - <<< $'FROM ubuntu:24.04\\nRUN apt-get update && apt-get install -y --no-install-recommends tippecanoe'

Run after prepare_lines.py and before prepare_region_summary.py, which flags
the regions that have tiles (lines.tiles) for the page:
    python tools/prepare_line_tiles.py [region ...]
"""
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "public" / "data" / "cache"
TILES = ROOT / "public" / "data" / "tiles"
DOCKER_IMAGE = "rpe-tippecanoe"
ATTRS = ("nm", "op", "c", "f", "l", "st", "oid", "km", "x0", "y0", "x1", "y1")
# ~150 m steps, about the lines' own precision (stored to 3 decimals, ~110 m);
# the map overzooms past it. Side by side with zoom 8 the map looks the same
# (checked on Europe up to street level), at 38% less: 26.5 -> 16.4 MB.
MAX_ZOOM = 6


def km(coords):
    """Haversine length, as lineKm() in src/pages/RegionPage.jsx."""
    total = 0.0
    for (lon1, lat1), (lon2, lat2) in zip(coords, coords[1:]):
        dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
        a = (math.sin(dlat / 2) ** 2
             + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
        total += 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return total


def attrs_row(f):
    g = f["geometry"]
    coords = g["coordinates"] if g["type"] == "LineString" else [p for part in g["coordinates"] for p in part]
    p = dict(f.get("properties") or {})
    p["km"] = round(km(coords), 1)
    (p["x0"], p["y0"]), (p["x1"], p["y1"]) = coords[0][:2], coords[-1][:2]
    return [None if p.get(k) == "" else p.get(k) for k in ATTRS]


def tippecanoe(args, workdir):
    """tippecanoe from PATH, else from the Docker image with workdir mounted at /w."""
    if shutil.which("tippecanoe"):
        return subprocess.run(["tippecanoe", *args], cwd=workdir, check=True)
    return subprocess.run(["docker", "run", "--rm", "-v", f"{workdir}:/w", "-w", "/w",
                           DOCKER_IMAGE, "tippecanoe", *args], check=True)


def build(region):
    src = CACHE / f"region_lines_{region}.geojson"
    out = TILES / f"region_lines_{region}.pmtiles"
    attrs = TILES / f"region_lines_{region}_attrs.json"
    feats = [f for f in json.loads(src.read_text(encoding="utf-8"))["features"] if f.get("geometry")]
    TILES.mkdir(parents=True, exist_ok=True)
    attrs.write_text(json.dumps({"keys": ATTRS, "rows": [attrs_row(f) for f in feats]},
                                separators=(",", ":")), encoding="utf-8")
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        with open(tmp / "lines.geojsonl", "w", encoding="utf-8") as fh:
            # Ids from 1: some readers take a feature id of 0 for none.
            for n, f in enumerate(feats, 1):
                v = (f.get("properties") or {}).get("v") or 0
                fh.write(json.dumps({"type": "Feature", "id": n, "geometry": f["geometry"],
                                     "properties": {"v": v}}, separators=(",", ":")) + "\n")
        tippecanoe([
            "-o", "lines.pmtiles", "--force", "--quiet",
            "-l", "lines", "-Z", "0", "-z", str(MAX_ZOOM),
            # Every line at every zoom, as the GeoJSON source drew them: no
            # dropping, no per-tile caps; simplification keeps tiles small.
            "-r1", "--no-feature-limit", "--no-tile-size-limit",
            "-P", "lines.geojsonl",
        ], tmp)
        shutil.copyfile(tmp / "lines.pmtiles", out)
    print(f"{out.name}: {len(feats)} lines, {src.stat().st_size / 1e6:.1f} MB GeoJSON -> "
          f"{out.stat().st_size / 1e6:.1f} MB tiles + {attrs.stat().st_size / 1e6:.1f} MB attributes")


def main():
    regions = sys.argv[1:] or sorted(
        p.name[len("region_lines_"):-len(".geojson")] for p in CACHE.glob("region_lines_*.geojson")
        if not p.name.endswith("_first.geojson"))
    for region in regions:
        build(region)


if __name__ == "__main__":
    main()
