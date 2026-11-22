// One Claude call per day: find catalyst-driven high-volatility candidates and look up
// one-month events for the given tickers, using the server-side web search tool.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-5-5"; // catalyst research (web search)
const NEWS_MODEL = "claude-haiku-5-5"; // headline summary only

const SYSTEM = `You are a research assistant for Korean (KOSPI/KOSDAQ) and US (NYSE/NASDAQ) equities.
You only gather facts; you never give buy/sell instructions.
Use web search to confirm dates. Mark each date as confirmed only when the company, the exchange or the regulator announced it; otherwise mark it as estimated.
Never invent tickers, codes or dates. If you cannot confirm something, say so with null values.
Write every human-readable string in Korean, short and plain.`;

function extractJson(text) {
  const tagged = [...text.matchAll(/<json>([\s\S]*?)<\/json>/g)].pop();
  const raw = tagged ? tagged[1] : (text.match(/\{[\s\S]*\}/) || [null])[0];
  if (!raw) throw new Error("no JSON in model output");
  return JSON.parse(raw);
}

// CLAUDE=off: run without the API (Claude Code on the PC fills in research and summaries instead).
export const apiOff = () => process.env.CLAUDE === "off";

export async function researchCatalysts({ today, horizonEnd, tickers, includeUS = false }) {
  if (apiOff()) { console.log("claude: off (PC mode)"); return null; }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("claude: skipped (ANTHROPIC_API_KEY not set)");
    return null;
  }
  const client = new Anthropic();
  const list = tickers.map((t) => `- ${t.name} (${t.market} ${t.symbol})`).join("\n");
  const prompt = `Today is ${today}. The window is ${today} to ${horizonEnd} (about 21 trading days).

Task A - high-volatility candidates:
${includeUS
    ? `Find up to 8 Korean or US stocks that have a confirmed catalyst inside the window: earnings release, FDA decision (PDUFA), clinical readout, index inclusion, large contract disclosure, product launch, policy benefit.
Prefer liquid names (Korea: average daily trading value above 10 billion KRW; US: above 20 million USD).`
    : `Find up to 8 Korean (KOSPI/KOSDAQ) stocks only, no US stocks, that have a confirmed catalyst inside the window: earnings release, clinical readout or regulatory decision, index inclusion (KOSPI200 etc.), large contract disclosure (DART), product launch, policy benefit.
Prefer liquid names (average daily trading value above 10 billion KRW).`} Exclude stocks under administrative or investment-warning designation.
Lock-up expiries and rights offerings are negatives: include them only as a risk note, not as a reason.

Task B - events for these tickers inside the window (one most relevant event each, or null):
${list}

Return only this JSON inside <json></json> tags:
<json>{
  "candidates": [
    {"name": "", "market": ${includeUS ? '"KR" or "US"' : '"KR"'}, "symbol": "${includeUS ? "6-digit KRX code or US ticker" : "6-digit KRX code"}", "catalyst": "짧은 설명", "date": "YYYY-MM-DD or null", "confirmed": true/false, "risk": "가장 그럴듯한 실패 시나리오 한 줄"}
  ],
  "events": {
    "<symbol>": {"event": "짧은 설명", "date": "YYYY-MM-DD or null", "confirmed": true/false}
  }
}</json>`;

  const messages = [{ role: "user", content: prompt }];
  for (let i = 0; i < 6; i++) {
    let res;
    try {
      res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10 }],
        messages,
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) console.log("claude: invalid API key");
      else if (error instanceof Anthropic.RateLimitError) console.log("claude: rate limited");
      else if (error instanceof Anthropic.APIError) console.log(`claude: API error ${error.status}: ${error.message}`);
      else console.log(`claude: ${error.message}`);
      return null;
    }
    if (res.stop_reason === "pause_turn") {
      messages.splice(1);
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    if (res.stop_reason === "refusal") {
      console.log(`claude: refused (${res.stop_details?.category ?? "unknown"})`);
      return null;
    }
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    try {
      return extractJson(text);
    } catch (e) {
      console.log(`claude: could not parse JSON (${e.message})`);
      return null;
    }
  }
  console.log("claude: too many continuations");
  return null;
}

// ---- News (Haiku, no web search: the collected articles are the only source) ----

const READER = `The reader is a Korean office worker in their late 20s or 30s who works in HR for SPAO stores (SPAO is E-Land World's SPA fashion brand in Korea).
Three groups:
- life: what a Korean in their 20s and 30s should know today: money, prices, interest rates, housing and jeonse, jobs and pay, taxes and benefits, policy changes that take effect, safety, technology and daily-life trends. Skip celebrity gossip, sports results and local crime unless they affect many people.
- world: the international situation: wars and conflicts, diplomacy, US, China, Japan, North Korea, global economy and trade.
- store: what the HR person for SPAO stores should know: minimum wage, labor law and enforcement (근로기준법, 주휴수당, 단시간 근로, 근로감독), store staffing, part-time hiring and turnover, scheduling, store openings and closings, competitor moves (Uniqlo, Topten, Musinsa Standard, ZARA, H&M, Shein), SPA and fashion retail trends that change store operations, and E-Land/SPAO news.`;

