// One Claude call per day: find catalyst-driven high-volatility candidates and look up
// one-month events for the given tickers, using the server-side web search tool.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-5-5";

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

export async function researchCatalysts({ today, horizonEnd, tickers }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("claude: skipped (ANTHROPIC_API_KEY not set)");
    return null;
  }
  const client = new Anthropic();
  const list = tickers.map((t) => `- ${t.name} (${t.market} ${t.symbol})`).join("\n");
  const prompt = `Today is ${today}. The window is ${today} to ${horizonEnd} (about 21 trading days).

Task A - high-volatility candidates:
Find up to 8 Korean or US stocks that have a confirmed catalyst inside the window: earnings release, FDA decision (PDUFA), clinical readout, index inclusion, large contract disclosure, product launch, policy benefit.
Prefer liquid names (Korea: average daily trading value above 10 billion KRW; US: above 20 million USD). Exclude stocks under administrative or investment-warning designation.
Lock-up expiries and rights offerings are negatives: include them only as a risk note, not as a reason.

Task B - events for these tickers inside the window (one most relevant event each, or null):
${list}

Return only this JSON inside <json></json> tags:
<json>{
  "candidates": [
    {"name": "", "market": "KR" or "US", "symbol": "6-digit KRX code or US ticker", "catalyst": "짧은 설명", "date": "YYYY-MM-DD or null", "confirmed": true/false, "risk": "가장 그럴듯한 실패 시나리오 한 줄"}
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

// Summarize the day's headlines (no web search; the headlines are the only source).
export async function summarizeNews({ today, sections }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("claude news: skipped (ANTHROPIC_API_KEY not set)");
    return null;
  }
  const client = new Anthropic();
  const list = sections.map((s) => `## ${s.id} (${s.label})\n${s.items.map((x, i) => `${i + 1}. ${x.t} - ${x.src}`).join("\n") || "(none)"}`).join("\n\n");
  const prompt = `Today is ${today} (KST). Below are today's and yesterday's Korean news headlines, grouped by section.
Summarize each section in Korean using only these headlines. Do not add facts that the headlines do not state.
Merge headlines about the same story. Write 2 to 4 bullets per section, each under 70 Korean characters, plain and neutral.
For an empty section return an empty list. Also write one headline line (under 45 characters) for the most important story of the day.

${list}

Return only this JSON inside <json></json> tags:
<json>{"headline": "", "top": [""], "world": [""], "biz": [""], "spa": [""], "fashion": [""], "hr": [""]}</json>`;
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: "You summarize news headlines for one reader. Korean output. Facts only, no opinions or predictions.",
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return extractJson(text);
  } catch (e) {
    console.log(`claude news: ${e.message}`);
    return null;
  }
}
