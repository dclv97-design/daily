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

export async function researchCatalysts({ today, horizonEnd, tickers, includeUS = false }) {
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

async function newsCall(prompt, maxTokens) {
  const client = new Anthropic();
  // Haiku has no server-side refusal fallback; on a refusal the app shows the plain article list.
  const res = await client.messages.create({
    model: NEWS_MODEL,
    max_tokens: maxTokens,
    output_config: { effort: "low" },
    system: `You prepare a daily news briefing in Korean for one reader. Facts only, taken from the given articles; no opinions or predictions.\n${READER}`,
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") throw new Error("refused");
  return extractJson(res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"));
}

// Step 1: choose up to 5 stories per group from titles and lead text. Returns {life: [[ids]], world: [...], store: [...]}.
export async function pickNewsStories({ today, groups }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("claude news: skipped (ANTHROPIC_API_KEY not set)");
    return null;
  }
  const list = groups.map((g) => `## ${g.id} (${g.title})\n${g.items.map((x, i) => `[${i}] ${x.t} (${x.src}) ${x.desc.slice(0, 140)}`).join("\n") || "(none)"}`).join("\n\n");
  const prompt = `Today is ${today} (KST). Below are recent Korean news articles for each group, numbered per group.
For each group choose up to 5 of the most important stories for this reader, most important first. One story may combine several articles about the same event: list all their numbers.
For store, choose only articles that really matter for SPAO store HR or the SPA/fashion retail business; fewer than 5 is fine, and an empty list is fine.

${list}

Return only this JSON inside <json></json> tags (numbers are the article numbers of that group):
<json>{"life": [[0, 4], [2]], "world": [[1]], "store": [[3]]}</json>`;
  try {
    return await newsCall(prompt, 2000);
  } catch (e) {
    console.log(`claude news pick: ${e.message}`);
    return null;
  }
}

// Step 2: summarize the chosen stories from their article text.
export async function writeNewsStories({ today, groups }) {
  const blocks = groups.map((g) => `## ${g.id} (${g.title})\n${g.stories.map((s, k) => `### story ${k}\n${s.arts.map((a) => `- ${a.t} (${a.src}): ${a.text}`).join("\n")}`).join("\n") || "(none)"}`).join("\n\n");
  const prompt = `Today is ${today} (KST). For each group below, write exactly one summary per story, using only the article text given for that story.
Never split a story into two summaries, never merge two stories, and never add a story that is not listed.
For each story write:
- "story": the story number as given ("### story N" -> N)
- "title": a short Korean title, under 30 characters
- "body": the key content in 2 or 3 plain Korean sentences, under 180 characters, with the concrete numbers, dates and who decided what
- "why": one line, under 60 characters, on why it matters to this reader (for life: a person in their 20s-30s; for world: Korea or the reader; for store: SPAO store HR or store operations). Do not invent effects the articles do not support; when the effect is unclear, name what to watch next. Do not write about what the article does not mention.
Also write "headline": one line under 45 characters for the single most important story of the day.

${blocks}

Return only this JSON inside <json></json> tags:
<json>{"headline": "", "life": [{"story": 0, "title": "", "body": "", "why": ""}], "world": [], "store": []}</json>`;
  try {
    return await newsCall(prompt, 6000);
  } catch (e) {
    console.log(`claude news write: ${e.message}`);
    return null;
  }
}
