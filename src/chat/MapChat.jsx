import { useEffect, useState } from 'react';
import { AiChatControl } from '@imaps/ai-chat/maplibre';
import { getT } from '../constants';
import { useLocalServer } from './useLocalServer';
import { buildDataServer } from './dataServer';
import { buildAppControlServer, useAppController } from './appControl';
import { AI_PROVIDER, chatDeployment } from './config';

const SYSTEM_PROMPT = `You are the embedded assistant for the World Bank Regional Power Explorer.
This explorer is a pilot and some datasets are indicative. Stay inside the explorer's published data and map state.

Rules:
- Use data__* tools for quantitative claims. Use data__regions to resolve names when needed.
- State the dataset/source and year whenever the tool provides them. Never average OSM, GEM and GPPD plant datasets together.
- If a tool reports that data is unavailable, say the explorer does not publish that value; do not fill the gap from general knowledge.
- Use app__update_state to navigate/filter the dashboard when the user asks you to change the view.
- Use map__* tools for camera, layer visibility, map inspection and viewport questions.
- Distinguish installed capacity (MW), generation/trade (usually GWh), access (%), and tariffs (USD/kWh).
- Keep responses concise and analytical; highlight material comparisons instead of dumping raw JSON.`;

function applyTheme(el, theme) {
  const t = getT(theme);
  el.setAttribute('theme', t.isDark ? 'dark' : 'light');
  const tokens = {
    background: t.panel, foreground: t.text, card: t.cardBg, 'card-foreground': t.text,
    popover: t.panel, 'popover-foreground': t.text,
    primary: t.highlight.fill, 'primary-foreground': '#fff',
    secondary: t.cardBg, 'secondary-foreground': t.text,
    muted: t.cardBg, 'muted-foreground': t.muted,
    accent: t.cardBg, 'accent-foreground': t.text,
    border: t.panelBorder, input: t.panelBorder, ring: t.highlight.fill, radius: '5px',
  };
  for (const [key, value] of Object.entries(tokens)) el.style.setProperty(`--${key}`, value);
  el.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
  el.style.zoom = '0.86';

  const panel = el.parentElement;
  const group = panel?.parentElement;
  if (panel) Object.assign(panel.style, {
    border: `1px solid ${t.panelBorder}`,
    borderRadius: '8px',
    background: t.panel,
    boxShadow: t.isDark ? '0 12px 30px rgba(0,0,0,.42)' : '0 12px 30px rgba(28,45,70,.16)',
  });
  if (group) Object.assign(group.style, {
    background: t.panel,
    border: `1px solid ${t.panelBorder}`,
    boxShadow: 'none',
    '--primary': t.highlight.fill,
  });
  const button = group?.querySelector('.imaps-ai-chat-toggle');
  if (button) Object.assign(button.style, { color: t.text, background: 'transparent' });
}

export default function MapChat({ mapRef, mapKey, ready, controller, theme }) {
  useAppController(controller);
  const dataServers = useLocalServer(buildDataServer, 'data');
  const appServers = useLocalServer(buildAppControlServer, 'app');
  const [control, setControl] = useState(null);

  useEffect(() => {
    if (!mapKey) return undefined;
    const map = mapRef.current;
    if (!map || map !== mapKey) return undefined;

    const ctrl = new AiChatControl({
      label: 'AI assistant',
      width: 430,
      height: 640,
      screenshot: true,
      chat: {
        title: 'Power Explorer Assistant',
        greeting: 'Ask about capacity, generation, trade, access, tariffs, or tell me how to change the map.',
        placeholder: 'Ask about the power system…',
        systemPrompt: SYSTEM_PROMPT,
        defaultProvider: AI_PROVIDER,
        disabledPlaceholder: 'Loading dashboard data…',
        deployment: chatDeployment(),
      },
    });
    map.addControl(ctrl, 'bottom-right');
    setControl(ctrl);

    return () => {
      try { if (map.hasControl(ctrl)) map.removeControl(ctrl); } catch { /* map teardown */ }
      setControl(null);
    };
  }, [mapRef, mapKey]);

  useEffect(() => {
    if (control) control.localServers = [...dataServers, ...appServers];
  }, [control, dataServers, appServers]);
  useEffect(() => { if (control?.element) control.element.disabled = !ready; }, [control, ready]);
  useEffect(() => { if (control?.element) applyTheme(control.element, theme); }, [control, theme]);

  return null;
}
