"""
Run all country data pipelines and regenerate public/data/ JSON files.

Usage:
  conda activate gams_env

  # All pipelines (ENTSO-E is slow on first run, fast thereafter):
  python tools/build_all.py

  # Skip ENTSO-E (quick local-file pipelines only):
  python tools/build_all.py --no-entsoe

  # ENTSO-E only, specific countries:
  python tools/build_all.py --entsoe-only BG RO GR

  # Central Asia only (OWID + Comtrade + enrichments):
  python tools/build_all.py --ca-only

Pipelines:
  TUR     — TEİAS XLS -> supply/TUR.json + trade/TUR.json
  AZE     — SSC XLS + CSV -> supply/AZE.json + trade/AZE.json
  GEO     — ESCO PDFs + TYNDP xlsx -> supply/GEO.json
  ARM     — OWID/Ember + IEA/Armstat + ESCO PDFs -> supply/ARM.json + trade/ARM.json
  EPIAS   — EPIAS Transparency Platform (eptr2) -> market/TUR.json
            Requires [api_tokens] epias_username/epias_password in config/api_tokens.ini
  OWID    — OWID/Ember CSV -> supply/{ISO3}.json for any country list
            Default countries: KAZ UZB KGZ TJK TKM
  UZB     — SIAT JSONs -> enriches supply/UZB.json with capacity (MW)
            Runs after OWID pipeline.
  Comtrade — UN Comtrade HS 2716 API -> trade/{ISO3}.json for any country list
             Requires [api_tokens] comtrade key in config/api_tokens.ini
  Reconcile — runs last: checks every supply/{ISO3}.json against Ember, replaces
             incomplete ENTSO-E series, refreshes Ember ones, writes docs/SUPPLY_QA.md
  ENTSO-E — ENTSO-E API -> entsoe/{ISO3}.json (fuel detail) + trade/{ISO3}.json for 36 countries
             First run ~30-60 min; subsequent runs use cached CSVs (instant).
             Cache: data-source/raw/ENTSOE/  (gitignored)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from pipelines import (
    tur_pipeline,
    epias_pipeline,
    aze_pipeline,
    geo_pipeline,
    arm_pipeline,
    owid_pipeline,
    uzb_pipeline,
    comtrade_pipeline,
    entsoe_supply_pipeline,
    reconcile_supply,
)
import check_notes

if __name__ == '__main__':
    args = sys.argv[1:]
    no_entsoe    = '--no-entsoe'   in args
    entsoe_only  = '--entsoe-only' in args
    ca_only      = '--ca-only'     in args
    entsoe_countries = [a for a in args if not a.startswith('--')] or None

    if not entsoe_only:
        if not ca_only:
            print('=== TUR pipeline ===')
            tur_pipeline.run()
            print()
            print('=== EPIAS pipeline (TUR market prices) ===')
            epias_pipeline.run()
            print()
            print('=== AZE pipeline ===')
            aze_pipeline.run()
            print()
            print('=== GEO pipeline ===')
            geo_pipeline.run()
            print()
            print('=== ARM pipeline ===')
            arm_pipeline.run()
            print()

        print('=== OWID pipeline (Central Asia) ===')
        owid_pipeline.run()
        print()

        print('=== UZB enrichment (SIAT capacity) ===')
        uzb_pipeline.run()
        print()

        print('=== Comtrade pipeline (Central Asia) ===')
        comtrade_pipeline.run()
        print()

    if not no_entsoe and not ca_only:
        print('=== ENTSO-E pipeline ===')
        entsoe_supply_pipeline.run(iso2_filter=entsoe_countries)
        print()

    # Last: check every supply file against Ember and repair what the source
    # pipelines left incomplete (see tools/pipelines/reconcile_supply.py).
    print('=== Supply reconciliation (Ember check) ===')
    reconcile_supply.run()
    print()

    print('=== Briefing notes check ===')
    check_notes.main()
    print()

    print('Done.')
