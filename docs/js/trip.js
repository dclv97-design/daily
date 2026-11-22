/* 알차게떠나기: 2027 연휴 서울 출발 직항 항공권 최저가. Data: data/flights/latest.json (plain). */
(function () {
  const { h } = U;

  const won = (n) => `${(n / 10000).toFixed(1).replace(/\.0$/, "")}만원`;
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const md = (iso) => { const d = new Date(`${iso.slice(0, 10)}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
  const hm = (iso) => iso.slice(11, 16);
  const tripLine = (t) => `${md(t.dep)} ${hm(t.dep)} → ${md(t.ret)} ${hm(t.ret)} · ${t.flight}`;
  const range = (must) => (must.length > 1 ? `${md(must[0])}~${md(must.at(-1))}` : md(must[0]));

  async function load() {
    const r = await fetch("data/flights/latest.json", { cache: "no-store" });
    if (!r.ok) throw new Error("NODATA");
    return r.json();
  }

  function flightRow(r) {
    const t = r.now || r.low || r.early;
    const isLow = r.now && r.low && r.now.price <= r.low.price;
    const meta = r.now
      ? (isLow ? "오늘 확인 · 역대 최저" : `오늘 확인 · 최저 ${won(r.low.price)} (${U.dateLabel(r.low.seen)})`)
      : r.low ? `오늘은 없음 · ${U.dateLabel(r.low.seen)} 최저 기록`
        : `귀국편 ${hm(t.ret)} 출발 · 15시 조건 밖 (참고용)`;
    return h(`${t.link ? "a" : "div"}.list-item.flight-row${r.early ? ".early" : ""}`, t.link ? { href: t.link, target: "_blank", rel: "noopener" } : {},
      h("div.flight-top", h("b", r.city), h("span.tiny.muted", r.country), h("span.grow"), h("b.flight-price", won(t.price))),
      h("div.d", tripLine(t)),
      h("div.m", h("span", meta)));
  }

  /* PC 실시간 검색 결과 (data/flights/live.json, Claude Code가 Google 항공편에서 직접 조회해 올림) */
  async function loadLive() {
    try {
      const r = await fetch("data/flights/live.json", { cache: "no-store" });
      return r.ok ? r.json() : null;
    } catch { return null; }
  }
  const gLink = (code, dep, ret) => `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from SEL to ${code} on ${dep} through ${ret} nonstop`)}&hl=ko&curr=KRW`;
  function liveRow(r, p) {
    return h("a.list-item.flight-row", { href: gLink(r.code, p.dep, p.ret), target: "_blank", rel: "noopener" },
      h("div.flight-top", h("b", r.city), h("span.tiny.muted", r.country), h("span.grow"), h("b.flight-price", won(r.total))),
      h("div.d", `가는 편 ${r.go.dep} ${r.go.airline} · ${won(r.go.price)}`),
      h("div.d", `오는 편 ${r.back.dep} ${r.back.airline} · ${won(r.back.price)}`));
  }
  function liveSection(live, openId) {
    const box = h("div.live-box",
      h("div.section-title", h("span", "실시간 검색"), h("span.tiny.muted", `${U.dateLabel(live.date)} PC에서 조회`)),
      h("p.small.muted", { style: { margin: "-4px 4px 10px" } }, `${live.rule} · 누르면 Google 항공편에서 다시 확인`));
    for (const p of live.pairs) {
      const key = `live-${p.id}`, open = openId === key;
      const card = h("div.card.flight-card");
      card.appendChild(h("button.flight-head", { onclick: () => (location.hash = open ? "#/trip" : `#/trip/${key}`) },
        h("b", p.label), h("span.tiny.muted", `${md(p.dep)}~${md(p.ret)}`), h("span.grow"),
        p.rows.length ? h("b.flight-price", `${p.rows[0].city} ${won(p.rows[0].total)}~`) : h("span.small.muted", "판매 전")));
      if (!p.rows.length) card.appendChild(h("p.small.muted", p.note || "결과 없음"));
      p.rows.slice(0, open ? 20 : 3).forEach((r) => card.appendChild(liveRow(r, p)));
      if (!open && p.rows.length > 3) card.appendChild(h("button.link-btn.small", { onclick: () => (location.hash = `#/trip/${key}`) }, `${p.rows.length - 3}곳 더 보기`));
      box.appendChild(card);
    }
    return box;
  }

  function noData() {
    return h("div.empty", h("b", "아직 항공권 데이터가 없습니다"), "평일 아침 분석 때 함께 모읍니다.");
  }

  async function listView(openId) {
    const live = await loadLive();
    let d;
    try { d = await load(); } catch { return live ? h("div", liveSection(live, openId)) : noData(); }
    const el = h("div");
    if (live) el.appendChild(liveSection(live, openId));
    el.appendChild(h("div.section-title", h("span", "자동 수집"), h("span.tiny.muted", "다른 사람들이 최근 검색한 가격")));
    el.appendChild(h("p.small.muted", { style: { margin: "-4px 4px 12px" } }, "서울 출발 · 직항 왕복 · 4~5일 · 귀국편 15시 이후 · 위탁수화물은 예약 전 직접 확인"));
    for (const hd of d.holidays) {
      const open = openId === hd.id;
      const card = h("div.card.flight-card");
      card.appendChild(h("button.flight-head", { onclick: () => (location.hash = open ? "#/trip" : `#/trip/${hd.id}`) },
        h("b", hd.label), h("span.tiny.muted", range(hd.must)), h("span.grow"),
        !hd.rows.length ? h("span.small.muted", "아직 없음")
          : hd.rows[0].early ? h("span.small.muted", "조건 밖만 있음")
            : h("b.flight-price", `${hd.rows[0].city} ${won((hd.rows[0].now || hd.rows[0].low).price)}~`)));
      if (open) {
        if (!hd.rows.length) card.appendChild(h("p.small.muted", "최근 검색된 직항 가격이 아직 없습니다. 날짜가 가까워질수록 늘어납니다."));
        hd.rows.slice(0, 20).forEach((r) => card.appendChild(flightRow(r)));
      } else {
        hd.rows.slice(0, 3).forEach((r) => card.appendChild(flightRow(r)));
        if (hd.rows.length > 3) card.appendChild(h("button.link-btn.small", { onclick: () => (location.hash = `#/trip/${hd.id}`) }, `${hd.rows.length - 3}곳 더 보기`));
      }
      el.appendChild(card);
    }
    el.appendChild(h("p.tiny.muted", { style: { margin: "8px 4px 0" } },
      `${U.dateLabel(d.date)} 아침 기준 · Aviasales 이용자가 최근 48시간 안에 검색한 가격이라 실제 가격과 다를 수 있습니다 · 누르면 Aviasales 검색이 열립니다`));
    return el;
  }

  // Launcher badge: number of new lowest prices found today.
  async function badge() {
    try {
      const d = await load();
      return d.date === U.today() ? d.newLows || 0 : 0;
    } catch { return 0; }
  }

  window.Trip = {
    badge,
    route(rest) {
      const [id] = rest;
      return App.layout({ app: "trip", title: "알차게떠나기", sub: "2027 연휴 항공권", body: listView(id), back: id ? "#/trip" : "#/", right: Updater.button("trip") });
    },
  };
})();