const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const PICK_SCHEMA = (() => {
  const ids = { type: "array", items: { type: "array", items: { type: "integer" } } };
  return obj({ headline: { type: "string" }, life: ids, world: ids, store: ids });
})();
const STORY_SCHEMA = obj({ title: { type: "string" }, body: { type: "string" }, why: { type: "string" } });

async function newsCall(prompt, maxTokens, schema) {
  const client = new Anthropic();
  const base = {
    model: NEWS_MODEL,
    max_tokens: maxTokens,
    system: `You prepare a daily news briefing in Korean for one reader. Facts only, taken from the given articles; no opinions or predictions.\n${READER}`,
    messages: [{ role: "user", content: prompt }],
  };
  let res;
  try {
    // Structured outputs: the API guarantees valid JSON matching the schema (no broken quotes).
    res = await client.messages.create({ ...base, output_config: { effort: "low", format: { type: "json_schema", schema } } });
  } catch (e) {
    if (!(e instanceof Anthropic.BadRequestError)) throw e;
    console.log(`claude news: structured output not accepted (${e.message.slice(0, 80)}), retrying as text`);
    res = await client.messages.create({ ...base, output_config: { effort: "low" } });
  }
  // Haiku has no server-side refusal fallback; on a refusal the app shows the plain article list.
  if (res.stop_reason === "refusal") throw new Error("refused");
  if (res.stop_reason === "max_tokens") throw new Error("output cut off (max_tokens)");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  try { return JSON.parse(text); } catch { return extractJson(text); }
}

// Step 1: choose up to 5 stories per group from titles and lead text. Returns {life: [[ids]], world: [...], store: [...]}.
export async function pickNewsStories({ today, groups }) {
  if (apiOff()) { console.log("claude news: off (PC mode)"); return null; }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("claude news: skipped (ANTHROPIC_API_KEY not set)");
    return null;
  }
  const list = groups.map((g) => `## ${g.id} (${g.title})\n${g.items.map((x, i) => `[${i}] ${x.t} (${x.src}) ${x.desc.slice(0, 140)}`).join("\n") || "(none)"}`).join("\n\n");
  const prompt = `Today is ${today} (KST). Below are recent Korean news articles for each group, numbered per group.
For each group choose up to 5 of the most important stories for this reader, most important first.
A story is one event. Put several article numbers in one story only when they report the same event; never put different events in one story.
Every story in a group must be a different topic: articles that are follow-ups, reactions or side angles of the same event (for example the same scandal in different exams) go into one story, never into separate stories. Prefer covering more different topics.
For store, choose only articles that really matter for SPAO store HR or the SPA/fashion retail business; fewer than 5 is fine, and an empty list is fine.
Also write "headline": one Korean line under 45 characters for the single most important story of the day.

${list}

Return JSON in this shape (numbers are the article numbers of that group):
{"headline": "", "life": [[0, 4], [2]], "world": [[1]], "store": [[3]]}`;
  try {
    return await newsCall(prompt, 3000, PICK_SCHEMA);
  } catch (e) {
    console.log(`claude news pick: ${e.message}`);
    return null;
  }
}

// Step 2: summarize ONE story from its article text (one call per story, so a summary can never
// end up under another story's sources). Returns {title, body, why} or null.
const WHY_FOR = {
  life: "a Korean in their 20s or 30s",
  world: "Korea or this reader",
  store: "SPAO store HR or store operations",
};
export async function summarizeStory({ today, group, arts }) {
  const text = arts.map((a, i) => `[article ${i + 1}] ${a.t} (${a.src})\n${a.text}`).join("\n\n");
  const prompt = `Today is ${today} (KST). Summarize the news story below in Korean, using only this article text.
If the articles turn out to describe different events, summarize only article 1.
- "title": a short title, under 30 characters
- "body": the key content in 2 or 3 plain sentences, under 180 characters, with the concrete numbers, dates and who decided what
- "why": one line, under 60 characters, on why it matters to ${WHY_FOR[group]}. Do not invent effects the article does not support; when the effect is unclear, name what to watch next. Do not mention what the article leaves out.

${text}`;
  try {
    const s = await newsCall(prompt, 2000, STORY_SCHEMA);
    return s?.title && s?.body ? { title: s.title, body: s.body, why: s.why || "" } : null;
  } catch (e) {
    console.log(`claude news story (${group}): ${e.message}`);
    return null;
  }
}
