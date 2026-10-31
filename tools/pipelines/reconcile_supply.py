"""
Supply reconciliation: check every supply file against Ember and repair it.

Runs after the source pipelines (build_all.py calls it last). An audit in
October 2026 compared every public/data/supply/<ISO3>.json with Ember's yearly
data and found:
  - ENTSO-E annual totals are often incomplete: whole fuels go unreported
    (Norway's capacity was 11% of Ember's, Switzerland had no solar, Sweden's
    and Italy's generation was 44%). Only 5 of 33 ENTSO-E capacity series and
    4 of 33 generation series were within 5% of Ember.
  - A fuel that a source did not report for a year was written as 0, not as
    missing.
  - 15 countries had no capacity at all, though Ember has it.
  - Most series stopped in 2023; Ember now runs to 2024 or 2025.

What this step does, per country and per block (generation, capacity):
  ENTSO-E    replaced by Ember. Even its most complete series ran 3-9% below
             Ember, and generation plus net imports covered under 85% of its
             own measured demand in 8 of 30 countries. Its finer split (hydro
             reservoir, run-of-river and pumped storage; lignite and hard coal;
             offshore and onshore wind) lives in public/data/entsoe/, written
             by entsoe_supply_pipeline.py; the report lists how complete each
             of those files is.
  OWID/Ember and older Ember releases
             refreshed from the current Ember release.
  an Ember-family series is kept instead if the current Ember release
             would drop a fuel it has substantially in the same years (the
             2026 release gives geothermal capacity as 0 for Kenya, Indonesia,
             the Philippines and other geothermal countries).
  OWID series also lose a double count: OWID's other_renewable_electricity
             includes bioenergy, which the OWID pipeline also added on its own
             (fixed there too).
  missing    filled from Ember where Ember has the country.
  national   (TEİAŞ, SSC Azerbaijan, GSE Georgia, SIAT, ...) left as they are:
             chosen deliberately. Only compared and reported.
Ember series write null, not 0, for a fuel Ember does not report that year.

Every comparison and action is written to docs/SUPPLY_QA.md.

Usage:
  python tools/pipelines/reconcile_supply.py            # all countries
  python tools/pipelines/reconcile_supply.py --refresh  # fetch the latest Ember release first
  python tools/pipelines/reconcile_supply.py --dry-run  # report only, change nothing
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from ember_capacity_pipeline import EMBER_FUEL_MAP, load_ember_csv  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SUPPLY = ROOT / 'public' / 'data' / 'supply'
REPORT = ROOT / 'docs' / 'SUPPLY_QA.md'
ENTSOE = ROOT / 'public' / 'data' / 'entsoe'

FIRST_YEAR = 2015
EMBER_CODES = {'KOS': 'XKX'}
EMBER_SOURCE = 'Ember — Yearly Electricity Data (ember-energy.org, CC BY 4.0)'
UNITS = {'generation': ('Electricity generation', 'TWh', 'GWh'), 'capacity': ('Capacity', 'GW', 'MW')}
# Our fuel names -> Ember's, to compare fuel by fuel. Pumped storage is left
# out everywhere: it stores power rather than generating it.
TO_EMBER = {
    'Hydro RoR': 'Hydro', 'Hydro Reservoir': 'Hydro', 'Wind Offshore': 'Wind', 'Lignite': 'Coal',
    'Oil': 'Oil & Other Fossil', 'Other Fossil': 'Oil & Other Fossil', 'Other': 'Oil & Other Fossil',
    'Biomass': 'Bioenergy', 'Waste': 'Bioenergy', 'Geothermal': 'Other Renewables',
}
LOST_SHARE, LOST_RATIO = 0.02, 0.2   # a fuel is lost if it was >=2% of the total and drops below 20%


def kind_of(source: str | None) -> str:
    s = (source or '').lower()
    if not s:
        return 'missing'
    if s.startswith('entso-e'):
        return 'entsoe'
    if s.startswith('our world in data / ember — yearly') or s.startswith('ember — yearly'):
        return 'ember'
    return 'national'


def ember_tables(df: pd.DataFrame) -> dict:
    """{block: DataFrame indexed by (ISO3, year), one column per fuel, in our units}."""
    df = df[df['Area type'] == 'Country or economy']
    out = {}
    for block, (category, unit, _) in UNITS.items():
        rows = df[(df['Category'] == category) & (df['Unit'] == unit) & df['Variable'].isin(EMBER_FUEL_MAP)]
        out[block] = rows.pivot_table(index=['ISO 3 code', 'Year'], columns='Variable', values='Value', aggfunc='sum') * 1000
    demand = df[(df['Category'] == 'Electricity demand') & (df['Variable'] == 'Demand') & (df['Unit'] == 'TWh')]
    out['demand'] = demand.set_index(['ISO 3 code', 'Year'])['Value'] * 1000
    return out


def ember_block(tables: dict, block: str, code: str) -> dict | None:
    """One supply block from Ember, in the explorer's format."""
    t = tables[block]
    if code not in t.index.get_level_values(0):
        return None
    rows = t.loc[code]
    rows = rows[rows.index >= FIRST_YEAR]
    if rows.empty:
        return None
    years = [int(y) for y in rows.index]
    fuels = {}
    for var, label in EMBER_FUEL_MAP.items():
        # A fuel Ember gives as 0 or nothing in every year is left out.
        if var in rows and (rows[var].fillna(0) > 0).any():
            fuels[label] = [None if pd.isna(v) else round(float(v), 1) for v in rows[var]]
    out = {'source': EMBER_SOURCE, 'unit': UNITS[block][2], 'years': years, 'fuels': fuels}
    if block == 'generation':
        d = tables['demand']
        out['note'] = ('Values converted from TWh (Ember) to GWh. Demand = Ember electricity demand '
                       '(generation plus net imports). A fuel Ember does not report for a year is left empty, not 0.')
        out['demand'] = [round(float(d[(code, y)]), 1) if (code, y) in d.index else None for y in years]
    return out


