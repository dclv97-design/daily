/* 똑똑해지기: 당일·전일 뉴스와 세계 이슈 요약, SPA / 패션 / HR 탭. Data: data/news/*.json (plain). */
(function () {
  const { h } = U;

  const TABS = [
    { id: "brief", label: "브리핑", icon: "globe", href: "#/news" },
    { id: "spa", label: "SPA", icon: "tag", href: "#/news/spa" },
    { id: "fashion", label: "패션", icon: "shirt", href: "#/news/fashion" },
    { id: "hr", label: "HR", icon: "person", href: "#/news/hr" },
    { id: "books", label: "책", icon: "book", href: "#/news/books" },
  ];
  const BRIEF = ["top", "world", "biz"];
  const cache = new Map();

  async function load(date) {
    const url = date ? `data/news/${date}.json` : "data/news/latest.json";
    if (cache.has(url)) return cache.get(url);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("NODATA");
    const j = await r.json();
    cache.set(url, j);
    return j;
  }

  function ago(iso) {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 60) return `${Math.max(1, m)}분 전`;
    if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`;
    const d = new Date(iso);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }

  const row = (x) => h("a.list-item.news-item", { href: x.link, target: "_blank", rel: "noopener" },
    h("div.t", x.t), h("div.m", h("span", x.src), h("span", ago(x.pub))));

  const sumCard = (lines) => (lines?.length ? h("div.card.news-sum", h("ul", lines.map((l) => h("li", l)))) : null);

  function section(d, id, withTitle) {
    const s = d.sections.find((x) => x.id === id);
    if (!s) return null;
    const box = h("div");
    if (withTitle) box.appendChild(h("div.section-title", s.label));
    const sum = sumCard(d.summary?.[id]);
    if (sum) box.appendChild(sum);
    if (!s.items.length) box.appendChild(h("p.small.muted", { style: { margin: "4px 4px 12px" } }, "관련 주요 뉴스가 없습니다"));
    s.items.forEach((x) => box.appendChild(row(x)));
    return box;
  }

  function noData() {
    return h("div.empty", h("b", "아직 뉴스가 없습니다"), "평일 아침 분석 때 함께 만들어집니다.");
  }

  async function briefView(date) {
    let d;
    try { d = await load(date); } catch { return noData(); }
    const el = h("div");
    if (d.summary?.headline) el.appendChild(h("div.card.news-head", h("div.tiny.muted", "오늘의 한 줄"), h("b", d.summary.headline)));
    BRIEF.forEach((id) => el.appendChild(section(d, id, true)));
    if (date) ["spa", "fashion", "hr"].forEach((id) => el.appendChild(section(d, id, true)));
    el.appendChild(h("p.tiny.muted", { style: { margin: "8px 4px 0" } }, `${U.dateLabel(d.date)} 아침 기준 · 제목을 누르면 기사 원문이 열립니다`));
    return el;
  }

  async function topicView(id) {
    let d;
    try { d = await load(); } catch { return noData(); }
    return section(d, id, false);
  }

  async function historyView() {
    let idx;
    try {
      const r = await fetch("data/news/index.json", { cache: "no-store" });
      if (!r.ok) throw new Error();
      idx = await r.json();
    } catch { return noData(); }
    return h("div", (idx.dates || []).map((dt) => h("button.list-item", { onclick: () => (location.hash = `#/news/day/${dt}`) }, h("div.t", U.dateLabel(dt)))));
  }

  /* 읽은 책: 이 기기에만 저장 (메모 백업에 함께 포함) */
  async function booksView(cur) {
    const STATUS = Note.BOOK_STATUS;
    cur = STATUS.includes(cur) ? cur : "다 읽음";
    const all = await U.store.byType("book");
    const list = all.filter((b) => (b.status || "다 읽음") === cur);
    const year = String(new Date().getFullYear());
    const doneThisYear = all.filter((b) => b.status === "다 읽음" && (b.date || "").startsWith(year)).length;
    const el = h("div",
      h("div.seg", STATUS.map((s) => h(`button${s === cur ? ".on" : ""}`, { onclick: () => (location.hash = `#/news/books/${encodeURIComponent(s)}`) },
        s, h("span.seg-n", all.filter((b) => (b.status || "다 읽음") === s).length)))),
      cur === "다 읽음" ? h("p.small.muted", { style: { margin: "0 4px 12px" } }, `올해 ${doneThisYear}권`) : null);
    for (const b of list) {
      const row = h("button.list-item.row.book-row", { onclick: () => (location.hash = `#/news/book/${b.id}`) });
      const url = b.media ? await Note.mediaUrl(b.media, true) : null;
      row.appendChild(url ? h("img.book-cover", { src: url, alt: "" }) : h("span.book-cover.blank", U.icon("book")));
      row.appendChild(h("div.grow",
        h("div.t", b.title),
        b.author ? h("div.d", b.author) : null,
        h("div.m",
          b.status === "다 읽음" && b.rating ? h("span.stars-sm", "★".repeat(b.rating) + "☆".repeat(5 - b.rating)) : null,
          b.status === "다 읽음" && b.date ? h("span", U.dateLabel(b.date)) : null,
          b.quote ? h("span", "밑줄 있음") : null)));
      el.appendChild(row);
    }
    if (!list.length) el.appendChild(h("div.empty", `${cur} 책이 없습니다`));
    el.appendChild(h("button.fab", { "aria-label": "책 추가", onclick: () => (location.hash = `#/news/book/new/${encodeURIComponent(cur)}`) }, U.icon("plus")));
    return el;
  }

  async function bookForm(id, status) {
    if (id === "new") return Note.form("book", null, { preset: Note.BOOK_STATUS.includes(status) ? { status } : null });
    const e = await U.store.get(id);
    if (!e) return h("div.empty", "찾을 수 없습니다");
    return Note.form("book", e);
  }

  async function hasToday() {
    try {
      const r = await fetch("data/news/index.json", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      return j?.dates?.[0] === U.today();
    } catch { return false; }
  }

  window.News = {
    hasToday,
    route(rest) {
      const [view, arg] = rest;
      const L = (active, title, body, extra = {}) => App.layout({ app: "news", title, tabs: TABS, active, body, ...extra });
      if (view === "day" && arg) return L("brief", U.dateLabel(arg), briefView(arg), { back: "#/news/history" });
      if (view === "history") return L("brief", "지난 뉴스", historyView(), { back: "#/news" });
      if (view === "books") return L("books", "읽은 책", booksView(arg ? decodeURIComponent(arg) : null));
      if (view === "book" && arg) {
        const st = rest[2] ? decodeURIComponent(rest[2]) : null;
        return L("books", arg === "new" ? "책 추가" : "책", bookForm(arg, st), { back: `#/news/books${st ? `/${encodeURIComponent(st)}` : ""}`, noTabs: true });
      }
      if (["spa", "fashion", "hr"].includes(view)) return L(view, TABS.find((t) => t.id === view).label, topicView(view));
      return L("brief", "똑똑해지기", briefView(), { right: h("button.link-btn.small", { onclick: () => (location.hash = "#/news/history") }, "지난 뉴스") });
    },
  };
})();
