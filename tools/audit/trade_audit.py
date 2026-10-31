"""
Trade audit experiments (docs/TRADE_AUDIT.md). Read-only: prints tables, changes nothing.

    python tools/audit/trade_audit.py

Each section tests one hypothesis against references that don't come from our
own files: ENTSO-E's harmonised statistics, Red Eléctrica, Statistics Norway, Ember.
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from trade_refs import ISO3, ember_net, entsoe_stats, our_entsoe_flows, ree_spain, ssb_norway  # noqa: E402

pd.set_option('display.width', 200)


def classify(v, ref):
    if v is None:
        return 'not in file'
    q = v / ref
    if abs(q - 1) <= .05:
        return 'match'
    if abs(q - .25) <= .03:
        return '4x low'
    return 'low' if q < .95 else 'high'


def main():
    S, M = entsoe_stats()
    T = our_entsoe_flows()
    net, gen = ember_net()

    # 1. Our files against ENTSO-E's statistics, flow by flow, both files of each border.
    rows = []
    for (a, b, y), ref in S.items():
        if ref < 50 or y > 2024:
            continue
        for who in (a, b):
            rows.append(dict(y=y, file=who, a=a, b=b, cls=classify(T.get(who, {}).get((a, b, y)), ref)))
    r = pd.DataFrame(rows)
    have = r[r.cls != 'not in file']
    print('1. Our files vs ENTSO-E statistics: share of flows by outcome, per year')
    print(pd.crosstab(have.y, have.cls, normalize='index').round(2).to_string())
    print('\n   Files with flows exactly 4x too low (count per year):')
    print(have[have.cls == '4x low'].groupby(['file', 'y']).size().unstack(fill_value=0).to_string())

    # 2. Net imports: our files, larger side of each border, and statistics, each against Ember.
    out = []
    for c, flows in T.items():
        iso = ISO3.get(c)
        for y in (2023, 2024):
            ref = net.get((iso, y))
            if ref is None or pd.isna(ref):
                continue
            scale = max(abs(ref), 0.02 * (gen.get((iso, y)) or 0), 50)
            own = sum(v if b == c else -v for (a, b, yy), v in flows.items() if yy == y)
            larger = 0
            for (a, b, yy), v in flows.items():
                if yy == y:
                    other = b if a == c else a
                    v = max(v, T.get(other, {}).get((a, b, y), 0))
                    larger += v if b == c else -v
            st = S[[k for k in S.index if k[1] == c and k[2] == y]].sum() - S[[k for k in S.index if k[0] == c and k[2] == y]].sum()
            out.append(dict(own=abs(own - ref) / scale, larger=abs(larger - ref) / scale, stats=abs(st - ref) / scale))
    e = pd.DataFrame(out)
    print(f'\n2. Net imports vs Ember, {len(e)} country-years (2023-24)')
    for k in ('own', 'larger', 'stats'):
        print(f'   {k:7} median error {e[k].median():.0%}  within 10%: {(e[k] < .1).mean():.0%}  over 30%: {(e[k] > .3).mean():.0%}')

    # 3. National references.
    print('\n3. Spain 2024: Red Eléctrica vs ENTSO-E statistics vs our files (GWh)')
    for (a, b), v in ree_spain(2024).items():
        print(f'   {a}->{b}: REE {v:8.0f} | stats {S.get((a, b, 2024), float("nan")):8.0f} | '
              f'{a} file {T.get(a, {}).get((a, b, 2024), float("nan")):8.0f} | {b} file {T.get(b, {}).get((a, b, 2024), float("nan")):8.0f}')
    print('\n   Norway: net imports, Statistics Norway vs ENTSO-E statistics vs Ember vs our file (GWh)')
    for y, (imp, exp) in sorted(ssb_norway(range(2019, 2026)).items()):
        st = S[[k for k in S.index if k[1] == 'NO' and k[2] == y]].sum() - S[[k for k in S.index if k[0] == 'NO' and k[2] == y]].sum()
        ours = sum(v if b == 'NO' else -v for (a, b, yy), v in T.get('NO', {}).items() if yy == y)
        print(f'   {y}: SSB {imp - exp:8.0f} | stats {st:8.0f} | Ember {net.get(("NOR", y), float("nan")):8.0f} | ours {ours:8.0f}')


if __name__ == '__main__':
    main()