def totals(block: dict) -> dict:
    """{year: total} comparable with Ember's, skipping pumped storage and empty years."""
    out = {}
    for i, y in enumerate(block['years']):
        vals = [s[i] for f, s in block['fuels'].items() if f != 'Hydro Pumped Storage' and s[i] is not None]
        if vals:
            out[y] = sum(vals)
    return out


def fix_owid_double_count(block: dict) -> bool:
    """OWID's other_renewable_electricity includes bioenergy, and the OWID
    pipeline used it next to biofuel_electricity, so bioenergy was counted twice.
    Take it out of Other Renewables. Returns whether anything changed."""
    other, bio = block['fuels'].get('Other Renewables'), block['fuels'].get('Bioenergy')
    if not (block['source'].startswith('Our World in Data') and other and bio):
        return False
    fixed = [None if o is None else round(max(0.0, o - (b or 0)), 1) for o, b in zip(other, bio)]
    if fixed == other:
        return False
    if any(fixed):
        block['fuels']['Other Renewables'] = fixed
    else:
        del block['fuels']['Other Renewables']
    return True


def lost_fuels(current: dict, new: dict) -> list[str]:
    """Fuels the current series has substantially that the new one drops, in years both cover."""
    def by_fuel(block):
        out = {}
        for f, s in block['fuels'].items():
            if f == 'Hydro Pumped Storage':
                continue
            k = TO_EMBER.get(f, f)
            for y, v in zip(block['years'], s):
                out.setdefault(y, {})[k] = out.get(y, {}).get(k, 0) + (v or 0)
        return out
    old, fresh = by_fuel(current), by_fuel(new)
    lost = set()
    for y in set(old) & set(fresh):
        total = sum(old[y].values())
        for k, v in old[y].items():
            if total and v >= LOST_SHARE * total and fresh[y].get(k, 0) < LOST_RATIO * v:
                lost.add(k)
    return sorted(lost)


def coverage(block: dict, ember: dict | None) -> dict:
    """{year: ours / Ember} for the years both have."""
    if not ember:
        return {}
    ours, ref = totals(block), totals(ember)
    return {y: ours[y] / ref[y] for y in ours if ref.get(y)}


def reconcile(iso: str, supply: dict, tables: dict) -> list[dict]:
    """Repair one country's supply in place; return one report row per block."""
    code = EMBER_CODES.get(iso, iso)
    rows = []
    for block in ('generation', 'capacity'):
        current = supply.get(block)
        kind = kind_of(current and current.get('source'))
        double_counted = bool(current) and fix_owid_double_count(current)
        ember = ember_block(tables, block, code)
        cov = coverage(current, ember) if current else {}
        worst = max(cov.values(), key=lambda c: abs(c - 1)) if cov else None
        latest = cov[max(cov)] if cov else None

        if kind == 'national':
            action = 'kept (national source)'
        elif ember is None:
            action = 'kept (no Ember data)' if current else 'missing (no Ember data)'
        elif kind == 'missing':
            action, supply[block] = 'filled from Ember', ember
        elif kind == 'entsoe':
            action, supply[block] = 'replaced by Ember (ENTSO-E incomplete)', ember
        elif lost := lost_fuels(current, ember):
            # A newer Ember release that drops a fuel is a gap, not a revision.
            action = f"kept (Ember lacks {', '.join(lost)})"
        elif ember == current:
            action = 'up to date with Ember'
        else:
            action, supply[block] = 'refreshed from current Ember release', ember
        if double_counted and supply[block] is current:
            action += '; bioenergy double count removed'
        rows.append({
            'iso': iso, 'block': block, 'was': current['source'][:40] if current else '—', 'action': action,
            'years': f"{min(current['years'])}–{max(current['years'])}" if current else '—',
            'now': f"{min(supply[block]['years'])}–{max(supply[block]['years'])}" if supply.get(block) else '—',
            'latest': latest, 'worst': worst,
        })
    return rows


