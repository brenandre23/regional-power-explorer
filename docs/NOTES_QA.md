# Briefing notes QA

Written by `tools/check_notes.py`; do not edit by hand. The briefing notes were drafted
with AI assistance and are not fact-checked. Their headline figures for generation,
installed capacity and electricity access are compared here with the explorer's data,
for the year the note names, else the data's latest year.

Reasons a figure differs, and what to do:

- **The note is wrong or out of date.** Correct the note.
- **Different definition.** Notes often give grid-connection rates, while the explorer
  uses World Bank WDI access, which counts off-grid solar. Say which in the note.
- **Different scope or year** (pre-war, "with imports", a 2025 estimate). Name it in the
  label; labels with such words are skipped here.

## Summary

| Measure | Compared | Within 15% | Differ by more |
|---|---|---|---|
| Generation (GWh) | 54 | 49 | 5 |
| Installed capacity (MW) | 141 | 80 | 61 |
| Electricity access (%) | 68 | 51 | 17 |

## Figures that differ by more than 15%

| Country | Note says | Note label | Measure | Year | Explorer data | Data source | Difference |
|---|---|---|---|---|---|---|---|
| TCD | ~4% | National electrification rate | Electricity access (%) | 2024 | 13.4 | World Bank WDI / SE4All | -70% |
| SLB | ~25% | National electricity access rate | Electricity access (%) | 2024 | 81.5 | World Bank WDI / SE4All | -69% |
| AFG | ~30% | National electrification rate | Electricity access (%) | 2024 | 87.8 | World Bank WDI / SE4All | -66% |
| PNG | ~15% | Electricity access rate (grid + off-grid SHS) | Electricity access (%) | 2024 | 43.3 | World Bank WDI / SE4All | -65% |
| MDG | ~22% | Electrification rate | Electricity access (%) | 2024 | 42.5 | World Bank WDI / SE4All | -48% |
| LSO | ~38% | Electrification rate | Electricity access (%) | 2024 | 60.6 | World Bank WDI / SE4All | -37% |
| HTI | ~35% | National electricity access rate (2024 est.) | Electricity access (%) | 2024 | 53.9 | World Bank WDI / SE4All | -35% |
| BEN | ~42% | Electrification rate | Electricity access (%) | 2024 | 59.0 | World Bank WDI / SE4All | -29% |
| BDI | ~15–20% | Electrification rate (World Bank 2023) | Electricity access (%) | 2024 | 20.1 | World Bank WDI / SE4All | -25% |
| SWZ | ~68% | Electrification rate | Electricity access (%) | 2024 | 89.3 | World Bank WDI / SE4All | -24% |
| BFA | ~42% | Electrification rate | Electricity access (%) | 2024 | 34.0 | World Bank WDI / SE4All | +24% |
| SLE | ~30% | Electrification rate | Electricity access (%) | 2024 | 39.2 | World Bank WDI / SE4All | -23% |
| ZWE | ~49% | Electrification rate | Electricity access (%) | 2024 | 62.0 | World Bank WDI / SE4All | -21% |
| LBR | ~28% | Electrification rate | Electricity access (%) | 2024 | 34.9 | World Bank WDI / SE4All | -20% |
| MOZ | ~30% | Electrification rate | Electricity access (%) | 2024 | 36.9 | World Bank WDI / SE4All | -19% |
| AGO | ~47% | Electrification rate | Electricity access (%) | 2024 | 55.5 | World Bank WDI / SE4All | -15% |
| TLS | ~80% | Electrification rate (significantly above Pacific SIDS peers) | Electricity access (%) | 2024 | 94.3 | World Bank WDI / SE4All | -15% |
| LAO | ~35 TWh | Total generation (2023 est.) | Generation (GWh) | 2023 | 52,300 | Ember — Yearly Electricity Data | -33% |
| RWA | ~0.9 TWh | Net generation (2023 estimate) | Generation (GWh) | 2023 | 1,100 | Ember — Yearly Electricity Data | -18% |
| ROU | ~60 TWh | Annual generation | Generation (GWh) | 2024 | 51,157 | ENTSO-E Transparency Platform — Actual Generation per Production Type | +17% |
| ETH | 29.5 TWh | Generation (EFY 2024/25) | Generation (GWh) | 2024 | 25,200 | Ember — Yearly Electricity Data | +17% |
| TKM | ~28 TWh | Generation (est. 2024) | Generation (GWh) | 2024 | 33,010 | Ember — Yearly Electricity Data | -15% |
| ATG | ~285 MW | Total installed capacity | Installed capacity (MW) | 2023 | 80 | Ember — Yearly Electricity Data | +256% |
| DMA | ~85 MW | Total installed capacity | Installed capacity (MW) | 2023 | 30 | Ember — Yearly Electricity Data | +183% |
| VUT | ~65 MW | Total installed capacity (Efate + Santo + outer islands) | Installed capacity (MW) | 2023 | 30 | Ember — Yearly Electricity Data | +117% |
| MRT | ~1.5 GW | Installed capacity (2024 est.) | Installed capacity (MW) | 2024 | 720 | Ember — Yearly Electricity Data | +108% |
| KNA | ~150 MW | Total installed capacity (St. Kitts + Nevis) | Installed capacity (MW) | 2024 | 80 | Ember — Yearly Electricity Data | +88% |
| LCA | ~165 MW | Total installed capacity | Installed capacity (MW) | 2024 | 90 | Ember — Yearly Electricity Data | +83% |
| GRD | ~110 MW | Total installed capacity | Installed capacity (MW) | 2024 | 70 | Ember — Yearly Electricity Data | +57% |
| NIC | ~1.9 GW | Installed capacity (est.) | Installed capacity (MW) | 2023 | 1,210 | Ember — Yearly Electricity Data | +57% |
| GAB | ~450 MW | Installed capacity (SEEG) | Installed capacity (MW) | 2024 | 1,020 | Ember — Yearly Electricity Data | -56% |
| DJI | ~90 MW | Installed capacity (mostly diesel) | Installed capacity (MW) | 2024 | 200 | Ember — Yearly Electricity Data | -55% |
| VCT | ~105 MW | Total installed capacity | Installed capacity (MW) | 2024 | 70 | Ember — Yearly Electricity Data | +50% |
| TZA | ~4.1 GW | Installed capacity (2025) | Installed capacity (MW) | 2024 | 2,750 | Ember — Yearly Electricity Data | +49% |
| LTU | ~4 GW | Total installed capacity | Installed capacity (MW) | 2025 | 7,810 | Ember — Yearly Electricity Data | -49% |
| SLE | ~130 MW | Installed capacity (2024 est.) | Installed capacity (MW) | 2023 | 250 | Ember — Yearly Electricity Data | -48% |
| BHR | ~5 GW | Total installed capacity | Installed capacity (MW) | 2024 | 9,350 | Ember — Yearly Electricity Data | -47% |
| GUY | ~550 MW | Total installed capacity | Installed capacity (MW) | 2024 | 380 | Ember — Yearly Electricity Data | +45% |
| CYP | ~1.6 GW | Total installed capacity | Installed capacity (MW) | 2025 | 2,890 | Ember — Yearly Electricity Data | -45% |
| BEN | ~490 MW | Installed capacity (2024 est.) | Installed capacity (MW) | 2024 | 340 | Ember — Yearly Electricity Data | +44% |
| LBY | ~8.2 GW | Nominal installed capacity | Installed capacity (MW) | 2024 | 14,280 | Ember — Yearly Electricity Data | -43% |
| MDG | ~500 MW | Installed capacity (all grids) | Installed capacity (MW) | 2024 | 870 | Ember — Yearly Electricity Data | -43% |
| BTN | ~3,490 MW | Installed capacity | Installed capacity (MW) | 2024 | 2,460 | Ember — Yearly Electricity Data | +42% |
| DOM | ~5.6 GW | Total installed capacity | Installed capacity (MW) | 2025 | 9,020 | Ember — Yearly Electricity Data | -38% |
| ISL | ~3 GW | Installed capacity | Installed capacity (MW) | 2024 | 2,210 | Ember — Yearly Electricity Data | +36% |
| JAM | ~1,050 MW | Total installed capacity | Installed capacity (MW) | 2024 | 1,630 | Ember — Yearly Electricity Data | -36% |
| BHS | ~700 MW | Total installed capacity (incl. Family Islands) | Installed capacity (MW) | 2024 | 1,080 | Ember — Yearly Electricity Data | -35% |
| IRQ | ~30 GW | Installed capacity | Installed capacity (MW) | 2024 | 46,240 | Ember — Yearly Electricity Data | -35% |
| STP | ~40 MW | Installed capacity | Installed capacity (MW) | 2023 | 30 | Ember — Yearly Electricity Data | +33% |
| ETH | ~8.1 GW | Installed capacity (EFY 2024/25) | Installed capacity (MW) | 2024 | 6,080 | Ember — Yearly Electricity Data | +33% |
| MKD | ~2 100 MW | Installed capacity | Installed capacity (MW) | 2025 | 3,130 | Ember — Yearly Electricity Data | -33% |
| AZE | ~8 GW | Installed capacity | Installed capacity (MW) | 2024 | 6,078 | SSC Azerbaijan · Table 5.3 — State Statistical Committee | +32% |
| MWI | ~450 MW | Installed capacity (2024 est.) | Installed capacity (MW) | 2024 | 640 | Ember — Yearly Electricity Data | -30% |
| SLV | 3,101 MW | Installed capacity (end 2024) | Installed capacity (MW) | 2023 | 2,400 | Ember — Yearly Electricity Data | +29% |
| HRV | ~5 GW | Total installed capacity | Installed capacity (MW) | 2025 | 7,000 | Ember — Yearly Electricity Data | -29% |
| WSM | ~65 MW | Total installed capacity (Upolu + Savai'i) | Installed capacity (MW) | 2024 | 90 | Ember — Yearly Electricity Data | -28% |
| GBR | ~80 GW | Total installed capacity | Installed capacity (MW) | 2025 | 110,740 | Ember — Yearly Electricity Data | -28% |
| SOM | ~80 MW | BECO diesel capacity (Mogadishu) | Installed capacity (MW) | 2024 | 110 | Ember — Yearly Electricity Data | -27% |
| BRN | ~0.9 GW | Installed capacity (2023) | Installed capacity (MW) | 2023 | 1,230 | Ember — Yearly Electricity Data | -27% |
| MEX | ~95 GW | Installed capacity | Installed capacity (MW) | 2025 | 128,330 | Ember — Yearly Electricity Data | -26% |
| CMR | ~1 400 MW | Installed capacity (post-Nachtigal) | Installed capacity (MW) | 2024 | 1,870 | Ember — Yearly Electricity Data | -25% |
| ARM | ~3 263 MW | Installed capacity | Installed capacity (MW) | 2025 | 4,330 | Ember — Yearly Electricity Data | -25% |
| BGR | ~13 GW | Installed capacity | Installed capacity (MW) | 2025 | 17,110 | Ember — Yearly Electricity Data | -24% |
| BRA | ~200 GW | Installed capacity | Installed capacity (MW) | 2025 | 260,640 | Ember — Yearly Electricity Data | -23% |
| SUR | ~540 MW | Total installed capacity | Installed capacity (MW) | 2024 | 700 | Ember — Yearly Electricity Data | -23% |
| UZB | ~25 GW | Installed capacity (2025) | Installed capacity (MW) | 2023 | 20,400 | National Statistics Committee of Uzbekistan — SIAT portal | +23% |
| ZWE | ~2.3 GW | Installed capacity (2024 est.) | Installed capacity (MW) | 2024 | 2,960 | Ember — Yearly Electricity Data | -22% |
| PRT | ~32 GW | Total installed capacity | Installed capacity (MW) | 2025 | 26,290 | Ember — Yearly Electricity Data | +22% |
| SVN | ~4 GW | Total installed capacity | Installed capacity (MW) | 2025 | 5,090 | Ember — Yearly Electricity Data | -21% |
| CHE | ~23 GW | Total installed capacity | Installed capacity (MW) | 2025 | 29,010 | Ember — Yearly Electricity Data | -21% |
| HND | ~3.5 GW | Installed capacity (2024) | Installed capacity (MW) | 2023 | 2,910 | Ember — Yearly Electricity Data | +20% |
| MLI | ~1.0 GW | Installed capacity (2024 est.) | Installed capacity (MW) | 2024 | 1,250 | Ember — Yearly Electricity Data | -20% |
| AUT | ~30 GW | Total installed capacity | Installed capacity (MW) | 2025 | 37,050 | Ember — Yearly Electricity Data | -19% |
| GRC | ~25 GW | Total installed capacity | Installed capacity (MW) | 2025 | 30,520 | Ember — Yearly Electricity Data | -18% |
| ITA | ~120 GW | Total installed capacity | Installed capacity (MW) | 2025 | 144,750 | Ember — Yearly Electricity Data | -17% |
| SEN | ~1.6 GW | Installed capacity (2024) | Installed capacity (MW) | 2024 | 1,930 | Ember — Yearly Electricity Data | -17% |
| HUN | ~14 GW | Total installed capacity | Installed capacity (MW) | 2025 | 16,870 | Ember — Yearly Electricity Data | -17% |
| BDI | ~100 MW | Installed capacity (est. 2024) | Installed capacity (MW) | 2024 | 120 | Ember — Yearly Electricity Data | -17% |
| HTI | ~400 MW | Nominal installed capacity (much offline) | Installed capacity (MW) | 2024 | 480 | Ember — Yearly Electricity Data | -17% |
| TGO | ~420 MW | Installed capacity (2024 est.) | Installed capacity (MW) | 2024 | 360 | Ember — Yearly Electricity Data | +17% |
| SVK | ~8 GW | Total installed capacity | Installed capacity (MW) | 2021 | 6,863 | ENTSO-E Transparency Platform — Installed Generation Capacity Aggregated | +17% |
| FRA | ~140 GW | Total installed capacity | Installed capacity (MW) | 2025 | 167,600 | Ember — Yearly Electricity Data | -16% |
| LAO | ~10 GW | Installed capacity (2023) | Installed capacity (MW) | 2023 | 11,840 | Ember — Yearly Electricity Data | -16% |
