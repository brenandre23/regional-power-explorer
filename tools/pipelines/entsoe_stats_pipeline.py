"""
ENTSO-E generation by detailed fuel, from ENTSO-E's harmonised statistics.

Source: "Monthly domestic values" (entsoe.eu/data/power-stats): monthly net
generation by production type and country, in GWh, published per year. Unlike
the Transparency Platform pull in entsoe_supply_pipeline.py, it covers each
country as a whole (no price-zone stand-ins) and needs no conversion from
15-minute or hourly values, so neither of that pipeline's known problems
applies (docs/TRADE_AUDIT.md).

Writes the `generation` block of public/data/entsoe/<ISO3>.json, keeping any
`capacity` block already there. The AI assistant's fuel_detail tool reads it for
the split within a fuel (hydro run-of-river, reservoir and pumped storage;
lignite and hard coal; onshore and offshore wind). Totals are grid-metered and
run below national statistics, so the explorer's supply series stay on Ember
(public/data/methodology.md).

Only country-years with all 12 months are kept. Downloads are cached in
data-source/raw/ENTSOE_STATS/.
    python tools/pipelines/entsoe_stats_pipeline.py
"""
import json
import sys
import urllib.request
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from entsoe_supply_pipeline import COUNTRIES, FUEL_MAP  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'data-source' / 'raw' / 'ENTSOE_STATS'
OUT = ROOT / 'public' / 'data' / 'entsoe'
URL = 'https://www.entsoe.eu/publications/data/power-stats/{y}/monthly_domestic_values_{y}.csv'
YEARS = range(2019, 2026)
SOURCE = "ENTSO-E harmonised statistics — monthly domestic values (net generation), summed by year"


def load(year):
    path = RAW / f'mdv_{year}.csv'
    if not path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(URL.format(y=year), headers={'User-Agent': 'regional-power-explorer pipeline'})
        path.write_bytes(urllib.request.urlopen(req, timeout=180).read())
    # Separator and the country column's name change between years.
    d = pd.read_csv(path, sep=None, engine='python', encoding='utf-8-sig').rename(columns={'Country': 'Area'})
    return d[~d.Category.str.startswith('Consumption')]


def main():
    by_country = {}  # iso2 -> {year: {fuel: GWh}}
    for year in YEARS:
        d = load(year)
        d = d[d.Category.map(FUEL_MAP).notna()]
        months = d.groupby('Area').Month.nunique()
        for area, rows in d[d.Area.isin(months[months == 12].index)].groupby('Area'):
            sums = rows.assign(fuel=rows.Category.map(FUEL_MAP)).groupby('fuel').ProvidedValue.sum()
            by_country.setdefault(area, {})[year] = {f: round(float(v), 1) for f, v in sums.items() if v > 0}

    written = 0
    for iso2, (iso3, name) in COUNTRIES.items():
        years = sorted(by_country.get(iso2, {}))
        if not years:
            continue
        data = by_country[iso2]
        fuels = sorted({f for y in years for f in data[y]}, key=lambda f: -sum(data[y].get(f, 0) for y in years))
        path = OUT / f'{iso3}.json'
        out = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'country': name}
        out['generation'] = {
            'source': SOURCE, 'unit': 'GWh', 'years': years,
            # A fuel absent from a year's statistics is left empty, not 0.
            'fuels': {f: [data[y].get(f) for y in years] for f in fuels},
        }
        OUT.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding='utf-8')
        written += 1
    print(f'entsoe/: generation for {written} countries, {min(YEARS)}-{max(YEARS)}')


if __name__ == '__main__':
    main()
