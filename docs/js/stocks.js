/* Stock analysis viewer: decrypts the daily report and renders it. */
(function () {
  const { h, icon } = U;
  const cache = new Map();

  const TABS = [
    { id: "today", label: "오늘", icon: "today", href: "#/stocks" },
    { id: "highvol", label: "고변동", icon: "bolt", href: "#/stocks/highvol" },
    { id: "holdings", label: "보유", icon: "wallet", href: "#/stocks/holdings" },
    { id: "history", label: "기록", icon: "clock", href: "#/stocks/history" },
  ];

  async function load(date) {
    const k = date || "latest";
    if (cache.has(k)) return cache.get(k);
    const pass = await U.store.kvGet("passphrase");
    if (!pass) throw Object.assign(new Error("NOPASS"), { code: "NOPASS" });
    const url = date ? `data/history/${date}.enc.json` : "data/latest.enc.json";
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) throw Object.assign(new Error("NODATA"), { code: "NODATA" });
    if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다 (${res.status})`);
    const enc = await res.json();
    let data;
    try { data = await Crypt.decryptJson(enc, pass); }
    catch { throw Object.assign(new Error("BADPASS"), { code: "BADPASS" }); }
    cache.set(k, data);
    return data;
  }

  function problemView(e) {
    if (e.code === "NOPASS" || e.code === "BADPASS") {
      const input = h("input.input", { type: "password", placeholder: "데이터 암호", autocomplete: "off" });
      return h("div",
        h("div.card",
          h("h3", e.code === "NOPASS" ? "데이터 암호를 입력하세요" : "암호가 맞지 않습니다"),
          h("p.small.muted", "GitHub Secret DATA_PASSPHRASE에 넣은 값과 같아야 합니다. 이 기기에만 저장됩니다."),
          h("div.field", { style: { marginTop: "12px" } }, input),
          h("button.btn.block", { onclick: async () => { await U.store.kvSet("passphrase", input.value.trim()); cache.clear(); Stocks.route([]); } }, "확인")));
    }
    if (e.code === "NODATA") {
      return h("div.empty", h("b", "아직 분석 결과가 없습니다"), "GitHub Actions에서 daily-analysis를 한 번 실행하면 여기에 표시됩니다.");
    }
    return h("div.empty", h("b", "불러오지 못했습니다"), e.message);
  }

  function probBar(p, upLabel = "+10%", downLabel = "-10%") {
    return h("div",
      h("div.pbar", h("i.u", { style: { width: `${p.up * 100}%` } }), h("i.n", { style: { width: `${p.neither * 100}%` } }), h("i.d", { style: { width: `${p.down * 100}%` } })),
      h("div.plegend",
        h("span", `${upLabel} 먼저 `, h("b", U.pct0(p.up))),
        h("span", "횡보 ", h("b", U.pct0(p.neither))),
        h("span", `${downLabel} 먼저 `, h("b", U.pct0(p.down)))));
  }

  function eventLine(ev) {
    if (!ev || !ev.event) return h("div.small.muted", { style: { marginTop: "8px" } }, "1개월 내 이벤트: 미확인");
    return h("div.small", { style: { marginTop: "8px" } },
      h("span.muted", "이벤트 "), ev.date ? `${ev.date.slice(5).replace("-", "/")} ` : "", ev.event, " ",
      h(`span.chip${ev.confirmed ? ".good" : ".warn"}`, ev.confirmed ? "확정" : "추정"));
  }

  function stockCard(p, { up = "+10%", down = "-10%", extra } = {}) {
    return h("div.card.stock-card",
      h("div.row.between",
        h("div.grow", h("div.name", p.name), h("div.tiny.muted", `${p.market === "KR" ? "한국" : "미국"} · ${p.symbol}`)),
        h("div", { style: { textAlign: "right" } }, h("div.px", U.price(p.close, p.market)), h(`div.tiny.${U.cls(p.chg1)}`, U.pct(p.chg1)))),
      probBar(p.prob, up, down),
      h("div.metrics",
        h("div", h("div.l", `변동성 (${p.sigmaSrc})`), h("div.v", U.pct0(p.sigma))),
        h("div", h("div.l", "120일 위치"), h("div.v", U.pct0(p.pos120))),
        h("div", h("div.l", "20일"), h(`div.v.${U.cls(p.r20)}`, U.pct(p.r20))),
        h("div", h("div.l", "목표가"), h("div.v", U.price(p.target, p.market))),
        h("div", h("div.l", "손절가"), h("div.v", U.price(p.stop, p.market))),
        h("div", h("div.l", "기준일"), h("div.v", p.asOf ? p.asOf.slice(5).replace("-", "/") : "-"))),
      extra || eventLine(p.event));
  }

  function header(d, note) {
    return h("div",
      note ? h("div.notice", note) : null,
      (d.warnings || []).map((w) => h("div.notice.warn", w)));
  }

  function todayView(d, dateNote) {
    const C = d.custom;
    const t = d.holdings?.total;
    return h("div",
      header(d, dateNote),
      t && t.value ? h("button.list-item", { onclick: () => (location.hash = "#/stocks/holdings") },
        h("div.row.between", h("div.t", "보유 종목"), h("span.muted", "›")),
        h("div.row.wrap", { style: { gap: "14px", marginTop: "6px" } },
          h("div", h("div.tiny.muted", "평가손익"), h(`div.num.${U.cls(t.pl)}`, { style: { fontWeight: 650 } }, `${U.manwon(t.pl)} (${U.pct(t.ret)})`)),
          h("div", h("div.tiny.muted", "평가금액"), h("div.num", { style: { fontWeight: 650 } }, U.won(t.value))),
          t.net != null ? h("div", h("div.tiny.muted", "실현+미실현"), h(`div.num.${U.cls(t.net)}`, { style: { fontWeight: 650 } }, U.manwon(t.net))) : null)) : null,
      h("div.section-title", h("span", "성향 맞춤 발굴"), h("span.tiny", "+10% / -10% · 21거래일")),
      C.marketNote ? h("div.notice", C.marketNote) : null,
      C.picks.length ? C.picks.map((p) => stockCard(p)) : h("div.card.flat", h("p.small", "오늘은 조건을 모두 통과한 종목이 없습니다.")),
      C.nearMiss?.length ? h("div.card.flat",
        h("h3", "아깝게 탈락"),
        C.nearMiss.map((n) => h("div.row.between.small", { style: { padding: "4px 0" } }, h("span", n.name), h("span.muted", n.reason)))) : null,
      h("p.tiny.muted", { style: { margin: "4px 4px 0" } },
        `조건: 변동성 ${U.pct0(C.criteria.sigmaMin)}~${U.pct0(C.criteria.sigmaMax)}, 120일 위치 하위 ${U.pct0(C.criteria.pos120Max)}, 20일 ${U.pct(C.criteria.r20Min, 0)} 이상, 거래대금 기준 통과. 보유 종목 제외.`),
      footer(d));
  }

  function highvolView(d) {
    const H = d.highvol;
    return h("div",
      h("div.notice.warn", "이 영역은 거래 기록상 약점이었던 고변동·손절 미실행 구간입니다. 진입 전에 손절 주문을 먼저 정해 두는 것을 전제로 보세요."),
      !H.available ? h("div.card.flat", h("p.small", "오늘은 촉매 검색을 하지 못했습니다(API 키 미설정 또는 오류).")) : null,
      H.picks.length ? H.picks.map((p) => stockCard(p, {
        up: "+20%",
        extra: h("div",
          h("div.small", { style: { marginTop: "8px" } }, h("span.muted", "촉매 "), p.date ? `${p.date.slice(5).replace("-", "/")} ` : "", p.catalyst, " ",
            h(`span.chip${p.confirmed ? ".good" : ".warn"}`, p.confirmed ? "확정" : "추정")),
          h("div.small", { style: { marginTop: "4px" } }, h("span.muted", "반대 논리 "), p.risk || "-"),
          h("div.tiny.muted", { style: { marginTop: "4px" } }, `+20% 기준 확률(공식) ${U.pct0(p.base20)}`)),
      })) : H.available ? h("div.card.flat", h("p.small", "조건을 통과한 고변동 후보가 없습니다.")) : null,
      H.rejected?.length ? h("div.card.flat", h("h3", "탈락"), H.rejected.map((r) =>
        h("div.row.between.small", { style: { padding: "4px 0" } }, h("span", r.name), h("span.muted", r.reason)))) : null,
      footer(d));
  }

  function holdingsView(d) {
    const { items = [], total, notes = [] } = d.holdings || {};
    if (!items.length) return h("div", header(d), h("div.empty", h("b", "보유 종목이 없습니다"), "GitHub Secret HOLDINGS_JSON을 설정하면 여기에 표시됩니다."));
    return h("div",
      header(d),
      h("div.kpis",
        h("div.kpi", h("div.l", "평가손익"), h(`div.v.${U.cls(total.pl)}`, U.manwon(total.pl)), h("div.s", U.pct(total.ret))),
        h("div.kpi", h("div.l", "평가금액"), h("div.v", U.manwon(total.value).replace("+", "")), h("div.s", `매수 ${U.manwon(total.cost).replace("+", "")}`)),
        total.net != null ? h("div.kpi", h("div.l", "실현 + 미실현"), h(`div.v.${U.cls(total.net)}`, U.manwon(total.net)), h("div.s", `실현 ${U.manwon(total.realized)}`)) : null,
        h("div.kpi", h("div.l", "상위 2종목 비중"), h("div.v", U.pct0(total.top2)), h("div.s", `해외 ${U.pct0(total.overseas)}`))),
      notes.length ? h("div.card", h("h3", "조건부 메모"), h("div.stack", notes.map((n) => h("p.small", n)))) : null,
      h("div.section-title", h("span", "종목별 점검"), h("span.tiny", "1개월 ±10% 기준")),
      items.map((i) => i.missing ? h("div.card.flat", h("div.row.between", h("b", i.name), h("span.small.muted", "시세 미확인"))) :
        h("div.card.stock-card",
          h("div.row.between",
            h("div.grow", h("div.name", i.name), h("div.tiny.muted", `${i.qty}주 · 비중 ${U.pct(i.weight, 1, false)}`)),
            h("div", { style: { textAlign: "right" } }, h("div.px", U.price(i.close, i.market)), h(`div.tiny.${U.cls(i.chg1)}`, `전일 ${U.pct(i.chg1)}`))),
          h("div.row.wrap", { style: { gap: "14px", marginTop: "8px" } },
            h("div", h("div.tiny.muted", "수익률"), h(`div.num.${U.cls(i.ret)}`, { style: { fontWeight: 650 } }, U.pct(i.ret))),
            h("div", h("div.tiny.muted", "손익"), h(`div.num.${U.cls(i.pl)}`, { style: { fontWeight: 650 } }, U.manwon(i.pl))),
            h("div", h("div.tiny.muted", "본전까지"), h("div.num", { style: { fontWeight: 650 } }, i.be > 0 ? `+${Math.round(i.be * 100)}%` : "이익 중"))),
          probBar(i.prob),
          h("div.metrics",
            h("div", h("div.l", `변동성 (${i.sigmaSrc})`), h("div.v", U.pct0(i.sigma))),
            h("div", h("div.l", "120일 위치"), h("div.v", U.pct0(i.pos120))),
            h("div", h("div.l", "20일"), h(`div.v.${U.cls(i.r20)}`, U.pct(i.r20)))),
          eventLine(i.event))),
      footer(d));
  }

  function footer(d) {
    return h("div",
      h("p.disclaimer", `기준: 한국 ${d.asOfKR || "-"} · 미국 ${d.asOfUS || "-"} 종가 · 원/달러 ${d.fx ? Math.round(d.fx).toLocaleString() : "미확인"} · 생성 ${new Date(d.generatedAt).toLocaleString("ko-KR")}`));
  }

  async function historyView() {
    const res = await fetch("data/index.json", { cache: "no-store" });
    const idx = res.ok ? await res.json() : { dates: [] };
    if (!idx.dates.length) return h("div.empty", h("b", "기록이 없습니다"));
    return h("div",
      h("p.small.muted", { style: { margin: "0 4px 10px" } }, "지난 분석을 날짜별로 다시 볼 수 있습니다."),
      idx.dates.map((dt) => h("button.list-item", { onclick: () => (location.hash = `#/stocks/day/${dt}`) },
        h("div.row.between", h("div.t", U.dateLabel(dt)), h("span.muted", "›")))));
  }

  const refreshBtn = () => h("button.icon-btn", { "aria-label": "새로고침", onclick: () => { cache.clear(); Stocks.route(location.hash.slice(2).split("/").slice(1)); } }, icon("refresh"));

  window.Stocks = {
    route(rest) {
      const [view, arg] = rest;
      const go = (active, title, fn, opts = {}) =>
        App.layout({
          app: "stock", title, sub: opts.sub, back: opts.back || "#/", right: refreshBtn(), tabs: TABS, active,
          body: (opts.date ? load(opts.date) : load()).then((d) => fn(d)).catch(problemView),
        });
      if (view === "highvol") return go("highvol", "고변동 발굴", highvolView, { sub: "+20% / -10% · 확정 촉매" });
      if (view === "holdings") return go("holdings", "보유 종목 점검", holdingsView);
      if (view === "history") return App.layout({ app: "stock", title: "지난 분석", tabs: TABS, active: "history", body: historyView() });
      if (view === "day" && arg) return go("history", U.dateLabel(arg), (d) => todayView(d, `${U.dateLabel(arg)}에 만든 분석입니다. 고변동·보유 탭은 최신 분석을 보여줍니다.`), { date: arg, back: "#/stocks/history" });
      return go("today", "부자되기", (d) => todayView(d), { sub: undefined });
    },
  };
})();
