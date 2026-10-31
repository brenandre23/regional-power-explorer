import { Link } from 'react-router-dom';

/**
 * "← World" on a region or country map, back to the world view (which keeps
 * where the user left it). A link, so it also opens in a new tab. Styled as
 * the Export PNG button it sits beside.
 *
 * @param {object}  props
 * @param {object}  props.t          active theme
 * @param {boolean} [props.compact]  phone-sized type
 */
export default function WorldButton({ t, compact }) {
  return (
    <Link to="/" title="Back to the world map" style={{
      backgroundColor: t.panel, border: `1px solid ${t.panelBorder}`, borderRadius: 6,
      boxShadow: '0 1px 8px rgba(0,0,0,.18)', color: t.lbl, textDecoration: 'none',
      padding: compact ? '7px 12px' : '5px 10px', fontSize: compact ? '0.68rem' : '0.58rem',
      fontWeight: 600, lineHeight: 'normal', display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      ← World
    </Link>
  );
}
