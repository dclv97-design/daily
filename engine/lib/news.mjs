// Daily news digest from Google News RSS (Korean edition). Writes plain JSON for the
// 똑똑해지기 app: headlines grouped by section, plus an optional Claude summary.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { summarizeNews } from "./claude.mjs";
import { sendPush } from "./push.mjs";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const KO = "hl=ko&gl=KR&ceid=KR:ko";
const topic = (t) => `https://news.google.com/rss/headlines/section/topic/${t}?${KO}`;
const search = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:2d`)}&${KO}`;

export const SECTIONS = [
  { id: "top", label: "주요", url: `https://news.google.com/rss?${KO}`, n: 8 },
  { id: "world", label: "세계", url: topic("WORLD"), n: 6 },
  { id: "biz", label: "경제", url: topic("BUSINESS"), n: 6 },
  { id: "spa", label: "SPA", url: search('(유니클로 OR ZARA OR 자라리테일 OR 탑텐 OR 스파오 OR 무신사스탠다드 OR "SPA 브랜드" OR 에잇세컨즈 OR 쉬인 OR H&M)'), n: 10 },
  { id: "fashion", label: "패션", url: search("(패션업계 OR 패션기업 OR 의류업계 OR 한섬 OR 신세계인터내셔날 OR 삼성물산패션 OR LF패션 OR 무신사 OR 에이블리 OR W컨셉 OR 29CM)"), n: 10 },
  { id: "hr", label: "HR", url: search("(인사제도 OR 채용시장 OR 희망퇴직 OR 구조조정 OR 임원인사 OR 노동시장 OR 주4일제 OR 성과급 OR HR테크 OR 인사담당자 OR 인사노무)"), n: 10 },
];

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .trim();
}
const tag = (xml, t) => (xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1];

export function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const src = decode(tag(it, "source"));
    let title = decode(tag(it, "title"));
    if (src && title.endsWith(` - ${src}`)) title = title.slice(0, -(src.length + 3));
    return { t: title, src, link: decode(tag(it, "link")), pub: new Date(decode(tag(it, "pubDate"))).toISOString() };
  }).filter((x) => x.t && x.link && x.pub !== "Invalid Date");
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
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.ok) return await r.text();
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 800 * (i + 1)));
  }
  return null;
}

export async function runNews({ dataDir, today }) {
  const now = Date.now();
  const seen = [];
  const sections = [];
  for (const s of SECTIONS) {
    const xml = await fetchText(s.url);
    if (!xml) { console.log(`news: ${s.id} fetch failed`); sections.push({ id: s.id, label: s.label, items: [] }); continue; }
    const all = parseRss(xml).sort((a, b) => b.pub.localeCompare(a.pub));
    // 당일·전일 기사 우선, 너무 적으면 사흘까지
    let pool = all.filter((x) => now - Date.parse(x.pub) <= 36 * 3600e3);
    if (pool.length < 3) pool = all.filter((x) => now - Date.parse(x.pub) <= 72 * 3600e3);
    const items = [];
    for (const x of pool) {
      const g = grams(x.t);
      if (seen.some((o) => similar(g, o) >= 0.6)) continue;
      seen.push(g);
      items.push(x);
      if (items.length >= s.n) break;
    }
    sections.push({ id: s.id, label: s.label, items });
  }

  const summary = await summarizeNews({ today, sections });
  const digest = { v: 1, date: today, generatedAt: new Date().toISOString(), sections, summary: summary || null };

  const dir = path.join(dataDir, "news");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "latest.json"), JSON.stringify(digest));
  writeFileSync(path.join(dir, `${today}.json`), JSON.stringify(digest));
  const idxPath = path.join(dir, "index.json");
  const idx = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, "utf8")) : { dates: [] };
  idx.dates = [...new Set([today, ...idx.dates])].sort().reverse().slice(0, 60);
  idx.updatedAt = digest.generatedAt;
  writeFileSync(idxPath, JSON.stringify(idx, null, 1));
  console.log(`news: ${sections.map((s) => `${s.id} ${s.items.length}`).join(", ")}${summary ? ", summarized" : ""}`);

  const top = sections.find((s) => s.id === "top")?.items || [];
  const lead = summary?.headline || top.slice(0, 2).map((x) => x.t).join(" / ");
  const extra = ["spa", "fashion", "hr"].map((id) => sections.find((s) => s.id === id)).filter((s) => s?.items.length).map((s) => `${s.label} ${s.items.length}`);
  await sendPush({
    title: `똑똑해지기 ${today.slice(5).replace("-", "/")}`,
    body: [lead, extra.join(" · ")].filter(Boolean).join("\n").slice(0, 180),
    url: "./#/news",
  });
}
