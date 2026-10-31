"""
Turkiye electricity market prices — EPIAS Transparency Platform pipeline.
https://seffaflik.epias.com.tr

Generates public/data/market/TUR.json with nine hourly series:
  - dam:     Day-Ahead Market — Market Clearing Price (MCP), in TL/MWh
  - dam_eur: Day-Ahead Market — Market Clearing Price (MCP), in EUR/MWh
  - dam_usd: Day-Ahead Market — Market Clearing Price (MCP), in USD/MWh
  - idm:     Intraday Market — Weighted Average Price (WAP), in TL/MWh
  - bpm:     Balancing Power Market — System Marginal Price (SMP), in TL/MWh
  - dam_qty: Day-Ahead Market — Matching Quantity, in MWh
  - idm_qty: Intraday Market — Matching Quantity, in MWh
  - bpm_net: Balancing Power Market — Net Instructed Quantity, in MWh
  - rt_cons: Real-Time Consumption, in MWh

rt_cons reads the "consumption" column off "rt-cons" — a plain single-endpoint
series like dam_qty, needing no custom compute function. It is NOT the same
figure as the settled/final consumption (the "uecm" endpoint, used nowhere in
this pipeline): verified for 2025-10-03, rt_cons runs ~5-7% above uecm on
every single hour that day (929,236 vs. 878,214 MWh daily total). rt_cons is
EPIAS's real-time/preliminary system-level consumption figure, published
about 2 hours behind, and may be revised in later runs. Its true data start
is 2015-12-31 (earlier than every other series here), but it's backfilled
from 2017-11-01 like the rest, for consistency.

dam/dam_eur/dam_usd all come from the same "mcp" endpoint response — it
returns price, priceEur and priceUsd columns per hour (confirmed against
the EPIAS PtfResponseDataDto schema). idm and bpm only carry a TL price in
their respective schemas, so they have no EUR/USD counterpart.

dam_qty reads matchedBids off "dam-clearing" (same date/hour shape as every
other endpoint here). idm_qty reads clearingQuantityBid off "idm-qty", which
has NO date/hour column at all — only a kontratAdi contract code (e.g.
"PH26090900" = PH + YYMMDDHH, Turkey local time) for hourly contracts, plus
"Blok" (block, multi-hour) contracts that don't fit this shape and are
dropped. See _decode_idm_qty_timestamp.

bpm_net is the only series sourced from TWO endpoints at once ("bpm-up" and
"bpm-down") — see _bpm_net_series. It's net = (up's three "Coded" columns
summed) - (down's three "Coded" columns summed), NOT the "Delivered"
columns and NOT the pre-built "net" column each endpoint already returns
(they're identical to each other but do not match EPIAS's own website,
which displays the Coded-column sum — verified against the website for
2026-10-04, matching to the penny on every checked hour including the
daily total; the "Delivered"-based "net" field differs by up to ~78 in a
single hour on that same date, so it was deliberately not used).

Good to know:
  - Auth is handled by the eptr2 client (logs in with username/password,
    manages the EPIAS session token internally).
  - Each run only fetches a short recent window and merges it into the
    existing file — older history is never overwritten.
  - Only the last 90 days of hourly detail are kept; older dates live on
    as daily/monthly/yearly averages only, to keep the file small.
  - To add another price series later, add one line to SERIES below.

Credentials: env vars EPIAS_USERNAME / EPIAS_PASSWORD, or
  [api_tokens] epias_username / epias_password in config/api_tokens.ini

Usage:
  python tools/pipelines/epias_pipeline.py                          # last 14 days
  python tools/pipelines/epias_pipeline.py --start-date 2018-01-01  # one-time backfill
  
"""
from __future__ import annotations

import json
import os
import re
import time
import warnings
from calendar import monthrange
from configparser import ConfigParser
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

warnings.filterwarnings('ignore')

ROOT       = Path(__file__).resolve().parents[2]
OUT_MARKET = ROOT / 'public' / 'data' / 'market' / 'TUR.json'

# A normal run only needs to look back this far — enough to catch late
# corrections plus fill in "today". Pass --start-date for a one-off backfill.
DEFAULT_FETCH_WINDOW_DAYS = 14

