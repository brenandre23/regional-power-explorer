"""
Reference data for the trade audit (docs/TRADE_AUDIT.md), and loaders for the
explorer's own trade files. Downloads are cached in data-source/raw/ (git-ignored).

    ENTSO-E statistics  harmonised monthly physical flows by country pair, GWh
                        (entsoe.eu/data/power-stats), 2019 onwards
    Red Eléctrica       Spain's physical exchanges by border (apidatos.ree.es)
    Statistics Norway   electricity balance, table 14091 (data.ssb.no)
    Ember               net imports per country (already cached by the Ember pipeline)
"""
import json
import glob
import os
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'data-source' / 'raw'
TRADE = ROOT / 'public' / 'data' / 'trade'
STATS_URL = 'https://www.entsoe.eu/publications/data/power-stats/{y}/physical_energy_power_flows_{y}.csv'

ISO2 = {
    'Albania': 'AL', 'Austria': 'AT', 'Bosnia and Herzegovina': 'BA', 'Belgium': 'BE', 'Bulgaria': 'BG',
    'Switzerland': 'CH', 'Cyprus': 'CY', 'Czech Republic': 'CZ', 'Germany': 'DE', 'Denmark': 'DK',
    'Estonia': 'EE', 'Spain': 'ES', 'Finland': 'FI', 'France': 'FR', 'United Kingdom': 'GB', 'Greece': 'GR',
    'Croatia': 'HR', 'Hungary': 'HU', 'Ireland': 'IE', 'Italy': 'IT', 'Lithuania': 'LT', 'Luxembourg': 'LU',
    'Latvia': 'LV', 'Montenegro': 'ME', 'North Macedonia': 'MK', 'Malta': 'MT', 'Netherlands': 'NL',
    'Norway': 'NO', 'Poland': 'PL', 'Portugal': 'PT', 'Romania': 'RO', 'Serbia': 'RS', 'Sweden': 'SE',
    'Slovenia': 'SI', 'Slovakia': 'SK', 'Turkiye': 'TR', 'Ukraine': 'UA', 'Moldova': 'MD', 'Kosovo': 'XK',
    'Russia': 'RU', 'Belarus': 'BY', 'Georgia': 'GE', 'Armenia': 'AM', 'Azerbaijan': 'AZ',
}
ISO3 = {
    'AL': 'ALB', 'AT': 'AUT', 'BA': 'BIH', 'BE': 'BEL', 'BG': 'BGR', 'CH': 'CHE', 'CY': 'CYP', 'CZ': 'CZE',
    'DE': 'DEU', 'DK': 'DNK', 'EE': 'EST', 'ES': 'ESP', 'FI': 'FIN', 'FR': 'FRA', 'GB': 'GBR', 'GR': 'GRC',
    'HR': 'HRV', 'HU': 'HUN', 'IE': 'IRL', 'IT': 'ITA', 'LT': 'LTU', 'LU': 'LUX', 'LV': 'LVA', 'ME': 'MNE',
    'MK': 'MKD', 'MT': 'MLT', 'NL': 'NLD', 'NO': 'NOR', 'PL': 'POL', 'PT': 'PRT', 'RO': 'ROU', 'RS': 'SRB',
    'SE': 'SWE', 'SI': 'SVN', 'SK': 'SVK', 'TR': 'TUR', 'UA': 'UKR', 'MD': 'MDA', 'XK': 'XKX', 'GE': 'GEO',
    'AM': 'ARM', 'AZ': 'AZE', 'BY': 'BLR', 'RU': 'RUS',
}
# Partner labels in our files that are zones or variant names, not countries.
ALIAS = {'DE_AT_LU': 'Germany', 'IE_SEM': 'Ireland', 'IT_GR': 'Italy', 'IT_BRNN': 'Italy',
         'IT_NORD_CH': 'Italy', 'IT_NORD_FR': 'Italy', 'Russian Federation': 'Russia', 'Russia/USSR': 'Russia'}


