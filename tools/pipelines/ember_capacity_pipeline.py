"""
Ember capacity pipeline.

Downloads the Ember Yearly Electricity Data long-format CSV and adds a
`capacity` section (installed capacity in MW) to existing supply JSONs that
currently only have a `generation` section.

Source:
  Ember — Yearly Electricity Data
  https://ember-energy.org/data/yearly-electricity-data/

Cache:
  data-source/raw/EMBER/yearly_full_release_long_format.csv  (gitignored)

Usage:
  python tools/pipelines/ember_capacity_pipeline.py
  python tools/pipelines/ember_capacity_pipeline.py --refresh   # force re-download
  python tools/pipelines/ember_capacity_pipeline.py KAZ UZB     # specific countries
  python tools/pipelines/ember_capacity_pipeline.py --overwrite  # re-add even if cap exists
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
import requests

ROOT       = Path(__file__).resolve().parents[2]
CACHE_DIR  = ROOT / 'data-source' / 'raw' / 'EMBER'
CACHE_FILE = CACHE_DIR / 'yearly_full_release_long_format.csv'
OUT_SUPPLY = ROOT / 'public' / 'data' / 'supply'

EMBER_URL = (
    'https://files.ember-energy.org/public-downloads/'
    'yearly_full_release_long_format.csv'
)

# Years to include in capacity output (must match generation years)
YEARS = list(range(2015, 2024))  # 2015-2023

# Individual fuel variables to include (skip aggregates like "Clean", "Fossil", etc.)
EMBER_FUEL_MAP: dict[str, str] = {
    'Coal':             'Coal',
    'Gas':              'Gas',
    'Other Fossil':     'Oil & Other Fossil',  # Ember: oil, diesel and other fossil fuels
    'Nuclear':          'Nuclear',
    'Hydro':            'Hydro',
    'Solar':            'Solar',
    'Wind':             'Wind',
    'Bioenergy':        'Bioenergy',
    'Other Renewables': 'Other Renewables',
}


def load_ember_csv(refresh: bool = False) -> pd.DataFrame:
    """The whole Ember long-format CSV, downloaded once and cached."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if not CACHE_FILE.exists() or refresh:
        print('  Downloading Ember yearly electricity data (~50 MB)...')
        r = requests.get(EMBER_URL, timeout=180)
        r.raise_for_status()
        CACHE_FILE.write_bytes(r.content)
        print(f'  Cached -> {CACHE_FILE}')
    return pd.read_csv(CACHE_FILE, low_memory=False)


def _load_ember(refresh: bool = False) -> pd.DataFrame:
    df = load_ember_csv(refresh)
    # Keep only capacity rows for individual fuel types
    cap = df[
        (df['Category'] == 'Capacity') &
        (df['Variable'].isin(EMBER_FUEL_MAP))
    ].copy()
    cap['Year'] = pd.to_numeric(cap['Year'], errors='coerce').astype('Int64')
    cap = cap[cap['Year'].isin(YEARS)]
    return cap


def _build_capacity(cap_df: pd.DataFrame, iso3: str) -> dict | None:
    sub = cap_df[cap_df['ISO 3 code'] == iso3]
    if sub.empty:
        return None

    fuels: dict[str, list[float | None]] = {}
    for ember_var, label in EMBER_FUEL_MAP.items():
        rows = sub[sub['Variable'] == ember_var].set_index('Year')
        vals = []
        has_data = False
        for yr in YEARS:
            if yr in rows.index:
                v = rows.loc[yr, 'Value']
                try:
                    f = float(v)
                    if f != f or f < 0:  # NaN or negative
                        vals.append(None)
                    else:
                        vals.append(round(f * 1000, 1))  # GW → MW
                        has_data = True
                except (TypeError, ValueError):
                    vals.append(None)
            else:
                vals.append(None)
        if has_data:
            fuels[label] = vals

    if not fuels:
        return None

    return {
        'source': (
            'Ember — Yearly Electricity Data '
            '(ember-energy.org, CC BY 4.0)'
        ),
        'unit': 'MW',
        'years': YEARS,
        'fuels': fuels,
    }


def run(
    countries: list[str] | None = None,
    refresh: bool = False,
    overwrite: bool = False,
) -> None:
    """
    Add capacity sections to gen-only supply JSONs using Ember data.

    Args:
        countries: ISO3 list to process — defaults to all gen-only supply JSONs
        refresh:   force re-download of Ember CSV
        overwrite: re-add capacity even if a capacity section already exists
    """
    OUT_SUPPLY.mkdir(parents=True, exist_ok=True)
    cap_df = _load_ember(refresh)
    print(f'  Ember capacity data loaded: {len(cap_df)} rows')

    # Determine which supply JSONs to process
    if countries is None:
        targets = sorted(OUT_SUPPLY.glob('*.json'))
    else:
        targets = [OUT_SUPPLY / f'{iso3}.json' for iso3 in countries]

    updated = 0
    skipped = 0
    missing = 0

    for path in targets:
        iso3 = path.stem
        if not path.exists():
            print(f'  [{iso3}] supply JSON not found — skipping')
            missing += 1
            continue

        supply = json.loads(path.read_text(encoding='utf-8'))

        if 'capacity' in supply and not overwrite:
            skipped += 1
            continue

        if 'generation' not in supply:
            print(f'  [{iso3}] no generation section — skipping')
            skipped += 1
            continue

        cap = _build_capacity(cap_df, iso3)
        if cap is None:
            print(f'  [{iso3}] no Ember capacity data')
            missing += 1
            continue

        supply['capacity'] = cap
        path.write_text(
            json.dumps(supply, indent=2, ensure_ascii=False, allow_nan=False),
            encoding='utf-8',
        )
        n_fuels = len(cap['fuels'])
        print(f'  [{iso3}] capacity added — {n_fuels} fuels')
        updated += 1

    print(f'\n  Done: {updated} updated, {skipped} skipped (already have cap), {missing} no Ember data')


if __name__ == '__main__':
    args = sys.argv[1:]
    refresh   = '--refresh'   in args
    overwrite = '--overwrite' in args
    iso3_filter = [a for a in args if not a.startswith('--')]

    print('=== Ember capacity pipeline ===')
    run(countries=iso3_filter or None, refresh=refresh, overwrite=overwrite)
    print()
    print('Done.')