# How much raw hourly detail to keep in the output file (older hours are
# still represented in the daily/monthly/yearly aggregates, just not hour
# by hour — this keeps the JSON file small even after years of daily runs).
HOURLY_RETENTION_DAYS = 90

# eptr2's HTTP client has no read timeout by default (bare urllib3.request()
# call with no timeout kwarg), so a single unresponsive request hangs
# forever instead of raising — which defeats the per-month try/except below
# that's meant to skip a bad month and move on. Bounding it here turns a
# silent multi-hour hang into an ordinary, already-handled FAILED/retry-later
# month. All observed successful calls finish in low single-digit seconds, so
# this has generous headroom without risking cutting off a slow-but-good one.
REQUEST_TIMEOUT_SECONDS = 30

# bpm_net is the one series computed from TWO endpoint responses at once
# ("bpm-up" and "bpm-down") rather than one column off one response, so it
# needs its own combining function ahead of SERIES, which references it
# directly. net = (up's three "Coded" columns summed) - (down's three
# "Coded" columns summed) — deliberately NOT the "Delivered" columns, and
# NOT the "net" column each endpoint already returns (identical between the
# two, but doesn't match EPIAS's own website — verified for 2026-10-04,
# where only the Coded-column sum matches the website to the penny,
# including the daily total; "net"/"Delivered" differ by up to ~78 in a
# single hour that same date).
def _bpm_net_series(endpoint_frames: dict) -> pd.Series:
    up, down = endpoint_frames.get('bpm-up'), endpoint_frames.get('bpm-down')
    if up is None or down is None or up.empty or down.empty:
        return pd.Series(dtype=float)
    up_coded   = up['upRegulationZeroCoded']     + up['upRegulationOneCoded']     + up['upRegulationTwoCoded']
    down_coded = down['downRegulationZeroCoded'] + down['downRegulationOneCoded'] + down['downRegulationTwoCoded']
    common = up_coded.index.intersection(down_coded.index)
    only_up, only_down = up_coded.index.difference(down_coded.index), down_coded.index.difference(up_coded.index)
    if len(only_up) or len(only_down):
        print(f'  [epias] bpm_net: WARNING — {len(only_up)} hour(s) only in bpm-up and '
              f'{len(only_down)} hour(s) only in bpm-down ({len(only_up) + len(only_down)} total) — '
              f'treated as gaps, not zero, and excluded from bpm_net.')
    return up_coded.loc[common] - down_coded.loc[common]


# ─── Series registry — add a new price series by adding one entry here ──────
#   endpoint    : eptr2 call name (see eptr2 docs / seffaflik technical guide)
#                 — a string for a single-endpoint series, or a list for one
#                 that reads from more than one (only bpm_net, so far)
#   label       : human-readable name, shown in the output json and the UI
#   value_field : column in the eptr2 response holding the price number
#   unit        : shown in the output json, per series
#   compute     : only on a multi-endpoint series — a function taking the
#                 full {endpoint: DataFrame} map and returning the hourly
#                 pd.Series directly, bypassing value_field entirely
#
# dam / dam_eur / dam_usd share the same "mcp" endpoint response — it returns
# price (TL), priceEur and priceUsd columns per hour — so they're fetched
# together in one API call per month rather than three (see run()).
SERIES = {
    'dam':     {'endpoint': 'mcp',          'label': 'Day-Ahead Market — Market Clearing Price',        'value_field': 'price',                'unit': 'TL/MWh'},
    'dam_eur': {'endpoint': 'mcp',          'label': 'Day-Ahead Market — Market Clearing Price (EUR)',  'value_field': 'priceEur',             'unit': 'EUR/MWh'},
    'dam_usd': {'endpoint': 'mcp',          'label': 'Day-Ahead Market — Market Clearing Price (USD)',  'value_field': 'priceUsd',             'unit': 'USD/MWh'},
    'idm':     {'endpoint': 'wap',          'label': 'Intraday Market — Weighted Average Price',        'value_field': 'wap',                  'unit': 'TL/MWh'},
    'bpm':     {'endpoint': 'smp',          'label': 'Balancing Power Market — System Marginal Price',  'value_field': 'systemMarginalPrice',  'unit': 'TL/MWh'},
    'dam_qty': {'endpoint': 'dam-clearing', 'label': 'Day-Ahead Market — Matching Quantity',            'value_field': 'matchedBids',          'unit': 'MWh'},
    'idm_qty': {'endpoint': 'idm-qty',      'label': 'Intraday Market — Matching Quantity',             'value_field': 'clearingQuantityBid',  'unit': 'MWh'},
    'bpm_net': {'endpoint': ['bpm-up', 'bpm-down'], 'label': 'Balancing Power Market — Net Instructed Quantity', 'unit': 'MWh', 'compute': _bpm_net_series},
    'rt_cons': {'endpoint': 'rt-cons',      'label': 'Real-Time Consumption',                            'value_field': 'consumption',          'unit': 'MWh'},
}


