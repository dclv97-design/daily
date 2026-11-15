// Daily news digest for the 똑똑해지기 app, in three groups:
//   life  - 한국 2030이 알아야 할 것 (연합뉴스 종합·경제·사회)
//   world - 국제 정세 (연합뉴스 국제)
//   store - SPAO 매장 HR이 알아야 할 것 (Bing 뉴스 검색: SPA·패션 리테일, 최저임금·근로기준·채용)
// Claude (Haiku) picks the stories, reads the article text and writes short summaries.
// Without an API key the app shows the newest articles with their lead text.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pickNewsStories, summarizeStory } from "./claude.mjs";
import { sendPush } from "./push.mjs";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const yna = (f) => `https://www.yna.co.kr/rss/${f}.xml`;
const bing = (q) => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=ko&cc=kr`;

export const GROUPS = [
  { id: "life", label: "2030", title: "2030이 알아야 할 것", feeds: [yna("news"), yna("economy"), yna("society")], hours: [36, 72], cap: 80, show: 12 },
  { id: "world", label: "국제", title: "국제 정세", feeds: [yna("international")], hours: [36, 72], cap: 50, show: 12 },
  {
    id: "store", label: "매장 HR", title: "SPAO 매장 HR 체크",
    feeds: ["스파오", "이랜드월드", "SPA 브랜드", "유니클로", "탑텐", "무신사 스탠다드", "패션 매장", "최저임금", "근로기준법", "주휴수당", "아르바이트 채용", "고용노동부 근로감독", "유통업계 인력"].map(bing),
    hours: [72, 24 * 7], cap: 50, show: 15,
  },
];

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", hellip: "…" };
function decode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .trim();
}
const strip = (s) => decode(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (xml, t) => (xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i")) || [])[1];

// Bing wraps the article URL in a click-tracking link; keep the real one.
function realLink(link) {
  try {
    const u = new URL(link);
    if (u.hostname.endsWith("bing.com") && u.searchParams.get("url")) return u.searchParams.get("url");
  } catch { /* keep */ }
  return link;
}

export function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const src = strip(tag(it, "News:Source") || tag(it, "source") || "").replace(/ on MSN$/, "") || (/yna\.co\.kr/.test(it) ? "연합뉴스" : "");
    let t = strip(tag(it, "title"));
    if (src && t.endsWith(` - ${src}`)) t = t.slice(0, -(src.length + 3));
    t = t.replace(/^\[(속보|단독|종합)\]\s*/, "");
    const desc = strip(tag(it, "description")).replace(/^\([^)=]{1,30}=[^)]{1,15}\)\s*[^=]{1,30}=\s*/, "");
    const pub = new Date(decode(tag(it, "pubDate")));
    return { t, src, link: realLink(decode(tag(it, "link"))), pub: isNaN(pub) ? null : pub.toISOString(), desc: desc.slice(0, 320) };
  }).filter((x) => x.t && x.link && x.pub);
}

// near-duplicate check on character bigrams (same story from several outlets)
const grams = (s) => { const t = s.replace(/[\s\p{P}]/gu, ""); const g = new Set(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
function similar(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.max(1, Math.min(a.size, b.size));
}

async function fetchText(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" } });
      if (r.ok) return await r.text();
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 800 * (i + 1)));
  }
  return null;
}

// Article text: paragraphs of the page (works for 연합뉴스; other sites fall back to the RSS lead).
async function articleText(link) {
  if (!/yna\.co\.kr\/view\//.test(link)) return null;
  const html = await fetchText(link);
  if (!html) return null;
  const ps = [...html.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map(([, p]) => strip(p))
    .filter((p) => p.length > 30 && !/재판매 및 DB 금지|제보는 카카오톡|@yna\.co\.kr|저작권자/.test(p));
  return ps.join(" ").replace(/^\([^)]{1,30}=연합뉴스\)\s*[^=]{1,30}=\s*/, "").slice(0, 1100) || null;
}

async function collect(g, now) {
  const all = [];
  for (const url of g.feeds) {
    const xml = await fetchText(url);
    if (!xml) { console.log(`news: ${g.id} feed failed ${url.slice(0, 60)}`); continue; }
    all.push(...parseRss(xml));
    await new Promise((r) => setTimeout(r, 250));
  }
  all.sort((a, b) => b.pub.localeCompare(a.pub));
  let pool = all.filter((x) => now - Date.parse(x.pub) <= g.hours[0] * 3600e3);
  if (pool.length < 8) pool = all.filter((x) => now - Date.parse(x.pub) <= g.hours[1] * 3600e3);
  const seen = [];
  const items = [];
  for (const x of pool) {
    const gx = grams(x.t);
    if (seen.some((o) => similar(gx, o) >= 0.6)) continue;
    seen.push(gx);
    items.push(x);
    if (items.length >= g.cap) break;
  }
  return items;
}

export async function runNews({ dataDir, today }) {
  const now = Date.now();
  const pools = {};
  for (const g of GROUPS) pools[g.id] = await collect(g, now);

  // 1) Claude picks the stories from titles and lead text,
  // 2) each story is summarized in its own call from the article text, so its sources always match.
  let summary = null;
  const picks = await pickNewsStories({ today, groups: GROUPS.map((g) => ({ id: g.id, title: g.title, items: pools[g.id] })) });
  if (picks) {
    summary = { headline: picks.headline || "" };
    for (const g of GROUPS) {
      summary[g.id] = [];
      const used = new Set();
      for (const ids of (picks[g.id] || []).slice(0, 5)) {
        const refs = [...new Set(ids)].map((i) => Number(i)).filter((i) => pools[g.id][i] && !used.has(i)).slice(0, 3);
        if (!refs.length) continue;
        const arts = [];
        for (const i of refs.slice(0, 2)) {
          const x = pools[g.id][i];
          arts.push({ t: x.t, src: x.src, text: (await articleText(x.link)) || x.desc });
        }
        const s = await summarizeStory({ today, group: g.id, arts });
        if (!s) continue;
        refs.forEach((i) => used.add(i));
        summary[g.id].push({ ...s, refs });
      }
    }
    if (!GROUPS.some((g) => summary[g.id].length)) summary = null;
  }

  // Articles shown under each group: the ones used by the summary first, then the newest.
  const groups = GROUPS.map((g) => {
    const used = (summary?.[g.id] || []).flatMap((s) => s.refs);
    const order = [...new Set([...used, ...pools[g.id].map((_, i) => i)])].slice(0, Math.max(g.show, used.length));
    const idx = new Map(order.map((i, k) => [i, k]));
    if (summary?.[g.id]) summary[g.id].forEach((s) => { s.refs = s.refs.map((i) => idx.get(i)).filter((k) => k != null); });
    return { id: g.id, label: g.label, title: g.title, items: order.map((i) => pools[g.id][i]) };
  });

  const digest = { v: 2, date: today, generatedAt: new Date().toISOString(), groups, summary };
  const dir = path.join(dataDir, "news");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "latest.json"), JSON.stringify(digest));
  writeFileSync(path.join(dir, `${today}.json`), JSON.stringify(digest));
  const idxPath = path.join(dir, "index.json");
  const idx = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, "utf8")) : { dates: [] };
  idx.dates = [...new Set([today, ...idx.dates])].sort().reverse().slice(0, 60);
  idx.updatedAt = digest.generatedAt;
  writeFileSync(idxPath, JSON.stringify(idx, null, 1));
  console.log(`news: ${GROUPS.map((g) => `${g.id} ${pools[g.id].length}`).join(", ")}${summary ? `, summarized ${GROUPS.map((g) => summary[g.id].length).join("/")}` : ""}`);

  const lead = summary?.headline || groups[0].items.slice(0, 2).map((x) => x.t).join(" / ");
  const counts = groups.map((g) => `${g.label} ${summary?.[g.id]?.length ?? g.items.length}`).join(" · ");
  await sendPush({
    title: `똑똑해지기 ${today.slice(5).replace("-", "/")}`,
    body: [lead, counts].filter(Boolean).join("\n").slice(0, 180),
    url: "./#/news",
  });
}
