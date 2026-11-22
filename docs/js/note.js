/* 단순 메모: Thinks / Note / To-do / Judge, 좋은 오늘 / 비선호, 스토리, VS.
   Everything stays in this device's IndexedDB. */
(function () {
  const { h, icon } = U;

  const TABS = [
    { id: "today", label: "오늘", icon: "today", href: "#/note" },
    { id: "memo", label: "메모", icon: "pen", href: "#/note/memo" },
    { id: "pref", label: "선호", icon: "heart", href: "#/note/pref" },
    { id: "story", label: "스토리", icon: "book", href: "#/note/story" },
    { id: "vs", label: "VS", icon: "vs", href: "#/note/vs" },
  ];

  const MEMO_SEGS = ["todo", "note", "thinks", "judge"];
  const TODO_KINDS = ["스케줄", "약속", "해야 할 일"];
  const kindLabel = (k) => (!k || k === "task" ? "해야 할 일" : k);
  let revealHidden = false; // 숨긴 스토리 보기 (앱을 닫으면 다시 숨김)
  const MEALS = ["아침", "점심", "저녁"];
  const PEOPLE = ["혼자", "가족", "친구", "동료", "연인"];
  const PREF_SEGS = ["good", "dislike"];
  const DISLIKE_LINE = "대충 알고 좋아하고, 다 알고 싫어하자";

  const TYPES = {
    thinks: {
      label: "Thinks", icon: "bulb",
      title: (e) => firstLine(e.content),
      detail: (e) => restLines(e.content),
      fields: [{ k: "content", label: "생각", type: "textarea", req: true, tall: true }],
    },
    note: {
      label: "Conv.", icon: "chat",
      title: (e) => [e.who, e.where].filter(Boolean).join(" · "),
      detail: (e) => (e.keywords || []).filter(Boolean).map((k) => `#${k}`).join(" "),
      fields: [
        { k: "who", label: "누구와", type: "text", req: true },
        { k: "when", label: "언제", type: "date", def: () => U.today() },
        { k: "where", label: "어디서", type: "text" },
        { k: "keywords", label: "키워드 3개", type: "keywords", req: true },
        { k: "memo", label: "메모", type: "textarea" },
      ],
    },
    todo: {
      label: "To-do", icon: "check",
      title: (e) => e.title,
      detail: (e) => e.memo || "",
      fields: [
        { k: "kind", label: "종류", type: "single", options: TODO_KINDS, def: () => "해야 할 일" },
        { k: "title", label: "내용", type: "text", req: true },
        { k: "someday", label: "언젠가", type: "check", rerender: true },
        { k: "due", label: "D-DAY", type: "date", showIf: (e) => !e.someday },
        { k: "time", label: "시간", type: "time", showIf: (e) => !e.someday },
        { k: "memo", label: "메모", type: "textarea" },
      ],
    },
    judge: {
      label: "Judge", icon: "scale",
      title: (e) => e.about,
      detail: (e) => e.flaw || "",
      fields: [
        { k: "about", label: "어떤 대화/일", type: "text", req: true },
        { k: "noteRef", label: "관련 Conv.", type: "noteRef" },
        { k: "flaw", label: "아쉬웠던 점", type: "textarea", req: true },
        { k: "thinking", label: "생각 과정", type: "textarea", tall: true },
        { k: "next", label: "다음엔", type: "textarea" },
      ],
    },
    good: {
      label: "좋은 오늘", icon: "heart",
      title: (e) => e.what,
      detail: (e) => e.why || "",
      fields: [
        { k: "media", label: "사진/영상", type: "media" },
        { k: "what", label: "좋은 것", type: "text", req: true },
        { k: "why", label: "이유", type: "text" },
        { k: "date", label: "날짜", type: "date", def: () => U.today() },
      ],
    },
    dislike: {
      label: "비선호", icon: "heart",
      title: (e) => e.what,
      detail: (e) => e.why || "",
      fields: [
        { k: "what", label: "싫은 것", type: "text", req: true },
        { k: "why", label: "이유", type: "textarea", req: true },
      ],
    },
    story: {
      label: "스토리", icon: "book",
      title: (e) => e.title,
      detail: (e) => e.story || "",
      fields: [
        { k: "title", label: "제목", type: "text", req: true },
        { k: "story", label: "내용", type: "textarea", req: true, tall: true },
        { k: "when", label: "언제", type: "date", def: () => U.today() },
        { k: "who", label: "누구와", type: "text" },
        { k: "hidden", label: "숨기기", type: "check" },
      ],
    },
    vs: {
      label: "VS", icon: "vs",
      title: (e) => `${e.a} VS ${e.b}`,
      detail: () => "",
      fields: [{ k: "pair", label: "", type: "vs" }, { k: "memo", label: "메모", type: "textarea" }],
    },
  };
  TYPES.meal = {
    label: "식사", icon: "today",
    title: (e) => `${e.slot} · ${mealName(e)}`,
    detail: (e) => mealMeta(e),
    fields: [
      { k: "slot", label: "끼니", type: "single", options: MEALS, req: true },
      { k: "media", label: "사진", type: "media", photoOnly: true, exif: true },
      { k: "menu", label: "메뉴", type: "text" },
      { k: "place", label: "상호명", type: "place" },
      { k: "geo", label: "사진 위치", type: "geo", showIf: (e) => e.lat != null },
      { k: "with", label: "누구랑", type: "people" },
      { k: "date", label: "날짜", type: "date", def: () => U.today() },
      { k: "time", label: "시간", type: "time" },
      { k: "memo", label: "메모", type: "textarea" },
    ],
  };
  TYPES.episode = TYPES.story; // older backups
  // 읽은 책 (똑똑해지기 앱의 책 탭에서 쓴다)
  const BOOK_STATUS = ["읽는 중", "다 읽음", "읽고 싶음"];
  TYPES.book = {
    label: "책", icon: "book",
    title: (e) => e.title,
    detail: (e) => e.author || "",
    fields: [
      { k: "media", label: "표지", type: "media", photoOnly: true },
      { k: "title", label: "제목", type: "text", req: true },
      { k: "author", label: "저자", type: "text" },
      { k: "status", label: "상태", type: "single", options: BOOK_STATUS, def: () => "다 읽음", rerender: true },
      { k: "rating", label: "별점", type: "rating", showIf: (e) => e.status === "다 읽음" },
      { k: "date", label: "다 읽은 날", type: "date", def: () => U.today(), showIf: (e) => e.status === "다 읽음" },
      { k: "quote", label: "기억에 남는 문장", type: "textarea" },
      { k: "memo", label: "생각", type: "textarea", tall: true },
    ],
  };

  function mealName(e) { return e.menu || e.place || (e.media ? "사진" : ""); }
  function mealMeta(e) { return [e.time, e.place && e.menu ? e.place : null, (e.with || []).join(", ")].filter(Boolean).join(" · "); }
  const slotFromTime = (t) => { const hr = Number((t || "").slice(0, 2)); return hr < 11 ? "아침" : hr < 16 ? "점심" : "저녁"; };
  function dday(due) {
    const n = Math.round((new Date(due + "T00:00:00") - new Date(U.today() + "T00:00:00")) / 86400000);
    return n === 0 ? "D-DAY" : n > 0 ? `D-${n}` : `D+${-n}`;
  }
  const todoSort = (a, b) => (a.someday ? 1 : 0) - (b.someday ? 1 : 0) || (a.due || "9").localeCompare(b.due || "9") || (a.time || "").localeCompare(b.time || "");

  function firstLine(s) { return (s || "").trim().split("\n")[0].slice(0, 80); }
  function restLines(s) { return (s || "").trim().split("\n").slice(1).join(" ").slice(0, 160); }

  const listOf = (type) => U.store.byType(type);

  /* ---------- media ---------- */
  const mediaUrls = new Map();
  async function mediaUrl(id, thumb) {
    if (!id) return null;
    const key = thumb ? id + ":t" : id;
    if (mediaUrls.has(key)) return mediaUrls.get(key);
    const b = await U.store.blobGet(key);
    if (!b) return null;
    const url = URL.createObjectURL(b);
    mediaUrls.set(key, url);
    return url;
  }
  async function deleteMedia(id) {
    if (!id) return;
    await U.store.blobDel(id);
    await U.store.blobDel(id + ":t");
    mediaUrls.delete(id);
    mediaUrls.delete(id + ":t");
  }
  function videoThumb(file) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      const url = URL.createObjectURL(file);
      let done = false;
      const finish = (b) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(b); };
      v.muted = true;
      v.playsInline = true;
      v.preload = "metadata";
      v.src = url;
      v.onloadeddata = () => { try { v.currentTime = Math.min(0.2, (v.duration || 1) / 2); } catch { finish(null); } };
      v.onseeked = () => {
        const r = Math.min(1, 420 / Math.max(v.videoWidth, v.videoHeight || 1));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(v.videoWidth * r));
        c.height = Math.max(1, Math.round(v.videoHeight * r));
        try { c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); c.toBlob((b) => finish(b), "image/jpeg", 0.8); }
        catch { finish(null); }
      };
      v.onerror = () => finish(null);
      setTimeout(() => finish(null), 6000);
    });
  }
  const MAX_VIDEO = 200 * 1024 * 1024;

  /* ---------- generic form ---------- */
  async function formView(type, existing, opts = {}) {
    const T = TYPES[type];
    const isNew = !existing;
    const e = existing ? { ...existing } : { id: U.uid(), type, createdAt: new Date().toISOString() };
    if (isNew) T.fields.forEach((f) => { if (f.def) e[f.k] = f.def(); });
    if (isNew && opts.preset) Object.assign(e, opts.preset);
    if (type === "todo") e.kind = kindLabel(e.kind);
    let pending = null;
    let pendingUrl = null;
    const notes = T.fields.some((f) => f.type === "noteRef") ? await listOf("note") : [];
    let people = [];
    if (T.fields.some((f) => f.type === "people")) {
      const used = new Set();
      (await listOf("meal")).forEach((m) => (m.with || []).forEach((p) => used.add(p)));
      people = [...new Set([...PEOPLE, ...used])];
    }

    const form = h("form", { onsubmit: (ev) => { ev.preventDefault(); save(); } });
    const errBox = h("p.small", { style: { color: "var(--up)" } });

    const renderField = (f) => {
      const wrap = h("div.field");
      if (f.label && f.type !== "check") wrap.appendChild(h("div.label", f.label));
      if (f.type === "rating") {
        const stars = h("div.stars");
        const draw = () => {
          stars.innerHTML = "";
          for (let i = 1; i <= 5; i++) stars.appendChild(h(`button.star${(e.rating || 0) >= i ? ".on" : ""}`, { type: "button", "aria-label": `${i}점`, onclick: () => { e.rating = e.rating === i ? 0 : i; draw(); } }, "★"));
        };
        draw();
        wrap.appendChild(stars);
      } else if (f.type === "check") {
        wrap.appendChild(h("label.check-row",
          h("input", { type: "checkbox", checked: !!e[f.k], onchange: (ev) => { e[f.k] = ev.target.checked; if (f.rerender) renderAll(); } }),
          h("span", f.label)));
      } else if (f.type === "place") {
        const input = h("input.input", { value: e.place || "", placeholder: "가게 이름", oninput: (ev) => (e.place = ev.target.value) });
        wrap.appendChild(input);
        if (e.geoName && e.geoName !== e.place) {
          wrap.appendChild(h("button.chip.near", { type: "button", onclick: () => { e.place = e.geoName; input.value = e.geoName; } }, icon("pin"), `근처: ${e.geoName}`));
        }
      } else if (f.type === "geo") {
        const map = `https://maps.apple.com/?ll=${e.lat},${e.lng}&q=${encodeURIComponent(e.place || e.geoName || "식사")}`;
        wrap.appendChild(h("div.geo-row",
          h("span.geo-ic", icon("pin")),
          h("span.grow.small", e.addr || "주소 확인 중…"),
          h("a.link-btn.small", { href: map, target: "_blank", rel: "noopener" }, "지도"),
          h("button.link-btn.small", { type: "button", onclick: () => { delete e.lat; delete e.lng; e.addr = ""; e.geoName = ""; renderAll(); } }, "지우기")));
      } else if (f.type === "text") {
        wrap.appendChild(h("input.input", { value: e[f.k] || "", oninput: (ev) => (e[f.k] = ev.target.value) }));
      } else if (f.type === "textarea") {
        wrap.appendChild(h("textarea.input", { value: e[f.k] || "", style: f.tall ? { minHeight: "160px" } : null, oninput: (ev) => (e[f.k] = ev.target.value) }));
      } else if (f.type === "date" || f.type === "time") {
        wrap.appendChild(h("input.input", { type: f.type, value: e[f.k] || "", onchange: (ev) => (e[f.k] = ev.target.value) }));
      } else if (f.type === "single") {
        const pills = h("div.pills");
        const draw = () => {
          pills.innerHTML = "";
          f.options.forEach((o) => pills.appendChild(h(`button.pill${e[f.k] === o ? ".on" : ""}`, { type: "button", onclick: () => { e[f.k] = o; if (f.rerender) renderAll(); else draw(); } }, o)));
        };
        draw();
        wrap.appendChild(pills);
      } else if (f.type === "people") {
        const pills = h("div.pills");
        const draw = () => {
          pills.innerHTML = "";
          people.forEach((o) => {
            const on = (e[f.k] || []).includes(o);
            pills.appendChild(h(`button.pill${on ? ".on" : ""}`, {
              type: "button",
              onclick: () => {
                let s = new Set(e[f.k] || []);
                if (o === "혼자") s = s.has(o) ? new Set() : new Set(["혼자"]);
                else { s.delete("혼자"); s.has(o) ? s.delete(o) : s.add(o); }
                e[f.k] = [...s];
                draw();
              },
            }, o));
          });
        };
        draw();
        const custom = h("input.input.grow", { placeholder: "이름 추가" });
        const addCustom = () => {
          const v = custom.value.trim();
          if (!v) return;
          if (!people.includes(v)) people.push(v);
          const s = new Set(e[f.k] || []);
          s.delete("혼자");
          s.add(v);
          e[f.k] = [...s];
          custom.value = "";
          draw();
        };
        custom.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); addCustom(); } });
        wrap.append(pills, h("div.row", { style: { marginTop: "8px" } }, custom, h("button.btn.ghost.sm", { type: "button", onclick: addCustom }, "추가")));
      } else if (f.type === "keywords") {
        const kw = (e.keywords = (e.keywords || []).concat(["", "", ""]).slice(0, 3));
        wrap.appendChild(h("div.row", kw.map((v, i) => h("input.input.grow", { value: v, oninput: (ev) => (kw[i] = ev.target.value) }))));
      } else if (f.type === "noteRef") {
        wrap.appendChild(h("select.input", { onchange: (ev) => (e.noteRef = ev.target.value || null) },
          h("option", { value: "" }, "선택 안 함"),
          notes.map((n) => h("option", { value: n.id, selected: e.noteRef === n.id }, `${n.when || n.date} · ${n.who}${n.where ? ` · ${n.where}` : ""}`))));
      } else if (f.type === "vs") {
        const side = (k) => h("label.vs-side", { class: e.pick === k ? "on" : "" },
          h("input", { type: "checkbox", checked: e.pick === k, onchange: (ev) => { e.pick = ev.target.checked ? k : null; redraw(); } }),
          h("input.input", { value: e[k] || "", oninput: (ev) => (e[k] = ev.target.value) }));
        const box = h("div.vs-form");
        const redraw = () => { box.innerHTML = ""; box.append(side("a"), h("div.vs-mid", "VS"), side("b")); };
        redraw();
        wrap.appendChild(box);
      } else if (f.type === "media") {
        let hasMedia = false;
        const box = h("div.photo-pick", { onclick: () => { if (!hasMedia) fileInput.click(); } });
        const change = h("button.link-btn.small", { type: "button", style: { display: "none" }, onclick: () => fileInput.click() }, "바꾸기");
        const fileInput = h("input", {
          type: "file", accept: f.photoOnly ? "image/*" : "image/*,video/*", style: { display: "none" },
          onchange: async (ev) => {
            const file = ev.target.files[0];
            if (!file) return;
            try {
              if (file.type.startsWith("video/")) {
                if (file.size > MAX_VIDEO) { U.toast("영상은 200MB 이하만 저장할 수 있습니다"); return; }
                pending = { kind: "video", full: file, thumb: await videoThumb(file) };
                pendingUrl = URL.createObjectURL(file);
                show("video", pendingUrl);
              } else {
                const meta = f.exif ? await U.readExif(file) : null;
                pending = { kind: "image", full: await U.resizeImage(file, 1600), thumb: await U.resizeImage(file, 420) };
                pendingUrl = URL.createObjectURL(pending.thumb);
                if (f.exif) applyPhotoMeta(meta);
                else show("image", pendingUrl);
              }
            } catch (err) { U.toast(err.message); }
          },
        });
        const show = (kind, url) => {
          hasMedia = true;
          box.innerHTML = "";
          box.appendChild(kind === "video" ? h("video", { src: url, controls: true, playsInline: true, style: { width: "100%", maxHeight: "360px", display: "block" } }) : h("img", { src: url, alt: "" }));
          change.style.display = "";
        };
        box.appendChild(h("span.muted.small", f.photoOnly ? "사진" : "사진 또는 영상"));
        wrap.append(box, fileInput, change);
        if (pending) show(pending.kind, pendingUrl);
        else if (e.media) mediaUrl(e.media, e.mediaType !== "video").then((u) => u && show(e.mediaType || "image", u));
      }
      return wrap;
    };

    // 식사 사진: 촬영 날짜·시간·위치를 채우고, 위치는 근처 가게 이름까지 찾아 본다
    function applyPhotoMeta(m) {
      const got = [];
      if (m?.date) { e.date = m.date; got.push("날짜"); }
      if (m?.time) {
        e.time = m.time;
        got.push("시간");
        if (isNew && !opts.preset?.slot) e.slot = slotFromTime(m.time);
      }
      if (m?.lat != null) { e.lat = m.lat; e.lng = m.lng; e.addr = ""; e.geoName = ""; got.push("위치"); }
      renderAll();
      U.toast(got.length ? `사진에서 ${got.join("·")}를 불러왔습니다` : "사진에 촬영 정보가 없습니다");
      if (m?.lat != null) {
        U.reverseGeocode(m.lat, m.lng).then((g) => {
          if (e.lat !== m.lat) return;
          e.addr = g?.area || `${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}`;
          e.geoName = g?.name || "";
          renderAll();
        });
      }
    }

    const fieldsBox = h("div");
    const visible = () => T.fields.filter((f) => !f.showIf || f.showIf(e));
    function renderAll() { fieldsBox.innerHTML = ""; visible().forEach((f) => fieldsBox.appendChild(renderField(f))); }
    renderAll();
    form.appendChild(fieldsBox);
    if (type === "todo" && !isNew) {
      form.appendChild(h("label.row.field", { style: { gap: "8px" } },
        h("input", { type: "checkbox", checked: !!e.done, onchange: (ev) => (e.done = ev.target.checked), style: { width: "20px", height: "20px", accentColor: "var(--accent)" } }), "완료"));
    }
    form.append(errBox,
      h("div.form-actions",
        !isNew ? h("button.btn.danger", { type: "button", onclick: remove }, "삭제") : null,
        h("button.btn", { type: "submit" }, "저장")));

    async function save() {
      if (type === "meal" && !pending && !e.media && !String(e.menu || "").trim() && !String(e.place || "").trim()) { errBox.textContent = "사진이나 메뉴를 입력하세요."; return; }
      if (type === "todo" && e.someday) { delete e.due; delete e.time; }
      let miss = visible().find((f) => f.req && (f.type === "keywords" ? !(e.keywords || []).some((k) => k.trim()) : !String(e[f.k] || "").trim()));
      if (type === "vs" && (!String(e.a || "").trim() || !String(e.b || "").trim())) miss = { label: "양쪽" };
      if (miss) { errBox.textContent = `${miss.label}을(를) 입력하세요.`; return; }
      if (pending) {
        await deleteMedia(e.media);
        e.media = U.uid();
        e.mediaType = pending.kind;
        await U.store.blobSet(e.media, pending.full);
        if (pending.thumb) await U.store.blobSet(e.media + ":t", pending.thumb);
      }
      if (e.keywords) e.keywords = e.keywords.map((k) => k.trim());
      e.date = e.date || e.when || e.due || e.createdAt.slice(0, 10);
      e.updatedAt = new Date().toISOString();
      await U.store.put(e);
      U.toast("저장됨");
      if (opts.onSaved) opts.onSaved(); else location.hash = backFor(type);
    }
    async function remove() {
      if (!(await U.ask("삭제할까요?", { ok: "삭제", danger: true }))) return;
      await deleteMedia(e.media);
      await U.store.del(e.id);
      U.toast("삭제됨");
      location.hash = backFor(type);
    }
    return form;
  }

  /* ---------- list items ---------- */
  function item(e) {
    const T = TYPES[e.type];
    return h("button.list-item", { onclick: () => (location.hash = `#/note/edit/${e.id}`) },
      h("div.t", T.title(e) || "(내용 없음)"),
      T.detail(e) ? h("div.d", T.detail(e)) : null,
      h("div.m", h("span", U.dateLabel(e.date))));
  }

  function todoRow(e, rerender) {
    const overdue = !e.done && !e.someday && e.due && e.due < U.today();
    const soon = !e.done && !e.someday && e.due && e.due >= U.today() && e.due <= U.addDays(U.today(), 3);
    return h("div.list-item.row", { style: { cursor: "default" } },
      h("input", {
        type: "checkbox", checked: !!e.done, "aria-label": "완료",
        style: { width: "22px", height: "22px", accentColor: "var(--accent)", flex: "none" },
        onchange: async (ev) => { e.done = ev.target.checked; e.updatedAt = new Date().toISOString(); await U.store.put(e); rerender(); },
      }),
      h("button.grow", { style: { border: 0, background: "none", textAlign: "left", padding: 0, cursor: "pointer" }, onclick: () => (location.hash = `#/note/edit/${e.id}`) },
        h("div.t", { style: e.done ? { textDecoration: "line-through", color: "var(--ink-3)" } : null }, e.title),
        h("div.m", h("span.chip", kindLabel(e.kind)),
          e.someday ? h("span.chip.someday", "언젠가")
            : e.due ? [h(`span.dday${overdue ? ".over" : soon ? ".soon" : ""}`, dday(e.due)), h("span", `${U.dateLabel(e.due)}${e.time ? ` ${e.time}` : ""}`)]
              : e.time ? h("span", e.time) : null)));
  }

  function vsRow(e, rerender) {
    const side = (k) => h(`button.vs-pick${e.pick === k ? ".on" : ""}`, {
      onclick: async () => { e.pick = e.pick === k ? null : k; e.updatedAt = new Date().toISOString(); await U.store.put(e); rerender(); },
    }, h("span.box", e.pick === k ? "✓" : ""), h("span", e[k]));
    const memo = h("textarea.input.vs-memo", {
      value: e.memo || "", placeholder: "메모", rows: 1,
      onchange: async (ev) => { e.memo = ev.target.value; e.updatedAt = new Date().toISOString(); await U.store.put(e); },
    });
    return h("div.card.vs-card",
      h("div.vs-row",
        side("a"), h("div.vs-mid", "VS"), side("b"),
        h("button.icon-btn.vs-edit", { "aria-label": "편집", onclick: () => (location.hash = `#/note/edit/${e.id}`) }, icon("pen"))),
      memo);
  }

  async function addRandomVs() {
    const list = window.VS_LIST || [];
    const existing = new Set((await listOf("vs")).map((v) => `${v.a}|${v.b}`));
    const pool = list.filter((x) => !existing.has(x));
    if (!pool.length) { U.toast("모두 추가했습니다"); return; }
    const [a, b] = pool[Math.floor(Math.random() * pool.length)].split("|");
    const now = new Date().toISOString();
    await U.store.put({ id: U.uid(), type: "vs", a, b, pick: null, memo: "", createdAt: now, updatedAt: now, date: U.today() });
  }

  const fab = (type) => h("button.fab", { "aria-label": "새로 쓰기", onclick: () => (location.hash = `#/note/new/${type}`) }, icon("plus"));
  const seg = (list, cur, base, withIcon) => h("div.seg", list.map((s) =>
    h(`button${s === cur ? ".on" : ""}`, { onclick: () => (location.hash = `${base}/${s}`) },
      withIcon ? h("span.seg-ic", icon(TYPES[s].icon)) : null, TYPES[s].label)));

  async function mediaTile(e) {
    const btn = h("button", { onclick: () => (location.hash = `#/note/edit/${e.id}`), "aria-label": e.what });
    const url = e.media ? await mediaUrl(e.media, true) : null;
    btn.appendChild(url ? h("img", { src: url, alt: "", loading: "lazy" }) : h("span.noimg", e.what));
    if (e.mediaType === "video") btn.appendChild(h("span.play", "▶"));
    return btn;
  }

  /* ---------- views ---------- */
  async function todayView() {
    const today = U.today();
    const [goods, todos, meals] = await Promise.all([listOf("good"), listOf("todo"), listOf("meal")]);
    const el = h("div");

    // 식사
    const todayMeals = meals.filter((m) => m.date === today);
    const mealCard = h("div.card", h("div.h-row", h("h3", "식사"), h("button.link-btn.small", { onclick: () => (location.hash = "#/note/meals") }, "기록 보기")));
    const slots = h("div.meal-slots");
    for (const s of MEALS) {
      const mine = todayMeals.filter((m) => m.slot === s);
      const btn = h(`button.meal-slot${mine.length ? ".done" : ""}`, { onclick: () => (location.hash = mine.length === 1 ? `#/note/edit/${mine[0].id}` : `#/note/new/meal/${s}`) });
      const photo = mine.find((m) => m.media);
      const url = photo ? await mediaUrl(photo.media, true) : null;
      if (url) btn.appendChild(h("img", { src: url, alt: "" }));
      btn.append(h("b", s), h("span", mine.length ? mine.map(mealName).join(", ") : "+"));
      if (mine.length) btn.appendChild(h("span.with", (mine[0].with || []).join(", ")));
      slots.appendChild(btn);
    }
    mealCard.appendChild(slots);
    el.appendChild(mealCard);

    const goodCard = h("div.card", h("h3", "좋은 오늘"));
    for (const g of goods.filter((x) => x.date === today)) {
      const row = h("button.list-item.row", { style: { boxShadow: "none", background: "var(--surface-2)", marginBottom: "6px" }, onclick: () => (location.hash = `#/note/edit/${g.id}`) });
      const url = g.media ? await mediaUrl(g.media, true) : null;
      if (url) row.appendChild(h("img", { src: url, alt: "", style: { width: "52px", height: "52px", objectFit: "cover", borderRadius: "10px", flex: "none" } }));
      row.appendChild(h("div.grow", h("div.t", g.what), g.why ? h("div.d", g.why) : null));
      goodCard.appendChild(row);
    }
    goodCard.appendChild(await formView("good", null, { onSaved: () => Note.route([]) }));
    el.appendChild(goodCard);

    const week = U.addDays(today, 7);
    const open = todos.filter((t) => !t.done && !t.someday && (!t.due || t.due <= week)).sort(todoSort);
    const todoBox = h("div");
    const drawTodos = () => { todoBox.innerHTML = ""; open.filter((t) => !t.done).forEach((t) => todoBox.appendChild(todoRow(t, drawTodos))); };
    drawTodos();
    el.append(h("div.section-title", h("span", "할 일 · 7일 안"), h("button.link-btn.small", { onclick: () => (location.hash = "#/note/new/todo") }, "+ 추가")), todoBox);

    el.append(h("div.section-title", "바로 쓰기"),
      h("div.quick.icons", MEMO_SEGS.map((t) => h("button", { onclick: () => (location.hash = `#/note/new/${t}`) }, h("span.q-ic", icon(TYPES[t].icon)), h("b", TYPES[t].label)))));
    return el;
  }

  async function memoView(cur) {
    cur = MEMO_SEGS.includes(cur) ? cur : "todo";
    const list = await listOf(cur);
    const el = h("div", seg(MEMO_SEGS, cur, "#/note/memo", true));
    if (cur === "todo") {
      const box = h("div");
      const draw = () => {
        box.innerHTML = "";
        const open = list.filter((t) => !t.done).sort(todoSort);
        open.filter((t) => !t.someday).forEach((t) => box.appendChild(todoRow(t, draw)));
        const someday = open.filter((t) => t.someday);
        if (someday.length) { box.appendChild(h("div.section-title", "언젠가")); someday.forEach((t) => box.appendChild(todoRow(t, draw))); }
        const done = list.filter((t) => t.done);
        if (done.length) { box.appendChild(h("div.section-title", "완료")); done.slice(0, 30).forEach((t) => box.appendChild(todoRow(t, draw))); }
      };
      draw();
      el.appendChild(box);
    } else list.forEach((e) => el.appendChild(item(e)));
    el.appendChild(fab(cur));
    return el;
  }

  async function prefView(cur) {
    cur = PREF_SEGS.includes(cur) ? cur : "good";
    const list = await listOf(cur);
    const el = h("div", seg(PREF_SEGS, cur, "#/note/pref"));
    if (cur === "good") {
      const grid = h("div.grid3");
      for (const g of list) grid.appendChild(await mediaTile(g));
      el.appendChild(grid);
    } else {
      el.appendChild(h("p.small.muted", { style: { margin: "0 4px 12px" } }, DISLIKE_LINE));
      list.forEach((e) => el.appendChild(h("button.list-item", { onclick: () => (location.hash = `#/note/edit/${e.id}`) }, h("div.t", e.what), h("div.d", e.why))));
    }
    el.appendChild(fab(cur));
    return el;
  }

  async function mealsView() {
    const list = (await listOf("meal")).sort((a, b) => b.date.localeCompare(a.date) || MEALS.indexOf(a.slot) - MEALS.indexOf(b.slot));
    const el = h("div");
    let last = null;
    for (const m of list) {
      if (m.date !== last) { el.appendChild(h("div.section-title", U.dateLabel(m.date))); last = m.date; }
      const row = h("button.list-item.row", { onclick: () => (location.hash = `#/note/edit/${m.id}`) });
      const url = m.media ? await mediaUrl(m.media, true) : null;
      if (url) row.appendChild(h("img", { src: url, alt: "", style: { width: "52px", height: "52px", objectFit: "cover", borderRadius: "10px", flex: "none" } }));
      row.appendChild(h("div.grow", h("div.t", `${m.slot} · ${mealName(m)}`), mealMeta(m) ? h("div.d", mealMeta(m)) : null));
      el.appendChild(row);
    }
    el.appendChild(h("button.fab", { "aria-label": "추가", onclick: () => (location.hash = "#/note/new/meal") }, icon("plus")));
    return el;
  }

  async function storyView(cur) {
    // 사주 버튼 바로 위의 보이지 않는 영역: 누르면 숨긴 스토리 보기/다시 숨기기
    const secret = h("button.secret-tap", {
      type: "button", "aria-hidden": "true", tabindex: "-1",
      onclick: () => {
        revealHidden = !revealHidden;
        if (location.hash !== "#/note/story") location.hash = "#/note/story";
        else Note.route(["story"]);
      },
    });
    const tabs = h("div.seg-wrap", secret, h("div.seg",
      h(`button${cur !== "saju" ? ".on" : ""}`, { onclick: () => (location.hash = "#/note/story") }, "스토리"),
      h(`button${cur === "saju" ? ".on" : ""}`, { onclick: () => (location.hash = "#/note/story/saju") }, "사주")));
    if (cur === "saju") return h("div", tabs, await sajuView());
    const list = [...(await listOf("story")), ...(await listOf("episode"))].filter((e) => revealHidden || !e.hidden);
    const el = h("div", tabs);
    list.forEach((e) => el.appendChild(h("button.list-item", { onclick: () => (location.hash = `#/note/edit/${e.id}`) },
      h("div.t", e.title), h("div.d", e.story),
      h("div.m", h("span", U.dateLabel(e.when || e.date)), e.who ? h("span", e.who) : null, e.hidden ? h("span.chip", "숨김") : null))));
    el.appendChild(fab("story"));
    return el;
  }

  async function vsView() {
    const list = await listOf("vs");
    const el = h("div");
    const openAdd = () => {
      const close = U.sheet(null, h("div.stack",
        h("button.btn.block", { onclick: async () => { await addRandomVs(); close(); Note.route(["vs"]); } }, "랜덤"),
        h("button.btn.ghost.block", { onclick: () => { close(); location.hash = "#/note/new/vs"; } }, "직접 쓰기")));
    };
    const draw = () => {
      el.innerHTML = "";
      list.forEach((e) => el.appendChild(vsRow(e, draw)));
      el.appendChild(h("button.fab", { "aria-label": "추가", onclick: openAdd }, icon("plus")));
    };
    draw();
    return el;
  }

  /* ---------- 사주 ---------- */
  const EL_CLASS = { 목: "el-wood", 화: "el-fire", 토: "el-earth", 금: "el-metal", 수: "el-water" };

  /* 사주 용어 사전: 용어 옆 (?)를 누르면 설명이 보인다 */
  const GLOSS = {
    "극신강": "나를 돕는 기운이 지나치게 많아 내 힘이 매우 센 상태. 추진력과 자기 확신이 강한 대신, 힘을 쓸 곳과 제어할 장치가 부족하면 소모와 충돌이 커진다.",
    "신강": "나(일간)를 돕는 기운이 많아 내 힘이 센 사주. 주도적이고 버티는 힘이 강하다.",
    "신약": "나(일간)를 돕는 기운이 적어 내 힘이 약한 사주. 주변의 도움과 환경의 영향을 크게 받는다.",
    "일간": "태어난 날의 위 글자. 사주에서 '나 자신'을 뜻하며 모든 해석의 기준이 된다.",
    "일주": "태어난 날의 기둥(위 글자 + 아래 글자). 나 자신과 배우자 자리를 함께 보여 준다.",
    "월지": "태어난 달의 아래 글자. 태어난 계절을 뜻하며 사주의 온도·습도와 힘의 크기를 가장 크게 좌우한다.",
    "일지": "태어난 날의 아래 글자. 내가 앉은 자리이자 배우자 자리.",
    "원국": "태어난 연·월·일·시 네 기둥 여덟 글자. 타고난 기본 구조.",
    "대운": "10년 단위로 바뀌는 큰 운의 흐름. 인생의 계절 같은 환경.",
    "세운": "매년 들어오는 한 해의 운.",
    "오행": "목(나무)·화(불)·토(흙)·금(쇠)·수(물) 다섯 기운. 서로 돕고(생) 누르는(극) 관계로 균형을 본다.",
    "천간": "각 기둥의 위 글자(갑을병정무기경신임계). 겉으로 드러나는 기운.",
    "지지": "각 기둥의 아래 글자(자축인묘진사오미신유술해). 실제 환경과 바탕이 되는 기운.",
    "지장간": "지지 안에 숨어 있는 천간들. 겉으로 보이지 않지만 상황에 따라 드러나는 잠재 기운.",
    "십성": "나(일간)를 기준으로 다른 글자가 어떤 역할을 하는지 열 가지로 나눈 것(비견·겁재·식신·상관·편재·정재·편관·정관·편인·정인).",
    "비견": "나와 같은 오행, 같은 음양. 동료·친구·형제. 자립심과 경쟁심.",
    "겁재": "나와 같은 오행, 다른 음양. 경쟁자·라이벌. 승부욕이 강하고 재물을 빼앗아 가는 성질도 있다.",
    "비겁": "비견과 겁재를 합쳐 부르는 말. 나와 같은 편의 기운(동료·경쟁자·자존심).",
    "식신": "내가 만들어 내는 것 중 안정적인 것. 표현·재능·결과물·먹을 복.",
    "상관": "내가 만들어 내는 것 중 날카로운 것. 말솜씨·비판·창의성. 규칙에 반발하는 성질.",
    "식상": "식신과 상관을 합쳐 부르는 말. 표현하고 생산하는 기운.",
    "정재": "내가 다루는 재물 중 안정적인 것. 월급·꾸준한 수입. 남자에게는 아내.",
    "편재": "내가 다루는 재물 중 크게 움직이는 것. 사업·투자·부수입. 남자에게는 연인·아버지.",
    "재성": "정재와 편재를 합쳐 부르는 말. 돈과 현실 감각. 남자에게는 아내·연인.",
    "정관": "나를 바르게 다스리는 기운. 직장·명예·규칙. 여자에게는 남편.",
    "편관": "나를 강하게 누르는 기운. 압박·권력·책임. 남자에게는 자녀.",
    "관성": "정관과 편관을 합쳐 부르는 말. 직장·조직·규율·명예.",
    "정인": "나를 돕는 기운 중 따뜻한 것. 어머니·학문·자격·문서.",
    "편인": "나를 돕는 기운 중 치우친 것. 직관·특수 지식·독특한 생각. 의존과 잡생각이 되기도 한다.",
    "인성": "정인과 편인을 합쳐 부르는 말. 배움·문서·보호·생각.",
    "용신": "이 사주에 가장 필요한 기운. 균형을 잡아 주는 핵심.",
    "희신": "용신을 도와주는 기운.",
    "기신": "이 사주에 해로운 기운. 이미 넘치거나 균형을 깨는 기운.",
    "구신": "기신을 도와 상황을 더 나쁘게 만드는 기운.",
    "조후": "사주의 온도와 습도를 맞추는 것. 여름생은 물, 겨울생은 불이 필요하다는 관점.",
    "억부": "센 기운은 누르고 약한 기운은 돕는다는 관점의 해석 방법.",
    "격국": "사주의 큰 틀과 성격. 직업적 설계도에 해당한다.",
    "월겁격": "태어난 달에 겁재가 자리 잡은 격. 자기 힘이 센 대신 재성·관성으로 다스려야 성공하는 구조.",
    "건록": "일간이 자기 힘을 온전히 갖는 자리(12운성). 자립과 실력.",
    "제왕": "12운성에서 기운이 가장 센 단계. 자존심·주도권·추진력이 강하다.",
    "12운성": "일간의 기운이 각 지지에서 얼마나 강하고 약한지를 사람의 일생(태어나 늙어 죽음)에 빗댄 12단계.",
    "12신살": "지지의 관계로 보는 특수한 기운 12가지(지살·화개살·역마살 등).",
    "지살": "이동·출장·이사·변화의 기운.",
    "화개살": "예술·학문·종교·고독한 몰입의 기운.",
    "육해살": "작은 장애와 질병, 마음고생의 기운.",
    "역마살": "멀리 움직이는 기운. 이직·이사·해외·출장이 잦다.",
    "망신살": "체면이 깎이거나 구설이 생기기 쉬운 기운. 반대로 이름을 알리는 계기가 되기도 한다.",
    "재고귀인": "재물 창고를 여는 귀인. 재물이 쌓이는 시기를 뜻한다.",
    "간여지동": "한 기둥의 위아래 글자가 같은 오행인 것(예: 丁巳). 자기 기운이 매우 강하고 주관이 뚜렷하다.",
    "군겁쟁재": "비겁(경쟁자)이 많아 하나의 재물을 여럿이 다투는 구조. 돈이 들어와도 주변으로 새기 쉽다.",
    "편인도식": "편인이 식신을 눌러 생산·결과물이 막히는 구조. 시작은 많고 마무리가 적어지기 쉽다.",
    "재생관": "재물이 관(직장·명예)을 살리는 흐름. 돈과 지위가 함께 오른다.",
    "식신제살": "식신이 편관(압박)을 제어하는 흐름. 재능으로 난관을 해결한다.",
    "득령": "태어난 달이 나를 돕는 것. 신강 판단의 첫째 기준.",
    "득지": "내가 앉은 자리(일지)가 나를 돕는 것.",
    "득세": "주변 글자들이 나를 돕는 것.",
    "조열": "사주가 덥고 건조한 상태. 물이 꼭 필요하다.",
    "양인": "일간의 기운이 극단으로 강해지는 자리. 결단력과 공격성.",
    "삼합": "세 지지가 모여 하나의 큰 오행 기운을 만드는 조합(예: 巳酉丑 → 금).",
    "방합": "같은 계절의 세 지지가 모여 그 계절의 기운을 만드는 조합(예: 亥子丑 → 수).",
    "반합": "삼합 중 두 글자만 모인 조합. 삼합보다 약하게 작용한다.",
    "육합": "두 지지가 짝을 이뤄 묶이는 조합(예: 子丑합).",
    "원진": "서로 미워하고 원망하는 관계의 두 지지. 이유 없는 서운함과 감정 소모.",
    "인사해": "寅과 巳가 서로 해치는 관계. 오해와 은근한 갈등, 문서 문제.",
    "형살": "서로 상처를 주는 관계(형). 다툼·법적 문제·수술수로 나타나기도 한다.",
    "정임합": "丁과 壬이 합하는 것. 일간 丁이 정관 壬과 묶여 조직·직장에 강하게 연결된다.",
    "비겁 운": "비견·겁재가 들어오는 시기. 경쟁과 지출이 커진다."
  };
  const GLOSS_RE = new RegExp(Object.keys(GLOSS).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  function qBtn(term) {
    return h("button.q", {
      type: "button", "aria-label": `${term} 뜻`,
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); U.sheet(term, h("p", { style: { lineHeight: 1.7 } }, GLOSS[term])); },
    }, "?");
  }
  // text -> [text, term, (?), ...]; only the first occurrence per `seen` set gets a (?)
  function G(text, seen = new Set()) {
    if (!text) return text;
    const out = [];
    let last = 0;
    for (const m of String(text).matchAll(GLOSS_RE)) {
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      const end = m.index + m[0].length;
      out.push(String(text).slice(last, end), qBtn(m[0]));
      last = end;
    }
    out.push(String(text).slice(last));
    return out;
  }
  // a short label that may be a term itself (절, 묘 etc. are listed separately so they don't match inside words)
  const STAGE_GLOSS = { 절: "12운성에서 기운이 끊어진 단계. 그 자리의 기운이 약하고, 새로 시작하는 성질.", 묘: "12운성에서 기운이 창고에 들어간 단계. 저장·축적·마무리의 성질.", 제왕: GLOSS["제왕"] };
  function L(label, seen) {
    if (STAGE_GLOSS[label] && !seen.has(label)) {
      seen.add(label);
      return [label, h("button.q", { type: "button", onclick: (e) => { e.preventDefault(); e.stopPropagation(); U.sheet(label, h("p", { style: { lineHeight: 1.7 } }, STAGE_GLOSS[label])); } }, "?")];
    }
    return G(label, seen);
  }

  async function sajuView() {
    const s = await U.store.kvGet("saju");
    if (!s) return h("div.empty", "사주 데이터가 없습니다. 설정 → 백업 불러오기에서 사주 파일을 불러오세요.");
    const year = new Date().getFullYear();
    const el = h("div");

    el.appendChild(h("div.card",
      h("div.row.between", h("h3", { style: { margin: 0 } }, G(s.profile.title)), h("span.chip.accent", G(s.profile.strength))),
      h("div.small.muted", { style: { marginTop: "6px", lineHeight: 1.7 } },
        h("div", s.profile.solar), h("div", s.profile.lunar), h("div", s.profile.corrected), h("div", G(`${s.profile.gender} · ${s.profile.place} · ${s.profile.frame}`)))));
    const gridSeen = new Set();

    // 원국
    el.appendChild(h("div.section-title", h("span", G("원국"))));
    el.appendChild(h("div.card.saju-grid", s.pillars.map((p) => h("div.pillar",
      h("div.pos", p.pos),
      h("div.ten", L(p.stemTen, gridSeen)),
      h(`div.glyph.${EL_CLASS[p.stemEl]}`, h("b", p.stem), h("span", `${p.stemKo}·${p.stemEl}`)),
      h(`div.glyph.${EL_CLASS[p.branchEl]}`, h("b", p.branch), h("span", `${p.branchKo}·${p.branchEl}`)),
      h("div.ten", L(p.branchTen, gridSeen)),
      h("div.meta", p.hidden), h("div.meta", L(p.stage, gridSeen)), h("div.meta", L(p.sal, gridSeen))))));
    el.appendChild(h("p.tiny.muted", { style: { margin: "-4px 4px 0" } }, "위에서부터 ", G("십성 · 천간 · 지지 · 지장간 · 12운성 · 12신살")));

    // 오행
    const max = Math.max(...Object.values(s.elements));
    el.appendChild(h("div.section-title", h("span", G("오행 분포"))));
    el.appendChild(h("div.card",
      Object.entries(s.elements).map(([k, v]) => h("div.hbar",
        h("span.lab", { style: { width: "28px" } }, k),
        h("span.track", h(`span.fill.${EL_CLASS[k]}-bg`, { style: { width: `${(v / max) * 100}%`, display: "block" } })),
        h("span.val", v))),
      h("p.tiny.muted", { style: { marginTop: "8px" } }, G(s.elementsNote))));

    // 용신
    el.appendChild(h("div.section-title", "필요한 기운 / 피할 기운"));
    const godSeen = new Set();
    el.appendChild(h("div.card", s.gods.map((g) => h("div.row", { style: { padding: "6px 0", alignItems: "flex-start" } },
      h("span.row", { style: { gap: "2px", flex: "none" } }, h(`span.god.${EL_CLASS[g.el]}-bg`, `${g.role} · ${g.el}`), GLOSS[g.role] ? qBtn(g.role) : null),
      h("span.small", G(g.desc, godSeen))))));

    // 요약
    el.appendChild(h("div.section-title", "핵심 요약"));
    const sumSeen = new Set();
    el.appendChild(h("div.card", h("div.stack", s.summary.map((x) => h("p.small", { style: { lineHeight: 1.65 } }, G(x, sumSeen))))));

    // 대운
    el.appendChild(h("div.section-title", h("span", G("대운 흐름"))));
    el.appendChild(h("div.daeun", s.daeun.map((d) => {
      const [y1, y2] = d.years.split("~").map(Number);
      const now = year >= y1 && year <= y2;
      return h(`div.dcard${now ? ".now" : ""}`,
        h("div.tiny.muted", d.ages), h("b", d.ganji), h("div.tiny", d.ko),
        h("div.dbar", h("i", { style: { height: `${(d.score / 5) * 100}%` } })),
        h("div.tiny.muted", d.years), now ? h("div.tiny.now-tag", "지금") : null,
        h("div.dkeys", d.keys.map((k) => h("span", k))));
    })));
    el.appendChild(h("p.tiny.muted", { style: { margin: "6px 4px 0" } }, G(s.daeunNote)));

    // 세운
    el.appendChild(h("div.section-title", h("span", "주요 연도 ", qBtn("세운"))));
    el.appendChild(h("div", s.seun.map((x) => h(`details.card.seun.${x.type === "위험" ? "risk" : x.type === "기회" ? "good" : "warn"}`,
      h("summary", h("span.yr", `${x.year} ${x.ganji}`), h("span.small.muted", ` ${x.age}세`), h("span.stag", x.type), h("div.small", { style: { marginTop: "2px" } }, x.title)),
      h("p.small", { style: { marginTop: "8px", lineHeight: 1.65 } }, G(x.why))))));

    // 외부 리포트
    if (s.reports?.length) {
      const toneCls = (t) => (t === "good" ? "good" : t === "risk" ? "risk" : "warn");
      const toneLabel = { good: "좋음", risk: "주의", warn: "보통" };
      el.appendChild(h("div.section-title", "사주아이 리포트"));
      s.reports.forEach((r) => {
        const body = [];
        const rs = new Set();
        if (r.months) {
          const detail = h("div.small", { style: { marginTop: "8px", lineHeight: 1.65, minHeight: "1px" } });
          const grid = h("div.mgrid", r.months.map((m) => h(`button.mcell.${toneCls(m.tone)}`, {
            onclick: (ev) => {
              ev.preventDefault();
              grid.querySelectorAll(".mcell").forEach((c) => c.classList.remove("sel"));
              ev.currentTarget.classList.add("sel");
              detail.innerHTML = "";
              detail.append(h("b", `${m.m}월 · ${m.t}`), h("div", G(m.p)));
            },
          }, h("b", `${m.m}`), h("span", toneLabel[toneCls(m.tone)]))));
          body.push(h("div", { style: { marginTop: "12px" } }, h("h4", "월별 흐름"), grid, detail));
        }
        if (r.years) {
          body.push(h("div", { style: { marginTop: "12px" } }, h("h4", "연도별"),
            r.years.map((y) => h("div.yrow", h(`span.ydot.${toneCls(y.tone)}`), h("div.grow", h("b.small", `${y.y} · ${y.t}`), h("div.small.muted", G(y.p, rs)))))));
        }
        if (r.items?.length) {
          body.push(h("div", { style: { marginTop: "12px" } }, r.items.map((it) =>
            h("div", { style: { marginTop: "10px" } }, h("h4", it.h), h("p.small", { style: { lineHeight: 1.7, marginTop: "4px" } }, G(it.p, rs))))));
        }
        if (r.secret) body.push(h("div.notice", { style: { marginTop: "12px" } }, G(r.secret, rs)));
        el.appendChild(h("details.card.saju-sec",
          h("summary", h("b", G(r.title)), h("div.tiny.muted", r.sub), h("div.small", { style: { marginTop: "6px", lineHeight: 1.6 } }, G(r.intro, rs))),
          body));
      });
      if (s.compare?.length) {
        el.appendChild(h("details.card.saju-sec",
          h("summary", h("b", "두 해석 비교"), h("div.small.muted", { style: { marginTop: "4px" } }, "사주아이 리포트와 원국 분석이 같거나 다른 지점")),
          s.compare.map((c) => h("div", { style: { marginTop: "12px" } }, h("h4", c.topic), h("p.small", { style: { marginTop: "4px" } }, G(c.a)), h("p.small.muted", { style: { marginTop: "2px" } }, G(c.b))))));
      }
    }

    // 상세
    el.appendChild(h("div.section-title", "원국 분석 상세"));
    s.sections.forEach((sec) => {
      const ss = new Set();
      el.appendChild(h("details.card.saju-sec",
        h("summary", h("b", sec.title), h("div.small.muted", { style: { marginTop: "4px" } }, G(sec.summary, ss))),
        sec.parts.map((pt) => h("div", { style: { marginTop: "14px" } },
          h("h4", G(pt.h, ss)), pt.p.map((para) => h("p.small", { style: { lineHeight: 1.75, marginTop: "6px" } }, G(para, ss)))))));
    });
    return el;
  }

  /* ---------- backup ---------- */
  async function exportBackup() {
    const entries = await U.store.all();
    const kv = await U.store.kvAll();
    const blobs = [];
    for (const [k, b] of await U.store.blobAll()) blobs.push([k, await U.blobToDataUrl(b)]);
    const data = JSON.stringify({ app: "daily-app-note", v: 3, exportedAt: new Date().toISOString(), entries, kv: kv.filter(([k]) => !["passphrase", "vapid", "pushSub"].includes(k)), blobs });
    const file = new File([data], `memo-backup-${U.today()}.json`, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "메모 백업" }); return; } catch { /* fall through */ }
    }
    const a = h("a", { href: URL.createObjectURL(file), download: file.name });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function importBackup(file) {
    try {
      let j;
      try { j = JSON.parse((await file.text()).replace(/^﻿/, "")); }
      catch { throw new Error(`'${file.name}'은(는) 백업 파일 형식이 아닙니다. saju-import.json 또는 note-seed.json을 골라 주세요.`); }
      if (j.app !== "daily-app-note") throw new Error("메모 백업 파일이 아닙니다.");
      j.entries = j.entries || [];
      const parts = [];
      if (j.entries.length) parts.push(`기록 ${j.entries.length}개`);
      if ((j.kv || []).some(([k]) => k === "saju")) parts.push("사주 데이터");
      else if ((j.kv || []).length) parts.push("설정");
      if (!(await U.ask(`${parts.join(", ") || "빈 백업"}을(를) 불러옵니다. 같은 내용은 덮어씁니다.`, { ok: "불러오기" }))) return;
      for (const e of j.entries) await U.store.put(e);
      for (const [k, v] of j.kv || []) await U.store.kvSet(k, v);
      for (const [k, d] of j.blobs || []) await U.store.blobSet(k, await U.dataUrlToBlob(d));
      U.toast("불러옴");
    } catch (e) {
      U.alert(e.message || String(e));
    }
  }

  async function launcherCount() {
    try {
      const todos = await listOf("todo");
      return todos.filter((t) => !t.done && t.due && t.due <= U.today()).length;
    } catch {
      return 0;
    }
  }

  // Main screen card: open to-dos that are overdue or due within 7 days (plus undated ones), max 6.
  async function homeTodoCard() {
    const today = U.today(), week = U.addDays(today, 7);
    const all = await listOf("todo");
    const card = h("div.card.home-card.home-todo");
    const head = h("div.home-head", h("b", "할 일"), h("span.grow"),
      h("button.link-btn.small", { onclick: () => (location.hash = "#/note/new/todo") }, "+ 추가"),
      h("button.link-btn.small", { onclick: () => (location.hash = "#/note/memo/todo") }, "전체"));
    const box = h("div");
    const draw = () => {
      box.innerHTML = "";
      const open = all.filter((t) => !t.done && !t.someday && (!t.due || t.due <= week)).sort(todoSort);
      if (!open.length) box.appendChild(h("p.small.muted", { style: { margin: "6px 2px 2px" } }, "7일 안에 할 일이 없습니다"));
      open.slice(0, 6).forEach((t) => box.appendChild(todoRow(t, draw)));
      if (open.length > 6) box.appendChild(h("button.link-btn.small", { onclick: () => (location.hash = "#/note/memo/todo") }, `${open.length - 6}개 더 보기`));
    };
    draw();
    card.append(head, box);
    return card;
  }

  async function launcherMeta() {
    try {
      const todos = await listOf("todo");
      const n = todos.filter((t) => !t.done && t.due && t.due <= U.today()).length;
      return n ? [`오늘 할 일 ${n}`] : [];
    } catch {
      return [];
    }
  }

  function backFor(type) {
    if (MEMO_SEGS.includes(type)) return `#/note/memo/${type}`;
    if (PREF_SEGS.includes(type)) return `#/note/pref/${type}`;
    if (type === "story" || type === "episode") return "#/note/story";
    if (type === "vs") return "#/note/vs";
    if (type === "meal") return "#/note";
    if (type === "book") return "#/news/books";
    return "#/note";
  }

  window.Note = {
    launcherMeta,
    launcherCount,
    homeTodoCard,
    form: formView,
    mediaUrl,
    BOOK_STATUS,
    exportBackup,
    importBackup,
    async route(rest) {
      const [view, arg] = rest;
      const L = (active, title, body, extra = {}) => App.layout({ app: "note", title, tabs: TABS, active, body, ...extra });
      if (view === "new" && TYPES[arg]) {
        const slot = rest[2] ? decodeURIComponent(rest[2]) : null;
        const preset = arg === "meal" && MEALS.includes(slot) ? { slot } : null;
        return L(null, preset ? `${slot} 기록` : TYPES[arg].label, formView(arg, null, { preset }), { back: backFor(arg), noTabs: true });
      }
      if (view === "meals") return L(null, "식사 기록", mealsView(), { back: "#/note", noTabs: true });
      if (view === "edit" && arg) {
        const e = await U.store.get(arg);
        if (!e || !TYPES[e.type]) return L(null, "메모", Promise.resolve(h("div.empty", "찾을 수 없습니다")), { back: "#/note", noTabs: true });
        return L(null, TYPES[e.type].label, formView(e.type, e), { back: backFor(e.type), noTabs: true });
      }
      if (view === "memo") return L("memo", "메모", memoView(arg));
      if (view === "pref") return L("pref", "선호", prefView(arg));
      if (view === "story" || view === "episode") return L("story", "스토리", storyView(arg));
      if (view === "vs") return L("vs", "VS", vsView());
      return L("today", "똑부러지기", todayView(), { right: Updater.button("note") });
    },
  };
})();
