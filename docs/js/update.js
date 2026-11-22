/* 메뉴별 "업데이트" 버튼: 확인 팝업 → GitHub Actions 실행(해당 부분만) → 데이터가 바뀔 때까지 기다렸다가 새로고침.
   GitHub 토큰은 설정 화면에서 넣고 이 기기에만 저장합니다(저장소 daily, Actions 읽기·쓰기 권한만). */
(function () {
  const { h, icon } = U;
  const OWNER = "dclv97-design", REPO = "daily", WF = "daily.yml";
  const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

  const PARTS = {
    stock: {
      part: "stocks", name: "부자되기", time: "2~3분", cost: "약 200~400원",
      what: ["주가·환율과 보유 종목 점검", "재료 검색 (Claude Sonnet, 웹 검색 최대 10회)"],
      checks: [["data/index.json", "updatedAt"]],
    },
    news: {
      part: "news", name: "똑똑해지기", time: "1~2분", cost: "약 10~30원",
      what: ["2030·국제·매장 HR 뉴스 수집", "기사 요약 (Claude Haiku, 약 16번 호출)"],
      checks: [["data/news/index.json", "updatedAt"]],
    },
    trip: {
      part: "flights", name: "알차게떠나기", time: "4~6분", cost: "무료 (Claude 안 씀)",
      what: ["2027 연휴 직항 항공권 가격 조회 (약 500번)"],
      checks: [["data/flights/latest.json", "generatedAt"]],
    },
    all: {
      part: "all", name: "전체", time: "7~10분", cost: "약 200~450원",
      what: ["부자되기: 주가·보유 점검 + 재료 검색 (Claude Sonnet)", "똑똑해지기: 뉴스 수집 + 요약 (Claude Haiku)", "알차게떠나기: 항공권 가격 조회 (무료)"],
      checks: [["data/index.json", "updatedAt"], ["data/news/index.json", "updatedAt"], ["data/flights/latest.json", "generatedAt"]],
    },
    note: {
      local: true, name: "똑부러지기", time: "몇 초", cost: "무료",
      what: ["앱 새 버전 확인 후 다시 불러오기", "기록은 이 기기에만 있어 서버 업데이트는 없습니다"],
    },
  };

  const headers = (token) => ({ Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });

  async function stamp(file, field) {
    try {
      const r = await fetch(`${file}?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return null;
      const j = await r.json();
      return j[field] ? Date.parse(j[field]) : null;
    } catch { return null; }
  }
  // Oldest timestamp among the part's data files (null when one has never been made).
  async function lastUpdated(cfg) {
    const ts = await Promise.all(cfg.checks.map(([f, k]) => stamp(f, k)));
    return ts.some((t) => !t) ? (ts.filter(Boolean).length ? Math.min(...ts.filter(Boolean)) : null) : Math.min(...ts);
  }
  async function allNewer(cfg, t0) {
    const ts = await Promise.all(cfg.checks.map(([f, k]) => stamp(f, k)));
    return ts.every((t) => t && t > t0);
  }

  function ago(ms) {
    if (!ms) return "기록 없음";
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return "방금";
    if (m < 60) return `${m}분 전`;
    if (m < 60 * 24) return `${Math.floor(m / 60)}시간 ${m % 60}분 전`;
    return new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  /* ---- 진행 상태: 앱을 닫았다 열어도 이어서 확인 (최대 15분) ---- */
  const KEY = "pendingUpdate";
  let pending = null; // { key, t0 }
  let timer = null;
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => f());

  async function startPolling() {
    clearInterval(timer);
    if (!pending) return;
    const cfg = PARTS[pending.key];
    let n = 0;
    const tick = async () => {
      n++;
      const age = Date.now() - pending.t0;
      if (age > 15 * 60e3) return finish(false, "15분이 지나도 결과가 오지 않았습니다. GitHub Actions 기록을 확인해 주세요.");
      if (await allNewer(cfg, pending.t0)) return finish(true);
      if (n % 3 === 0) {
        // 실행이 실패로 끝났으면 바로 알려 줍니다(전체 새로고침은 성공한 부분만이라도 반영해서 보여 줌).
        try {
          const token = await U.store.kvGet("ghToken");
          const r = await fetch(`${API}/actions/workflows/${WF}/runs?event=workflow_dispatch&per_page=3`, { headers: headers(token) });
          const j = r.ok ? await r.json() : null;
          const run = (j?.workflow_runs || []).find((x) => Date.parse(x.created_at) >= pending.t0 - 60e3);
          if (run?.status === "completed" && run.conclusion !== "success") {
            return finish(false, `실행이 실패했습니다 (${run.conclusion}).${pending.key === "all" ? " 성공한 부분은 반영됐을 수 있어 화면을 다시 불러옵니다." : ""}`, pending.key === "all");
          }
        } catch { /* keep polling */ }
      }
      notify();
    };
    timer = setInterval(tick, 10000);
    notify();
  }

  async function finish(ok, msg, reload = false) {
    clearInterval(timer);
    const name = PARTS[pending?.key]?.name || "";
    pending = null;
    await U.store.kvSet(KEY, null);
    notify();
    if (ok) {
      U.toast(`${name} 새로고침 완료`);
      setTimeout(() => location.reload(), 900);
    } else {
      await U.alert(msg);
      if (reload) location.reload();
    }
  }

  async function run(key) {
    const cfg = PARTS[key];
    if (cfg.local) {
      try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { /* offline */ }
      U.toast("새 버전을 확인했습니다");
      setTimeout(() => location.reload(), 700);
      return;
    }
    const token = await U.store.kvGet("ghToken");
    if (!token) {
      const go = await U.ask("새로고침하려면 설정에서 GitHub 연결을 먼저 해 주세요.", { ok: "설정으로", cancel: "닫기" });
      if (go) location.hash = "#/settings";
      return;
    }
    const t0 = Date.now();
    let r;
    try {
      r = await fetch(`${API}/actions/workflows/${WF}/dispatches`, {
        method: "POST", headers: { ...headers(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main", inputs: { part: cfg.part } }),
      });
    } catch {
      return U.alert("인터넷 연결을 확인해 주세요.");
    }
    if (r.status === 401) return U.alert("GitHub 토큰이 맞지 않거나 만료됐습니다. 설정에서 다시 넣어 주세요.");
    if (r.status === 403 || r.status === 404) return U.alert("토큰에 이 저장소의 Actions 권한(읽기·쓰기)이 없습니다. 설정의 안내대로 토큰을 다시 만들어 주세요.");
    if (r.status !== 204) return U.alert(`새로고침을 시작하지 못했습니다 (${r.status}).`);
    pending = { key, t0 };
    await U.store.kvSet(KEY, pending);
    U.toast(`${cfg.name} 새로고침을 시작했습니다`);
    startPolling();
  }

  async function confirmAndRun(key) {
    const cfg = PARTS[key];
    if (pending) return U.alert(`${PARTS[pending.key].name} 새로고침이 진행 중입니다. 끝난 뒤에 다시 눌러 주세요.`);
    const last = cfg.local ? null : await lastUpdated(cfg);
    let close;
    const COLOR = { stock: "stock", news: "news", trip: "trip", note: "note", all: "stock" }[key];
    const body = h("div.upd-sheet", { style: `--accent: var(--${COLOR}); --accent-soft: var(--${COLOR}-soft);` },
      h("ul.upd-list", cfg.what.map((w) => h("li", w))),
      h("div.upd-meta",
        cfg.local ? null : h("div", h("span", "마지막 새로고침"), h("b", ago(last))),
        h("div", h("span", "걸리는 시간"), h("b", cfg.time)),
        h("div", h("span", "비용"), h("b", cfg.cost))),
      h("div.form-actions",
        h("button.btn.ghost", { type: "button", onclick: () => close() }, "취소"),
        h("button.btn", { type: "button", onclick: () => { close(); run(key); } }, "새로고침")));
    close = U.sheet(`${cfg.name} 새로고침 하시겠습니까?`, body);
  }

  // 상단 바에 넣는 버튼. 진행 중이면 경과 시간을 보여 줍니다.
  function button(key, label = "새로고침") {
    const btn = h("button.update-btn", { type: "button", onclick: () => confirmAndRun(key) });
    const draw = () => {
      if (!btn.isConnected && btn._drawn) { listeners.delete(draw); return; }
      btn._drawn = true;
      btn.innerHTML = "";
      const busy = pending && pending.key === key;
      btn.classList.toggle("busy", !!busy);
      const sec = busy ? Math.round((Date.now() - pending.t0) / 1000) : 0;
      btn.append(icon("refresh"), busy ? `새로고침 중 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : label);
    };
    listeners.add(draw);
    draw();
    return btn;
  }

  // 앱을 다시 열었을 때 진행 중이던 업데이트를 이어서 확인합니다.
  U.store.kvGet(KEY).then((p) => {
    if (p && Date.now() - p.t0 < 15 * 60e3 && PARTS[p.key]) { pending = p; startPolling(); }
  }).catch(() => {});

  // 설정 화면: GitHub 연결
  async function settingsCard() {
    const saved = (await U.store.kvGet("ghToken")) || "";
    const input = h("input.input", { type: "password", value: saved, placeholder: "github_pat_로 시작하는 토큰", autocomplete: "off" });
    const status = h("p.small.muted", { style: { marginTop: "8px" } }, saved ? "토큰이 저장되어 있습니다." : "아직 연결되지 않았습니다.");
    const check = async () => {
      const token = input.value.trim();
      if (!token) { status.textContent = "토큰을 넣어 주세요."; return; }
      await U.store.kvSet("ghToken", token);
      status.textContent = "확인 중…";
      try {
        const r = await fetch(`${API}/actions/workflows/${WF}`, { headers: headers(token) });
        status.textContent = r.ok ? "연결됐습니다. 각 메뉴의 새로고침 버튼을 쓸 수 있습니다." : r.status === 401 ? "토큰이 맞지 않습니다." : `권한을 확인해 주세요 (${r.status}).`;
      } catch { status.textContent = "인터넷 연결을 확인해 주세요."; }
    };
    return h("div.card",
      h("p.small.muted", "각 메뉴의 새로고침 버튼은 GitHub에서 분석을 실행합니다. 이 기기에서 실행하려면 GitHub 토큰이 한 번 필요합니다. 토큰은 이 기기에만 저장됩니다."),
      h("ol.small.upd-steps",
        h("li", h("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener" }, "GitHub 토큰 만들기"), " 화면을 엽니다 (Fine-grained token)."),
        h("li", "Repository access → Only select repositories → daily"),
        h("li", "Permissions → Repository permissions → Actions: Read and write"),
        h("li", "만료 기간을 정하고 Generate token → 복사해서 아래에 붙여넣기")),
      h("div.field", { style: { marginTop: "12px" } }, input),
      h("button.btn.block", { onclick: check }, "저장하고 연결 확인"),
      status);
  }

  window.Updater = { button, settingsCard };
})();
