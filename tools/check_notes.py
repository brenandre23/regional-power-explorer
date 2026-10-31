"""
Compare the headline figures in the country briefing notes with the explorer's data.

The notes (public/data/notes/<ISO3>.html) were drafted with AI assistance and
are not fact-checked. Each opens with a row of headline figures (the "kpi"
boxes). This script reads the ones it can compare (generation, installed
capacity and electricity access) and checks them against supply/<ISO3>.json
and access.json for the same year where the note gives one, else the latest.

It changes nothing. It writes docs/NOTES_QA.md: every compared figure, and
those that differ by more than 15%, for whoever maintains the notes to correct
or explain. Rerun after the notes or the data change:
    python tools/check_notes.py
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
REPORT = ROOT / "docs" / "NOTES_QA.md"
THRESHOLD = 0.15
KPI = re.compile(r'<div class="kpi-val">(.*?)</div>\s*<div class="kpi-lbl">(.*?)</div>', re.S)
# Labels that name something other than the national total: part of the
# population or the fleet, one fuel, another scope or a derated figure.
SKIP = ("rural", "urban", "target", "cooking", "pre-war", "with imports", "storage", "reservoir",
        "pipeline", "planned", "peak", "share", "export", "import", "demand", "per capita",
        "solar", "wind", "hydro", "coal", "gas", "geotherm", "nuclear", "renewable", "thermal",
        "effective", "available", "remaining", "firm", "dependable", "domestic", "grid-connected")


def text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def number(value):
    """The first number in a figure such as '~3.4 GW', '3 447 GWh' or '40,334 MW'."""
    v = re.sub(r"(?<=\d)[\s   ,](?=\d{3}\b)", "", value)
    m = re.search(r"\d+(?:\.\d+)?", v)
    return float(m.group()) if m else None


def series_total(block, year):
    """Total of a supply block for a year (pumped storage left out), or None."""
    if not block or year not in block["years"]:
        return None
    i = block["years"].index(year)
    vals = [s[i] for f, s in block["fuels"].items() if f != "Hydro Pumped Storage" and s[i] is not None]
    return sum(vals) if vals else None


def compare(iso, value, label, supply, access):
    """(measure, year, note figure, data figure, data source) or None."""
    low, unit = label.lower(), value.lower()
    if any(w in low for w in SKIP):
        return None
    x = number(value)
    if x is None:
        return None
    m = re.search(r"20\d\d", label)
    asked = int(m.group()) if m else None
    if "generation" in low and ("twh" in unit or "gwh" in unit):
        block, measure, scale = supply.get("generation"), "Generation (GWh)", 1000 if "twh" in unit else 1
    elif "capacity" in low and ("gw" in unit or "mw" in unit):
        block, measure, scale = supply.get("capacity"), "Installed capacity (MW)", 1000 if "gw" in unit else 1
    elif ("electrification" in low or "access" in low) and "%" in value:
        a = access.get(iso)
        return a and ("Electricity access (%)", a.get("year"), x, a["total"], "World Bank WDI / SE4All")
    else:
        return None
    if not block:
        return None
    year = asked if asked in block["years"] else block["years"][-1]
    total = series_total(block, year)
    return total and (measure, year, x * scale, round(total), block["source"].split("(")[0].strip())


def main():
    access = json.loads((DATA / "access.json").read_text(encoding="utf-8"))["countries"]
    rows = []
    for path in sorted((DATA / "notes").glob("*.html")):
        iso = path.stem
        sp = DATA / "supply" / f"{iso}.json"
        supply = json.loads(sp.read_text(encoding="utf-8")) if sp.exists() else {}
        for value, label in KPI.findall(path.read_text(encoding="utf-8")):
            value, label = text(value), text(label)
            c = compare(iso, value, label, supply, access)
            if c:
                rows.append((iso, value, label, *c))

    def off(r):
        return abs(r[5] - r[6]) / r[6] if r[6] else 0

    flagged = sorted((r for r in rows if off(r) > THRESHOLD), key=lambda r: (r[3], -off(r)))
    lines = [
        "# Briefing notes QA",
        "",
        "Written by `tools/check_notes.py`; do not edit by hand. The briefing notes were drafted",
        "with AI assistance and are not fact-checked. Their headline figures for generation,",
        "installed capacity and electricity access are compared here with the explorer's data,",
        "for the year the note names, else the data's latest year.",
        "",
        "Reasons a figure differs, and what to do:",
        "",
        "- **The note is wrong or out of date.** Correct the note.",
        "- **Different definition.** Notes often give grid-connection rates, while the explorer",
        "  uses World Bank WDI access, which counts off-grid solar. Say which in the note.",
        "- **Different scope or year** (pre-war, \"with imports\", a 2025 estimate). Name it in the",
        "  label; labels with such words are skipped here.",
        "",
        "## Summary",
        "",
        "| Measure | Compared | Within 15% | Differ by more |",
        "|---|---|---|---|",
    ]
    for measure in ("Generation (GWh)", "Installed capacity (MW)", "Electricity access (%)"):
        m = [r for r in rows if r[3] == measure]
        bad = sum(1 for r in m if off(r) > THRESHOLD)
        lines.append(f"| {measure} | {len(m)} | {len(m) - bad} | {bad} |")
    lines += ["", "## Figures that differ by more than 15%", "",
              "| Country | Note says | Note label | Measure | Year | Explorer data | Data source | Difference |",
              "|---|---|---|---|---|---|---|---|"]
    for r in flagged:
        lines.append(f"| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[6]:,} | {r[7]} | {(r[5] - r[6]) / r[6]:+.0%} |")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(rows)} figures compared, {len(flagged)} differ by more than {THRESHOLD:.0%} -> {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
