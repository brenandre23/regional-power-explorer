"""
Generic OWID/Ember electricity generation pipeline.

Generates public/data/supply/{ISO3}.json for any list of countries using
Our World in Data / Ember yearly electricity data.

Source:
  Our World in Data — Yearly Electricity Data
  github.com/owid/energy-data  (CC BY 4.0)

Cache:
  data-source/raw/OWID/owid_energy.csv  (gitignored — regenerated from OWID)

Usage:
  python tools/pipelines/owid_pipeline.py
  python tools/pipelines/owid_pipeline.py --refresh        # force re-download
  python tools/pipelines/owid_pipeline.py KAZ UZB KGZ     # specific countries
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
import requests

ROOT       = Path(__file__).resolve().parents[2]
OWID_CACHE = ROOT / 'data-source' / 'raw' / 'OWID' / 'owid_energy.csv'
OUT_SUPPLY = ROOT / 'public' / 'data' / 'supply'

OWID_URL = 'https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv'

YEARS = list(range(2015, 2024))  # 2015-2023

# OWID TWh columns → dashboard fuel labels
OWID_FUEL_MAP = {
    'coal_electricity':             'Coal',
    'gas_electricity':              'Gas',
    'hydro_electricity':            'Hydro',
    'nuclear_electricity':          'Nuclear',
    'solar_electricity':            'Solar',
    'wind_electricity':             'Wind',
    'oil_electricity':              'Oil',
    'biofuel_electricity':          'Bioenergy',
    # Not other_renewable_electricity: that one includes bioenergy, which is
    # already counted above, so bioenergy came out twice.
    'other_renewable_exc_biofuel_electricity': 'Other Renewables',
}

# Countries to process by default — add any ISO3 here
# Maps ISO3 → display name
DEFAULT_COUNTRIES: dict[str, str] = {
    # Central Asia
    'KAZ': 'Kazakhstan',
    'UZB': 'Uzbekistan',
    'KGZ': 'Kyrgyzstan',
    'TJK': 'Tajikistan',
    'TKM': 'Turkmenistan',
    # WAPP
    'SEN': 'Senegal',
    'GMB': 'Gambia',
    'GNB': 'Guinea-Bissau',
    'GIN': 'Guinea',
    'SLE': 'Sierra Leone',
    'LBR': 'Liberia',
    'CIV': "Cote d'Ivoire",
    'GHA': 'Ghana',
    'TGO': 'Togo',
    'BEN': 'Benin',
    'NGA': 'Nigeria',
    'NER': 'Niger',
    'MLI': 'Mali',
    'BFA': 'Burkina Faso',
    'MRT': 'Mauritania',
    'CPV': 'Cape Verde',
    # EAPP
    'EGY': 'Egypt',
    'LBY': 'Libya',
    'SDN': 'Sudan',
    'SSD': 'South Sudan',
    'ETH': 'Ethiopia',
    'DJI': 'Djibouti',
    'KEN': 'Kenya',
    'TZA': 'Tanzania',
    'SOM': 'Somalia',
    'UGA': 'Uganda',
    'RWA': 'Rwanda',
    'BDI': 'Burundi',
    'COD': 'DR Congo',
    # SAPP
    'ZAF': 'South Africa',
    'ZWE': 'Zimbabwe',
    'ZMB': 'Zambia',
    'MOZ': 'Mozambique',
    'NAM': 'Namibia',
    'BWA': 'Botswana',
    'LSO': 'Lesotho',
    'SWZ': 'Eswatini',
    'MWI': 'Malawi',
    'AGO': 'Angola',
    'MDG': 'Madagascar',
    # ASEAN
    'BRN': 'Brunei',
    'KHM': 'Cambodia',
    'IDN': 'Indonesia',
    'LAO': 'Laos',
    'MYS': 'Malaysia',
    'MMR': 'Myanmar',
    'PHL': 'Philippines',
    'SGP': 'Singapore',
    'THA': 'Thailand',
    'VNM': 'Vietnam',
    # SIDS — Caribbean
    'CUB': 'Cuba',
    'HTI': 'Haiti',
    'DOM': 'Dominican Republic',
    'JAM': 'Jamaica',
    'TTO': 'Trinidad and Tobago',
    'BRB': 'Barbados',
    'BHS': 'Bahamas',
    'GRD': 'Grenada',
    'LCA': 'Saint Lucia',
    'VCT': 'Saint Vincent and the Grenadines',
    'DMA': 'Dominica',
    'ATG': 'Antigua and Barbuda',
    'KNA': 'Saint Kitts and Nevis',
    'BLZ': 'Belize',
    'GUY': 'Guyana',
    'SUR': 'Suriname',
    # SIDS — Pacific
    'FJI': 'Fiji',
    'PNG': 'Papua New Guinea',
    'SLB': 'Solomon Islands',
    'VUT': 'Vanuatu',
    'WSM': 'Samoa',
    'TON': 'Tonga',
    'KIR': 'Kiribati',
    'TUV': 'Tuvalu',
    'NRU': 'Nauru',
    'PLW': 'Palau',
    'MHL': 'Marshall Islands',
    'FSM': 'Micronesia (Federated States of)',
    'TLS': 'Timor-Leste',
    # SIDS — AIMS
    'MDV': 'Maldives',
    'COM': 'Comoros',
    'SYC': 'Seychelles',
    'MUS': 'Mauritius',
    'STP': 'Sao Tome and Principe',
    'BHR': 'Bahrain',
    # Pan-Arab
    'DZA': 'Algeria',
    'MAR': 'Morocco',
    'TUN': 'Tunisia',
    'JOR': 'Jordan',
    'LBN': 'Lebanon',
    'SYR': 'Syria',
    'IRQ': 'Iraq',
    'SAU': 'Saudi Arabia',
    'YEM': 'Yemen',
    'OMN': 'Oman',
    'ARE': 'UAE',
    'QAT': 'Qatar',
    'KWT': 'Kuwait',
    'PSE': 'Palestine',
    # CAPP
    'CMR': 'Cameroon',
    'CAF': 'Central African Republic',
    'TCD': 'Chad',
    'COG': 'Republic of Congo',
    'GAB': 'Gabon',
    'GNQ': 'Equatorial Guinea',
    # SIEPAC
    'GTM': 'Guatemala',
    'HND': 'Honduras',
    'SLV': 'El Salvador',
    'NIC': 'Nicaragua',
    'CRI': 'Costa Rica',
    'PAN': 'Panama',
    # South Asia
    'IND': 'India',
    'PAK': 'Pakistan',
    'BGD': 'Bangladesh',
    'LKA': 'Sri Lanka',
    'NPL': 'Nepal',
    'BTN': 'Bhutan',
    'AFG': 'Afghanistan',
    # Southern Cone (MERCOSUR)
    'ARG': 'Argentina',
    'BRA': 'Brazil',
    'CHL': 'Chile',
    'PRY': 'Paraguay',
    'URY': 'Uruguay',
    # Andean Community
    'BOL': 'Bolivia',
    'COL': 'Colombia',
    'ECU': 'Ecuador',
    'PER': 'Peru',
    'VEN': 'Venezuela',
    # ENTSO-E members missing from the list above
    'ISL': 'Iceland',
    'MDA': 'Moldova',
    # North America
    'USA': 'United States',
    'CAN': 'Canada',
    'MEX': 'Mexico',
}


def _load_owid(refresh: bool = False) -> pd.DataFrame:
    OWID_CACHE.parent.mkdir(parents=True, exist_ok=True)
    if not OWID_CACHE.exists() or refresh:
        print('  Downloading OWID energy data...')
        r = requests.get(OWID_URL, timeout=180)
        r.raise_for_status()
        OWID_CACHE.write_bytes(r.content)
        print(f'  Cached -> {OWID_CACHE}')
    return pd.read_csv(OWID_CACHE, low_memory=False)


def _build_supply(df: pd.DataFrame, iso3: str, country_name: str) -> dict | None:
    sub = df[df['iso_code'] == iso3].copy()
    sub['year'] = pd.to_numeric(sub['year'], errors='coerce').astype('Int64')
    sub = sub[sub['year'].isin(YEARS)].sort_values('year')

    if sub.empty:
        print(f'  [{iso3}] no OWID data — skipping')
        return None

    years_out = [int(y) for y in sub['year']]

    fuels: dict[str, list[float]] = {}
    for col, label in OWID_FUEL_MAP.items():
        if col not in sub.columns:
            continue
        vals = [round(float(v) * 1000, 1) if pd.notna(v) else 0.0
                for v in sub[col]]
        if any(v > 0 for v in vals):
            fuels[label] = vals

    demand: list[float] = []
    if 'electricity_demand' in sub.columns:
        for v in sub['electricity_demand']:
            demand.append(round(float(v) * 1000, 1) if pd.notna(v) else 0.0)

    generation = {
        'source': (
            'Our World in Data / Ember — Yearly Electricity Data '
            '(github.com/owid/energy-data, CC BY 4.0)'
        ),
        'unit':   'GWh',
        'note':   (
            'Values converted from TWh (OWID) to GWh. '
            'Demand = electricity_demand column (includes net imports). '
            'Hydro = all hydropower (reservoir + run-of-river not distinguished).'
        ),
        'years':  years_out,
        'fuels':  fuels,
        'demand': demand,
    }

    gen_total = sub['electricity_generation'].tolist() if 'electricity_generation' in sub.columns else []
    print(
        f'  [{iso3}] {years_out[0]}-{years_out[-1]}  '
        f'gen 2023: {round(float(gen_total[-1])*1000,0) if gen_total else "n/a"} GWh  '
        f'fuels: {list(fuels.keys())}'
    )

    return {'country': country_name, 'generation': generation}


def run(
    countries: dict[str, str] | None = None,
    refresh: bool = False,
) -> None:
    """
    Generate supply JSONs for all given countries.

    Args:
        countries: {ISO3: display_name} — defaults to DEFAULT_COUNTRIES
        refresh:   force re-download of OWID CSV
    """
    if countries is None:
        countries = DEFAULT_COUNTRIES

    print(f'  Loading OWID data ({len(countries)} countries)...')
    df = _load_owid(refresh)
    OUT_SUPPLY.mkdir(parents=True, exist_ok=True)

    for iso3, name in countries.items():
        supply = _build_supply(df, iso3, name)
        if supply is None:
            continue
        out_path = OUT_SUPPLY / f'{iso3}.json'
        out_path.write_text(
            json.dumps(supply, indent=2, ensure_ascii=False), encoding='utf-8'
        )
        print(f'  supply -> {out_path}')


if __name__ == '__main__':
    args = sys.argv[1:]
    refresh = '--refresh' in args
    iso3_filter = [a for a in args if not a.startswith('--')]

    countries = DEFAULT_COUNTRIES
    if iso3_filter:
        countries = {k: v for k, v in DEFAULT_COUNTRIES.items() if k in iso3_filter}
        unknown = [k for k in iso3_filter if k not in DEFAULT_COUNTRIES]
        if unknown:
            print(f'  Warning: unknown ISO3 codes: {unknown}')

    print('=== OWID pipeline ===')
    run(countries=countries, refresh=refresh)
    print()
    print('Done.')
