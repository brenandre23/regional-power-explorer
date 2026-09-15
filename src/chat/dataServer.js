// Read-only MCP tools over compact publication JSON. The assistant deliberately
// avoids opening the large display GeoJSON files: MapLibre handles geometry;
// the model gets only the small analytical slices it needs.
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { appUrl } from './urls';

const cache = new Map();
const getJson = path => {
  const url = appUrl(path);
  if (!cache.has(url)) {
    cache.set(url, fetch(url)
      .then(r => (r.ok ? r.json() : undefined))
      .catch(() => undefined));
  }
  return cache.get(url);
};
const json = o => ({ content: [{ type: 'text', text: JSON.stringify(o) }] });
const iso3 = z.string().length(3).transform(s => s.toUpperCase()).describe('ISO3 country code, e.g. KEN');
const last = arr => arr?.at(-1);

export function buildDataServer() {
  const server = new McpServer({ name: 'data', version: '1.0.0' });

  server.tool('regions', 'List power pools/regions and member countries. Use this to resolve names to region ids and ISO3 codes.', {}, async () => {
    const { regions = [] } = (await getJson('data/regions.json')) ?? {};
    return json(regions.map(({ id, name, status, type, parent, countries, non_determined }) =>
      ({ id, name, status, type, parent, countries, non_determined })));
  });

  server.tool('capacity', 'Installed capacity in MW by fuel and country for a region, using one published plant dataset. Also returns GPPD fleet age where available.', {
    regionId: z.string().describe('region id from data__regions, e.g. wapp'),
    source: z.enum(['osm', 'gem', 'gppd']).default('gem'),
  }, async ({ regionId, source }) => {
    const suffix = source === 'osm' ? '' : `_${source}`;
    const [cap, age] = await Promise.all([
      getJson(`data/cache/region_capacity_${regionId}${suffix}.json`),
      getJson(`data/cache/region_age_${regionId}_gppd.json`),
    ]);
    if (!cap) return json({ available: false, message: `No ${source} capacity publication for region ${regionId}.` });
    return json({
      available: true,
      metric: 'installed capacity', unit: 'MW', plantDataset: source,
      countries: cap.countries,
      fleetAge: age ? { source: 'GPPD', referenceYear: age.reference_year, unit: 'years', countries: age.countries } : undefined,
    });
  });

  server.tool('supply', 'Generation and capacity by fuel for one country, including latest values and annual totals. Returns the publication source strings.', { iso: iso3 }, async ({ iso }) => {
    const d = await getJson(`data/supply/${iso}.json`);
    if (!d) return json({ available: false, message: `No supply publication for ${iso}.` });
    const summarise = block => block && {
      source: block.source, unit: block.unit, note: block.note,
      latestYear: last(block.years),
      latestByFuel: Object.fromEntries(Object.entries(block.fuels ?? {}).map(([f, s]) => [f, last(s)])),
      totalByYear: Object.fromEntries((block.years ?? []).map((y, i) => [y,
        Object.values(block.fuels ?? {}).reduce((a, series) => a + (Number(series[i]) || 0), 0)])),
      demandByYear: block.demand ? Object.fromEntries(block.years.map((y, i) => [y, block.demand[i]])) : undefined,
      peakDemandByYear: block.peak_demand ? Object.fromEntries(block.years.map((y, i) => [y, block.peak_demand[i]])) : undefined,
    };
    return json({ available: true, country: d.country, iso, generation: summarise(d.generation), capacity: summarise(d.capacity) });
  });

  server.tool('trade', 'Electricity imports and exports for one country: annual net imports and leading partners in the latest year.', {
    iso: iso3,
    topN: z.number().int().min(1).max(15).default(8),
  }, async ({ iso, topN }) => {
    const d = await getJson(`data/trade/${iso}.json`);
    if (!d) return json({ available: false, message: `No trade publication for ${iso}.` });
    const sum = m => d.years.map((_, i) => Object.values(m || {}).reduce((a, series) => a + (Number(series[i]) || 0), 0));
    const imp = sum(d.imports), exp = sum(d.exports);
    const top = m => Object.entries(m || {})
      .map(([partner, series]) => [partner, last(series)])
      .filter(([, value]) => Number(value) > 0)
      .sort((a, b) => b[1] - a[1]).slice(0, topN);
    return json({
      available: true, country: d.country, iso, source: d.source, unit: d.unit,
      latestYear: last(d.years),
      netImportsByYear: Object.fromEntries(d.years.map((year, i) => [year, +(imp[i] - exp[i]).toFixed(1)])),
      latestTopImportPartners: Object.fromEntries(top(d.imports)),
      latestTopExportPartners: Object.fromEntries(top(d.exports)),
    });
  });

  server.tool('indicators', 'Electricity access and retail tariffs for up to 30 countries from the explorer publications.', {
    isos: z.array(iso3).min(1).max(30),
  }, async ({ isos }) => {
    const [access, tariffs] = await Promise.all([getJson('data/access.json'), getJson('data/tariffs.json')]);
    return json({
      access: { year: access?.year, source: access?.source, unit: '% of population' },
      tariffs: { year: tariffs?.year, source: tariffs?.source, unit: 'USD/kWh' },
      countries: Object.fromEntries(isos.map(code => [code, {
        access: access?.countries?.[code], tariffs: tariffs?.countries?.[code],
      }])),
    });
  });

  return server;
}
