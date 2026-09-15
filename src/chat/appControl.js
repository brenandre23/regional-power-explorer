// One `app__update_state` tool that drives the page's own controls. The page
// registers a controller each render; the tool reads the latest one lazily, so
// navigation can swap it under a live chat.
import { useEffect } from 'react';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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
    'Drive the Explorer UI instead of describing clicks. All fields are optional and applied together. ' +
    'Navigation happens first; page-specific controls should be changed in a follow-up call after navigation.',
    {
      goToRegion: z.string().optional().describe('region id from data__regions, e.g. wapp'),
      goToCountry: z.string().length(3).optional().describe('ISO3 code, e.g. KEN'),
      tab: z.string().optional().describe('country page tab: overview | load | supply | market | re | zoning; region page: overview | countries | supply & trade'),
      plantSource: z.enum(['osm', 'gem', 'gppd']).optional(),
      minMw: z.number().min(0).optional().describe('hide plants below this capacity'),
      fuels: z.array(z.string()).optional().describe('show ONLY these fuels: solar wind hydro gas coal nuclear oil biomass geothermal diesel waste biogas wood'),
    },
    async ({ goToRegion, goToCountry, tab, plantSource, minMw, fuels }) => {
      const c = controller;
      if (!c) return text('No Explorer map page is mounted.');

      const done = [];
      const skipped = [];

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
        now: { page: c.page, regionId: c.regionId, iso: c.iso, tab: c.tab },
      }));
    });

  return server;
}
