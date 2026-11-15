/* Shared helpers: DOM builder, formatting, IndexedDB storage, toast, sheet. */
(function () {
  const U = {};

  // h('div.card', {onclick}, child, ...)
  U.h = function (sel, attrs, ...kids) {
    const [tag, ...cls] = sel.split(".");
    const el = document.createElement(tag || "div");
    if (cls.length) el.className = cls.join(" ");
    if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
      kids.unshift(attrs);
      attrs = null;
    }
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "class") el.className += (el.className ? " " : "") + v;
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k === "html") el.innerHTML = v;
        else if (k in el && k !== "list" && k !== "type") el[k] = v;
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    const add = (k) => {
      if (k == null || k === false) return;
      if (Array.isArray(k)) k.forEach(add);
      else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    };
    kids.forEach(add);
    return el;
  };

  const ICONS = {
    chart: '<path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6"/>',
    note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h5"/>',
    home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    today: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12h2M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    chat: '<path d="M5 5h14v10H9l-4 4z"/><path d="M9 9h6M9 12h4"/>',
    check: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
    scale: '<path d="M12 4v16M7 20h10M5 8h14"/><path d="M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z"/>',
    vs: '<path d="M4 7h11l-3-3M20 17H9l3 3"/>',
    book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
  };
  U.icon = (name) => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.innerHTML = ICONS[name] || "";
    return s;
  };

  // Formatting
  U.won = (v) => (v == null || isNaN(v) ? "-" : `${v < 0 ? "-" : ""}${Math.round(Math.abs(v)).toLocaleString("ko-KR")}원`);
  U.signedWon = (v) => (v == null || isNaN(v) ? "-" : `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.round(Math.abs(v)).toLocaleString("ko-KR")}원`);
  U.manwon = (v) => (v == null ? "-" : `${v < 0 ? "-" : v > 0 ? "+" : ""}${Math.round(Math.abs(v) / 10000).toLocaleString("ko-KR")}만`);
  U.pct = (v, d = 1, sign = true) => (v == null || isNaN(v) ? "-" : `${sign && v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`);
  U.pct0 = (v) => (v == null || isNaN(v) ? "-" : `${Math.round(v * 100)}%`);
  U.price = (v, market) =>
    v == null ? "-" : market === "KR" ? `${Math.round(v).toLocaleString("ko-KR")}원` : `$${v >= 100 ? v.toFixed(2) : v.toFixed(2)}`;
  U.cls = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");

  U.today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  U.addDays = (iso, n) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  U.dateLabel = (iso) => {
    if (!iso) return "";
    const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
  };
  U.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // IndexedDB
  let dbp = null;
  U.db = function () {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open("daily-app", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const e = db.createObjectStore("entries", { keyPath: "id" });
        e.createIndex("type", "type");
        db.createObjectStore("blobs");
        db.createObjectStore("kv");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  };
  function tx(store, mode, fn) {
    return U.db().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(store, mode);
          const s = t.objectStore(store);
          let result;
          Promise.resolve(fn(s)).then((r) => (result = r));
          t.oncomplete = () => resolve(result);
          t.onerror = () => reject(t.error);
        }),
    );
  }
  const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  U.store = {
    put: (entry) => tx("entries", "readwrite", (s) => req2p(s.put(entry))),
    get: (id) => tx("entries", "readonly", (s) => req2p(s.get(id))),
    del: (id) => tx("entries", "readwrite", (s) => req2p(s.delete(id))),
    byType: (type) => tx("entries", "readonly", (s) => req2p(s.index("type").getAll(type))).then((l) => l.sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt) || b.createdAt.localeCompare(a.createdAt))),
    all: () => tx("entries", "readonly", (s) => req2p(s.getAll())),
    kvGet: (k) => tx("kv", "readonly", (s) => req2p(s.get(k))),
    kvSet: (k, v) => tx("kv", "readwrite", (s) => req2p(s.put(v, k))),
    kvAll: () => tx("kv", "readonly", (s) => Promise.all([req2p(s.getAllKeys()), req2p(s.getAll())])).then(([k, v]) => k.map((key, i) => [key, v[i]])),
    blobGet: (k) => tx("blobs", "readonly", (s) => req2p(s.get(k))),
    blobSet: (k, v) => tx("blobs", "readwrite", (s) => req2p(s.put(v, k))),
    blobDel: (k) => tx("blobs", "readwrite", (s) => req2p(s.delete(k))),
    blobAll: () => tx("blobs", "readonly", (s) => Promise.all([req2p(s.getAllKeys()), req2p(s.getAll())])).then(([k, v]) => k.map((key, i) => [key, v[i]])),
  };

  // Toast
  U.toast = function (msg) {
    let t = document.querySelector(".toast");
    if (!t) { t = U.h("div.toast"); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("on"), 1800);
  };

  U.sheet = function (title, body) {
    const bg = U.h("div.sheet-bg", { onclick: (e) => { if (e.target === bg) close(); } });
    const close = () => bg.remove();
    bg.appendChild(U.h("div.sheet", U.h("div.grab"), title ? U.h("h2", title) : null, body));
    document.body.appendChild(bg);
    return close;
  };

  // In-app confirm sheet (native confirm() is blocked in some web views and home-screen apps).
  U.ask = function (msg, { ok = "확인", cancel = "취소", danger = false } = {}) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; close(); resolve(v); };
      const close = U.sheet(null, U.h("div",
        U.h("p", { style: { fontSize: "16px", fontWeight: 600, margin: "4px 0 16px" } }, msg),
        U.h("div.form-actions", { style: { marginTop: 0 } },
          U.h("button.btn.ghost", { type: "button", onclick: () => finish(false) }, cancel),
          U.h(`button.btn${danger ? ".danger-solid" : ""}`, { type: "button", onclick: () => finish(true) }, ok))));
      // closing by tapping the backdrop counts as cancel
      const bg = document.querySelectorAll(".sheet-bg");
      const last = bg[bg.length - 1];
      if (last) last.addEventListener("click", (e) => { if (e.target === last) { done = true; resolve(false); } });
    });
  };
  U.alert = function (msg) { return U.ask(msg, { ok: "확인", cancel: "닫기" }); };
  U.confirm = (msg) => U.ask(msg);

  U.copy = async function (text) {
    try { await navigator.clipboard.writeText(text); U.toast("복사했습니다"); }
    catch { U.sheet("길게 눌러 복사하세요", U.h("div.code", { style: { userSelect: "all", maxHeight: "50vh" } }, text)); }
  };

  // Resize an image file to a JPEG blob.
  U.resizeImage = function (file, max) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * r);
        c.height = Math.round(img.height * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))), "image/jpeg", 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽지 못했습니다")); };
      img.src = url;
    });
  };

  U.blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  U.dataUrlToBlob = (d) => fetch(d).then((r) => r.blob());

  U.isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  window.U = U;
})();
