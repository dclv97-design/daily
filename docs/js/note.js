/* My Note: a private journal built around five habits —
   missed words, pre-conversation prep, behaviour experiments, judgement scoring, the "good" album —
   plus a page for defining yourself. Everything stays in this device's IndexedDB. */
(function () {
  const { h, icon } = U;

  const TABS = [
    { id: "today", label: "오늘", icon: "today", href: "#/note" },
    { id: "log", label: "기록", icon: "pen", href: "#/note/log" },
    { id: "judge", label: "판단", icon: "target", href: "#/note/judge" },
    { id: "like", label: "좋음", icon: "heart", href: "#/note/like" },
    { id: "me", label: "나", icon: "person", href: "#/note/me" },
  ];

  const DEFAULT_BUFFERS = ["잠깐, 정리해서 말할게.", "내가 이해한 건 ~인데, 맞아?", "생각해보고 다시 말해줄게."];

  const TYPES = {
    missed: {
      label: "했어야 할 말",
      desc: "대화가 끝나고 '아, 이 말 했어야 했는데' 싶을 때",
      title: (e) => e.should,
      detail: (e) => (e.said ? `실제로는: ${e.said}` : e.who || ""),
      fields: [
        { k: "who", label: "어떤 자리였나", type: "text", ph: "예: 친구와 저녁, 팀장 면담" },
        { k: "said", label: "실제로 한 말", type: "textarea", ph: "예: 나 이제 집에 갈래" },
        { k: "should", label: "했어야 했던 말", type: "textarea", ph: "예: 나 좀 더 놀고 싶은데, 너 괜찮아?", req: true },
        { k: "why", label: "왜 못 했을까", type: "multi", options: ["상대가 원할 답을 먼저 냄", "즉흥적으로 말함", "거절이 두려움", "입장이 정리 안 됨", "분위기에 맞춤", "위계 때문에", "기타"] },
        { k: "note", label: "메모", type: "textarea", ph: "선택" },
      ],
    },
    prep: {
      label: "대화 장전",
      desc: "중요한 대화 전에 두 줄만 적어 가기",
      title: (e) => e.with,
      detail: (e) => `결론: ${e.conclusion || "-"}`,
      fields: [
        { k: "with", label: "누구와, 어떤 자리", type: "text", ph: "예: 상무님 면담, 친구와 진지한 얘기", req: true },
        { k: "when", label: "날짜", type: "date", def: () => U.today() },
        { k: "conclusion", label: "내 결론은", type: "textarea", ph: "이 대화에서 내 입장 한 줄", req: true },
        { k: "mustSay", label: "꼭 해야 할 말 1개", type: "textarea", ph: "이것만은 꺼내고 나온다", req: true },
        { k: "buffer", label: "막히면 쓸 버퍼 문장", type: "buffer" },
        { k: "outcome", label: "꼭 할 말을 했나", type: "single", options: ["했다", "일부만", "못했다"], after: true },
        { k: "review", label: "돌아보기", type: "textarea", ph: "상대 반응, 다음엔 어떻게", after: true },
      ],
    },
    exp: {
      label: "행동 실험",
      desc: "상대 마음을 추측하지 말고 직접 확인해 보기",
      title: (e) => e.action,
      detail: (e) => `예상: ${e.expect || "-"}`,
      fields: [
        { k: "action", label: "해볼 말이나 행동", type: "textarea", ph: "예: 한 시간만 더 있다 갈래? 피곤하면 말고.", req: true },
        { k: "expect", label: "내 예상 반응", type: "textarea", ph: "예: 피곤하다고 할 것 같다", req: true },
        { k: "actual", label: "실제 반응", type: "textarea", after: true },
        { k: "matched", label: "예상과 비교하면", type: "single", options: ["예상대로", "달랐다"], after: true },
        { k: "learned", label: "알게 된 것", type: "textarea", after: true },
      ],
    },
    judge: {
      label: "판단 노트",
      desc: "묻기 전에 '내 생각은 ○○, 이유는 ○○'부터",
      title: (e) => e.question,
      detail: (e) => `내 판단: ${e.myCall || "-"}`,
      fields: [
        { k: "question", label: "무엇을 판단하나", type: "text", ph: "예: 이 지원자 최종 합격할까", req: true },
        { k: "category", label: "분류", type: "single", options: ["일상", "업무", "주식", "관계", "커리어", "기타"], def: () => "일상" },
        { k: "myCall", label: "내 판단은", type: "text", ph: "한 줄로", req: true },
        { k: "reason", label: "이유는", type: "textarea", req: true },
        { k: "confidence", label: "확신", type: "range", min: 50, max: 100, step: 10, def: () => 70, unit: "%" },
        { k: "due", label: "채점할 날", type: "date", def: () => U.addDays(U.today(), 7) },
        { k: "result", label: "결과", type: "single", options: ["맞음", "부분", "틀림"], after: true },
        { k: "reflection", label: "채점 메모", type: "textarea", ph: "왜 맞았나/틀렸나", after: true },
      ],
    },
    like: {
      label: "좋음",
      desc: "끌리는 것 하나와 이유 한 줄. 판단은 하지 않기",
      title: (e) => e.why,
      detail: (e) => (e.tags || []).join(" · "),
      fields: [
        { k: "photo", label: "사진", type: "photo" },
        { k: "why", label: "왜 끌렸나 (한 줄)", type: "text", ph: "판단하지 말고 느낀 그대로", req: true },
        { k: "tags", label: "종류", type: "multi", options: ["색", "공간", "옷", "사진", "폰트", "물건", "음악", "사람", "기타"] },
        { k: "date", label: "날짜", type: "date", def: () => U.today() },
      ],
    },
  };

  /* ---------- storage helpers ---------- */
  const listOf = (type) => U.store.byType(type);
  const getBuffers = async () => (await U.store.kvGet("buffers")) || DEFAULT_BUFFERS.slice();
  const getIdentity = async () => (await U.store.kvGet("identity")) || { choice: "", intolerable: "", gap: "", statement: "", history: [] };
  const getValues = async () => (await U.store.kvGet("values")) || [];
  const photoUrls = new Map();
  async function thumbUrl(photoId) {
    if (!photoId) return null;
    if (photoUrls.has(photoId)) return photoUrls.get(photoId);
    const b = (await U.store.blobGet(photoId + ":t")) || (await U.store.blobGet(photoId));
    if (!b) return null;
    const url = URL.createObjectURL(b);
    photoUrls.set(photoId, url);
    return url;
  }

  /* ---------- generic form ---------- */
  async function formView(type, existing) {
    const T = TYPES[type];
    const isNew = !existing;
    const e = existing ? { ...existing } : { id: U.uid(), type, createdAt: new Date().toISOString() };
    if (isNew) T.fields.forEach((f) => { if (f.def) e[f.k] = f.def(); });
    const buffers = await getBuffers();
    let pendingPhoto = null;

    const form = h("form", { onsubmit: (ev) => { ev.preventDefault(); save(); } });
    const errBox = h("p.small", { style: { color: "var(--up)", minHeight: "1px" } });

    const renderField = (f) => {
      const wrap = h("div.field");
      wrap.appendChild(h("div.label", f.label + (f.req ? "" : "")));
      if (f.type === "text") {
        wrap.appendChild(h("input.input", { value: e[f.k] || "", placeholder: f.ph || "", oninput: (ev) => (e[f.k] = ev.target.value) }));
      } else if (f.type === "textarea") {
        wrap.appendChild(h("textarea.input", { value: e[f.k] || "", placeholder: f.ph || "", oninput: (ev) => (e[f.k] = ev.target.value) }));
      } else if (f.type === "date") {
        wrap.appendChild(h("input.input", { type: "date", value: e[f.k] || "", onchange: (ev) => (e[f.k] = ev.target.value) }));
      } else if (f.type === "single" || f.type === "multi") {
        const pills = h("div.pills");
        const draw = () => {
          pills.innerHTML = "";
          f.options.forEach((o) => {
            const on = f.type === "multi" ? (e[f.k] || []).includes(o) : e[f.k] === o;
            pills.appendChild(h(`button.pill${on ? ".on" : ""}`, {
              type: "button",
              onclick: () => {
                if (f.type === "multi") {
                  const s = new Set(e[f.k] || []);
                  s.has(o) ? s.delete(o) : s.add(o);
                  e[f.k] = [...s];
                } else e[f.k] = e[f.k] === o ? null : o;
                draw();
              },
            }, o));
          });
        };
        draw();
        wrap.appendChild(pills);
      } else if (f.type === "range") {
        const out = h("b", `${e[f.k]}${f.unit || ""}`);
        wrap.firstChild.append(" ", out);
        wrap.appendChild(h("input", { type: "range", min: f.min, max: f.max, step: f.step, value: e[f.k], oninput: (ev) => { e[f.k] = +ev.target.value; out.textContent = `${e[f.k]}${f.unit || ""}`; } }));
        wrap.appendChild(h("div.hint", "나중에 채점하면 확신과 실제 적중률을 비교해 볼 수 있습니다."));
      } else if (f.type === "buffer") {
        const pills = h("div.pills");
        const draw = () => {
          pills.innerHTML = "";
          buffers.forEach((b) => pills.appendChild(h(`button.pill${e.buffer === b ? ".on" : ""}`, { type: "button", onclick: () => { e.buffer = e.buffer === b ? null : b; draw(); } }, b)));
        };
        draw();
        wrap.append(pills, h("div.hint", "버퍼 문장은 '나' 탭에서 바꿀 수 있습니다."));
      } else if (f.type === "photo") {
        const box = h("label.photo-pick");
        const showImg = (url) => { box.innerHTML = ""; box.append(h("img", { src: url, alt: "" }), fileInput); };
        const fileInput = h("input", {
          type: "file", accept: "image/*",
          onchange: async (ev) => {
            const file = ev.target.files[0];
            if (!file) return;
            try {
              pendingPhoto = { full: await U.resizeImage(file, 1400), thumb: await U.resizeImage(file, 420) };
              showImg(URL.createObjectURL(pendingPhoto.thumb));
            } catch (err) { U.toast(err.message); }
          },
        });
        box.append(h("span.muted.small", "탭해서 사진 고르기 (선택)"), fileInput);
        if (e.photo) thumbUrl(e.photo).then((u) => u && showImg(u));
        wrap.appendChild(box);
      }
      return wrap;
    };

    const now = T.fields.filter((f) => !f.after);
    const later = T.fields.filter((f) => f.after);
    now.forEach((f) => form.appendChild(renderField(f)));
    if (later.length) {
      if (isNew) {
        const det = h("details", h("summary.small.muted", { style: { margin: "4px 0 14px", cursor: "pointer" } }, "나중에 채울 항목 보기"));
        later.forEach((f) => det.appendChild(renderField(f)));
        form.appendChild(det);
      } else {
        form.appendChild(h("div.divider"));
        form.appendChild(h("div.section-title", { style: { marginTop: 0 } }, "나중에 채우기"));
        later.forEach((f) => form.appendChild(renderField(f)));
      }
    }
    form.append(errBox,
      h("div.form-actions",
        !isNew ? h("button.btn.danger", { type: "button", onclick: remove }, "삭제") : null,
        h("button.btn", { type: "submit" }, "저장")));

    async function save() {
      const miss = T.fields.find((f) => f.req && !String(e[f.k] || "").trim());
      if (miss) { errBox.textContent = `'${miss.label}'을(를) 채워 주세요.`; return; }
      if (pendingPhoto) {
        if (e.photo) { await U.store.blobDel(e.photo); await U.store.blobDel(e.photo + ":t"); photoUrls.delete(e.photo); }
        e.photo = U.uid();
        await U.store.blobSet(e.photo, pendingPhoto.full);
        await U.store.blobSet(e.photo + ":t", pendingPhoto.thumb);
      }
      e.date = e.date || e.when || e.createdAt.slice(0, 10);
      e.updatedAt = new Date().toISOString();
      await U.store.put(e);
      U.toast("저장했습니다");
      location.hash = backFor(type);
    }
    async function remove() {
      if (!U.confirm("이 기록을 삭제할까요? 되돌릴 수 없습니다.")) return;
      if (e.photo) { await U.store.blobDel(e.photo); await U.store.blobDel(e.photo + ":t"); }
      await U.store.del(e.id);
      U.toast("삭제했습니다");
      location.hash = backFor(type);
    }

    return h("div", h("p.small.muted", { style: { margin: "0 4px 14px" } }, T.desc), form);
  }

  /* ---------- list item ---------- */
  function item(e) {
    const T = TYPES[e.type];
    const chips = [];
    if (e.type === "prep") chips.push(e.outcome ? h(`span.chip${e.outcome === "했다" ? ".good" : e.outcome === "못했다" ? ".bad" : ".warn"}`, e.outcome) : h("span.chip.accent", "대화 전"));
    if (e.type === "exp") chips.push(e.matched ? h(`span.chip${e.matched === "예상대로" ? "" : ".warn"}`, e.matched) : h("span.chip.accent", "시도 전"));
    if (e.type === "judge") {
      if (e.result) chips.push(h(`span.chip${e.result === "맞음" ? ".good" : e.result === "틀림" ? ".bad" : ".warn"}`, e.result));
      else if (e.due && e.due <= U.today()) chips.push(h("span.chip.accent", "채점할 차례"));
      else chips.push(h("span.chip", `채점 ${e.due ? e.due.slice(5).replace("-", "/") : "-"}`));
      chips.push(h("span.chip", `${e.category || "기타"} · 확신 ${e.confidence}%`));
    }
    if (e.type === "missed") (e.why || []).slice(0, 2).forEach((w) => chips.push(h("span.chip", w)));
    return h("button.list-item", { onclick: () => (location.hash = `#/note/edit/${e.id}`) },
      h("div.t", T.title(e) || "(제목 없음)"),
      T.detail(e) ? h("div.d", T.detail(e)) : null,
      h("div.m", h("span", U.dateLabel(e.date)), ...chips));
  }

  function bars(counts, total) {
    const max = Math.max(1, ...Object.values(counts));
    return h("div", Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
      h("div.hbar", h("span.lab", k), h("span.track", h("span.fill", { style: { width: `${(v / max) * 100}%`, display: "block" } })), h("span.val", total ? `${v}` : v))));
  }

  const fab = (type) => h("button.fab", { "aria-label": "새 기록", onclick: () => (location.hash = `#/note/new/${type}`) }, icon("plus"));

  /* ---------- views ---------- */
  async function todayView() {
    const [judges, preps, likes, missed, exps, identity, buffers] = await Promise.all([
      listOf("judge"), listOf("prep"), listOf("like"), listOf("missed"), listOf("exp"), getIdentity(), getBuffers(),
    ]);
    const today = U.today();
    const due = judges.filter((j) => !j.result && j.due && j.due <= today);
    const upcoming = preps.filter((p) => !p.outcome).sort((a, b) => (a.when || "").localeCompare(b.when || ""));
    const likedToday = likes.some((l) => l.date === today);
    const streak = likeStreak(likes);
    const month = today.slice(0, 7);
    const graded = judges.filter((j) => j.result);
    const acc = graded.length ? graded.reduce((a, j) => a + (j.result === "맞음" ? 1 : j.result === "부분" ? 0.5 : 0), 0) / graded.length : null;
    const prepDone = preps.filter((p) => p.outcome);
    const said = prepDone.length ? prepDone.filter((p) => p.outcome === "했다").length / prepDone.length : null;

    const el = h("div");
    el.appendChild(h("div.card",
      h("h3", "결정하기 전에 한 줄"),
      h("p.small.muted", "누군가에게 묻기 전에 '내 생각은 ○○, 이유는 ○○'부터 적어 두세요. 나중에 채점하면 판단이 앞당겨집니다."),
      h("button.btn.soft.block", { style: { marginTop: "12px" }, onclick: () => (location.hash = "#/note/new/judge") }, "내 판단 먼저 적기")));

    if (due.length) el.appendChild(h("div.card",
      h("div.h-row", h("h3", "채점할 차례"), h("span.chip.accent", `${due.length}건`)),
      due.slice(0, 3).map((j) => h("button.list-item", { style: { boxShadow: "none", background: "var(--surface-2)", marginBottom: "6px" }, onclick: () => (location.hash = `#/note/edit/${j.id}`) },
        h("div.t", j.question), h("div.d", `내 판단: ${j.myCall}`)))));

    if (upcoming.length) el.appendChild(h("div.card",
      h("h3", "장전해 둔 대화"),
      upcoming.slice(0, 2).map((p) => h("button.list-item", { style: { boxShadow: "none", background: "var(--surface-2)", marginBottom: "6px" }, onclick: () => (location.hash = `#/note/edit/${p.id}`) },
        h("div.t", `${p.with}${p.when ? ` · ${U.dateLabel(p.when)}` : ""}`),
        h("div.d", `결론: ${p.conclusion}`), h("div.d", `꼭 할 말: ${p.mustSay}`)))));

    el.appendChild(h("div.card",
      h("div.h-row", h("h3", "오늘의 좋음"), h("span.small.muted", streak ? `${streak}일 연속` : "")),
      likedToday ? h("p.small", "오늘 한 장 저장했습니다.") : h("p.small.muted", "끌리는 것 하나를 저장하고 이유 한 줄만 붙이세요."),
      !likedToday ? h("button.btn.block", { style: { marginTop: "10px" }, onclick: () => (location.hash = "#/note/new/like") }, "좋음 저장하기") : null));

    el.appendChild(h("div.section-title", "바로 기록하기"));
    el.appendChild(h("div.quick",
      ["missed", "prep", "exp", "judge"].map((t) => h("button", { onclick: () => (location.hash = `#/note/new/${t}`) }, h("b", TYPES[t].label), h("span", TYPES[t].desc)))));

    el.appendChild(h("div.section-title", "이번 달"));
    el.appendChild(h("div.kpis",
      h("div.kpi", h("div.l", "했어야 할 말"), h("div.v", `${missed.filter((m) => m.date?.startsWith(month)).length}건`), h("div.s", "모일수록 진짜 생각이 보입니다")),
      h("div.kpi", h("div.l", "판단 적중률"), h("div.v", acc == null ? "-" : U.pct0(acc)), h("div.s", `채점 ${graded.length}건`)),
      h("div.kpi", h("div.l", "꼭 할 말 성공"), h("div.v", said == null ? "-" : U.pct0(said)), h("div.s", `장전 ${prepDone.length}회`)),
      h("div.kpi", h("div.l", "행동 실험"), h("div.v", `${exps.filter((x) => x.matched).length}회`), h("div.s", `예상과 다름 ${exps.filter((x) => x.matched === "달랐다").length}회`))));

    el.appendChild(h("div.card",
      h("h3", "막힐 때 쓸 문장"),
      h("div.stack", buffers.map((b) => h("div.quote.small", b)))));

    if (identity.statement) el.appendChild(h("button.list-item", { onclick: () => (location.hash = "#/note/me") },
      h("div.tiny.muted", "나는 이런 사람"), h("div.small", { style: { marginTop: "4px", lineHeight: 1.65 } }, identity.statement)));
    return el;
  }

  function likeStreak(likes) {
    const days = new Set(likes.map((l) => l.date));
    let n = 0;
    let d = U.today();
    if (!days.has(d)) d = U.addDays(d, -1);
    while (days.has(d)) { n++; d = U.addDays(d, -1); }
    return n;
  }

  async function logView(seg) {
    seg = TYPES[seg] && ["missed", "prep", "exp"].includes(seg) ? seg : "missed";
    const list = await listOf(seg);
    const el = h("div",
      h("div.seg", ["missed", "prep", "exp"].map((s) => h(`button${s === seg ? ".on" : ""}`, { onclick: () => (location.hash = `#/note/log/${s}`) }, TYPES[s].label))));
    if (seg === "missed" && list.length >= 3) {
      const counts = {};
      list.forEach((e) => (e.why || []).forEach((w) => (counts[w] = (counts[w] || 0) + 1)));
      if (Object.keys(counts).length) el.appendChild(h("div.card", h("h3", "못 한 이유 패턴"), bars(counts)));
    }
    if (seg === "prep") {
      const done = list.filter((p) => p.outcome);
      if (done.length) {
        const c = { 했다: 0, 일부만: 0, 못했다: 0 };
        done.forEach((p) => c[p.outcome]++);
        el.appendChild(h("div.card", h("h3", "꼭 할 말, 실제로 했나"), bars(c)));
      }
    }
    if (seg === "exp") {
      const done = list.filter((x) => x.matched);
      if (done.length) el.appendChild(h("div.card", h("h3", "내 추측의 정확도"),
        h("p.small", `${done.length}번 시도 중 ${done.filter((x) => x.matched === "예상대로").length}번 예상대로였습니다.`),
        h("p.tiny.muted", { style: { marginTop: "4px" } }, "예상과 다른 경우가 많을수록, 상대 마음을 추측하기보다 물어보는 편이 낫다는 신호입니다.")));
    }
    if (!list.length) el.appendChild(h("div.empty", h("b", `${TYPES[seg].label} 기록이 없습니다`), TYPES[seg].desc));
    list.forEach((e) => el.appendChild(item(e)));
    el.appendChild(fab(seg));
    return el;
  }

  async function judgeView() {
    const list = await listOf("judge");
    const today = U.today();
    const graded = list.filter((j) => j.result);
    const due = list.filter((j) => !j.result && j.due && j.due <= today);
    const open = list.filter((j) => !j.result && !(j.due && j.due <= today));
    const score = (arr) => arr.length ? arr.reduce((a, j) => a + (j.result === "맞음" ? 1 : j.result === "부분" ? 0.5 : 0), 0) / arr.length : null;
    const el = h("div");
    if (graded.length) {
      const byConf = {};
      graded.forEach((j) => { const k = `${j.confidence}%`; (byConf[k] = byConf[k] || []).push(j); });
      const byCat = {};
      graded.forEach((j) => { const k = j.category || "기타"; (byCat[k] = byCat[k] || []).push(j); });
      el.appendChild(h("div.kpis",
        h("div.kpi", h("div.l", "적중률"), h("div.v", U.pct0(score(graded))), h("div.s", `채점 ${graded.length}건 (부분=0.5)`)),
        h("div.kpi", h("div.l", "채점 대기"), h("div.v", `${due.length}건`), h("div.s", `진행 중 ${open.length}건`))));
      el.appendChild(h("div.card", h("h3", "확신 vs 실제"),
        h("p.tiny.muted", "확신 80%라고 적은 판단이 실제로 80% 맞으면 판단이 잘 보정된 것입니다."),
        Object.keys(byConf).sort().map((k) => h("div.hbar", h("span.lab", `확신 ${k}`),
          h("span.track", h("span.fill", { style: { width: `${score(byConf[k]) * 100}%`, display: "block" } })),
          h("span.val", `${U.pct0(score(byConf[k]))}`)))));
      el.appendChild(h("div.card", h("h3", "분류별 적중률"),
        Object.entries(byCat).map(([k, arr]) => h("div.hbar", h("span.lab", `${k} (${arr.length})`),
          h("span.track", h("span.fill", { style: { width: `${score(arr) * 100}%`, display: "block" } })), h("span.val", U.pct0(score(arr)))))));
    }
    if (!list.length) el.appendChild(h("div.empty", h("b", "판단 노트가 없습니다"), "점심 메뉴, 지원자 합격 여부, 주식 방향처럼 작은 것부터 내 판단을 먼저 적어 보세요."));
    if (due.length) { el.appendChild(h("div.section-title", "채점할 차례")); due.forEach((e) => el.appendChild(item(e))); }
    if (open.length) { el.appendChild(h("div.section-title", "진행 중")); open.forEach((e) => el.appendChild(item(e))); }
    if (graded.length) { el.appendChild(h("div.section-title", "채점 완료")); graded.forEach((e) => el.appendChild(item(e))); }
    el.appendChild(fab("judge"));
    return el;
  }

  async function likeView() {
    const list = await listOf("like");
    const today = U.today();
    const days = new Set(list.map((l) => l.date));
    const dots = [];
    for (let i = 29; i >= 0; i--) dots.push(h(`i${days.has(U.addDays(today, -i)) ? ".on" : ""}`));
    const filled = dots.filter((d) => d.className === "on").length;
    const tagCounts = {};
    list.forEach((l) => (l.tags || []).forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
    const words = {};
    list.forEach((l) => (l.why || "").split(/[\s,.·]+/).filter((w) => w.length >= 2).forEach((w) => (words[w] = (words[w] || 0) + 1)));
    const topWords = Object.entries(words).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const el = h("div",
      h("div.card",
        h("div.h-row", h("h3", "최근 30일"), h("span.small.muted", `${filled}/30일 · ${likeStreak(list)}일 연속`)),
        h("div.dots", dots),
        h("p.tiny.muted", { style: { marginTop: "8px" } }, "한 달을 채운 뒤 쭉 훑어보면 반복되는 패턴이 보입니다. 그게 취향입니다.")),
      Object.keys(tagCounts).length ? h("div.card", h("h3", "자주 고른 종류"), bars(tagCounts)) : null,
      topWords.length ? h("div.card", h("h3", "이유에 자주 나온 말"), h("div.pills", topWords.map(([w, n]) => h("span.chip", `${w} ${n}`)))) : null);

    if (!list.length) el.appendChild(h("div.empty", h("b", "아직 저장한 좋음이 없습니다"), "옷, 공간, 색, 사진, 폰트 뭐든 괜찮습니다."));
    else {
      const grid = h("div.grid3");
      for (const l of list) {
        const btn = h("button", { onclick: () => (location.hash = `#/note/edit/${l.id}`), "aria-label": l.why });
        const url = await thumbUrl(l.photo);
        btn.appendChild(url ? h("img", { src: url, alt: "", loading: "lazy" }) : h("span.noimg", l.why));
        grid.appendChild(btn);
      }
      el.appendChild(grid);
    }
    el.appendChild(fab("like"));
    return el;
  }

  async function meView() {
    const idn = await getIdentity();
    const values = await getValues();
    const buffers = await getBuffers();
    const el = h("div");

    const s = { ...idn };
    const sentence = (k, label, ph) => h("div.field", h("div.label", label), h("textarea.input", { value: s[k] || "", placeholder: ph, style: { minHeight: "64px" }, oninput: (e) => (s[k] = e.target.value) }));
    el.appendChild(h("div.card",
      h("h3", "나를 정의하는 세 문장"),
      h("p.small.muted", { style: { marginBottom: "12px" } }, "형용사 대신, 포기해야 할 때 반복해서 고르는 것으로 적어 보세요. 처음엔 틀려도 됩니다."),
      sentence("choice", "나는 ___와 ___ 중 하나를 골라야 하면 ___를 고른다.", "예: 나는 ○○와 ○○ 중에 ○○를 고른다."),
      sentence("intolerable", "나는 ___는 절대 못 참는다. 왜냐하면 ___니까.", "이유는 일반론 말고 내 행동 방식으로"),
      sentence("gap", "사람들은 나에게 ___를 기대하지만, 사실 나는 ___다.", ""),
      h("div.field", h("div.label", "합쳐서 한 단락으로"), h("textarea.input", { value: s.statement || "", placeholder: "세 문장을 묶은 초안. 고칠 때마다 버전이 남습니다.", oninput: (e) => (s.statement = e.target.value) })),
      h("button.btn.block", {
        onclick: async () => {
          const changed = ["choice", "intolerable", "gap", "statement"].some((k) => (s[k] || "") !== (idn[k] || ""));
          if (!changed) { U.toast("바뀐 내용이 없습니다"); return; }
          const history = idn.history || [];
          if (idn.statement || idn.choice || idn.intolerable || idn.gap) history.unshift({ at: new Date().toISOString(), choice: idn.choice, intolerable: idn.intolerable, gap: idn.gap, statement: idn.statement });
          await U.store.kvSet("identity", { choice: s.choice, intolerable: s.intolerable, gap: s.gap, statement: s.statement, history: history.slice(0, 50) });
          U.toast("저장했습니다");
          Note.route(["me"]);
        },
      }, "저장 (이전 버전은 기록에 남음)"),
      (idn.history || []).length ? h("details", { style: { marginTop: "12px" } },
        h("summary.small.muted", { style: { cursor: "pointer" } }, `이전 버전 ${idn.history.length}개`),
        idn.history.map((v) => h("div.card.flat", { style: { marginTop: "8px" } },
          h("div.tiny.muted", new Date(v.at).toLocaleString("ko-KR")),
          [v.choice, v.intolerable, v.gap].filter(Boolean).map((x) => h("p.small", { style: { marginTop: "4px" } }, x)),
          v.statement ? h("p.small.muted", { style: { marginTop: "6px" } }, v.statement) : null))) : null));

    // Can't stand -> want to protect
    const vals = values.map((v) => ({ ...v }));
    const vlist = h("div");
    const drawVals = () => {
      vlist.innerHTML = "";
      vals.forEach((v, i) => vlist.appendChild(h("div.row", { style: { marginBottom: "8px", alignItems: "flex-start" } },
        h("input.input.grow", { value: v.hate || "", placeholder: "못 참는 것", oninput: (e) => (v.hate = e.target.value) }),
        h("span.muted", { style: { paddingTop: "12px" } }, "→"),
        h("input.input.grow", { value: v.protect || "", placeholder: "그래서 지키고 싶은 것", oninput: (e) => (v.protect = e.target.value) }),
        h("button.icon-btn", { "aria-label": "삭제", onclick: () => { vals.splice(i, 1); drawVals(); } }, icon("trash")))));
    };
    drawVals();
    el.appendChild(h("div.card",
      h("h3", "못 참는 것 → 지키고 싶은 것"),
      h("p.small.muted", { style: { marginBottom: "12px" } }, "싫은 건 이미 정확히 압니다. 뒤집으면 내가 지키려는 가치가 나옵니다."),
      vlist,
      h("div.row", h("button.btn.ghost.sm", { onclick: () => { vals.push({ hate: "", protect: "" }); drawVals(); } }, "줄 추가"),
        h("button.btn.sm", { onclick: async () => { await U.store.kvSet("values", vals.filter((v) => v.hate || v.protect)); U.toast("저장했습니다"); } }, "저장"))));

    // Buffers
    const bufs = buffers.slice();
    const blist = h("div");
    const drawBufs = () => {
      blist.innerHTML = "";
      bufs.forEach((b, i) => blist.appendChild(h("div.row", { style: { marginBottom: "8px" } },
        h("input.input.grow", { value: b, oninput: (e) => (bufs[i] = e.target.value) }),
        h("button.icon-btn", { "aria-label": "삭제", onclick: () => { bufs.splice(i, 1); drawBufs(); } }, icon("trash")))));
    };
    drawBufs();
    el.appendChild(h("div.card",
      h("h3", "버퍼 문장"),
      h("p.small.muted", { style: { marginBottom: "12px" } }, "즉답을 끊고 늦게 오는 판단이 도착할 시간을 버는 문장입니다."),
      blist,
      h("div.row", h("button.btn.ghost.sm", { onclick: () => { bufs.push(""); drawBufs(); } }, "문장 추가"),
        h("button.btn.sm", { onclick: async () => { await U.store.kvSet("buffers", bufs.map((b) => b.trim()).filter(Boolean)); U.toast("저장했습니다"); } }, "저장"))));

    el.appendChild(h("button.btn.ghost.block", { onclick: () => (location.hash = "#/settings") }, "백업과 설정"));
    return el;
  }

  /* ---------- backup ---------- */
  async function exportBackup() {
    const entries = await U.store.all();
    const kv = await U.store.kvAll();
    const blobs = [];
    for (const [k, b] of await U.store.blobAll()) blobs.push([k, await U.blobToDataUrl(b)]);
    const data = JSON.stringify({ app: "daily-app-note", v: 1, exportedAt: new Date().toISOString(), entries, kv: kv.filter(([k]) => !["passphrase", "vapid", "pushSub"].includes(k)), blobs });
    const file = new File([data], `my-note-backup-${U.today()}.json`, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "마이 노트 백업" }); return; } catch { /* fall through */ }
    }
    const a = h("a", { href: URL.createObjectURL(file), download: file.name });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function importBackup(file) {
    try {
      const j = JSON.parse(await file.text());
      if (j.app !== "daily-app-note") throw new Error("마이 노트 백업 파일이 아닙니다.");
      if (!U.confirm(`기록 ${j.entries.length}개를 불러옵니다. 같은 기록은 덮어씁니다. 계속할까요?`)) return;
      for (const e of j.entries) await U.store.put(e);
      for (const [k, v] of j.kv || []) await U.store.kvSet(k, v);
      for (const [k, d] of j.blobs || []) await U.store.blobSet(k, await U.dataUrlToBlob(d));
      U.toast("불러왔습니다");
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function launcherMeta() {
    try {
      const [judges, likes] = await Promise.all([listOf("judge"), listOf("like")]);
      const due = judges.filter((j) => !j.result && j.due && j.due <= U.today()).length;
      const parts = [];
      if (due) parts.push(`채점 대기 ${due}건`);
      const st = likeStreak(likes);
      parts.push(st ? `좋음 ${st}일 연속` : "오늘의 좋음 비어 있음");
      return parts;
    } catch {
      return [];
    }
  }

  window.Note = {
    launcherMeta,
    exportBackup,
    importBackup,
    async route(rest) {
      const [view, arg] = rest;
      const L = (active, title, body, extra = {}) => App.layout({ app: "note", title, tabs: TABS, active, body, ...extra });
      if (view === "new" && TYPES[arg]) return L(null, `새 ${TYPES[arg].label}`, formView(arg), { back: backFor(arg), noTabs: true });
      if (view === "edit" && arg) {
        const e = await U.store.get(arg);
        if (!e) return L(null, "기록", Promise.resolve(h("div.empty", h("b", "기록을 찾지 못했습니다"))), { back: "#/note", noTabs: true });
        return L(null, TYPES[e.type].label, formView(e.type, e), { back: backFor(e.type), noTabs: true });
      }
      if (view === "log") return L("log", "기록", logView(arg));
      if (view === "judge") return L("judge", "판단 노트", judgeView());
      if (view === "like") return L("like", "좋음 앨범", likeView());
      if (view === "me") return L("me", "나", meView());
      return L("today", "마이 노트", todayView(), { right: h("div.sub", U.dateLabel(U.today())) });
    },
  };

  function backFor(type) {
    return type === "judge" ? "#/note/judge" : type === "like" ? "#/note/like" : `#/note/log/${type}`;
  }
})();