# ═══════════════════════════════════════════════════════════════════════════
# Credentials
# ═══════════════════════════════════════════════════════════════════════════

def _load_credentials() -> tuple[str, str]:
    env_user = os.getenv('EPIAS_USERNAME')
    env_pass = os.getenv('EPIAS_PASSWORD')
    if env_user and env_pass:
        return env_user, env_pass

    candidates = [
        ROOT / 'config' / 'api_tokens.ini',
        ROOT.parent / 'black_sea_2026' / 'EPM' / 'pre-analysis' / 'config' / 'api_tokens.ini',
    ]
    for path in candidates:
        if not path.exists():
            continue
        cfg = ConfigParser()
        cfg.read(path)
        user = cfg.get('api_tokens', 'epias_username', fallback=None)
        pwd  = cfg.get('api_tokens', 'epias_password', fallback=None)
        if user and pwd:
            return user, pwd

    raise RuntimeError(
        'EPIAS credentials not found. Set env vars EPIAS_USERNAME / EPIAS_PASSWORD, '
        'or add to config/api_tokens.ini:\n'
        '  [api_tokens]\n  epias_username = ...\n  epias_password = ...'
    )


# ═══════════════════════════════════════════════════════════════════════════
# Fetch — one series, in monthly chunks, from the EPIAS API
# ═══════════════════════════════════════════════════════════════════════════

def _timestamp_column(df: pd.DataFrame) -> str:
    return next((c for c in df.columns if 'date' in c.lower() or 'time' in c.lower()), df.columns[0])


# "idm-qty" has no date/hour column — only a kontratAdi contract code. Hourly
# contracts look like "PH26090900" (PH + YYMMDDHH, Turkey local time); "Blok"
# (block, multi-hour) contracts use a different shape ("PB...-NN") and can't
# be decoded the same way, so they're dropped rather than mis-timestamped.
# Verified against live data spanning 2017-11 through 2026-09: every single
# "Saatlik" (hourly) row across that whole range matches this pattern with no
# exceptions, and block contracts — common through mid-2023 — disappear
# entirely from 2024 onward.
_IDM_QTY_HOURLY_RE = re.compile(r'^PH(\d{2})(\d{2})(\d{2})(\d{2})$')


def _decode_idm_qty_timestamp(df: pd.DataFrame) -> pd.DataFrame:
    hourly = df[df['kontratTuru'] == 'Saatlik']
    codes = hourly['kontratAdi'].astype(str)
    parts = codes.str.extract(_IDM_QTY_HOURLY_RE)
    hourly = hourly[parts.notna().all(axis=1)]
    parts = parts[parts.notna().all(axis=1)]
    local_iso = '20' + parts[0] + '-' + parts[1] + '-' + parts[2] + 'T' + parts[3] + ':00:00+03:00'
    return hourly.set_index(pd.to_datetime(local_iso, utc=True))


