/* Router, launcher, shared layout and settings. */
(function () {
  const { h, icon } = U;
  const root = document.getElementById("root");
  const App = (window.App = { routes: {} });

  App.layout = function ({ app, title, sub, back = "#/", right, tabs, active, body, noTabs }) {
    root.innerHTML = "";
    const wrap = h(`div.app${app === "note" ? ".note" : ""}`);
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
    const hour = new Date().getHours();
    const hello = hour < 11 ? "좋은 아침이에요" : hour < 18 ? "오늘도 수고하고 있어요" : "오늘 하루 정리할 시간";
    const stockMeta = h("div.meta", h("span", "데이터 확인 중"));
    const noteMeta = h("div.meta");
    const el = h(
      "div.launch",
      h("div.hello", `${U.dateLabel(U.today())} · ${hello}`),
      h("h1", "무엇을 열까요?"),
      h("button.tile.stock", { onclick: () => (location.hash = "#/stocks") },
        h("div.badge", icon("chart")), h("span.arrow", "›"),
        h("h2", "주식 분석"), h("p", "매일 아침 06:50 업데이트되는 발굴 후보와 보유 종목 점검"), stockMeta),
      h("button.tile.note", { onclick: () => (location.hash = "#/note") },
        h("div.badge", icon("note")), h("span.arrow", "›"),
        h("h2", "마이 노트"), h("p", "했어야 할 말, 대화 장전, 판단 채점, 좋음 앨범"), noteMeta),
      h("div.foot", h("span", "모든 노트는 이 기기에만 저장됩니다"), h("button.link-btn", { onclick: () => (location.hash = "#/settings") }, "설정")),
    );
    root.appendChild(el);
    // Lightweight meta
    fetch("data/index.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((idx) => {
      stockMeta.innerHTML = "";
      stockMeta.appendChild(h("span", idx?.dates?.length ? `최근 업데이트 ${U.dateLabel(idx.dates[0])}` : "아직 데이터가 없습니다"));
    }).catch(() => { stockMeta.innerHTML = ""; stockMeta.appendChild(h("span", "오프라인")); });
    if (window.Note) Note.launcherMeta().then((parts) => parts.forEach((p) => noteMeta.appendChild(h("span", p))));
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
      h("div.section-title", "마이 노트 백업"),
      h("div.card",
        h("p.small.muted", "노트와 사진은 이 기기에만 저장됩니다. 기기를 바꾸거나 Safari 데이터를 지우기 전에 백업 파일을 저장해 두세요."),
        h("div.row", { style: { marginTop: "12px" } },
          h("button.btn.ghost.grow", { onclick: () => Note.exportBackup() }, "백업 파일 저장"),
          h("label.btn.ghost.grow", { style: { position: "relative" } }, "백업 불러오기",
            h("input", { type: "file", accept: "application/json,.json", style: { position: "absolute", inset: 0, opacity: 0 }, onchange: (e) => e.target.files[0] && Note.importBackup(e.target.files[0]) })))),
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
      alert(e.message || String(e));
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
