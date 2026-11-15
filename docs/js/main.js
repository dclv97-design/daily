/* Router, launcher, shared layout and settings. */
(function () {
  const { h, icon } = U;
  const root = document.getElementById("root");
  const App = (window.App = { routes: {} });

  App.layout = function ({ app, title, sub, back = "#/", right, tabs, active, body, noTabs }) {
    root.innerHTML = "";
    const wrap = h(`div.app${app ? `.${app}` : ""}`);
    const top = h(
      "header.topbar",
      h("button.icon-btn", { "aria-label": "뒤로", onclick: () => (location.hash = back) }, icon(back === "#/" ? "home" : "back")),
      h("div.grow", h("h1", title), sub ? h("div.sub", sub) : null),
      right || null,
    );
    const main = h(`main${noTabs || !tabs ? ".no-tabs" : ""}`);
    if (body instanceof Promise) {
      main.appendChild(h("div.empty", "불러오는 중"));
      body.then((b) => { main.innerHTML = ""; main.appendChild(b); }).catch((e) => { main.innerHTML = ""; main.appendChild(h("div.empty", h("b", "문제가 생겼습니다"), String(e.message || e))); });
    } else main.appendChild(body);
    wrap.append(top, main);
    if (tabs && !noTabs) {
      wrap.appendChild(
        h("nav.tabs", h("div.tabs-inner", tabs.map((t) =>
          h(`button.tab${t.id === active ? ".on" : ""}`, { onclick: () => (location.hash = t.href) }, icon(t.icon), t.label)))),
      );
    }
    root.appendChild(wrap);
    window.scrollTo(0, 0);
    return main;
  };

  /* Launcher */
  async function launcher() {
    root.innerHTML = "";
    const stockBadge = h("span.app-badge", { style: { display: "none" } });
    const newsBadge = h("span.app-badge", { style: { display: "none" } });
    const noteBadge = h("span.app-badge", { style: { display: "none" } });
    const tripBadge = h("span.app-badge", { style: { display: "none" } });
    const appIcon = (cls, ic, label, href, badge) =>
      h(`button.app-icon.${cls}`, { onclick: () => (location.hash = href) },
        h("span.app-square", icon(ic), badge), h("span.app-label", label));
    const q = window.Quotes ? Quotes.today() : null;
    // Main screen cards (filled in once their data loads): news summary and to-dos.
    const newsSlot = h("div.home-slot.news");
    const todoSlot = h("div.home-slot.note");
    if (window.News) News.homeCard().then((c) => c && newsSlot.appendChild(c)).catch(() => {});
    if (window.Note) Note.homeTodoCard().then((c) => c && todoSlot.appendChild(c)).catch(() => {});
    const el = h(
      "div.launch",
      h("h1", U.dateLabel(U.today())),
      h("div.app-grid",
        appIcon("stock", "chart", "부자되기", "#/stocks", stockBadge),
        appIcon("news", "globe", "똑똑해지기", "#/news", newsBadge),
        appIcon("note", "note", "똑부러지기", "#/note", noteBadge),
        appIcon("trip", "plane", "야무져지기", "#/trip", tripBadge)),
      h("div.home-cards", newsSlot, todoSlot),
      q ? h("p.daily-quote", h("span", `“${q.t}”`), h("span.by", `- ${q.by}`)) : null,
      h("div.foot", h("span", "모든 노트는 이 기기에만 저장됩니다"), h("button.link-btn", { onclick: () => (location.hash = "#/settings") }, "설정")),
    );
    root.appendChild(el);
    // Badges: new report / news today, todos due
    fetch("data/index.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((idx) => {
      if (idx?.dates?.[0] === U.today()) { stockBadge.textContent = "N"; stockBadge.style.display = ""; }
    }).catch(() => {});
    if (window.News) News.hasToday().then((y) => { if (y) { newsBadge.textContent = "N"; newsBadge.style.display = ""; } });
    if (window.Note) Note.launcherCount().then((n) => { if (n) { noteBadge.textContent = n; noteBadge.style.display = ""; } });
    if (window.Trip) Trip.badge().then((n) => { if (n) { tripBadge.textContent = "↓"; tripBadge.style.display = ""; } });
  }

  /* Settings */
  async function settings() {
    const pass = (await U.store.kvGet("passphrase")) || "";
    const vapid = await U.store.kvGet("vapid");
    const body = h("div");

    // Passphrase
    const passInput = h("input.input", { type: "password", value: pass, placeholder: "GitHub Secret DATA_PASSPHRASE와 같은 값", autocomplete: "off" });
    body.append(
      h("div.section-title", "주식 데이터 암호"),
      h("div.card",
        h("p.small.muted", "분석 결과는 암호화되어 공개 저장소에 올라갑니다. 엔진에 넣은 암호와 같은 값을 입력하면 이 기기에서만 풀어서 봅니다."),
        h("div.field", { style: { marginTop: "12px" } }, passInput),
        h("button.btn.block", { onclick: async () => { await U.store.kvSet("passphrase", passInput.value.trim()); U.toast("저장했습니다"); } }, "저장")),
    );

    // Push
    const pushBox = h("div.card");
    const renderPush = async () => {
      pushBox.innerHTML = "";
      const v = await U.store.kvGet("vapid");
      const sub = await U.store.kvGet("pushSub");
      pushBox.append(
        h("p.small.muted", "아이폰에서는 홈 화면에 추가한 앱으로 열었을 때만 알림을 켤 수 있습니다(iOS 16.4 이상)."),
        !U.isStandalone() ? h("div.notice.warn", { style: { marginTop: "10px" } }, "지금은 브라우저로 열려 있습니다. Safari 공유 버튼 → 홈 화면에 추가 후, 홈 화면 아이콘으로 다시 열어 주세요.") : null,
        h("div.section-title", "1단계 · 알림 키 만들기"),
        v ? h("div.stack",
          h("div.small", "VAPID_PUBLIC_KEY"), h("div.code", v.publicKey),
          h("button.btn.ghost.sm", { onclick: () => U.copy(v.publicKey) }, "공개 키 복사"),
          h("div.small", "VAPID_PRIVATE_KEY"), h("div.code", v.privateKey),
          h("button.btn.ghost.sm", { onclick: () => U.copy(v.privateKey) }, "비공개 키 복사"),
          h("p.tiny.muted", "두 값을 GitHub 저장소 Settings → Secrets → Actions에 같은 이름으로 넣으세요. 비공개 키는 다른 곳에 공유하지 마세요."))
          : h("button.btn.soft.block", { onclick: async () => { await U.store.kvSet("vapid", await Crypt.makeVapidKeys()); renderPush(); } }, "알림 키 만들기"),
        h("div.section-title", "2단계 · 이 기기 알림 켜기"),
        h("button.btn.block", { disabled: !v, onclick: () => subscribe(renderPush) }, sub ? "다시 연결하기" : "알림 허용하고 연결하기"),
        sub ? h("div.stack", { style: { marginTop: "10px" } },
          h("div.small", "PUSH_SUBSCRIPTION"), h("div.code", sub),
          h("button.btn.ghost.sm", { onclick: () => U.copy(sub) }, "연결 정보 복사"),
          h("p.tiny.muted", "이 값을 GitHub Secret PUSH_SUBSCRIPTION에 넣으면 매일 아침 이 기기로 알림이 옵니다.")) : null,
      );
    };
    renderPush();
    body.append(h("div.section-title", "아침 알림"), pushBox);

    // Backup
    body.append(
      h("div.section-title", "메모 백업"),
      h("div.card",
        h("p.small.muted", "메모와 사진·영상은 이 기기에만 저장됩니다. 기기를 바꾸기 전에 백업하세요."),
        h("div.row", { style: { marginTop: "12px" } },
          h("button.btn.ghost.grow", { onclick: () => Note.exportBackup() }, "백업 파일 저장"),
          h("label.btn.ghost.grow", { style: { position: "relative" } }, "백업 불러오기",
            h("input", { type: "file", style: { position: "absolute", inset: 0, opacity: 0 }, onchange: (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) Note.importBackup(f); } })))),
    );

    // Theme
    const theme = (await U.store.kvGet("theme")) || "auto";
    body.append(
      h("div.section-title", "화면"),
      h("div.card", h("div.pills", [["auto", "시스템"], ["light", "밝게"], ["dark", "어둡게"]].map(([k, l]) =>
        h(`button.pill${theme === k ? ".on" : ""}`, { onclick: async () => { await U.store.kvSet("theme", k); applyTheme(k); settings(); } }, l)))),
      h("p.disclaimer", "주식 분석은 정보 제공 목적이며 투자 자문이 아닙니다. 확률은 통계적 근사치이며 결과를 보장하지 않습니다."),
    );
    App.layout({ title: "설정", body, noTabs: true });
  }

  async function subscribe(done) {
    try {
      const v = await U.store.kvGet("vapid");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("이 브라우저는 웹 푸시를 지원하지 않습니다. 홈 화면 앱으로 열어 주세요.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("알림 권한이 허용되지 않았습니다.");
      const reg = await navigator.serviceWorker.ready;
      const old = await reg.pushManager.getSubscription();
      if (old) await old.unsubscribe();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Crypt.b64urlToBytes(v.publicKey) });
      await U.store.kvSet("pushSub", JSON.stringify(sub));
      U.toast("알림이 연결됐습니다");
      done();
    } catch (e) {
      U.alert(e.message || String(e));
    }
  }

  function applyTheme(k) {
    if (k === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", k);
  }

  /* Router */
  async function route() {
    const hash = location.hash || "#/";
    const parts = hash.slice(2).split("/").filter(Boolean);
    const [app, ...rest] = parts;
    try {
      if (!app) return launcher();
      if (app === "settings") return settings();
      if (app === "stocks") return Stocks.route(rest);
      if (app === "note") return Note.route(rest);
      if (app === "news") return News.route(rest);
      if (app === "trip") return Trip.route(rest);
      return launcher();
    } catch (e) {
      console.error(e);
      root.innerHTML = "";
      root.appendChild(h("div.empty", h("b", "문제가 생겼습니다"), String(e.message || e)));
    }
  }

  window.addEventListener("hashchange", route);
  U.store.kvGet("theme").then((t) => applyTheme(t || "auto")).catch(() => {});
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  route();
})();