def _fetch_endpoint(client, endpoint: str, start: date, end: date) -> pd.DataFrame:
    """Returns one hourly pd.DataFrame (UTC-indexed, all response columns kept)
    for a single eptr2 endpoint, fetched month by month so we never ask the
    API for too much at once. Called once per distinct endpoint even when
    several series (e.g. dam / dam_eur / dam_usd) read different columns out
    of the same response."""
    frames = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        last_day    = monthrange(year, month)[1]
        chunk_start = f'{year}-{month:02d}-01'
        chunk_end   = f'{year}-{month:02d}-{min(last_day, end.day) if (year, month) == (end.year, end.month) else last_day:02d}'
        label       = f'{year}-{month:02d}'
        try:
            df = client.call(endpoint, start_date=chunk_start, end_date=chunk_end,
                              request_kwargs={'timeout': REQUEST_TIMEOUT_SECONDS})
        except Exception as exc:
            print(f'  [epias] {endpoint} {label}: FAILED — {exc}')
            df = None

        if df is not None and not df.empty:
            if endpoint == 'idm-qty':
                df = _decode_idm_qty_timestamp(df)
            else:
                ts_col = _timestamp_column(df)
                df = df.set_index(pd.to_datetime(df[ts_col], utc=True))
            if df.empty:
                print(f'  [epias] {endpoint} {label}: no hourly rows')
            else:
                frames.append(df)
                print(f'  [epias] {endpoint} {label}: {len(df)} rows')
        else:
            print(f'  [epias] {endpoint} {label}: no data')

        month += 1
        if month > 12:
            month, year = 1, year + 1
        time.sleep(0.5)  # be polite to the API

    if not frames:
        return pd.DataFrame()
    combined = pd.concat(frames).sort_index()
    return combined[~combined.index.duplicated(keep='first')]


def _extract_series(df: pd.DataFrame, endpoint: str, value_field: str) -> pd.Series:
    """Pulls one column out of an endpoint's fetched DataFrame as an hourly
    pd.Series. Returns an empty series (with a warning) if the column isn't
    there, e.g. because the API response shape changed."""
    if df.empty:
        return pd.Series(dtype=float)
    if value_field not in df.columns:
        print(f'  [epias] {endpoint}: WARNING — expected column "{value_field}" not found. '
              f'Available columns: {list(df.columns)}. Fix SERIES[...]["value_field"] and re-run.')
        return pd.Series(dtype=float)
    return df[value_field]


# ═══════════════════════════════════════════════════════════════════════════
# Aggregate — hourly → daily / monthly / yearly, each as {mean, min, max}
# ═══════════════════════════════════════════════════════════════════════════

def _stats_by(hourly: pd.Series, group_keys) -> dict:
    """{'mean': {date_str: value}, 'min': {...}, 'max': {...}} for one grouping."""
    grouped = hourly.groupby(group_keys)
    return {
        'mean': {str(k): round(v, 2) for k, v in grouped.mean().items()},
        'min':  {str(k): round(v, 2) for k, v in grouped.min().items()},
        'max':  {str(k): round(v, 2) for k, v in grouped.max().items()},
    }


def _aggregate(hourly: pd.Series) -> dict:
    """hourly's index is UTC. EPIAS prices are inherently on Turkey local time
    (UTC+3, no DST since Sep 2016), so bucket by the Europe/Istanbul-converted
    index — otherwise every "day" would actually span 21:00 UTC the previous
    day through 20:00 UTC that day, a 3-hour-shifted window that doesn't match
    the real Turkish trading day. The values themselves are unaffected; only
    which day/month/year each hour is grouped into changes."""
    local = hourly.tz_convert('Europe/Istanbul')
    return {
        'daily':   _stats_by(hourly, local.index.date),
        'monthly': _stats_by(hourly, local.index.to_period('M')),
        'yearly':  _stats_by(hourly, local.index.year),
    }


def _merge_stats(old: dict | None, new: dict) -> dict:
    """Combine two {'mean': {}, 'min': {}, 'max': {}} blocks — new values win
    on any overlapping date, everything else from `old` is kept as-is."""
    old = old or {}
    return {stat: {**old.get(stat, {}), **new.get(stat, {})} for stat in ('mean', 'min', 'max')}


