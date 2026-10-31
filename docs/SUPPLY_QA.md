# Supply data QA

Written by `tools/pipelines/reconcile_supply.py`; do not edit by hand. Each country's
generation and capacity series as they were before the step, compared with Ember
(data to 2025), and what the step did. "Ours / Ember" is the series total as a
share of Ember's for the same year (pumped storage left out): the latest year both
have, and the year furthest from 100%.

## Summary

| Block | Action | Countries |
|---|---|---|
| capacity | filled from Ember | 15 |
| capacity | kept (Ember lacks Coal) | 1 |
| capacity | kept (Ember lacks Oil & Other Fossil) | 1 |
| capacity | kept (Ember lacks Other Renewables) | 7 |
| capacity | kept (Ember lacks Solar) | 3 |
| capacity | kept (national source) | 4 |
| capacity | kept (no Ember data) | 1 |
| capacity | missing (no Ember data) | 2 |
| capacity | refreshed from current Ember release | 109 |
| capacity | replaced by Ember (ENTSO-E incomplete) | 32 |
| generation | filled from Ember | 1 |
| generation | kept (national source) | 4 |
| generation | kept (no Ember data) | 2 |
| generation | missing (no Ember data) | 1 |
| generation | refreshed from current Ember release | 134 |
| generation | replaced by Ember (ENTSO-E incomplete) | 33 |

## Generation

