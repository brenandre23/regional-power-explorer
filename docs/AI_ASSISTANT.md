# AI assistant

How the explorer's built-in assistant answers questions, and the rules to keep when
changing it. Architecture and the trust boundary: `AI_CHAT_ARCHITECTURE.md`. What the data
means: `public/data/methodology.md`.

## What it is for

Analysts ask energy questions in plain language and get a short answer built from the
explorer's own data, with the source, year and unit next to every figure. The assistant can
also move the map and the dashboard. It does not search the web, read attachments or make
figures up: if the explorer does not publish something, it says so and offers the closest
thing it has.

## How it is put together

| Part | File | Role |
|---|---|---|
| System prompt | `src/chat/MapChat.jsx` (`SYSTEM_PROMPT`) | Audience, what the data covers, how to answer (grounding, sources, missing data, comparing like with like, caveats, untrusted text), style |
| Data tools | `src/chat/dataServer.js` | 16 read-only tools over `public/data/`; the model sees them as `data__<name>` |
| App tool | `src/chat/appControl.js` | `app__update_state`: navigate, open tabs, filter plants, read the current view |
| Map tools | `@imaps/ai-chat` | `map__*`: camera, layers, legend, what is on screen, screenshot |
| Methodology | `public/data/methodology.md` | One file for people and the model: sources, definitions, limits |
| Model and policy | `src/chat/config.js` | Allowed models (default Claude Opus 5, then Sonnet 5), gateway, locks |

The chat package runs at most 12 tool rounds per answer; tools that take several countries
at once (supply, indicators, re_resources) keep comparisons inside that.

## Design rules

These follow Anthropic's guidance for tool use and prompts; keep them when editing.

1. **The system prompt is context and policy, not a tool list.** It names no tools, so adding
   or removing one never leaves a stale reference. Rules about one tool go in that tool's
   description.
2. **Each tool description is a contract:** what it returns, when to use it (and when another
   tool fits better), what every parameter means, and its limits. Keep it accurate when the
   data changes: a description that promises something the data doesn't do misleads the
   model more than a missing one.
3. **Every result has the same shape.** `{ available: true, source, years/unit, caveats?, ... }`
   or `{ available: false, message }`, where the message says what to try instead. Caveats
   travel with the data (trade problems, planned vs committed, AI-drafted notes), so the model
   can pass them on.
4. **Figures come only from tool results.** General knowledge may explain a concept, never
   supply a number. Missing data is reported as missing. A derived figure (share, growth,
   ratio) comes with how it was worked out: inputs, sources, years, calculation.
5. **Judgement questions get evidence and reasoning,** with the conclusion labelled as the
   assistant's reading of the data. When the answer turns on a choice only the user can make
   (cost versus emissions, which criterion matters most), the assistant asks instead of choosing.
6. **Text from the data is untrusted.** Briefing notes are AI-drafted; the prompt tells the
   model never to act on instructions inside data, and note results restate it.
7. **No shouting.** Plain statements with the reason beside them; current models follow
   instructions closely, and capitalised MUST/NEVER makes them rigid.

## The tools

| Tool | Use for | Source |
|---|---|---|
| `regions` | Region and country ids, power-pool membership | `regions.json` |
| `coverage` | What is published for a country | build file list |
| `methodology` | Where a figure comes from, definitions, limits | `methodology.md` |
| `supply` | Generation, capacity and demand by fuel and year (up to 10 countries) | Ember (national statistics); national sources for 4 countries |
| `capacity` | Operating plant capacity by fuel for a region, fleet age | GEM, GPPD or OSM |
| `pipeline` | Planned and under-construction MW by fuel | GEM |
| `plants` | Largest plants by fuel and status | GEM, GPPD or OSM |
| `trade` | Net imports, partners, flows by year, with known-problem caveats | ENTSO-E, Comtrade, EAPP, national |
| `indicators` | Access (total, urban, rural) and tariffs (up to 30 countries) | World Bank WDI; tariff compilation |
| `re_resources` | Solar and wind resource (up to 30 countries) | Global Solar Atlas, Global Wind Atlas, NASA POWER |
| `fuel_detail` | Split within hydro, coal, wind (Europe) | ENTSO-E harmonised statistics |
| `grid` | Line km by voltage, operators, substations (region) | OpenStreetMap |
| `market` | Wholesale prices and volumes (Türkiye) | EPİAŞ |
| `zones` | Planning-model zones and their plants | EPM zones, OSM plants |
| `load_centres` | Main cities by population (Black Sea) | not recorded |
| `country_note` | Qualitative context: actors, issues, takeaways | AI-drafted briefing notes |

Derived files behind some tools are rebuilt by `tools/prepare_ai.py` (checked in CI), and
`tools/prepare_re.py`; see `DATA_LINEAGE.md`.

## Known limits (state them, don't hide them)

