"""
Test whether the ENTSO-E pipeline under-counts hourly borders 4x (docs/TRADE_AUDIT.md).

Hypothesis: query_physical_crossborder_allborders returns every border of a
country on one timeline. Once one border reports every 15 minutes, an hourly
border has values on the hour only, and _to_gwh multiplies each by 0.25 h, so
the border's energy comes out at a quarter. This runs the pipeline's own query
for cases where the audit saw exactly-4x gaps, and prints, per border:
    resolution   minutes between the border's own values
    pipeline     GWh as entsoe_supply_pipeline computes it (all borders together)
    alone        GWh from that border's own values only
    stats        ENTSO-E's harmonised statistics for the same border and year
Expected if the hypothesis holds: hourly borders show pipeline ~ alone / 4 and
alone ~ stats (within the stats' usual few-percent netting difference).

Needs an ENTSO-E API token (API_TOKEN_ENTSOE or config/api_tokens.ini) and
`pip install entsoe-py`. Read-only; raw responses go to data-source/raw/ENTSOE/check/.
    python tools/audit/entsoe_resolution_check.py
"""
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / 'pipelines'))
from entsoe import EntsoePandasClient  # noqa: E402
from entsoe_supply_pipeline import TRADE_AREA_OVERRIDES, TZ, _load_token, _norm_partner, _to_gwh  # noqa: E402
from trade_refs import ISO2, entsoe_stats  # noqa: E402

CASES = [('AT', 2021), ('HU', 2021), ('CH', 2022), ('FR', 2024), ('ES', 2024)]
OUT = HERE.parents[1] / 'data-source' / 'raw' / 'ENTSOE' / 'check'


def resolution_minutes(series):
    s = series.dropna()
    return int(s.index.to_series().diff().dropna().dt.total_seconds().median() / 60) if len(s) > 1 else None


def main():
    client = EntsoePandasClient(api_key=_load_token())
    stats, _ = entsoe_stats(range(2019, 2026))
    OUT.mkdir(parents=True, exist_ok=True)
    for c, year in CASES:
        start, end = pd.Timestamp(f'{year}-01-01', tz=TZ), pd.Timestamp(f'{year + 1}-01-01', tz=TZ)
        code = TRADE_AREA_OVERRIDES.get(c, c)
        df = client.query_physical_crossborder_allborders(code, start=start, end=end, export=True)
        df = df.drop(columns=[x for x in df.columns if str(x).strip().lower() == 'sum'])
        df.to_csv(OUT / f'exports_{c}_{year}.csv')
        pipeline = _to_gwh(df)
        print(f'\n{c} {year} exports, one query for all borders (rows: {len(df)})')
        print(f'  {"to":10} {"resolution":>10} {"pipeline":>10} {"alone":>10} {"stats":>10}  pipeline/alone')
        for col in df.columns:
            alone = _to_gwh(df[[col]].dropna())[col]
            partner = ISO2.get(_norm_partner(col))
            ref = stats.get((c, partner, year), float('nan'))
            ratio = pipeline[col] / alone if alone else float('nan')
            print(f'  {str(col):10} {resolution_minutes(df[col])!s:>8}min {pipeline[col]:10.0f} {alone:10.0f} {ref:10.0f}  {ratio:.2f}')


if __name__ == '__main__':
    main()
