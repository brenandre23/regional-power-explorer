// One `app__update_state` tool that drives the page's own controls. The page
// registers a controller each render; the tool reads the latest one lazily, so
// navigation can swap it under a live chat.
import { useEffect } from 'react';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import files from 'virtual:data-manifest';
import { appPath } from '../utils/paths';
import { fetchData } from '../utils/dataCache';

let controller = null;

export function useAppController(c) {
  useEffect(() => {
    controller = c;
    return () => { if (controller === c) controller = null; };
  });
}

const text = s => ({ content: [{ type: 'text', text: s }] });

export function buildAppControlServer() {
  const server = new McpServer({ name: 'app', version: '1.0.0' });

  server.tool('update_state',
    'Change what the explorer shows, or read what it shows now. Use it when the user asks to go to a country or region, open a tab, ' +
    'switch the plant database on the map, or filter plants by fuel or size; and with no fields to learn the current page, region, country and tab ' +
    '(e.g. when the user says "here" or "this country"). All fields are optional and applied together. ' +
    'Navigating to a country or region happens first and other fields in the same call are skipped: set them in a follow-up call once the page has changed. ' +
    'Returns what was done, what was skipped and why, and the current view. It changes only the view, never the data.',
    {
      goToRegion: z.string().optional().describe('Open a region page: region id from the data regions tool, e.g. wapp.'),
      goToCountry: z.string().length(3).optional().describe('Open a country page: ISO3 code, e.g. KEN.'),
      tab: z.string().optional().describe('Tab to open. Country page: overview, load, supply (labelled "Supply & Trade"), market (Türkiye only), re (renewable resources), zoning (labelled "Zones"). Region page: overview, countries, supply & trade.'),
      plantSource: z.enum(['osm', 'gem', 'gppd']).optional().describe('Plant database shown on the map: gem (Global Energy Monitor), gppd (WRI), osm (OpenStreetMap).'),
      minMw: z.number().min(0).optional().describe('Hide plants smaller than this capacity, in MW.'),
      fuels: z.array(z.string()).optional().describe('Show only plants of these fuels; others are hidden. Values: solar wind hydro gas coal nuclear oil biomass geothermal diesel waste biogas wood.'),
    },
    async ({ goToRegion, goToCountry, tab, plantSource, minMw, fuels }) => {
      const c = controller;
      if (!c) return text('No Explorer map page is mounted.');

      const done = [];
      const skipped = [];

      // An unknown id would open a broken page: check it first.
      if (goToCountry && !files.includes(`geo/country/${goToCountry.toUpperCase()}.topo.json`)) {
        return text(`No country page for "${goToCountry}". Use an ISO3 code from the data regions tool.`);
      }
      if (goToRegion) {
        const { regions = [] } = (await fetchData(appPath('data/regions.json')).catch(() => null)) ?? {};
        if (!regions.some(r => r.id === goToRegion)) {
          return text(`No region "${goToRegion}". Region ids: ${regions.map(r => r.id).join(', ')}.`);
        }
      }

      if (goToCountry) {
        c.navigate(`/country/${goToCountry.toUpperCase()}`);
        done.push(`navigating to country ${goToCountry.toUpperCase()}`);
      } else if (goToRegion) {
        c.navigate(`/region/${goToRegion}`);
        done.push(`navigating to region ${goToRegion}`);
      }

      const apply = (field, value, fn) => {
        if (value === undefined) return;
        if (goToRegion || goToCountry) {
          skipped.push({ field, reason: 'page is changing; call again once navigation completes' });
          return;
        }
        if (!fn) {
          skipped.push({ field, reason: `not available on the ${c.page} page` });
          return;
        }
        fn(value);
        done.push(`${field} → ${JSON.stringify(value)}`);
      };

      apply('tab', tab, c.setTab);
      apply('plantSource', plantSource, c.setPlantSource);
      apply('minMw', minMw, c.setMinMw);
      apply('fuels', fuels, c.showOnlyFuels);

      return text(JSON.stringify({
        done,
        skipped,
        // The page re-renders after this call, so report a tab just set rather than the old one.
        now: { page: c.page, regionId: c.regionId, iso: c.iso, tab: done.some(d => d.startsWith('tab')) ? tab : c.tab },
      }));
    });

  return server;
}
