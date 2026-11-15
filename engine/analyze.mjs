// Daily analysis: fetch prices, screen, look up catalysts, encrypt the result for the web app,
// and send one push notification. Run by .github/workflows/daily.yml.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchKR, fetchUS, fetchFx, fetchIV, pool } from "./lib/market.mjs";
import { summarize, touchProb, firstTouch } from "./lib/stats.mjs";
import { researchCatalysts } from "./lib/claude.mjs";
import { encryptJson } from "./lib/crypto.mjs";
import { sendPush } from "./lib/push.mjs";
import { runNews } from "./lib/news.mjs";
import { runFlights } from "./lib/flights.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dataDir = path.join(root, "docs", "data");
const DISCLAIMER = "본 내용은 정보 제공 목적이며 투자 자문이 아닙니다. 확률은 통계적 근사치이며 결과를 보장하지 않습니다.";

const universe = JSON.parse(readFileSync(path.join(here, "config", "universe.json"), "utf8"));
const C = universe.criteria;
const HVC = universe.highvol;
const US_PICKS = universe.recommendUS === true; // 추천에 미국 종목 포함 여부 (보유 점검과는 무관)
const warnings = [];

function loadHoldings() {
  const raw = process.env.HOLDINGS_JSON || (existsSync(path.join(here, "config", "holdings.json")) && readFileSync(path.join(here, "config", "holdings.json"), "utf8"));
  if (!raw) {
    warnings.push("보유 종목(HOLDINGS_JSON)이 설정되지 않아 보유 점검을 건너뛰었습니다.");
    return { items: [], realizedPnL: null };
  }
  try {
    const j = JSON.parse(raw);
    return { items: j.items || [], realizedPnL: j.realizedPnL ?? null };
  } catch {
    warnings.push("HOLDINGS_JSON 형식이 올바르지 않습니다.");
    return { items: [], realizedPnL: null };
  }
}

