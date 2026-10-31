// Shared helpers for the country-page tab charts (Supply, Market, …) — kept
// in their own file rather than exported from a tab component so components
// stay Fast-Refresh-friendly (a file mixing component + non-component
// exports breaks Vite's fast refresh for that file). For the same reason this
// file exports no components: source attribution lives in ../ChartCaption,
// which the region pages use too, and tabs import it from there directly.

export function downloadBlob(content, filename, type = 'application/octet-stream') {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Time-series chart kit ────────────────────────────────────────────────────
// Everything below is shared between any tab that charts an EPIAS-shaped
// {label, unit, hourly, daily, monthly, yearly} series block — originally
// built for MarketTab's Prices/Quantity sub-tabs, and reused as-is by
// LoadTab's Real-time consumption sub-tab (same block shape, same EPIAS
// source, same Yearly/Monthly/Daily/Hourly granularity levels).

export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const GRANULARITIES = [['multiyear', 'Yearly'], ['year', 'Monthly'], ['month', 'Daily'], ['day', 'Hourly']];
export const GRANULARITY_LABEL = Object.fromEntries(GRANULARITIES);
// Above this many bars, the Daily (per-day) bar+whisker chart gets visually
// cluttered — fall back to a plain mean line instead, same idea as Hourly.
export const DAILY_BAR_MAX_POINTS = 60;
// X-axis title — what each granularity's chart points actually represent.
// Hourly is the one level where raw timestamps get displayed (vs. the
// pre-bucketed daily/monthly/yearly aggregates below), so it's the one
// place the time zone needs spelling out — see toIstanbul below.
export const AXIS_TITLE = { multiyear: 'Year', year: 'Month', month: 'Day', day: 'Hour (Türkiye time)' };
export const WHISKER_COLOR = '#B8BEC6'; // light neutral gray, deliberately not the series color — stays out of the way

// All timestamps in the source JSON are UTC (fixed-width ISO strings with a
// "+00:00" suffix). The daily/monthly/yearly aggregates are already bucketed
// by Türkiye local time (UTC+3) on the backend — this only matters for the
// Hourly view, which displays raw per-hour timestamps: those are converted to
// Türkiye local time here too, so "which hour" always means the same thing
// regardless of which series/tab is being displayed.
export function toIstanbul(isoUtc) {
  const d = new Date(isoUtc);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
  // Intl can return hour "24" for local midnight instead of "00" — normalize.
  return { date: `${p.year}-${p.month}-${p.day}`, hour: p.hour === '24' ? '00' : p.hour };
}
// The "YYYY-MM-DD" day / "HH" hour an hourly ISO timestamp belongs to, in
// Türkiye local time.
export function dayOf(iso)  { return toIstanbul(iso).date; }
export function hourOf(iso) { return toIstanbul(iso).hour; }

export function monthLabel(ym) { const [y, m] = ym.split('-'); return `${MONTH_ABBR[+m - 1]} ${y}`; }
export function dayLabel(ymd) { const [y, m, d] = ymd.split('-'); return `${+d} ${MONTH_ABBR[+m - 1]} ${y}`; }
// Full-word versions, used in the chart tooltip (e.g. "4 August 2026").
export function fullMonthLabel(ym) { const [y, m] = ym.split('-'); return `${MONTH_FULL[+m - 1]} ${y}`; }
export function fullDayLabel(ymd) { const [y, m, d] = ymd.split('-'); return `${+d} ${MONTH_FULL[+m - 1]} ${y}`; }
export function hourOfDayLabel(iso) { return `${+hourOf(iso)}:00`; } // "04:00" -> "4:00"
// Chart x-axis labels that disambiguate only when the selected range needs
// it — e.g. a single month's days just say "5", but once a Daily range
// crosses a month boundary that's ambiguous, so it becomes "5 Aug".
export function monthPointLabel(ym, rangeStart, rangeEnd) {
  const [y, m] = ym.split('-');
  const spansYears = rangeStart.slice(0, 4) !== rangeEnd.slice(0, 4);
  return spansYears ? `${MONTH_ABBR[+m - 1]} '${y.slice(2)}` : MONTH_ABBR[+m - 1];
}
export function dayPointLabel(ymd, rangeStart, rangeEnd) {
  const [, m, d] = ymd.split('-');
  const spansMonths = rangeStart.slice(0, 7) !== rangeEnd.slice(0, 7);
  return spansMonths ? `${+d} ${MONTH_ABBR[+m - 1]}` : `${+d}`;
}
// Axis label for a multi-day Hourly range — day only, no hour, since with
// hundreds of points only ~10 ticks get labeled anyway and "20 Jul 0:00"
// x10 overlaps into an unreadable mess; the tooltip still has the exact
// hour via hourLabel regardless of what the axis shows.
export function shortDayLabel(iso) {
  const [, m, d] = dayOf(iso).split('-');
  return `${+d} ${MONTH_ABBR[+m - 1]}`;
}
export function hourTimestampLabel(iso) {
  const [y, m, d] = dayOf(iso).split('-');
  return `${+d} ${MONTH_ABBR[+m - 1]} ${y}, ${hourOf(iso)}:00 Türkiye time`;
}

export function fmtValue(v) {
  if (v == null || Number.isNaN(v)) return '—';
  // Magnitude, not raw value, decides decimal places — otherwise a negative
  // number like -1500 (bpm_net) would keep a decimal place its positive
  // counterpart wouldn't, since -1500 >= 100 is false.
  return v.toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 });
}

