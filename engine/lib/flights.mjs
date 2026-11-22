// Cheapest round trips from Seoul for the 2027 Korean holidays.
// Source: Travelpayouts / Aviasales Data API (free, needs TRAVELPAYOUTS_TOKEN). Prices are the cheapest
// tickets that Aviasales users found in the last 48 hours, not a live search, so the app also keeps the
// lowest price ever seen for each holiday and destination.
// Rules: direct both ways, 4-5 days (3-4 nights) including at least one holiday date,
// return flight leaves at 15:00 local time or later. Checked baggage is NOT checked (the user checks it).
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
const ORIGIN = "SEL"; // 인천 + 김포

// "must": the trip has to include at least one of these dates (holiday + substitute holiday).
export const HOLIDAYS = [
  { id: "seol", label: "설 연휴", must: ["2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09"] },
  { id: "samil", label: "삼일절", must: ["2027-03-01"] },
  { id: "children", label: "어린이날", must: ["2027-05-05"] },
  { id: "buddha", label: "부처님오신날", must: ["2027-05-13"] },
  { id: "jeheon", label: "제헌절", must: ["2027-07-17", "2027-07-19"] },
  { id: "gwangbok", label: "광복절", must: ["2027-08-15", "2027-08-16"] },
  { id: "chuseok", label: "추석 연휴", must: ["2027-09-14", "2027-09-15", "2027-09-16"] },
  { id: "gaecheon", label: "개천절", must: ["2027-10-03", "2027-10-04"] },
  { id: "hangeul", label: "한글날", must: ["2027-10-09", "2027-10-11"] },
];

export const DESTS = [
  // 일본
  ["TYO", "도쿄", "일본"], ["OSA", "오사카", "일본"], ["NGO", "나고야", "일본"], ["FUK", "후쿠오카", "일본"],
  ["SPK", "삿포로", "일본"], ["OKA", "오키나와", "일본"], ["KKJ", "기타큐슈", "일본"],
  ["NGS", "나가사키", "일본"], ["KMJ", "구마모토", "일본"], ["KOJ", "가고시마", "일본"], ["KMI", "미야자키", "일본"],
  ["OIT", "오이타", "일본"], ["HSG", "사가", "일본"], ["HIJ", "히로시마", "일본"], ["OKJ", "오카야마", "일본"],
  ["TAK", "다카마쓰", "일본"], ["MYJ", "마쓰야마", "일본"], ["YGJ", "요나고", "일본"], ["KMQ", "고마쓰", "일본"],
  ["TOY", "도야마", "일본"], ["KIJ", "니가타", "일본"], ["SDJ", "센다이", "일본"], ["AOJ", "아오모리", "일본"],
  ["FSZ", "시즈오카", "일본"], ["HKD", "하코다테", "일본"], ["AKJ", "아사히카와", "일본"],
  // 중화권
  ["SHA", "상하이", "중국"], ["HKG", "홍콩", "홍콩"], ["TPE", "타이베이", "대만"], ["KHH", "가오슝", "대만"], ["RMQ", "타이중", "대만"],
];

const DAY = 86400e3;
const d2n = (d) => Date.parse(`${d}T00:00:00Z`) / DAY;
const n2d = (n) => new Date(n * DAY).toISOString().slice(0, 10);

// Month pairs (departure month, return month) that can hold a valid trip for each holiday.
function monthPairs() {
  const pairs = new Set();
  for (const h of HOLIDAYS) {
    const lo = Math.min(...h.must.map(d2n)), hi = Math.max(...h.must.map(d2n));
    for (let dep = lo - 4; dep <= hi; dep++) for (const len of [3, 4]) {
      const ret = dep + len;
      if (ret < lo) continue;
      pairs.add(`${n2d(dep).slice(0, 7)}|${n2d(ret).slice(0, 7)}`);
    }
  }
  return [...pairs].map((p) => p.split("|"));
}

// Local date and hour straight from the ISO string ("2027-02-09T16:30:00+09:00" -> 2027-02-09, 16).
const localDate = (s) => String(s).slice(0, 10);
const localHour = (s) => Number(String(s).slice(11, 13));

// Returns { h, early } when the fare is a direct 4-5 day round trip that includes a holiday date.
// early = the return flight leaves before 15:00 (shown in the app as "조건 밖", never as a match).
export function matchHoliday(t) {
  if (t.transfers !== 0 || t.return_transfers !== 0 || !t.departure_at || !t.return_at) return null;
  const dep = d2n(localDate(t.departure_at)), ret = d2n(localDate(t.return_at));
  const len = ret - dep;
  if (len < 3 || len > 4) return null;
  const h = HOLIDAYS.find((x) => x.must.some((d) => d2n(d) >= dep && d2n(d) <= ret));
  return h ? { h, early: localHour(t.return_at) < 15 } : null;
}

async function getJson(token, url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "X-Access-Token": token, "Accept-Encoding": "gzip, deflate" } });
      if (r.status === 429) { await new Promise((res) => setTimeout(res, 2000 * (i + 1))); continue; }
      if (r.status === 401 || r.status === 403) throw new Error(`token rejected (${r.status})`);
      if (!r.ok) return null;
      const j = await r.json();
      return j.success ? j.data : null;
    } catch (e) {
      if (/token rejected/.test(e.message)) throw e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
  return null;
}

// Cheapest round trips for a departure month + return month.
async function query(token, dest, depMonth, retMonth, market) {
  const qs = new URLSearchParams({
    origin: ORIGIN, destination: dest, departure_at: depMonth, return_at: retMonth,
    one_way: "false", direct: "true", currency: "krw", sorting: "price", limit: "1000", page: "1",
  });
  if (market) qs.set("market", market);
  const d = await getJson(token, `${API}?${qs}`);
  return Array.isArray(d) ? d : [];
}