function kstDate(offsetDays = 0) {
  const d = new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

const symOf = (x) => (x.market === "KR" ? x.code : x.ticker);
const key = (market, symbol) => `${market}:${symbol}`;

async function main() {
  const today = kstDate();
  const horizonEnd = kstDate(30);
  const holdings = loadHoldings();
  const fx = await fetchFx();
  if (!fx) warnings.push("원/달러 환율을 가져오지 못했습니다. 미국 종목 원화 환산이 비어 있을 수 있습니다.");

  // 1) Collect symbols
  const targets = new Map();
  const add = (market, symbol, name, tag) => {
    const k = key(market, symbol);
    if (!targets.has(k)) targets.set(k, { market, symbol, name, tags: new Set() });
    targets.get(k).tags.add(tag);
  };
  universe.kr.forEach((s) => add("KR", s.code, s.name, "universe"));
  if (US_PICKS) universe.us.forEach((t) => add("US", t, t, "universe"));
  holdings.items.forEach((h) => add(h.market, symOf(h), h.name, "holding"));

  // 2) Prices
  const quotes = new Map();
  async function load(t) {
    const rows = t.market === "KR" ? await fetchKR(t.symbol) : await fetchUS(t.symbol);
    if (!rows) return;
    const s = summarize(rows);
    s.sigma = s.hv60;
    s.sigmaSrc = "HV";
    if (t.market === "US") {
      const iv = await fetchIV(t.symbol);
      if (iv) { s.sigma = iv; s.sigmaSrc = "IV"; }
    }
    quotes.set(key(t.market, t.symbol), s);
  }
  await pool([...targets.values()], load, { concurrency: 4, gapMs: 300 });
  const missing = [...targets.values()].filter((t) => !quotes.has(key(t.market, t.symbol))).map((t) => t.name);
  if (missing.length) warnings.push(`시세를 가져오지 못한 종목: ${missing.join(", ")}`);

  const valueOK = (market, s) => (market === "KR" ? s.value20 >= C.minValueKRW : s.value20 >= C.minValueUSD);
  const holdingKeys = new Set(holdings.items.map((h) => key(h.market, symOf(h))));

  // 3) Custom screen (+10% / -10%, range bottom, decline settled)
  const evaluated = [];
  for (const t of targets.values()) {
    if (!t.tags.has("universe")) continue;
    const k = key(t.market, t.symbol);
    const s = quotes.get(k);
    if (!s || holdingKeys.has(k)) continue;
    const fails = [];
    if (s.sigma < C.sigmaMin || s.sigma > C.sigmaMax) fails.push(`변동성 ${(s.sigma * 100).toFixed(0)}%`);
    if (s.pos120 > C.pos120Max) fails.push(`120일 위치 ${(s.pos120 * 100).toFixed(0)}%`);
    if (s.r20 < C.r20Min) fails.push(`20일 ${(s.r20 * 100).toFixed(1)}% (하락 진행)`);
    if (!valueOK(t.market, s)) fails.push("유동성 미달");
    evaluated.push({ t, s, fails });
  }
  const pickRow = ({ t, s }) => ({
    name: t.name, market: t.market, symbol: t.symbol, close: s.close, chg1: s.chg1, asOf: s.asOf,
    sigma: s.sigma, sigmaSrc: s.sigmaSrc, pos120: s.pos120, r20: s.r20, value20: s.value20,
    target: s.close * (1 + C.target), stop: s.close * (1 - C.stop),
    prob: firstTouch(s.sigma, C.target, C.stop),
  });
  const passed = evaluated.filter((e) => !e.fails.length).sort((a, b) => a.s.pos120 - b.s.pos120);
  const customPicks = passed.slice(0, C.maxPicks).map(pickRow);
  const nearMiss = evaluated.filter((e) => e.fails.length === 1).sort((a, b) => a.s.pos120 - b.s.pos120).slice(0, 2)
    .map((e) => ({ name: e.t.name, reason: e.fails[0] }));
  const krEval = evaluated.filter((e) => e.t.market === "KR");
  const lowCount = krEval.filter((e) => e.s.pos120 <= 0.2).length;
  const marketNote = krEval.length && lowCount / krEval.length >= 0.6
    ? `한국 후보 ${krEval.length}개 중 ${lowCount}개가 120일 범위 하위 20%에 있습니다. 개별 종목보다 시장 전반이 하락한 국면입니다.`
    : null;

  // 4) Catalysts (one Claude call with web search)
  const eventTickers = [
    ...holdings.items.map((h) => ({ name: h.name, market: h.market, symbol: symOf(h) })),
    ...customPicks.map((p) => ({ name: p.name, market: p.market, symbol: p.symbol })),
  ];
  const research = await researchCatalysts({ today, horizonEnd, tickers: eventTickers, includeUS: US_PICKS });
  if (!research) warnings.push("촉매 검색을 하지 못했습니다(API 키 미설정 또는 오류). 이벤트는 미확인으로 표시됩니다.");
  const events = research?.events || {};
  customPicks.forEach((p) => { p.event = events[p.symbol] || null; });

  // 5) High-volatility screen (+20% / -10%) on the researched candidates
  const highvol = { picks: [], rejected: [], available: !!research };
  if (research?.candidates?.length) {
    const cands = research.candidates.filter((c) => c.symbol && (c.market === "KR" || (US_PICKS && c.market === "US"))).slice(0, 8);
    await pool(cands, async (c) => {
      const k = key(c.market, c.symbol);
      if (!quotes.has(k)) await load({ market: c.market, symbol: c.symbol });
      const s = quotes.get(k);
      if (!s) { highvol.rejected.push({ name: c.name, reason: "시세 미확인" }); return; }
      const base = touchProb(s.sigma, HVC.target);
      let reason = null;
      if (s.sigma > HVC.maxSigma) reason = `변동성 ${(s.sigma * 100).toFixed(0)}% (이분법적 이벤트, 공식 부적합)`;
      else if (base < HVC.minBaseProb) reason = `+20% 기준 확률 ${(base * 100).toFixed(0)}%`;
      else if (!valueOK(c.market, s)) reason = "유동성 미달";
      if (reason) { highvol.rejected.push({ name: c.name, reason }); return; }
      highvol.picks.push({
        name: c.name, market: c.market, symbol: c.symbol, close: s.close, chg1: s.chg1, asOf: s.asOf,
        sigma: s.sigma, sigmaSrc: s.sigmaSrc, catalyst: c.catalyst, date: c.date, confirmed: !!c.confirmed, risk: c.risk,
        base20: base, target: s.close * (1 + HVC.target), stop: s.close * (1 - HVC.stop),
        prob: firstTouch(s.sigma, HVC.target, HVC.stop),
      });
    }, { concurrency: 3, gapMs: 300 });
    highvol.picks.sort((a, b) => b.prob.up - a.prob.up);
    highvol.picks = highvol.picks.slice(0, HVC.maxPicks);
    highvol.rejected = highvol.rejected.slice(0, 3);
  }

  // 6) Holdings check
  const items = [];
  for (const h of holdings.items) {
    const s = quotes.get(key(h.market, symOf(h)));
    if (!s) { items.push({ name: h.name, market: h.market, symbol: symOf(h), missing: true }); continue; }
    const value = h.market === "KR" ? h.qty * s.close : fx ? h.qty * s.close * fx : null;
    const cost = h.market === "KR" ? h.cost : h.costKRW;
    items.push({
      name: h.name, market: h.market, symbol: symOf(h), qty: h.qty, close: s.close, chg1: s.chg1, asOf: s.asOf,
      cost, value, pl: value != null ? value - cost : null, ret: value != null ? value / cost - 1 : null,
      be: value ? cost / value - 1 : null, sigma: s.sigma, sigmaSrc: s.sigmaSrc, pos120: s.pos120, lo120: s.lo120, r20: s.r20,
      prob: firstTouch(s.sigma, C.target, C.stop), event: events[symOf(h)] || null,
    });
  }
  const valued = items.filter((i) => i.value != null);
  const tv = valued.reduce((a, i) => a + i.value, 0);
  const tc = valued.reduce((a, i) => a + i.cost, 0);
  valued.forEach((i) => { i.weight = tv ? i.value / tv : 0; });
  items.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const top2 = valued.slice().sort((a, b) => b.value - a.value).slice(0, 2).reduce((a, i) => a + i.weight, 0);
  const overseas = valued.filter((i) => i.market === "US").reduce((a, i) => a + i.weight, 0);
  const total = { cost: tc, value: tv, pl: tv - tc, ret: tc ? tv / tc - 1 : 0, top2, overseas, realized: holdings.realizedPnL };
  if (holdings.realizedPnL != null) total.net = holdings.realizedPnL + total.pl;

  // Deterministic conditional notes (max 4)
  const notes = [];
  valued.filter((i) => Math.abs(i.chg1) >= 0.05).forEach((i) =>
    notes.push(`${i.name}: 전일 대비 ${(i.chg1 * 100).toFixed(1)}%로 크게 움직였습니다. 만약 이 흐름이 이어지면 1개월 확률표의 기준점도 함께 바뀝니다.`));
  valued.filter((i) => i.pos120 <= 0.03).forEach((i) =>
    notes.push(`${i.name}: 120일 최저가(${fmtPrice(i.lo120, i.market)}) 부근입니다. 만약 저점을 깨면 지지 구간이 사라집니다.`));
  valued.filter((i) => i.pl < 0).sort((a, b) => a.pl - b.pl).slice(0, 2).forEach((i) => {
    const be2 = (i.cost + i.value) / (2 * i.value) - 1;
    const w2 = (2 * i.value) / (tv + i.value);
    notes.push(`만약 ${i.name} 종목을 현재 평가금액만큼 추가 매수하면, 본전까지 필요한 상승률은 +${(i.be * 100).toFixed(0)}%에서 +${(be2 * 100).toFixed(0)}%로 줄고 비중은 ${(i.weight * 100).toFixed(0)}%에서 ${(w2 * 100).toFixed(0)}%가 됩니다.`);
  });

  const asOf = (m) => [...quotes.entries()].filter(([k]) => k.startsWith(m)).map(([, s]) => s.asOf).sort().pop() || null;
  const report = {
    v: 1, date: today, generatedAt: new Date().toISOString(), asOfKR: asOf("KR:"), asOfUS: asOf("US:"), fx,
    custom: { criteria: C, picks: customPicks, nearMiss, marketNote },
    highvol, holdings: { items, total, notes: notes.slice(0, 4) },
    warnings, disclaimer: DISCLAIMER,
  };

  // 7) Encrypt and write
  const pass = process.env.DATA_PASSPHRASE;
  if (!pass) throw new Error("DATA_PASSPHRASE is not set; refusing to write unencrypted data.");
  mkdirSync(path.join(dataDir, "history"), { recursive: true });
  const enc = encryptJson(report, pass);
  writeFileSync(path.join(dataDir, "latest.enc.json"), JSON.stringify(enc));
  writeFileSync(path.join(dataDir, "history", `${today}.enc.json`), JSON.stringify(enc));
  const idxPath = path.join(dataDir, "index.json");
  const idx = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, "utf8")) : { dates: [] };
  idx.dates = [...new Set([today, ...idx.dates])].sort().reverse().slice(0, 120);
  idx.updatedAt = report.generatedAt;
  writeFileSync(idxPath, JSON.stringify(idx, null, 1));
  console.log(`wrote report for ${today}: custom ${customPicks.length}, highvol ${highvol.picks.length}, holdings ${items.length}, warnings ${warnings.length}`);

  // 8) Push
  const mover = valued.slice().sort((a, b) => Math.abs(b.chg1) - Math.abs(a.chg1))[0];
  const parts = [
    `맞춤 ${customPicks.length}${customPicks.length ? `(${customPicks.slice(0, 2).map((p) => p.name).join("·")})` : ""}`,
    `고변동 ${highvol.picks.length}`,
  ];
  if (mover) parts.push(`보유 ${mover.name} 전일 ${(mover.chg1 * 100).toFixed(1)}%`);
  await sendPush({ title: `BARMS ${today.slice(5).replace("-", "/")}`, body: parts.join(", ") });
}

function fmtPrice(v, market) {
  return market === "KR" ? `${Math.round(v).toLocaleString("ko-KR")}원` : `$${v.toFixed(2)}`;
}

// Stocks first, then the news digest; a stock failure must not block the news (and vice versa).
let failed = false;
try { await main(); } catch (e) { console.error(e); failed = true; }
let flightLine = null;
try { flightLine = await runFlights({ dataDir, today: kstDate() }); } catch (e) { console.error("flights:", e.message); }
try { await runNews({ dataDir, today: kstDate(), extraLine: flightLine }); } catch (e) { console.error("news:", e); }
if (failed) process.exit(1);
