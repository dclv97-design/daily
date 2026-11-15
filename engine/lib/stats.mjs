// Pure math helpers. No Node-specific imports, so this file also runs in a browser for testing.

export function logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) out.push(Math.log(closes[i] / closes[i - 1]));
  return out;
}

export function stdev(xs) {
  if (xs.length < 2) return NaN;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

// Annualised historical volatility from the last n daily returns.
export function hv(closes, n = 60) {
  const slice = closes.slice(-(n + 1));
  return stdev(logReturns(slice)) * Math.sqrt(252);
}

// Abramowitz-Stegun approximation of the standard normal CDF.
export function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - p : p;
}

// Rule-based "touch" probability within 21 trading days: 2 * (1 - N(|ln(1+move)| / s)).
export function touchProb(sigma, move, days = 21) {
  const s = sigma * Math.sqrt(days / 252);
  return Math.min(1, 2 * (1 - normCdf(Math.abs(Math.log(1 + move)) / s)));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Driftless daily-close simulation: which barrier is touched first within `days`.
export function firstTouch(sigma, up, down, { days = 21, n = 6000, seed = 42 } = {}) {
  const rnd = mulberry32(seed);
  const sd = sigma / Math.sqrt(252);
  const lu = Math.log(1 + up);
  const ld = Math.log(1 - down);
  let w = 0;
  let l = 0;
  for (let k = 0; k < n; k++) {
    let p = 0;
    for (let d = 0; d < days; d++) {
      const u1 = 1 - rnd();
      const u2 = rnd();
      p += sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      if (p >= lu) { w++; break; }
      if (p <= ld) { l++; break; }
    }
  }
  return { up: w / n, down: l / n, neither: (n - w - l) / n };
}

// rows: [{d,o,h,l,c,v}] oldest -> newest
export function summarize(rows) {
  const closes = rows.map((r) => r.c);
  const n = rows.length;
  const last = rows[n - 1];
  const prev = rows[n - 2] || last;
  const w = Math.min(120, n);
  const win = rows.slice(-w);
  const hi120 = Math.max(...win.map((r) => r.h));
  const lo120 = Math.min(...win.map((r) => r.l));
  const ref20 = rows[Math.max(0, n - 21)].c;
  const value20 = rows.slice(-20).reduce((a, r) => a + r.c * r.v, 0) / Math.min(20, n);
  return {
    asOf: last.d,
    close: last.c,
    chg1: last.c / prev.c - 1,
    hv60: hv(closes, Math.min(60, n - 1)),
    hi120,
    lo120,
    pos120: hi120 > lo120 ? (last.c - lo120) / (hi120 - lo120) : 0.5,
    r20: last.c / ref20 - 1,
    value20,
    bars: n,
  };
}