// minVal/maxVal bracket the data; the returned ticks always span at least
// [0, maxVal] and, when minVal is negative (only bpm_net so far), extend
// below zero too. For an all-positive series minVal is always passed as 0,
// so this reduces to exactly the old 0-to-top behavior — no change there.
export function niceTicks(minVal, maxVal) {
  const lo = Math.min(0, minVal || 0), hi = Math.max(0, maxVal || 0);
  if (lo === 0 && hi === 0) return [0];
  const raw = (hi - lo) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const nice = [1, 2, 2.5, 5, 10].find(f => f * mag >= raw) * mag;
  // Round the axis top/bottom OUT to the next nice step — never one full
  // step beyond. Keeps niceTicks idempotent on either end, so a tick can
  // never land outside the plot area.
  const top = Math.ceil(hi / nice - 1e-9) * nice;
  const bottom = Math.floor(lo / nice + 1e-9) * nice;
  const ticks = [];
  for (let v = bottom; v <= top + nice * 1e-9; v += nice) ticks.push(Math.round(v));
  return ticks;
}

export function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null; }

// What the From/To range pickers choose from, per granularity — the same
// level as what gets charted for Yearly/Monthly/Daily, but for Hourly it's
// still whole days (picking two timestamps across a range of days via a
// dropdown isn't practical), which then charts every hour within them.
export function getPeriods(block, granularity) {
  if (!block) return [];
  if (granularity === 'multiyear') return Object.keys(block.yearly.mean).sort();
  if (granularity === 'year')      return Object.keys(block.monthly.mean).sort();
  if (granularity === 'month')     return Object.keys(block.daily.mean).sort();
  // Hourly picks from the rolling hourly window (block.hourly), NOT
  // block.daily.mean — that's permanent full history back to 2017 and would
  // let you "select" days with no hourly detail behind them at all.
  if (granularity === 'day') {
    const days = new Set(Object.keys(block.hourly || {}).map(h => dayOf(h)));
    return [...days].sort();
  }
  return [];
}

export function periodOptionLabel(granularity, p) {
  if (granularity === 'multiyear') return p;
  if (granularity === 'year')      return monthLabel(p);
  return dayLabel(p); // Daily's days and Hourly's day-range both use day strings
}

// Default range shown the first time a granularity is selected (or when the
// previous range doesn't carry over, e.g. after switching granularity).
export function defaultRange(periods, granularity) {
  if (!periods.length) return [null, null];
  const last = periods[periods.length - 1];
  if (granularity === 'multiyear') return [periods[0], last];       // full history, as before
  if (granularity === 'year')      return [periods[Math.max(0, periods.length - 12)], last]; // last 12 months
  if (granularity === 'month')     return [periods[Math.max(0, periods.length - 30)], last]; // last 30 days
  return [last, last]; // Hourly: most recent single day, as before
}