def _get(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        req = urllib.request.Request(url, headers={'User-Agent': 'regional-power-explorer trade audit'})
        with urllib.request.urlopen(req, timeout=180) as r:
            path.write_bytes(r.read())
    return path


def entsoe_stats(years=range(2019, 2026)):
    """(annual, monthly) Series of physical flows, GWh: index (src, dst, year[, month])."""
    out = []
    for y in years:
        p = _get(STATS_URL.format(y=y), RAW / 'ENTSOE_STATS' / f'physical_energy_power_flows_{y}.csv')
        # The file's separator and column names change between years.
        d = pd.read_csv(p, sep=None, engine='python', encoding='utf-8-sig')
        d = d.rename(columns={'FromCountryMapCode': 'FromAreaCode', 'ToCountryMapCode': 'ToAreaCode'})
        d = d[d.MeasureTime == 'Monthly Value']
        exp = d.Direction == 'Export'
        d['src'] = d.FromAreaCode.where(exp, d.ToAreaCode)
        d['dst'] = d.ToAreaCode.where(exp, d.FromAreaCode)
        # Each flow is listed twice (an export from one side, an import to the other).
        m = d.groupby(['src', 'dst', 'Month']).Value.max().reset_index()
        m['y'] = y
        out.append(m)
    m = pd.concat(out)
    return m.groupby(['src', 'dst', 'y']).Value.sum(), m.set_index(['src', 'dst', 'y', 'Month']).Value


def ree_spain(year):
    """Spain's physical exchanges by border: {(src, dst): GWh}, from Red Eléctrica."""
    url = ('https://apidatos.ree.es/en/datos/intercambios/todas-fronteras-fisicos'
           f'?start_date={year}-01-01T00:00&end_date={year}-12-31T23:59&time_trunc=year')
    d = json.loads(_get(url, RAW / 'NATIONAL' / f'ree_{year}.json').read_text())
    codes = {'francia': 'FR', 'portugal': 'PT', 'marruecos': 'MA', 'andorra': 'AD'}
    out = {}
    for inc in d['included']:
        for x in inc['attributes'].get('content', []):
            v = sum(abs(e['value']) for e in x['attributes']['values']) / 1000
            if x['type'] == 'Exports':
                out[('ES', codes[inc['type']])] = v
            elif x['type'] == 'Imports':
                out[(codes[inc['type']], 'ES')] = v
    return out


def ssb_norway(years):
    """Norway's {year: (imports, exports)} in GWh, from Statistics Norway table 14091."""
    path = RAW / 'NATIONAL' / 'ssb_14091.json'
    if not path.exists():
        months = [f'{y}M{m:02d}' for y in years for m in range(1, 13)]
        q = {'query': [{'code': 'Produk2', 'selection': {'filter': 'item', 'values': ['2', '3']}},
                       {'code': 'Tid', 'selection': {'filter': 'item', 'values': months}}],
             'response': {'format': 'json-stat2'}}
        req = urllib.request.Request('https://data.ssb.no/api/v0/en/table/14091', data=json.dumps(q).encode(),
                                     headers={'Content-Type': 'application/json'})
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(urllib.request.urlopen(req, timeout=120).read())
    d = json.loads(path.read_text())
    prod = list(d['dimension']['Produk2']['category']['index'])
    tid = list(d['dimension']['Tid']['category']['index'])
    out = {}
    for pi, p in enumerate(prod):
        for ti, t in enumerate(tid):
            v = d['value'][pi * len(tid) + ti]
            if v is not None:
                imp, exp = out.get(int(t[:4]), (0.0, 0.0))
                out[int(t[:4])] = (imp + v / 1000, exp) if p == '2' else (imp, exp + v / 1000)
    return out


def ember_net():
    """Ember net imports, GWh, indexed (ISO3, year); and generation for scaling."""
    e = pd.read_csv(RAW / 'EMBER' / 'yearly_full_release_long_format.csv', low_memory=False)
    e = e[e['Area type'] == 'Country or economy']
    net = e[(e.Category == 'Electricity imports') & (e.Unit == 'TWh')].set_index(['ISO 3 code', 'Year'])['Value'] * 1000
    gen = e[(e.Category == 'Electricity generation') & (e.Unit == 'TWh') & (e.Subcategory == 'Total')]
    return net, gen.set_index(['ISO 3 code', 'Year'])['Value'] * 1000


def our_entsoe_flows():
    """{iso2 of file: {(src, dst, year): GWh}} from our ENTSO-E trade files, partner names
    mapped to countries and flows between a country's own zones left out."""
    files = {}
    for f in glob.glob(str(TRADE / '*.json')):
        d = json.load(open(f, encoding='utf-8'))
        c = ISO2.get(d.get('country'))
        if not c or not d.get('years') or not d['source'].startswith('ENTSO-E'):
            continue
        flows = {}
        for k in ('exports', 'imports'):
            for p, s in d[k].items():
                pc = ISO2.get(ALIAS.get(p, p))
                if not pc or pc == c:
                    continue
                for y, v in zip(d['years'], s):
                    key = (c, pc, y) if k == 'exports' else (pc, c, y)
                    flows[key] = flows.get(key, 0) + (v or 0)
        files[c] = flows
    return files