| Country | Source before | Years before | Ours / Ember, latest | Furthest from Ember | Action | Years now |
|---|---|---|---|---|---|---|
| AFG | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| AGO | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| ALB | — | — | — | — | missing (no Ember data) | — |
| ARE | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| ARG | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| ARM | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| ATG | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| AUT | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 78% | 76% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| AZE | SSC Azerbaijan · Table 5.4 — State Stati | 2015–2024 | 102% | 102% | kept (national source) | 2015–2024 |
| BDI | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BEL | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 94% | 93% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| BEN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BFA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BGD | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| BGR | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 96% | 96% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| BHR | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BHS | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BIH | ENTSO-E Transparency Platform — Actual G | 2017–2024 | 79% | 59% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| BLZ | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BOL | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| BRA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| BRB | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BRN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BTN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BWA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| CAF | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2023 |
| CAN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| CHE | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 56% | 20% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| CHL | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| CIV | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| CMR | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| COD | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| COG | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| COL | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| COM | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2023 |
| CPV | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| CRI | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| CUB | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| CYP | ENTSO-E Transparency Platform — Actual G | 2015–2022 | 37% | 37% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| CZE | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 93% | 93% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| DEU | ENTSO-E Transparency Platform — Actual G | 2015–2023 | 88% | 0% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| DJI | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| DMA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2023 |
| DNK | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 68% | 65% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| DOM | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| DZA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| ECU | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| EGY | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| ESP | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 86% | 86% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| EST | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 79% | 74% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| ETH | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| FIN | ENTSO-E Transparency Platform — Actual G | 2016–2024 | 94% | 88% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| FJI | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| FRA | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 92% | 91% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| FSM | Our World in Data / Ember — Yearly Elect | 2015–2023 | — | — | kept (no Ember data) | 2015–2023 |
| GAB | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GBR | ENTSO-E Transparency Platform — Actual G | 2016–2021 | 37% | 37% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| GEO | ESCO Georgia — Annual Electricity Balanc | 2017–2025 | 102% | 102% | kept (national source) | 2017–2025 |
| GHA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GIN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GMB | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GNB | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GNQ | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GRC | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 86% | 75% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| GRD | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GTM | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GUY | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| HND | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| HRV | ENTSO-E Transparency Platform — Actual G | 2019–2024 | 85% | 85% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| HTI | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| HUN | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 85% | 85% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| IDN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| IND | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| IRL | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 75% | 74% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| IRQ | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| ISL | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| ITA | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 44% | 40% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| JAM | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| JOR | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| KAZ | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| KEN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| KGZ | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| KHM | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| KIR | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| KNA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| KWT | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| LAO | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| LBN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| LBR | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| LBY | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| LCA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| LKA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| LSO | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| LTU | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 96% | 77% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| LUX | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 85% | 50% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| LVA | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 93% | 89% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| MAR | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| MDA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| MDG | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| MDV | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| MEX | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| MKD | ENTSO-E Transparency Platform — Actual G | 2016–2024 | 74% | 56% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| MLI | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| MMR | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| MNE | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 91% | 64% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| MOZ | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| MRT | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| MUS | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| MWI | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| MYS | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| NAM | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| NER | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| NGA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| NIC | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| NLD | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 87% | 87% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| NOR | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 13% | 11% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| NPL | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| NRU | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| OMN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| PAK | Our World in Data / Ember — Yearly Elect | 2015–2023 | 116% | 116% | refreshed from current Ember release | 2015–2025 |
| PAN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| PER | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| PHL | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| PNG | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| POL | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 91% | 89% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| PRT | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 83% | 83% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| PRY | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| PSE | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| QAT | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| ROU | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 97% | 97% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| RWA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SAU | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SDN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SEN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SGP | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| SLB | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SLE | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SLV | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| SOM | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SRB | ENTSO-E Transparency Platform — Actual G | 2016–2024 | 93% | 2% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| SSD | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| STP | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2023 |
| SUR | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SVK | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 98% | 97% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| SVN | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 90% | 90% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| SWE | ENTSO-E Transparency Platform — Actual G | 2015–2024 | 44% | 3% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| SWZ | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SYC | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SYR | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| TCD | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| TGO | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| THA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| TJK | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| TKM | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| TLS | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| TON | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| TTO | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| TUN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| TUR | TEİAŞ official statistics · file 63 (gen | 2000–2024 | 104% | 104% | kept (national source) | 2000–2024 |
| TUV | Our World in Data / Ember — Yearly Elect | 2015–2023 | — | — | kept (no Ember data) | 2015–2023 |
| TZA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| UGA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| UKR | — | — | — | — | filled from Ember | 2015–2022 |
| URY | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| USA | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| UZB | Our World in Data / Ember (fuel mix base | 2015–2023 | 100% | 100% | kept (national source) | 2015–2023 |
| VCT | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| VEN | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| VNM | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| VUT | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2023 |
| WSM | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| YEM | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| ZAF | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| ZMB | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| ZWE | Our World in Data / Ember — Yearly Elect | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |

## Capacity

| Country | Source before | Years before | Ours / Ember, latest | Furthest from Ember | Action | Years now |
|---|---|---|---|---|---|---|
| AFG | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 123% | refreshed from current Ember release | 2015–2024 |
| AGO | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| ALB | ENTSO-E Transparency Platform — Installe | 2018–2024 | — | — | kept (no Ember data) | 2018–2024 |
| ARE | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| ARG | — | — | — | — | filled from Ember | 2015–2025 |
| ARM | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| ATG | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 400% | 900% | kept (Ember lacks Oil & Other Fossil) | 2015–2023 |
| AUT | ENTSO-E Transparency Platform — Installe | 2015–2024 | 73% | 66% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| AZE | SSC Azerbaijan · Table 5.3 — State Stati | 2015–2024 | 79% | 79% | kept (national source) | 2015–2024 |
| BDI | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BEL | ENTSO-E Transparency Platform — Installe | 2015–2024 | 98% | 91% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| BEN | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BFA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BGD | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 101% | refreshed from current Ember release | 2015–2025 |
| BGR | ENTSO-E Transparency Platform — Installe | 2015–2024 | 95% | 84% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| BHR | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BHS | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BIH | ENTSO-E Transparency Platform — Installe | 2017–2024 | 78% | 78% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| BLZ | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BOL | — | — | — | — | filled from Ember | 2015–2025 |
| BRA | — | — | — | — | filled from Ember | 2015–2025 |
| BRB | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BRN | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BTN | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| BWA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| CAF | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2023 |
| CAN | — | — | — | — | filled from Ember | 2015–2025 |
| CHE | ENTSO-E Transparency Platform — Installe | 2015–2024 | 34% | 34% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| CHL | — | — | — | — | filled from Ember | 2015–2025 |
| CIV | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 85% | 85% | refreshed from current Ember release | 2015–2024 |
| CMR | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 87% | 87% | refreshed from current Ember release | 2015–2024 |
| COD | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| COG | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| COL | — | — | — | — | filled from Ember | 2015–2025 |
| COM | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2023 |
| CPV | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| CRI | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 108% | 108% | kept (Ember lacks Other Renewables) | 2015–2023 |
| CUB | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| CYP | ENTSO-E Transparency Platform — Installe | 2015–2021 | 82% | 82% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| CZE | ENTSO-E Transparency Platform — Installe | 2015–2024 | 101% | 105% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| DEU | ENTSO-E Transparency Platform — Installe | 2018–2024 | 97% | 95% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| DJI | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| DMA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2023 |
| DNK | ENTSO-E Transparency Platform — Installe | 2015–2024 | 54% | 54% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| DOM | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| DZA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 96% | 93% | refreshed from current Ember release | 2015–2024 |
| ECU | — | — | — | — | filled from Ember | 2015–2025 |
| EGY | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 97% | 97% | refreshed from current Ember release | 2015–2025 |
| ESP | ENTSO-E Transparency Platform — Installe | 2015–2024 | 88% | 88% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| EST | ENTSO-E Transparency Platform — Installe | 2015–2024 | 79% | 77% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| ETH | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| FIN | ENTSO-E Transparency Platform — Installe | 2015–2024 | 88% | 82% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| FJI | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| FRA | ENTSO-E Transparency Platform — Installe | 2015–2024 | 89% | 85% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| FSM | — | — | — | — | missing (no Ember data) | — |
| GAB | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 91% | 121% | refreshed from current Ember release | 2015–2024 |
| GBR | ENTSO-E Transparency Platform — Installe | 2015–2021 | 101% | 79% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| GEO | GSE / World Bank Power Sector Data Repos | 2017–2025 | 80% | 80% | kept (national source) | 2017–2025 |
| GHA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GIN | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GMB | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GNB | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GNQ | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GRC | ENTSO-E Transparency Platform — Installe | 2015–2024 | 86% | 80% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| GRD | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| GTM | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 101% | 101% | refreshed from current Ember release | 2015–2024 |
| GUY | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| HND | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 105% | 106% | kept (Ember lacks Coal) | 2015–2023 |
| HRV | ENTSO-E Transparency Platform — Installe | 2015–2024 | 75% | 72% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| HTI | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| HUN | ENTSO-E Transparency Platform — Installe | 2015–2024 | 70% | 69% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| IDN | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 105% | 108% | kept (Ember lacks Other Renewables) | 2015–2023 |
| IND | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| IRL | ENTSO-E Transparency Platform — Installe | 2015–2024 | 72% | 72% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| IRQ | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 106% | 113% | refreshed from current Ember release | 2015–2024 |
| ISL | — | — | — | — | filled from Ember | 2015–2024 |
| ITA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| JAM | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| JOR | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| KAZ | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 101% | 101% | refreshed from current Ember release | 2015–2025 |
| KEN | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 134% | 143% | kept (Ember lacks Other Renewables) | 2015–2023 |
| KGZ | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 91% | refreshed from current Ember release | 2015–2025 |
| KHM | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 102% | refreshed from current Ember release | 2015–2025 |
| KIR | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| KNA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| KWT | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| LAO | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| LBN | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 98% | 107% | refreshed from current Ember release | 2015–2024 |
| LBR | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| LBY | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 97% | 97% | refreshed from current Ember release | 2015–2024 |
| LCA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| LKA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| LSO | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| LTU | ENTSO-E Transparency Platform — Installe | 2015–2024 | 68% | 68% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| LUX | ENTSO-E Transparency Platform — Installe | 2015–2024 | 94% | 80% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| LVA | ENTSO-E Transparency Platform — Installe | 2015–2024 | 93% | 93% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| MAR | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 99% | 99% | refreshed from current Ember release | 2015–2025 |
| MDA | — | — | — | — | filled from Ember | 2015–2025 |
| MDG | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| MDV | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 95% | 95% | refreshed from current Ember release | 2015–2024 |
| MEX | — | — | — | — | filled from Ember | 2015–2025 |
| MKD | ENTSO-E Transparency Platform — Installe | 2016–2024 | 66% | 66% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| MLI | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| MMR | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 110% | 110% | refreshed from current Ember release | 2015–2024 |
| MNE | ENTSO-E Transparency Platform — Installe | 2015–2024 | 89% | 119% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| MOZ | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 98% | 98% | refreshed from current Ember release | 2015–2024 |
| MRT | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| MUS | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 101% | refreshed from current Ember release | 2015–2024 |
| MWI | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 102% | 102% | refreshed from current Ember release | 2015–2024 |
| MYS | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 102% | 103% | refreshed from current Ember release | 2015–2025 |
| NAM | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 89% | 88% | refreshed from current Ember release | 2015–2024 |
| NER | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| NGA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 99% | 99% | refreshed from current Ember release | 2015–2025 |
| NIC | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 125% | 125% | kept (Ember lacks Other Renewables) | 2015–2023 |
| NLD | ENTSO-E Transparency Platform — Installe | 2015–2024 | 111% | 126% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| NOR | ENTSO-E Transparency Platform — Installe | 2015–2024 | 11% | 10% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| NPL | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| NRU | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| OMN | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 103% | 104% | refreshed from current Ember release | 2015–2025 |
| PAK | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 95% | 95% | refreshed from current Ember release | 2015–2025 |
| PAN | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 97% | 96% | refreshed from current Ember release | 2015–2024 |
| PER | — | — | — | — | filled from Ember | 2015–2025 |
| PHL | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 108% | 111% | kept (Ember lacks Other Renewables) | 2015–2023 |
| PNG | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 106% | 108% | kept (Ember lacks Other Renewables) | 2015–2023 |
| POL | ENTSO-E Transparency Platform — Installe | 2015–2024 | 89% | 89% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| PRT | ENTSO-E Transparency Platform — Installe | 2015–2024 | 67% | 67% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| PRY | — | — | — | — | filled from Ember | 2015–2025 |
| PSE | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 82% | 82% | refreshed from current Ember release | 2015–2024 |
| QAT | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| ROU | ENTSO-E Transparency Platform — Installe | 2015–2024 | 70% | 70% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| RWA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 103% | 108% | refreshed from current Ember release | 2015–2024 |
| SAU | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SDN | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SEN | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 99% | refreshed from current Ember release | 2015–2024 |
| SGP | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| SLB | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SLE | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 104% | kept (Ember lacks Solar) | 2015–2023 |
| SLV | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 110% | 116% | kept (Ember lacks Other Renewables) | 2015–2023 |
| SOM | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SRB | ENTSO-E Transparency Platform — Installe | 2015–2024 | 111% | 117% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| SSD | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| STP | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2023 |
| SUR | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| SVK | ENTSO-E Transparency Platform — Installe | 2015–2021 | 94% | 90% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| SVN | ENTSO-E Transparency Platform — Installe | 2015–2024 | 100% | 88% | replaced by Ember (ENTSO-E incomplete) | 2015–2025 |
| SWE | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 102% | refreshed from current Ember release | 2015–2025 |
| SWZ | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 90% | 90% | refreshed from current Ember release | 2015–2024 |
| SYC | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 109% | kept (Ember lacks Solar) | 2015–2023 |
| SYR | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 92% | 92% | refreshed from current Ember release | 2015–2024 |
| TCD | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| TGO | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| THA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| TJK | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| TKM | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| TLS | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| TON | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| TTO | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 101% | 101% | refreshed from current Ember release | 2015–2024 |
| TUN | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 105% | 107% | refreshed from current Ember release | 2015–2025 |
| TUR | TEİAŞ official statistics · file 9 (capa | 2006–2024 | 100% | 107% | kept (national source) | 2006–2024 |
| TUV | — | — | — | — | missing (no Ember data) | — |
| TZA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 101% | refreshed from current Ember release | 2015–2024 |
| UGA | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 94% | 94% | refreshed from current Ember release | 2015–2024 |
| UKR | ENTSO-E Transparency Platform — Installe | 2020–2023 | 90% | 90% | replaced by Ember (ENTSO-E incomplete) | 2015–2022 |
| URY | — | — | — | — | filled from Ember | 2015–2025 |
| USA | — | — | — | — | filled from Ember | 2015–2025 |
| UZB | National Statistics Committee of Uzbekis | 2015–2023 | 112% | 112% | kept (national source) | 2015–2023 |
| VCT | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 86% | 86% | refreshed from current Ember release | 2015–2024 |
| VEN | — | — | — | — | filled from Ember | 2015–2024 |
| VNM | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2025 |
| VUT | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 150% | 150% | kept (Ember lacks Solar) | 2015–2023 |
| WSM | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| YEM | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 98% | 97% | refreshed from current Ember release | 2015–2024 |
| ZAF | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 97% | 104% | refreshed from current Ember release | 2015–2025 |
| ZMB | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 100% | refreshed from current Ember release | 2015–2024 |
| ZWE | Ember — Yearly Electricity Data (ember-e | 2015–2023 | 100% | 101% | refreshed from current Ember release | 2015–2024 |

## ENTSO-E detail files

`public/data/entsoe/<ISO3>.json` keeps ENTSO-E's finer fuel split for the AI assistant
(`data__fuel_detail`). Its totals are not used: this is how much of Ember's total they cover.

| Country | Block | Years | ENTSO-E / Ember, latest | Furthest from Ember |
|---|---|---|---|---|
| ALB | capacity | 2018–2024 | — | — |
| AUT | generation | 2015–2024 | 78% | 76% |
| AUT | capacity | 2015–2024 | 73% | 66% |
| BEL | generation | 2015–2024 | 94% | 93% |
| BEL | capacity | 2015–2024 | 98% | 91% |
| BGR | generation | 2015–2024 | 96% | 96% |
| BGR | capacity | 2015–2024 | 95% | 84% |
| BIH | generation | 2017–2024 | 79% | 59% |
| BIH | capacity | 2017–2024 | 78% | 78% |
| CHE | generation | 2015–2024 | 56% | 20% |
| CHE | capacity | 2015–2024 | 34% | 34% |
| CYP | generation | 2015–2022 | 37% | 37% |
| CYP | capacity | 2015–2021 | 82% | 82% |
| CZE | generation | 2015–2024 | 93% | 93% |
| CZE | capacity | 2015–2024 | 101% | 105% |
| DEU | generation | 2015–2023 | 88% | 0% |
| DEU | capacity | 2018–2024 | 97% | 95% |
| DNK | generation | 2015–2024 | 68% | 65% |
| DNK | capacity | 2015–2024 | 54% | 54% |
| ESP | generation | 2015–2024 | 86% | 86% |
| ESP | capacity | 2015–2024 | 88% | 88% |
| EST | generation | 2015–2024 | 79% | 74% |
| EST | capacity | 2015–2024 | 79% | 77% |
| FIN | generation | 2016–2024 | 94% | 88% |
| FIN | capacity | 2015–2024 | 88% | 82% |
| FRA | generation | 2015–2024 | 92% | 91% |
| FRA | capacity | 2015–2024 | 89% | 85% |
| GBR | generation | 2016–2021 | 37% | 37% |
| GBR | capacity | 2015–2021 | 101% | 79% |
| GRC | generation | 2015–2024 | 86% | 75% |
| GRC | capacity | 2015–2024 | 86% | 80% |
| HRV | generation | 2019–2024 | 85% | 85% |
| HRV | capacity | 2015–2024 | 75% | 72% |
| HUN | generation | 2015–2024 | 85% | 85% |
| HUN | capacity | 2015–2024 | 70% | 69% |
| IRL | generation | 2015–2024 | 75% | 74% |
| IRL | capacity | 2015–2024 | 72% | 72% |
| ITA | generation | 2015–2024 | 44% | 40% |
| LTU | generation | 2015–2024 | 96% | 77% |
| LTU | capacity | 2015–2024 | 68% | 68% |
| LUX | generation | 2015–2024 | 85% | 50% |
| LUX | capacity | 2015–2024 | 94% | 80% |
| LVA | generation | 2015–2024 | 93% | 89% |
| LVA | capacity | 2015–2024 | 93% | 93% |
| MKD | generation | 2016–2024 | 74% | 56% |
| MKD | capacity | 2016–2024 | 66% | 66% |
| MNE | generation | 2015–2024 | 91% | 64% |
| MNE | capacity | 2015–2024 | 89% | 119% |
| NLD | generation | 2015–2024 | 87% | 87% |
| NLD | capacity | 2015–2024 | 111% | 126% |
| NOR | generation | 2015–2024 | 13% | 11% |
| NOR | capacity | 2015–2024 | 11% | 10% |
| POL | generation | 2015–2024 | 91% | 89% |
| POL | capacity | 2015–2024 | 89% | 89% |
| PRT | generation | 2015–2024 | 83% | 83% |
| PRT | capacity | 2015–2024 | 67% | 67% |
| ROU | generation | 2015–2024 | 97% | 97% |
| ROU | capacity | 2015–2024 | 70% | 70% |
| SRB | generation | 2016–2024 | 93% | 2% |
| SRB | capacity | 2015–2024 | 111% | 117% |
| SVK | generation | 2015–2024 | 98% | 97% |
| SVK | capacity | 2015–2021 | 94% | 90% |
| SVN | generation | 2015–2024 | 90% | 90% |
| SVN | capacity | 2015–2024 | 100% | 88% |
| SWE | generation | 2015–2024 | 44% | 3% |
| UKR | capacity | 2020–2023 | 90% | 90% |