def entsoe_rows(tables: dict) -> list[dict]:
    """How complete each ENTSO-E detail file is against Ember."""
    rows = []
    for path in sorted(ENTSOE.glob('*.json')):
        d = json.loads(path.read_text(encoding='utf-8'))
        code = EMBER_CODES.get(path.stem, path.stem)
        for block in ('generation', 'capacity'):
            if d.get(block):
                cov = coverage(d[block], ember_block(tables, block, code))
                rows.append({'iso': path.stem, 'block': block, 'latest': cov[max(cov)] if cov else None,
                             'worst': max(cov.values(), key=lambda c: abs(c - 1)) if cov else None,
                             'years': f"{min(d[block]['years'])}–{max(d[block]['years'])}"})
    return rows


def write_report(rows: list[dict], ember_release: str, entsoe: list[dict]) -> None:
    pct = lambda c: '—' if c is None or pd.isna(c) else f'{c * 100:.0f}%'
    df = pd.DataFrame(rows)
    lines = [
        '# Supply data QA',
        '',
        'Written by `tools/pipelines/reconcile_supply.py`; do not edit by hand. Each country\'s',
        'generation and capacity series as they were before the step, compared with Ember',
        f'({ember_release}), and what the step did. "Ours / Ember" is the series total as a',
        'share of Ember\'s for the same year (pumped storage left out): the latest year both',
        'have, and the year furthest from 100%.',
        '',
        '## Summary',
        '',
        '| Block | Action | Countries |',
        '|---|---|---|',
    ]
    for (block, action), n in df.groupby(['block', 'action']).size().items():
        lines.append(f'| {block} | {action} | {n} |')
    for block in ('generation', 'capacity'):
        lines += ['', f'## {block.capitalize()}', '',
                  '| Country | Source before | Years before | Ours / Ember, latest | Furthest from Ember | Action | Years now |',
                  '|---|---|---|---|---|---|---|']
        for r in df[df.block == block].sort_values('iso').to_dict('records'):
            lines.append(f"| {r['iso']} | {r['was']} | {r['years']} | {pct(r['latest'])} | {pct(r['worst'])} | {r['action']} | {r['now']} |")
    lines += ['', '## ENTSO-E detail files', '',
              '`public/data/entsoe/<ISO3>.json` keeps ENTSO-E\'s finer fuel split for the AI assistant',
              '(`data__fuel_detail`). Its totals are not used: this is how much of Ember\'s total they cover.',
              '', '| Country | Block | Years | ENTSO-E / Ember, latest | Furthest from Ember |', '|---|---|---|---|---|']
    for r in entsoe:
        lines.append(f"| {r['iso']} | {r['block']} | {r['years']} | {pct(r['latest'])} | {pct(r['worst'])} |")
    REPORT.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def run(refresh: bool = False, dry_run: bool = False) -> None:
    raw = load_ember_csv(refresh)
    tables = ember_tables(raw)
    release = f"data to {int(raw['Year'].max())}"
    rows = []
    for path in sorted(SUPPLY.glob('*.json')):
        supply = json.loads(path.read_text(encoding='utf-8'))
        before = json.dumps(supply, sort_keys=True)
        rows += reconcile(path.stem, supply, tables)
        if not dry_run and json.dumps(supply, sort_keys=True) != before:
            path.write_text(json.dumps(supply, indent=2, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    write_report(rows, release, entsoe_rows(tables))
    df = pd.DataFrame(rows)
    print(df.groupby(['block', 'action']).size().to_string())
    print(f'Report -> {REPORT.relative_to(ROOT)}')


if __name__ == '__main__':
    args = sys.argv[1:]
    run(refresh='--refresh' in args, dry_run='--dry-run' in args)
