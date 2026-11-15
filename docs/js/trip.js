/* 야무져지기: 2027 연휴 서울 출발 직항 항공권 최저가. Data: data/flights/latest.json (plain). */
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
    const t = r.now || r.low;
    const isLow = r.now && r.low && r.now.price <= r.low.price;
    return h(t.link ? "a.list-item.flight-row" : "div.list-item.flight-row", t.link ? { href: t.link, target: "_blank", rel: "noopener" } : {},
      h("div.flight-top", h("b", r.city), h("span.tiny.muted", r.country), h("span.grow"), h("b.flight-price", won(t.price))),
      h("div.d", tripLine(t)),
      h("div.m",
        r.now
          ? h("span", isLow ? "오늘 확인 · 역대 최저" : `오늘 확인 · 최저 ${won(r.low.price)} (${U.dateLabel(r.low.seen)})`)
          : h("span", `오늘은 없음 · ${U.dateLabel(r.low.seen)} 최저 기록`)));
  }

  function noData() {
    return h("div.empty", h("b", "아직 항공권 데이터가 없습니다"), "평일 아침 분석 때 함께 모읍니다.");
  }

  async function listView(openId) {
    let d;
    try { d = await load(); } catch { return noData(); }
    const el = h("div",
      h("p.small.muted", { style: { margin: "0 4px 12px" } }, "서울 출발 · 직항 왕복 · 4~5일 · 귀국편 15시 이후 · 위탁수화물은 예약 전 직접 확인"));
    for (const hd of d.holidays) {
      const open = openId === hd.id;
      const card = h("div.card.flight-card");
      card.appendChild(h("button.flight-head", { onclick: () => (location.hash = open ? "#/trip" : `#/trip/${hd.id}`) },
        h("b", hd.label), h("span.tiny.muted", range(hd.must)), h("span.grow"),
        hd.rows.length ? h("b.flight-price", `${hd.rows[0].city} ${won((hd.rows[0].now || hd.rows[0].low).price)}~`) : h("span.small.muted", "아직 없음")));
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
      return App.layout({ app: "trip", title: "야무져지기", sub: "2027 연휴 항공권", body: listView(id), back: id ? "#/trip" : "#/" });
    },
  };
})();
