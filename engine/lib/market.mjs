// Market data fetchers. These use public chart endpoints that are not official APIs;
// they can change or block without notice, so every fetch fails soft (returns null).

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { tries = 3 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" } });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
    } catch {
      /* retry */
    }
    await sleep(800 * (i + 1));
  }
  return null;
}

// Korean daily bars from Naver's chart feed: data="YYYYMMDD|open|high|low|close|volume"
export async function fetchKR(code, count = 260) {
  const text = await get(
    `https://fchart.stock.naver.com/sise.nhn?symbol=${encodeURIComponent(code)}&timeframe=day&count=${count}&requestType=0`,
  );
  if (!text) return null;
  const rows = [];
  for (const m of text.matchAll(/data="([^"]+)"/g)) {
    const [d, o, h, l, c, v] = m[1].split("|");
    const close = Number(c);
    if (!close) continue;
    rows.push({ d: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, o: +o, h: +h, l: +l, c: close, v: +v });
  }
  return rows.length > 25 ? rows : null;
}

// US daily bars from Yahoo's chart endpoint.
export async function fetchUS(ticker, range = "1y") {
  const text = await get(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`,
  );
  if (!text) return null;
  try {
    const r = JSON.parse(text).chart.result[0];
    const q = r.indicators.quote[0];
    const rows = [];
    r.timestamp.forEach((t, i) => {
      if (q.close[i] == null) return;
      rows.push({
        d: new Date(t * 1000).toISOString().slice(0, 10),
        o: q.open[i],
        h: q.high[i] ?? q.close[i],
        l: q.low[i] ?? q.close[i],
        c: q.close[i],
        v: q.volume[i] ?? 0,
      });
    });
    return rows.length > 25 ? rows : null;
  } catch {
    return null;
  }
}

export async function fetchFx() {
  const rows = await fetchUS("KRW=X", "1mo");
  return rows ? rows[rows.length - 1].c : null;
}

// 30-day implied volatility as shown on optioncharts.io ("30-day implied volatility was 59.6%").
export async function fetchIV(ticker) {
  const html = await get(`https://optioncharts.io/options/${encodeURIComponent(ticker)}`, { tries: 2 });
  if (!html) return null;
  const m = html.match(/30-day implied volatility was\s*([\d.]+)%/i);
  return m ? Number(m[1]) / 100 : null;
}

// Run async jobs with limited concurrency and a small pause between starts.
export async function pool(items, worker, { concurrency = 4, gapMs = 250 } = {}) {
  const out = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i], i);
      await sleep(gapMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return out;
}
