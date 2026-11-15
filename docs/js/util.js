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
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5s1.1-5.9 3.6-8.5z"/>',
    tag: '<path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z"/><circle cx="8" cy="8.5" r="1.4"/>',
    pushpin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    shirt: '<path d="M8 4l4 2 4-2 5 4-3 3-2-1.5V20H8V9.5L6 11 3 8z"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
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

  // Photo metadata (JPEG EXIF): shooting date/time and GPS. Read before resizing (the canvas drops EXIF).
  U.readExif = async function (file) {
    try {
      const buf = await file.slice(0, 256 * 1024).arrayBuffer();
      const v = new DataView(buf);
      if (v.getUint16(0) !== 0xffd8) return null;
      let off = 2;
      while (off + 10 < v.byteLength) {
        const marker = v.getUint16(off);
        if ((marker & 0xff00) !== 0xff00) break;
        const len = v.getUint16(off + 2);
        if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
        off += 2 + len;
      }
    } catch { /* not a readable JPEG */ }
    return null;
  };
  function parseTiff(v, t) {
    const le = v.getUint16(t) === 0x4949;
    const u16 = (o) => v.getUint16(t + o, le);
    const u32 = (o) => v.getUint32(t + o, le);
    const ifd = (o) => {
      const m = {};
      const n = u16(o);
      for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; m[u16(e)] = { type: u16(e + 2), count: u32(e + 4), voff: e + 8 }; }
      return m;
    };
    const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const val = (en) => {
      if (!en) return null;
      const { type, count, voff } = en;
      const at = (SIZE[type] || 1) * count > 4 ? u32(voff) : voff;
      if (type === 2) { let s = ""; for (let i = 0; i < count; i++) { const c = v.getUint8(t + at + i); if (!c) break; s += String.fromCharCode(c); } return s; }
      if (type === 5) { const a = []; for (let i = 0; i < count; i++) a.push(u32(at + i * 8) / (u32(at + i * 8 + 4) || 1)); return a; }
      if (type === 3) return u16(at);
      if (type === 4) return u32(at);
      return null;
    };
    const out = {};
    const ifd0 = ifd(u32(4));
    let dt = null;
    const exifPtr = val(ifd0[0x8769]);
    if (exifPtr) { const ex = ifd(exifPtr); dt = val(ex[0x9003]) || val(ex[0x9004]); }
    dt = dt || val(ifd0[0x0132]);
    if (dt && /^\d{4}:\d\d:\d\d \d\d:\d\d/.test(dt)) { out.date = dt.slice(0, 10).replace(/:/g, "-"); out.time = dt.slice(11, 16); }
    const gpsPtr = val(ifd0[0x8825]);
    if (gpsPtr) {
      const g = ifd(gpsPtr);
      const lat = val(g[2]);
      const lng = val(g[4]);
      const dms = (a) => a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600;
      if (lat?.length && lng?.length && (dms(lat) || dms(lng))) {
        out.lat = dms(lat) * (val(g[1]) === "S" ? -1 : 1);
        out.lng = dms(lng) * (val(g[3]) === "W" ? -1 : 1);
      }
    }
    return out;
  }

  // Coordinates -> nearby place name and area (OpenStreetMap Nominatim, Korean labels).
  U.reverseGeocode = async function (lat, lng) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=ko&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}`);
      if (!r.ok) return null;
      const j = await r.json();
      const a = j.address || {};
      const area = [a.city || a.town || a.county || a.province, a.borough || a.city_district || a.suburb, a.quarter || a.neighbourhood || a.village || a.road].filter(Boolean);
      return { name: j.name || "", area: [...new Set(area)].join(" ") || j.display_name || "" };
    } catch {
      return null;
    }
  };

  U.blobToDataUrl =(b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  U.dataUrlToBlob = (d) => fetch(d).then((r) => r.blob());

  U.isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  window.U = U;
})();
