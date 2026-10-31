"""
Small per-region summaries of the map data files, so the region page can hand
the big files straight to MapLibre's worker instead of reading them itself.

The region page used to parse region_lines_<id>.geojson and
region_plants_<id>[_gppd|_gem].geojson on the main thread -- Europe's are 21 MB
and 10 MB -- and then MapLibre copied them again to its worker: about 1.3 s of
frozen page on a desktop, several seconds on a phone. All the page needs from
them up front is what is summarised here; the files themselves now go to the
map by URL, and are read in full only for a download.

Outputs (public/data/cache/):
    region_summary_<id>.json
        lines.voltages   distinct line voltages in volts (0 = untagged), for the
                         slider floor and the voltage legend
        plants.<source>  per plant source present ('osm', 'gppd', 'gem'):
                         count    number of plants
                         fuels    distinct fuel names
                         top_mw   the 151 largest capacities (MW), descending --
                                  enough for adaptiveMinMw() in src/constants.js,
                                  which caps the map at the ~150 largest plants
        lines.tiles      true when public/data/tiles/region_lines_<id>.pmtiles
                         exists (prepare_line_tiles.py); the page then draws
                         the lines from it and needs no lines first pass
        lines.first / plants.<source>.first
                         true when a first-pass file was written (below)

    region_lines_<id>_first.geojson    lines of 220 kV and up
    region_plants_<id>[_gppd|_gem]_first.geojson
                         the plants the map shows at first: those at or above
                         the starting min-MW, which the page takes from OSM
        Only for files over FIRST_PASS_BYTES that the cut makes much smaller
        (Europe's 110-150 kV lines are 2/3 of its 21 MB). The region page draws
        the first-pass file, then swaps in the full one, which stays the file
        that downloads, the chat and the other pages read.

Run after any pipeline step that rewrites the region plant or line files:
    python tools/prepare_region_summary.py
"""
import json
import re
from pathlib import Path

CACHE = Path(__file__).resolve().parents[1] / "public" / "data" / "cache"
TILES = CACHE.parent / "tiles"
SOURCES = {"": "osm", "_gppd": "gppd", "_gem": "gem"}
TOP = 151
FIRST_PASS_BYTES = 5_000_000
FIRST_KV = 220_000
MAX_MARKERS = 150


def adaptive_min_mw(mws):
    """adaptiveMinMw() in src/constants.js, on capacities sorted descending."""
    if len(mws) <= MAX_MARKERS:
        return 0
    kth = mws[MAX_MARKERS - 1]
    step = 25 if kth >= 200 else 10 if kth >= 50 else 5
    return max(0, (kth // step) * step)


def write_first_pass(path, feats, keep):
    """Write path's _first file when it is big and the cut at least halves it."""
    first = path.with_name(path.name.replace(".geojson", "_first.geojson"))
    kept = [f for f in feats if keep(f.get("properties") or {})]
    if path.stat().st_size < FIRST_PASS_BYTES or len(kept) * 2 > len(feats):
        first.unlink(missing_ok=True)
        return False
    first.write_text(json.dumps({"type": "FeatureCollection", "features": kept},
                                separators=(",", ":")), encoding="utf-8")
    print(f"  {first.name}: {len(kept)} of {len(feats)} features, {first.stat().st_size} B")
    return True


def features(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f).get("features", [])


def summarise(region):
    out = {"lines": None, "plants": {}}
    lines = CACHE / f"region_lines_{region}.geojson"
    if lines.exists():
        feats = features(lines)
        volts = {int((f.get("properties") or {}).get("v") or 0) for f in feats}
        out["lines"] = {"voltages": sorted(volts)}
        if (TILES / f"region_lines_{region}.pmtiles").exists():
            out["lines"]["tiles"] = True
            lines.with_name(lines.name.replace(".geojson", "_first.geojson")).unlink(missing_ok=True)
        elif write_first_pass(lines, feats, lambda p: (p.get("v") or 0) >= FIRST_KV):
            out["lines"]["first"] = True
    floor = 0
    for suffix, name in SOURCES.items():
        path = CACHE / f"region_plants_{region}{suffix}.geojson"
        if not path.exists():
            continue
        feats = features(path)
        props = [f.get("properties") or {} for f in feats]
        mws = sorted((p.get("mw") or 0 for p in props if (p.get("mw") or 0) > 0), reverse=True)
        out["plants"][name] = {
            "count": len(feats),
            "fuels": sorted({p["fuel"] for p in props if p.get("fuel")}),
            "top_mw": mws[:TOP],
        }
        # The page's starting min-MW comes from OSM's capacities whichever
        # source it opens on, so every source's first pass is cut there.
        if name == "osm":
            floor = adaptive_min_mw(mws)
        if floor and write_first_pass(path, feats, lambda p: (p.get("mw") or 0) >= floor):
            out["plants"][name]["first"] = True
    return out


def main():
    regions = sorted({m.group(1) for p in CACHE.glob("region_*.geojson")
                      if not p.name.endswith("_first.geojson")
                      and (m := re.match(r"region_(?:lines|plants)_(.+?)(?:_gppd|_gem)?\.geojson$", p.name))})
    for region in regions:
        summary = summarise(region)
        path = CACHE / f"region_summary_{region}.json"
        path.write_text(json.dumps(summary, separators=(",", ":")), encoding="utf-8")
        print(f"{path.name}: {path.stat().st_size} B, sources {list(summary['plants'])}")


if __name__ == "__main__":
    main()