def _recent_hourly(hourly: pd.Series, old_hourly: dict) -> dict:
    """Raw hourly values for the last HOURLY_RETENTION_DAYS only. Merges this
    run's freshly fetched hours into whatever was already saved (new values
    win on overlap) rather than replacing it outright — otherwise a run whose
    fetch window doesn't reach up to "today" (e.g. a backfill for one older
    month) would wipe out already-saved hours it didn't touch."""
    # Floored to midnight so the retention window always starts on a clean day
    # boundary — an un-floored "now - 90 days" cutoff lands at whatever hour
    # the pipeline happens to run at, truncating the oldest retained day to
    # start partway through instead of at 00:00 like every other day.
    cutoff = pd.Timestamp.now(tz='UTC').normalize() - pd.Timedelta(days=HOURLY_RETENTION_DAYS)
    merged = dict(old_hourly)
    if len(hourly):
        recent = hourly[hourly.index >= cutoff]
        merged.update({t.isoformat(): round(v, 2) for t, v in recent.items()})
    return {t: v for t, v in merged.items() if pd.Timestamp(t) >= cutoff}


def _build_series_block(old_block: dict, label: str, unit: str, hourly: pd.Series) -> dict:
    agg = _aggregate(hourly) if len(hourly) else {'daily': {}, 'monthly': {}, 'yearly': {}}
    return {
        'label':   label,
        'unit':    unit,
        'hourly':  _recent_hourly(hourly, old_block.get('hourly', {})),
        'daily':   _merge_stats(old_block.get('daily'),   agg['daily']),
        'monthly': _merge_stats(old_block.get('monthly'), agg['monthly']),
        'yearly':  _merge_stats(old_block.get('yearly'),  agg['yearly']),
    }


# ═══════════════════════════════════════════════════════════════════════════
# Main entry point
# ═══════════════════════════════════════════════════════════════════════════

def run(start_date: str | None = None, end_date: str | None = None) -> None:
    from eptr2 import EPTR2  # imported lazily so the rest of the pipeline can be
                              # imported/tested without eptr2 installed

    end   = date.fromisoformat(end_date) if end_date else date.today()
    start = date.fromisoformat(start_date) if start_date else end - timedelta(days=DEFAULT_FETCH_WINDOW_DAYS)

    username, password = _load_credentials()
    client = EPTR2(username=username, password=password, ssl_verify=False)
    print(f'[epias] Authenticated as {username}')
    print(f'[epias] Fetching {start} → {end}')

    existing: dict = {}
    if OUT_MARKET.exists():
        existing = json.loads(OUT_MARKET.read_text(encoding='utf-8'))

    market = {
        'country': 'Turkiye',
        'source':  'EPIAS Transparency Platform (seffaflik.epias.com.tr)',
        'updated': date.today().isoformat(),
    }

    # Fetch each distinct endpoint once, then let every series that reads
    # from it (e.g. dam / dam_eur / dam_usd all read "mcp") pull its own
    # column out of the same fetched data instead of re-fetching. A series'
    # "endpoint" can be a list (bpm_net reads both bpm-up and bpm-down).
    endpoints = {}
    for cfg in SERIES.values():
        for endpoint in (cfg['endpoint'] if isinstance(cfg['endpoint'], list) else [cfg['endpoint']]):
            endpoints[endpoint] = None
    endpoint_frames = {}
    for endpoint in endpoints:
        print(f'[epias] fetching endpoint "{endpoint}" ...')
        endpoint_frames[endpoint] = _fetch_endpoint(client, endpoint, start, end)

    for key, cfg in SERIES.items():
        print(f'[epias] {cfg["label"]} ({key}) ...')
        if 'compute' in cfg:
            hourly = cfg['compute'](endpoint_frames)
        else:
            hourly = _extract_series(endpoint_frames[cfg['endpoint']], cfg['endpoint'], cfg['value_field'])
        if hourly.empty:
            print(f'  [epias] WARNING: no new data for {key} this run — kept previous values')
        market[key] = _build_series_block(existing.get(key, {}), cfg['label'], cfg['unit'], hourly)

    OUT_MARKET.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_MARKET, 'w', encoding='utf-8') as f:
        json.dump(market, f, indent=2, ensure_ascii=False, allow_nan=False)
    print(f'TUR market → {OUT_MARKET}')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Fetch Turkiye market prices from EPIAS')
    parser.add_argument('--start-date', type=str, default=None,
                         help='YYYY-MM-DD. Default: 14 days ago. Use e.g. 2018-01-01 once, to backfill full history.')
    parser.add_argument('--end-date', type=str, default=None,
                         help='YYYY-MM-DD. Default: today.')
    args = parser.parse_args()
    run(start_date=args.start_date, end_date=args.end_date)