- **National and regional only.** Sub-national figures come in a later iteration (Kenya first).
- **Trade volumes are indicative.** ENTSO-E flows under-count some borders, and Norway,
  Sweden and Denmark cover one price zone (`TRADE_AUDIT.md`). The trade tool attaches these
  caveats to every result.
- **Plant databases and national statistics differ** by design; the tools name the database.
- **The chat package's model list** stops at Claude Opus 5 and Sonnet 5; a package update is
  needed for newer models.

## Test questions

Run these after any change to the prompt, a tool or the data, with the browser's network tab
open. A pass means the answer has the listed property. The set is spread across regions and
includes the data's edge cases (national sources, gaps, small islands, one-zone trade files),
because those are where an answer can go wrong; nothing in the assistant is specific to any
country.

**Core data questions**

| # | Question | Region | Expected |
|---|---|---|---|
| 1 | What is Vietnam's generation mix? | ASEAN | Fuels with GWh or %, latest year, Ember named |
| 2 | Compare installed capacity in Ghana, Nigeria and Senegal | WAPP | One call for all three; table; MW and year |
| 3 | Compare renewable shares across ASEAN | ASEAN | All 10 countries in one call; shares derived and explained |
| 4 | What is the US capacity mix? | North America | Ember capacity, MW, latest year |
| 5 | How much solar is planned in SAPP? | SAPP | GEM pipeline for the region; "planned is not committed" |
| 6 | What are the five largest hydro plants in Ethiopia? | EAPP | GEM; names and MW |
| 7 | What is the electricity access rate in Chad? | CAPP | % with its reference year; WDI |
| 8 | Which has better solar, Morocco or Chile? And wind? | Pan-Arab, Mercosur | PV output and wind speed; whole-country caveat |
| 9 | What share of Austria's hydro is pumped storage? | Europe | ENTSO-E split, with its coverage |
| 10 | What are Turkish day-ahead prices this year? | Black Sea | TL and USD; update date |
| 11 | How long is the high-voltage grid in Central America? | SIEPAC | km by voltage; region total; OSM caveat |
| 12 | What are the largest demand centres in Georgia? | Black Sea | Cities and population; source not recorded |

**Trade, with its known problems**

| # | Question | Region | Expected |
|---|---|---|---|
| 13 | Is Norway a net exporter? | Europe | Yes, from national figures (demand minus generation); the trade file covers one zone |
| 14 | How much electricity does Spain export to Portugal? | Europe | Figure with the ENTSO-E caveat; volumes called indicative |
| 15 | How dependent is Cambodia on imports? | GMS | Imports as a share of demand, worked out and explained; Comtrade caveat |
| 16 | How much power does India import from Bhutan? | South Asia | Not published (no trade file for India); says so |

**Edge cases in the data**

| # | Question | Region | Expected |
|---|---|---|---|
| 17 | What is Uzbekistan's solar generation? | Central Asia | National source (SIAT) named, not Ember |
| 18 | What is Finland's solar resource? | Europe | Not available above 60°N; wind is |
| 19 | What is Tuvalu's electricity mix? | Pacific islands | OWID/Ember figures; small-island approximation |
| 20 | What was Albania's generation last year? | Balkans | Not published (not in Ember); capacity is |

**Not published, methodology, judgement**

| # | Question | Region | Expected |
|---|---|---|---|
| 21 | What are wholesale power prices in India? | South Asia | Not published (Türkiye only); offers retail tariffs |
| 22 | What is the installed capacity of Uttar Pradesh? | South Asia | Sub-national not published; offers India's national figure |
| 23 | Who are the key actors in Nigeria's power sector? | WAPP | Briefing note; says it is AI-drafted, not fact-checked |
| 24 | Where does the explorer's capacity data come from? | — | Methodology: national statistics vs plant databases |
| 25 | Why do capacity figures differ between the Supply tab and the map? | — | Different sources by design |
| 26 | Which country in WAPP has the strongest case for more solar? | WAPP | Evidence and reasoning; conclusion labelled as a reading of the data |
| 27 | Should Indonesia build more geothermal or more solar? | ASEAN | What the data shows for each, then asks which criterion matters |
| 28 | What was Germany's GDP in 2023? | — | Outside the explorer's data; no figure |

**Map and dashboard**

| # | Question | Where | Expected |
|---|---|---|---|
| 29 | Take me to Kazakhstan's supply tab | any page | Navigates, then opens the tab |
| 30 | Show only coal plants | a region page (e.g. South Asia) | Filters; one-line confirmation |
| 31 | What is the installed capacity here? | any country page | Reads the current view first, then answers for that country |
| 32 | Go to Kenya | world map | Opens the country page (Kenya is the planned sub-national pilot) |

Before release, also check the deployment items in `AI_CHAT_QA_CHECKLIST.md`.