export function rangeLabel(granularity, start, end) {
  if (!start || !end) return '';
  const fmt = granularity === 'multiyear' ? (x => x) : granularity === 'year' ? monthLabel : dayLabel;
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

function statsFromKeys(meanMap, minMap, maxMap, keys) {
  if (!keys.length) return null;
  return {
    avg: avg(keys.map(k => meanMap[k])),
    min: Math.min(...keys.map(k => minMap[k])),
    max: Math.max(...keys.map(k => maxMap[k])),
  };
}

// periodStart/periodEnd are always the same "shape" of key as the aggregate
// being filtered (years for yearly, 'YYYY-MM' for monthly, 'YYYY-MM-DD' for
// daily) — plain string comparison sorts these the same as chronological
// order, so a simple range filter works without parsing dates.
export function computeStats(block, granularity, periodStart, periodEnd) {
  if (!block || !periodStart || !periodEnd) return null;
  if (granularity === 'multiyear') {
    const keys = Object.keys(block.yearly.mean).filter(k => k >= periodStart && k <= periodEnd);
    return statsFromKeys(block.yearly.mean, block.yearly.min, block.yearly.max, keys);
  }
  if (granularity === 'year') {
    const keys = Object.keys(block.monthly.mean).filter(k => k >= periodStart && k <= periodEnd);
    return statsFromKeys(block.monthly.mean, block.monthly.min, block.monthly.max, keys);
  }
  if (granularity === 'month') {
    const keys = Object.keys(block.daily.mean).filter(k => k >= periodStart && k <= periodEnd);
    return statsFromKeys(block.daily.mean, block.daily.min, block.daily.max, keys);
  }
  if (granularity === 'day') {
    const keys = Object.keys(block.hourly).filter(k => {
      const day = dayOf(k);
      return day >= periodStart && day <= periodEnd;
    });
    if (!keys.length) return null;
    const vals = keys.map(k => block.hourly[k]);
    return { avg: avg(vals), min: Math.min(...vals), max: Math.max(...vals) };
  }
  return null;
}

export function getChartPoints(block, granularity, periodStart, periodEnd) {
  if (!block || !periodStart || !periodEnd) return { mode: 'band', points: [] };
  if (granularity === 'multiyear') {
    const years = Object.keys(block.yearly.mean).filter(k => k >= periodStart && k <= periodEnd).sort();
    return { mode: 'band', points: years.map(y => ({
      label: y, fullLabel: y, mean: block.yearly.mean[y], min: block.yearly.min[y], max: block.yearly.max[y],
    })) };
  }
  if (granularity === 'year') {
    const months = Object.keys(block.monthly.mean).filter(k => k >= periodStart && k <= periodEnd).sort();
    return { mode: 'band', points: months.map(m => ({
      label: monthPointLabel(m, periodStart, periodEnd), fullLabel: fullMonthLabel(m),
      mean: block.monthly.mean[m], min: block.monthly.min[m], max: block.monthly.max[m],
    })) };
  }
  if (granularity === 'month') {
    const days = Object.keys(block.daily.mean).filter(k => k >= periodStart && k <= periodEnd).sort();
    const points = days.map(d => ({
      label: dayPointLabel(d, periodStart, periodEnd), fullLabel: fullDayLabel(d),
      mean: block.daily.mean[d], min: block.daily.min[d], max: block.daily.max[d],
    }));
    // Too many bars to read cleanly — fall back to a plain mean line (still
    // has min/max for the tooltip, just not drawn as bars+whiskers).
    if (points.length > DAILY_BAR_MAX_POINTS) {
      return { mode: 'line', points: points.map(p => ({ ...p, value: p.mean })) };
    }
    return { mode: 'band', points };
  }
  if (granularity === 'day') {
    const hours = Object.keys(block.hourly).filter(k => {
      const day = dayOf(k);
      return day >= periodStart && day <= periodEnd;
    }).sort();
    const multiDay = periodStart !== periodEnd;
    return { mode: 'line', points: hours.map(h => ({
      label: multiDay ? shortDayLabel(h) : hourOfDayLabel(h),
      fullLabel: fullDayLabel(dayOf(h)), hourLabel: hourOfDayLabel(h),
      value: block.hourly[h],
    })) };
  }
  return { mode: 'band', points: [] };
}