// Cheapest 3-4 night round trip for every departure date of a month (one per date).
async function grouped(token, dest, depMonth, market) {
  const qs = new URLSearchParams({
    origin: ORIGIN, destination: dest, departure_at: depMonth, group_by: "departure_at",
    direct: "true", min_trip_duration: "3", max_trip_duration: "4", currency: "krw",
  });
  if (market) qs.set("market", market);
  const d = await getJson(token, `https://api.travelpayouts.com/aviasales/v3/grouped_prices?${qs}`);
  return d && typeof d === "object" ? Object.values(d) : [];
}

const short = (t, dest) => ({
  dest, price: t.price, airline: t.airline, flight: `${t.airline}${t.flight_number}`,
  dep: t.departure_at, ret: t.return_at, origin: t.origin_airport, airport: t.destination_airport,
  link: t.link ? `https://www.aviasales.com${t.link}` : null,
});

export async function runFlights({ dataDir, today }) {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) { console.log("flights: skipped (TRAVELPAYOUTS_TOKEN not set)"); return null; }

  // The data market changes which searches are counted; use the one that returns data for a busy route.
  let market = "kr";
  const probe = async (m) => (await query(token, "OSA", "2027-02", "2027-02", m)).length;
  const [kr, def] = [await probe("kr"), await probe(null)];
  if (def > kr) market = null;
  console.log(`flights: market ${market || "default"} (probe kr ${kr}, default ${def})`);

  const pairs = monthPairs();
  const depMonths = [...new Set(pairs.map(([dm]) => dm))];
  const found = {}; // holidayId -> destCode -> best matching ticket today
  const near = {}; // holidayId -> destCode -> best ticket that fails only the 15:00 return rule
  const byMonth = {}; // diagnostics: departure month -> { raw, match, near }
  let calls = 0, raw = 0;
  const take = (code, rows) => {
    raw += rows.length;
    for (const t of rows) {
      const m = String(t.departure_at || "").slice(0, 7);
      const s = (byMonth[m] ||= { raw: 0, match: 0, near: 0 });
      s.raw++;
      const r = matchHoliday(t);
      if (!r) continue;
      const box = r.early ? near : found;
      s[r.early ? "near" : "match"]++;
      const cur = (box[r.h.id] ||= {})[code];
      if (!cur || t.price < cur.price) box[r.h.id][code] = short(t, code);
    }
  };
  for (const [code] of DESTS) {
    for (const [dm, rm] of pairs) { take(code, await query(token, code, dm, rm, market)); calls++; await new Promise((res) => setTimeout(res, 150)); }
    for (const dm of depMonths) { take(code, await grouped(token, code, dm, market)); calls++; await new Promise((res) => setTimeout(res, 150)); }
  }
  console.log(`flights: by month ${Object.keys(byMonth).sort().map((m) => `${m} ${byMonth[m].raw}/${byMonth[m].match}/${byMonth[m].near}`).join(", ")} (fares/match/early-return)`);

  // Lowest price ever seen per holiday + destination (the cache only covers 48 hours).
  const dir = path.join(dataDir, "flights");
  mkdirSync(dir, { recursive: true });
  const statePath = path.join(dir, "lows.json");
  const lows = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
  const newLows = [];
  for (const [hid, byDest] of Object.entries(found)) {
    for (const [code, t] of Object.entries(byDest)) {
      const k = `${hid}|${code}`;
      if (!lows[k] || t.price < lows[k].price) {
        if (lows[k]) newLows.push({ hid, code, price: t.price, was: lows[k].price });
        lows[k] = { ...t, seen: today };
      }
    }
  }
  writeFileSync(statePath, JSON.stringify(lows));

  const name = Object.fromEntries(DESTS.map(([c, n, country]) => [c, { n, country }]));
  const holidays = HOLIDAYS.map((h) => {
    const rows = DESTS.map(([code]) => {
      const now = found[h.id]?.[code] || null;
      const low = lows[`${h.id}|${code}`] || null;
      const early = !now && !low ? near[h.id]?.[code] || null : null; // only when nothing matches
      if (!now && !low && !early) return null;
      return { code, city: name[code].n, country: name[code].country, now, low, early };
    }).filter(Boolean).sort((a, b) => (!!a.early - !!b.early) || ((a.now || a.low || a.early).price - (b.now || b.low || b.early).price));
    return { id: h.id, label: h.label, must: h.must, rows };
  });
  const out = { v: 1, date: today, generatedAt: new Date().toISOString(), market: market || "default", newLows: newLows.filter((x) => x.was).length, holidays };
  writeFileSync(path.join(dir, "latest.json"), JSON.stringify(out));

  const nToday = Object.values(found).reduce((s, x) => s + Object.keys(x).length, 0);
  console.log(`flights: ${calls} calls, ${raw} fares, ${nToday} matches today, ${newLows.length} new lows`);

  // One line for the morning push: the biggest new low, if any.
  const best = newLows.filter((x) => x.was).sort((a, b) => (b.was - b.price) - (a.was - a.price))[0];
  if (!best) return null;
  const hl = HOLIDAYS.find((h) => h.id === best.hid).label;
  const man = (p) => `${(p / 10000).toFixed(1).replace(/\.0$/, "")}만원`;
  return `✈ ${hl} ${name[best.code].n} ${man(best.price)} (최저가 갱신, 이전 ${man(best.was)})`;
}
