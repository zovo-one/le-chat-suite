"use strict";
(() => {
  // src/shared/types.ts
  var HOST_ID = "lech3a91-host";
  var K = {
    settings: "lech:settings",
    folders: "lech:folders",
    prompts: "lech:prompts",
    convmap: "lech:convmap",
    selcache: "lech:selcache",
    funnel: "lech:funnel",
    license: "zovo_license"
    // VERBATIM — fleet verifier depends on it
  };
  var FREE_FOLDER_CAP = 3;
  var FREE_PROMPT_CAP = 5;
  var PRO_FOLDER_CAP = 200;
  var PRO_PROMPT_CAP = 500;
  var PROMPT_BODY_MAX = 1e4;
  var PROMPT_TITLE_MAX = 120;
  var FOLDER_NAME_MAX = 60;
  var CONVMAP_CAP = 2e3;
  var CONVMAP_GC_DAYS = 90;

  // src/shared/validate.ts
  function isObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  var MAX_STORED_STR = 260;
  var CONTROL_RE = /[\x00-\x1F\x7F-\x9F]/g;
  var BODY_CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;
  var BIDI_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
  function sanitizeLine(v, max = MAX_STORED_STR) {
    if (typeof v !== "string") return "";
    const cleaned = v.replace(CONTROL_RE, "").replace(BIDI_RE, "").trim();
    return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
  }
  function sanitizeBody(v, max = PROMPT_BODY_MAX) {
    if (typeof v !== "string") return "";
    const cleaned = v.replace(/\r\n?/g, "\n").replace(BODY_CONTROL_RE, "").replace(BIDI_RE, "");
    return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
  }
  var ID_MAX = 64;
  function sanitizeId(v) {
    if (typeof v !== "string") return null;
    const id = v.trim();
    if (id.length === 0 || id.length > ID_MAX) return null;
    return id;
  }
  function finiteNonNeg(v, fallback) {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
  }
  var THEMES = /* @__PURE__ */ new Set(["auto", "light", "dark"]);
  function freshSettings() {
    return {
      enabled: true,
      foldersEnabled: true,
      promptsEnabled: true,
      exportEnabled: true,
      theme: "auto"
    };
  }
  function validateSettings(v) {
    const s = freshSettings();
    if (!isObject(v)) return s;
    if (typeof v.enabled === "boolean") s.enabled = v.enabled;
    if (typeof v.foldersEnabled === "boolean") s.foldersEnabled = v.foldersEnabled;
    if (typeof v.promptsEnabled === "boolean") s.promptsEnabled = v.promptsEnabled;
    if (typeof v.exportEnabled === "boolean") s.exportEnabled = v.exportEnabled;
    if (typeof v.theme === "string" && THEMES.has(v.theme)) {
      s.theme = v.theme;
    }
    return s;
  }
  var COLOR_PALETTE_SIZE = 8;
  function validateFolder(v, index) {
    if (!isObject(v)) return null;
    const id = sanitizeId(v.id);
    if (id === null) return null;
    const name = sanitizeLine(v.name, FOLDER_NAME_MAX);
    if (name === "") return null;
    const colorId = typeof v.colorId === "number" && Number.isInteger(v.colorId) && v.colorId >= 0 && v.colorId < COLOR_PALETTE_SIZE ? v.colorId : 0;
    const collapsed = typeof v.collapsed === "boolean" ? v.collapsed : false;
    const order = finiteNonNeg(v.order, index);
    const createdAt = finiteNonNeg(v.createdAt, 0);
    return { id, name, colorId, collapsed, order, createdAt };
  }
  function validateFolders(v) {
    if (!Array.isArray(v)) return [];
    const bounded = v.slice(0, PRO_FOLDER_CAP);
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < bounded.length; i++) {
      const rec = validateFolder(bounded[i], i);
      if (rec === null || seen.has(rec.id)) continue;
      seen.add(rec.id);
      out.push(rec);
    }
    return out;
  }
  function validatePrompt(v) {
    if (!isObject(v)) return null;
    const id = sanitizeId(v.id);
    if (id === null) return null;
    if (typeof v.body !== "string") return null;
    const body = sanitizeBody(v.body, PROMPT_BODY_MAX);
    if (body === "") return null;
    const title = sanitizeLine(v.title, PROMPT_TITLE_MAX);
    const createdAt = finiteNonNeg(v.createdAt, 0);
    const updatedAt = finiteNonNeg(v.updatedAt, createdAt);
    return { id, title, body, createdAt, updatedAt };
  }
  function validatePrompts(v) {
    if (!Array.isArray(v)) return [];
    const bounded = v.slice(0, PRO_PROMPT_CAP);
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < bounded.length; i++) {
      const rec = validatePrompt(bounded[i]);
      if (rec === null || seen.has(rec.id)) continue;
      seen.add(rec.id);
      out.push(rec);
    }
    return out;
  }
  var CONVKEY_MAX = 160;
  function entrySeenAt(v) {
    return isObject(v) ? finiteNonNeg(v.seenAt, 0) : 0;
  }
  function validateConvEntry(v) {
    if (!isObject(v)) return null;
    const folderId = sanitizeId(v.folderId);
    if (folderId === null) return null;
    const lastTitle = sanitizeLine(v.lastTitle, MAX_STORED_STR);
    const seenAt = finiteNonNeg(v.seenAt, 0);
    return { folderId, lastTitle, seenAt };
  }
  function validateConvmap(v) {
    if (!isObject(v)) return {};
    let entries = Object.entries(v);
    if (entries.length > CONVMAP_CAP) {
      entries = entries.map(([key, val]) => ({ key, val, seen: entrySeenAt(val) })).sort((a, b) => b.seen - a.seen).slice(0, CONVMAP_CAP).map(({ key, val }) => [key, val]);
    }
    const out = {};
    for (const [key, val] of entries) {
      if (key.length === 0 || key.length > CONVKEY_MAX) continue;
      const entry = validateConvEntry(val);
      if (entry !== null) out[key] = entry;
    }
    return out;
  }

  // src/shared/storage.ts
  function isObject2(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  function isQuotaError(e) {
    const m = e instanceof Error ? e.message : String(e);
    return /quota/i.test(m);
  }
  async function storageGet(key) {
    try {
      const out = await chrome.storage.local.get(key);
      return out[key];
    } catch {
      return void 0;
    }
  }
  async function storageSet2(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return { ok: true };
    } catch (e) {
      return isQuotaError(e) ? { error: "quota" } : { error: "unknown" };
    }
  }
  function subscribeLocal(handler) {
    const listener = (changes, area) => {
      if (area === "local") handler(changes);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
  function uuid() {
    try {
      return crypto.randomUUID();
    } catch {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.floor(Math.random() * 16);
        const v = c === "x" ? r : r & 3 | 8;
        return v.toString(16);
      });
    }
  }
  async function rmw(key, sanitize, mutate) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = sanitize(await storageGet(key));
      const next = mutate(current) ?? current;
      const r = await storageSet2(key, next);
      if ("ok" in r) return r;
      if (r.error === "quota") return r;
    }
    return { error: "unknown" };
  }
  function defaultSettings() {
    return freshSettings();
  }
  function defaultFunnel() {
    return { schemaVersion: 1, installId: "", counters: {}, events: [], seen: {} };
  }
  function sanitizeSettings(raw) {
    return validateSettings(raw);
  }
  function sanitizeFolders(raw) {
    const out = validateFolders(raw);
    out.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    return out;
  }
  function sanitizePrompts(raw) {
    const out = validatePrompts(raw);
    for (const p of out) if (p.title === "") p.title = "Untitled prompt";
    out.sort((a, b) => a.createdAt - b.createdAt);
    return out;
  }
  function sanitizeConvmap(raw) {
    return validateConvmap(raw);
  }
  function gcConvmap(map, now = Date.now()) {
    const staleMs = CONVMAP_GC_DAYS * 24 * 60 * 60 * 1e3;
    for (const [key, e] of Object.entries(map)) {
      if (e.seenAt > 0 && now - e.seenAt > staleMs) delete map[key];
    }
    const keys = Object.keys(map);
    if (keys.length <= CONVMAP_CAP) return map;
    keys.sort((a, b) => (map[a]?.seenAt ?? 0) - (map[b]?.seenAt ?? 0));
    let excess = keys.length - CONVMAP_CAP;
    for (const key of keys) {
      if (excess <= 0) break;
      delete map[key];
      excess--;
    }
    return map;
  }
  async function getSettings() {
    return sanitizeSettings(await storageGet(K.settings));
  }
  async function getFolders() {
    return sanitizeFolders(await storageGet(K.folders));
  }
  async function getPrompts() {
    return sanitizePrompts(await storageGet(K.prompts));
  }
  async function getConvmap() {
    return sanitizeConvmap(await storageGet(K.convmap));
  }
  var FUNNEL_EVENT_NAMES = /* @__PURE__ */ new Set([
    "install",
    "onboarding_complete",
    "first_value",
    "feature_used",
    "cap_hit",
    "paywall_shown",
    "cta_click",
    "nudge_dismiss",
    "key_verified",
    "verify_failed"
  ]);
  var MAX_FUNNEL_EVENTS = 120;
  var MAX_FUNNEL_STR = 64;
  function funnelStr(v) {
    return typeof v === "string" && v !== "" ? v.slice(0, MAX_FUNNEL_STR) : void 0;
  }
  function funnelCount(v) {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : void 0;
  }
  function sanitizeFunnelEvent(e) {
    if (!isObject2(e) || typeof e.name !== "string" || !FUNNEL_EVENT_NAMES.has(e.name)) return null;
    if (typeof e.t !== "number" || !Number.isFinite(e.t)) return null;
    const rec = { name: e.name, t: e.t };
    const installId = funnelStr(e.installId);
    if (installId !== void 0) rec.installId = installId;
    const surface = funnelStr(e.surface);
    if (surface !== void 0) rec.surface = surface;
    const feature = funnelStr(e.feature);
    if (feature !== void 0) rec.feature = feature;
    const trigger = funnelStr(e.trigger);
    if (trigger !== void 0) rec.trigger = trigger;
    const reason = funnelStr(e.reason);
    if (reason !== void 0) rec.reason = reason;
    const plan = funnelStr(e.plan);
    if (plan !== void 0) rec.plan = plan;
    const tier2 = funnelStr(e.tier);
    if (tier2 !== void 0) rec.tier = tier2;
    const steps = funnelCount(e.steps);
    if (steps !== void 0) rec.steps = steps;
    const count = funnelCount(e.count);
    if (count !== void 0) rec.count = count;
    return rec;
  }
  async function readFunnel() {
    const v = await storageGet(K.funnel);
    if (!isObject2(v) || v.schemaVersion !== 1 || !isObject2(v.counters)) return defaultFunnel();
    const counters = {};
    for (const key of Object.keys(v.counters)) {
      if (!FUNNEL_EVENT_NAMES.has(key)) continue;
      const n = funnelCount(v.counters[key]);
      if (n !== void 0) counters[key] = n;
    }
    const seen = {};
    if (isObject2(v.seen)) {
      for (const key of Object.keys(v.seen)) {
        if (FUNNEL_EVENT_NAMES.has(key) && v.seen[key] === true) {
          seen[key] = true;
        }
      }
    }
    const events = [];
    if (Array.isArray(v.events)) {
      for (const raw of v.events.slice(-MAX_FUNNEL_EVENTS)) {
        const rec = sanitizeFunnelEvent(raw);
        if (rec !== null) events.push(rec);
      }
    }
    const installId = typeof v.installId === "string" && /^[A-Za-z0-9-]{0,64}$/.test(v.installId) ? v.installId : "";
    return { schemaVersion: 1, installId, counters, events, seen };
  }

  // src/shared/license.ts
  var KEY_RE = /^ZOVO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  function hexEq(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }
  var KEY_INPUT_MAX = 128;
  function normalizeKey(raw) {
    if (typeof raw !== "string") return null;
    if (raw.length > KEY_INPUT_MAX) return null;
    const key = raw.trim().toUpperCase();
    return KEY_RE.test(key) ? key : null;
  }
  function keyIsValid(key) {
    if (typeof key !== "string") return false;
    if (key.length > 64) return false;
    return KEY_RE.test(key.trim().toUpperCase());
  }
  async function readLicenseBlob() {
    try {
      const out = await chrome.storage.local.get(K.license);
      return out[K.license];
    } catch {
      return null;
    }
  }
  function isObject3(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  async function getTier() {
    const blob = await readLicenseBlob();
    if (!isObject3(blob) || blob.tier !== "pro") return "free";
    const key = normalizeKey(blob.key);
    if (key === null || !keyIsValid(key)) return "free";
    if (typeof blob.checksum !== "string") return "free";
    const m = KEY_RE.exec(key);
    if (!hexEq(blob.checksum, m[4])) return "free";
    return "pro";
  }

  // src/shared/convkey.ts
  var CONVKEY_RES = [
    /\/chat[s]?\/([0-9a-fA-F-]{8,})/,
    /\/c\/([0-9a-fA-F-]{8,})/,
    /\/conversation[s]?\/([0-9a-fA-F-]{8,})/
  ];
  var MAX_CONVKEY_LEN = 256;
  function convKeyFromPath(pathname) {
    if (typeof pathname !== "string" || pathname === "") return "";
    for (const re of CONVKEY_RES) {
      const m = re.exec(pathname);
      if (m !== null && typeof m[1] === "string") return m[1].slice(0, MAX_CONVKEY_LEN);
    }
    return pathname.slice(0, MAX_CONVKEY_LEN);
  }
  function convKeyFromHref(href) {
    if (typeof href !== "string" || href === "") return "";
    try {
      const u = new URL(href, ["https", "://chat.mistral.ai/"].join(""));
      return convKeyFromPath(u.pathname);
    } catch {
      return "";
    }
  }
  function currentConvKey() {
    try {
      return convKeyFromPath(window.location.pathname);
    } catch {
      return "";
    }
  }
  var TITLE_NOISE_RE = /\s*[|·-]\s*(Le Chat|Mistral).*$/i;
  var MAX_TITLE = 200;
  function sanitizeTitle(raw) {
    if (typeof raw !== "string") return "";
    const s = raw.replace(TITLE_NOISE_RE, "").replace(/\s+/g, " ");
    return sanitizeLine(s, MAX_TITLE);
  }

  // src/shared/selectors.ts
  var REGISTRY = {
    sidebar: [
      { q: 'nav:has(a[href*="/chat/"])', note: "semantic nav holding chat links" },
      { q: '[role="navigation"]:has(a[href*="/chat/"])', note: "aria navigation landmark" },
      { q: 'aside:has(a[href*="/chat/"])', note: "aside holding chat links" },
      { q: "@anchor-climb", note: "climb chat anchors to deepest common container with >=3 rows" },
      { q: 'div[class*="sidebar" i]:has(a[href*="/chat/"])', note: "class-substring LAST resort" }
    ],
    convRows: [
      { q: 'a[href*="/chat/"]', note: "chat links", scope: "sidebar", many: true },
      { q: 'a[href*="/c/"]', note: "short-path conversation links", scope: "sidebar", many: true },
      { q: "li:has(a[href]) a", note: "list-item anchors", scope: "sidebar", many: true }
    ],
    convTitle: [
      { q: "@document-title", note: "document.title minus the Le Chat/Mistral suffix" },
      { q: '[aria-current="page"]', note: "current row label in sidebar" },
      { q: "main h1", note: "heading in main" }
    ],
    composer: [
      { q: 'textarea[placeholder*="essage" i]', note: "message placeholder (any locale spelling)" },
      { q: "form textarea", note: "textarea inside the composer form" },
      { q: '[contenteditable="true"][role="textbox"]', note: "rich textbox" },
      { q: '[contenteditable="true"]', note: "any contenteditable" },
      { q: "textarea", note: "bare textarea LAST resort" }
    ],
    msgList: [
      { q: 'main [data-testid*="conversation" i]', note: "testid conversation container" },
      { q: 'main [class*="thread" i]', note: "thread class substring" },
      { q: "@scroll-ancestor", note: "scrollable ancestor of the last msgTurns hit" },
      { q: "main", note: "main landmark LAST resort" }
    ],
    msgTurns: [
      { q: "[data-message-author]", note: "author-tagged turns", scope: "msgList", many: true },
      { q: "[data-role]", note: "role-tagged turns", scope: "msgList", many: true },
      { q: "article", note: "article turns", scope: "msgList", many: true },
      {
        q: "@child-heuristic",
        note: "direct children holding a pre/p block, alternating roles",
        scope: "msgList",
        many: true
      }
    ],
    turnRole: [
      { q: "@turn-role", note: "per-turn resolution at scrape time \u2014 never resolved in resolveAll" }
    ]
  };
  function safeQuery(root, q) {
    try {
      return root.querySelector(q);
    } catch {
      return null;
    }
  }
  function safeQueryAll(root, q) {
    try {
      return Array.from(root.querySelectorAll(q));
    } catch {
      return [];
    }
  }
  function anchorClimb(doc) {
    const anchors = safeQueryAll(doc, 'a[href*="/chat/"]');
    if (anchors.length < 3) return null;
    const counts = /* @__PURE__ */ new Map();
    for (const a of anchors) {
      const box = a.closest('nav,aside,[role="navigation"]');
      if (box !== null) counts.set(box, (counts.get(box) ?? 0) + 1);
    }
    let best = null;
    let bestDepth = -1;
    for (const [box, n] of counts) {
      if (n < 3) continue;
      let depth = 0;
      for (let p = box.parentElement; p !== null; p = p.parentElement) depth++;
      if (depth > bestDepth) {
        best = box;
        bestDepth = depth;
      }
    }
    return best;
  }
  function scrollAncestor(doc, resolved) {
    const turns = resolved.msgTurns?.value;
    if (turns === void 0 || turns === null || turns.kind !== "elements" || turns.els.length === 0) {
      return null;
    }
    let node = turns.els[turns.els.length - 1]?.parentElement ?? null;
    const view = doc.defaultView;
    if (view === null) return null;
    let hops = 0;
    while (node !== null && hops < 32) {
      hops++;
      try {
        const oy = view.getComputedStyle(node).overflowY;
        if (oy === "auto" || oy === "scroll") return node;
      } catch {
        return null;
      }
      node = node.parentElement;
    }
    return null;
  }
  function childHeuristic(scope) {
    const out = [];
    for (const child of Array.from(scope.children)) {
      if (safeQuery(child, "pre,p") !== null) out.push(child);
    }
    return out;
  }
  function runCandidate(c, doc, scopeRoot, resolved) {
    const root = c.scope !== void 0 && scopeRoot !== null ? scopeRoot : doc;
    if (c.q === "@anchor-climb") {
      const el3 = anchorClimb(doc);
      return el3 === null ? null : { kind: "element", el: el3 };
    }
    if (c.q === "@document-title") {
      const text = sanitizeTitle(doc.title);
      return text === "" ? null : { kind: "text", text };
    }
    if (c.q === "@scroll-ancestor") {
      const el3 = scrollAncestor(doc, resolved);
      return el3 === null ? null : { kind: "element", el: el3 };
    }
    if (c.q === "@child-heuristic") {
      if (scopeRoot === null) return null;
      const els = childHeuristic(scopeRoot);
      return els.length === 0 ? null : { kind: "elements", els };
    }
    if (c.q === "@turn-role") return null;
    if (c.many === true) {
      const els = safeQueryAll(root, c.q);
      return els.length === 0 ? null : { kind: "elements", els };
    }
    const el2 = safeQuery(root, c.q);
    if (el2 === null) return null;
    return { kind: "element", el: el2 };
  }
  function sane(id, value) {
    if (value.kind === "element") {
      if (!value.el.isConnected) return false;
      if (id === "sidebar") {
        return safeQuery(value.el, 'a[href*="/chat/"]') !== null || safeQuery(value.el, 'a[href*="/c/"]') !== null;
      }
      return true;
    }
    if (value.kind === "elements") {
      return value.els.length > 0 && value.els.every((el2) => el2.isConnected);
    }
    return value.text !== "";
  }
  var memoryCache = {};
  function persistCache() {
    try {
      void chrome.storage.local.set({ [K.selcache]: memoryCache });
    } catch {
    }
  }
  async function loadCache() {
    try {
      const out = await chrome.storage.local.get(K.selcache);
      const raw = out[K.selcache];
      if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
        const clean = {};
        for (const [key, v] of Object.entries(raw)) {
          if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 64) clean[key] = v;
        }
        return clean;
      }
    } catch {
    }
    return {};
  }
  var RESOLVE_ORDER = [
    "sidebar",
    "convRows",
    "convTitle",
    "composer",
    "msgList",
    "msgTurns"
  ];
  function scopeRootFor(id, resolved) {
    if (id === "convRows") {
      const v = resolved.sidebar?.value;
      return v !== void 0 && v !== null && v.kind === "element" ? v.el : null;
    }
    if (id === "msgTurns") {
      const v = resolved.msgList?.value;
      return v !== void 0 && v !== null && v.kind === "element" ? v.el : null;
    }
    return null;
  }
  function resolveOne(id, doc, resolved) {
    const candidates = REGISTRY[id];
    const scopeRoot = scopeRootFor(id, resolved);
    const scoped = candidates.some((c) => c.scope !== void 0);
    if (scoped && scopeRoot === null) {
      return { id, status: "degraded", value: null, candidateIndex: -1 };
    }
    const cached = memoryCache[id];
    const order = [];
    if (cached !== void 0 && cached >= 0 && cached < candidates.length) order.push(cached);
    for (let i = 0; i < candidates.length; i++) {
      if (i !== cached) order.push(i);
    }
    for (const i of order) {
      const c = candidates[i];
      if (c === void 0) continue;
      let value = null;
      try {
        value = runCandidate(c, doc, scopeRoot, resolved);
      } catch {
        value = null;
      }
      if (value === null) continue;
      if (id === "convTitle" && value.kind === "element") {
        const text = sanitizeTitle(value.el.textContent ?? "");
        if (text === "") continue;
        value = { kind: "text", text };
      }
      if (!sane(id, value)) continue;
      if (memoryCache[id] !== i) {
        memoryCache[id] = i;
        persistCache();
      }
      return { id, status: "resolved", value, candidateIndex: i };
    }
    if (memoryCache[id] !== void 0) {
      delete memoryCache[id];
      persistCache();
    }
    return { id, status: "degraded", value: null, candidateIndex: -1 };
  }
  async function resolveAll(doc = document) {
    const stored = await loadCache();
    memoryCache = { ...stored, ...memoryCache };
    const resolved = {};
    for (const id of RESOLVE_ORDER) {
      resolved[id] = resolveOne(id, doc, resolved);
    }
    return resolved;
  }
  async function resolveFeature(id, doc = document, resolved = {}) {
    if (id === "turnRole") {
      return { id, status: "degraded", value: null, candidateIndex: -1 };
    }
    if (id === "convRows" && resolved.sidebar === void 0) {
      resolved.sidebar = resolveOne("sidebar", doc, resolved);
    }
    if (id === "msgTurns" && resolved.msgList === void 0) {
      resolved.msgList = resolveOne("msgList", doc, resolved);
    }
    return resolveOne(id, doc, resolved);
  }
  var ASSISTANT_ARIA_RE = /le chat|mistral|assistant/i;
  var USER_ARIA_RE = /you|user/i;
  function resolveTurnRole(turn, index, flipParity) {
    const attr = turn.getAttribute("data-message-author") ?? turn.getAttribute("data-role") ?? "";
    if (ASSISTANT_ARIA_RE.test(attr)) return "Le Chat";
    if (USER_ARIA_RE.test(attr)) return "User";
    const labelled = turn.querySelector("[aria-label]");
    const aria = labelled !== null ? labelled.getAttribute("aria-label") ?? "" : "";
    if (ASSISTANT_ARIA_RE.test(aria)) return "Le Chat";
    if (USER_ARIA_RE.test(aria)) return "User";
    const even = index % 2 === 0;
    return even !== flipParity ? "User" : "Le Chat";
  }
  function firstTurnIsAssistant(turn) {
    const attr = turn.getAttribute("data-message-author") ?? turn.getAttribute("data-role") ?? "";
    if (ASSISTANT_ARIA_RE.test(attr)) return true;
    if (USER_ARIA_RE.test(attr)) return false;
    const labelled = turn.querySelector("[aria-label]");
    const aria = labelled !== null ? labelled.getAttribute("aria-label") ?? "" : "";
    return ASSISTANT_ARIA_RE.test(aria);
  }

  // src/content/styles.ts
  var LECH_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.lech3a91-root {
  --p: #d147d1; --pd: #ab2bab; --pl: #e48be4; --p50: #fbeefb; --acc: #8c47d1;
  --onp: #2b0a2b; --onpd: #ffffff;
  --bg: #fbf9fb; --card: #ffffff; --tx: #2b0a2b; --tx2: #6b5566; --tx3: #97839a;
  --bd: #e8e3e8; --ok: #1d7a4f; --warn: #9a6a00;
  --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --r: 10px;
  --shadow: 0 2px 6px rgba(43,10,43,.08), 0 14px 34px -14px rgba(43,10,43,.28);
  font-family: var(--font); font-size: 13px; line-height: 1.45; color: var(--tx);
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .lech3a91-root:not([data-lech3a91-theme="light"]) {
    --bg: #1c1020; --card: #241426; --tx: #f5e9f4; --tx2: #c9b3c7; --tx3: #9d8799;
    --bd: #3d2a40; --p50: #33152f;
    --shadow: 0 2px 6px rgba(0,0,0,.4), 0 14px 34px -14px rgba(0,0,0,.6);
  }
}
.lech3a91-root[data-lech3a91-theme="dark"] {
  --bg: #1c1020; --card: #241426; --tx: #f5e9f4; --tx2: #c9b3c7; --tx3: #9d8799;
  --bd: #3d2a40; --p50: #33152f;
  --shadow: 0 2px 6px rgba(0,0,0,.4), 0 14px 34px -14px rgba(0,0,0,.6);
}

/* ---------------------------------------------------------------- panel */
.lech3a91-panel {
  position: fixed; width: 260px; max-height: 70vh; z-index: 2147483646;
  display: flex; flex-direction: column;
  background: var(--bg); color: var(--tx);
  border: 1px solid var(--bd); border-radius: 14px; box-shadow: var(--shadow);
  overflow: hidden;
}
.lech3a91-panel[hidden] { display: none; }
.lech3a91-body { overflow-y: auto; overscroll-behavior: contain; }

.lech3a91-head {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  background: var(--card); border-bottom: 1px solid var(--bd); flex: none;
}
.lech3a91-mark {
  width: 22px; height: 22px; border-radius: 6px; flex: none;
  background: var(--p); color: var(--onp);
  display: grid; place-items: center;
}
.lech3a91-mark svg { display: block; }
.lech3a91-title { font-weight: 700; font-size: 13px; letter-spacing: -.01em; }
.lech3a91-title small { display: block; font-weight: 500; font-size: 10.5px; color: var(--tx3); }
.lech3a91-head .lech3a91-spacer { flex: 1; }

/* ------------------------------------------------------------------ rail */
.lech3a91-rail {
  position: fixed; left: 0; top: 34vh; width: 36px; height: 44px; z-index: 2147483646;
  border: 1px solid var(--bd); border-left: none; border-radius: 0 12px 12px 0;
  background: var(--p); color: var(--onp); cursor: pointer;
  display: grid; place-items: center; box-shadow: var(--shadow);
  font: inherit;
}
.lech3a91-rail[hidden] { display: none; }
.lech3a91-rail:hover { background: var(--pl); }

/* -------------------------------------------------------------- sections */
.lech3a91-sec { border-bottom: 1px solid var(--bd); padding: 8px 10px 10px; }
.lech3a91-sec:last-child { border-bottom: none; }
.lech3a91-sechead {
  display: flex; align-items: center; gap: 6px; width: 100%;
  background: none; border: none; cursor: pointer; font: inherit;
  color: var(--tx); font-weight: 700; font-size: 11px; letter-spacing: .07em;
  text-transform: uppercase; padding: 2px 0 8px;
}
.lech3a91-sechead .lech3a91-count { color: var(--tx3); font-weight: 600; letter-spacing: 0; text-transform: none; }
.lech3a91-sechead .lech3a91-chev { margin-left: auto; color: var(--tx3); transition: transform .15s; }
.lech3a91-sechead[aria-expanded="false"] .lech3a91-chev { transform: rotate(-90deg); }

/* --------------------------------------------------------------- folders */
.lech3a91-chip {
  display: flex; align-items: center; gap: 7px; width: 100%;
  padding: 6px 8px; border: 1px solid var(--bd); border-radius: var(--r);
  background: var(--card); cursor: pointer; font: inherit; color: var(--tx);
  text-align: left; margin-bottom: 5px;
}
.lech3a91-chip:hover { border-color: var(--pl); }
.lech3a91-chip.lech3a91-drop { border-color: var(--p); border-style: dashed; background: var(--p50); }
.lech3a91-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--bd); }
.lech3a91-chipname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.lech3a91-chipcount { color: var(--tx3); font-size: 11px; flex: none; }
.lech3a91-chipbtns { display: none; gap: 2px; flex: none; }
.lech3a91-chip:hover .lech3a91-chipbtns, .lech3a91-chip:focus-within .lech3a91-chipbtns { display: flex; }

.lech3a91-convs { margin: -2px 0 6px 12px; border-left: 2px solid var(--bd); padding-left: 8px; }
.lech3a91-conv {
  display: flex; align-items: center; gap: 6px; padding: 3px 4px;
  font-size: 12px; color: var(--tx2); border-radius: 6px;
}
.lech3a91-conv:hover { background: var(--p50); color: var(--tx); }
.lech3a91-convname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lech3a91-conv a { color: inherit; text-decoration: none; }
.lech3a91-conv a:hover { text-decoration: underline; }
.lech3a91-conv .lech3a91-iconbtn { visibility: hidden; }
.lech3a91-conv:hover .lech3a91-iconbtn, .lech3a91-conv:focus-within .lech3a91-iconbtn { visibility: visible; }

.lech3a91-swatches { display: flex; gap: 6px; padding: 4px 2px 8px; flex-wrap: wrap; }
.lech3a91-swatch {
  width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--bd);
  cursor: pointer; padding: 0;
}
.lech3a91-swatch[aria-pressed="true"] { border-color: var(--tx); }

/* --------------------------------------------------------------- buttons */
.lech3a91-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  font: inherit; font-weight: 600; font-size: 12.5px; cursor: pointer;
  border-radius: 9px; border: 1px solid transparent; padding: 7px 12px;
  transition: background .12s, border-color .12s;
}
.lech3a91-btn--primary { background: var(--p); color: var(--onp); width: 100%; }
.lech3a91-btn--primary:hover { background: var(--pl); }
.lech3a91-btn--ghost { background: transparent; color: var(--tx2); border-color: var(--bd); }
.lech3a91-btn--ghost:hover { color: var(--tx); border-color: var(--tx3); }
.lech3a91-btn--sm { padding: 4px 9px; font-size: 12px; }
.lech3a91-btn[disabled] { opacity: .55; cursor: default; }
.lech3a91-btnrow { display: flex; gap: 6px; margin-top: 6px; }

.lech3a91-iconbtn {
  display: inline-grid; place-items: center; width: 20px; height: 20px;
  border: none; border-radius: 5px; background: none; color: var(--tx3);
  cursor: pointer; padding: 0; font: inherit;
}
.lech3a91-iconbtn:hover { background: var(--p50); color: var(--tx); }

/* Focus rings \u2014 every interactive element in the panel shows a visible
   keyboard focus indicator (DESIGN-SYSTEM: focus-visible everywhere; --p on
   the panel surface clears the 3:1 non-text contrast minimum in both themes). */
.lech3a91-btn:focus-visible, .lech3a91-iconbtn:focus-visible,
.lech3a91-chip:focus-visible, .lech3a91-menuitem:focus-visible,
.lech3a91-swatch:focus-visible, .lech3a91-sechead:focus-visible,
.lech3a91-rail:focus-visible, .lech3a91-later:focus-visible,
.lech3a91-note a:focus-visible, .lech3a91-foot a:focus-visible,
.lech3a91-conv a:focus-visible {
  outline: 2px solid var(--p); outline-offset: 1px;
}

/* ---------------------------------------------------------------- forms */
.lech3a91-input, .lech3a91-area {
  width: 100%; font: inherit; font-size: 12.5px; color: var(--tx);
  background: var(--card); border: 1px solid var(--bd); border-radius: 8px;
  padding: 6px 8px; outline: none;
}
.lech3a91-area { min-height: 74px; resize: vertical; }
.lech3a91-input:focus, .lech3a91-area:focus { border-color: var(--p); box-shadow: 0 0 0 2px var(--p50); }
.lech3a91-form { display: flex; flex-direction: column; gap: 6px; margin-bottom: 6px; }
.lech3a91-label { font-size: 11px; font-weight: 600; color: var(--tx2); }

/* ----------------------------------------------------------------- notes */
.lech3a91-note {
  display: flex; flex-direction: column; gap: 6px;
  background: var(--p50); border: 1px solid var(--pl); border-radius: var(--r);
  padding: 8px 10px; margin: 6px 0; font-size: 12px; color: var(--tx);
}
.lech3a91-note[hidden] { display: none; }
.lech3a91-note .lech3a91-note-actions { display: flex; gap: 8px; align-items: center; }
.lech3a91-note a { color: var(--pd); font-weight: 700; text-decoration: none; }
.lech3a91-note a:hover { text-decoration: underline; }
.lech3a91-note .lech3a91-later { background: none; border: none; color: var(--tx3); cursor: pointer; font: inherit; font-size: 11.5px; margin-left: auto; }
.lech3a91-note .lech3a91-later:hover { color: var(--tx); }
.lech3a91-hint { font-size: 11px; color: var(--tx3); margin-top: 4px; }
.lech3a91-empty { font-size: 12px; color: var(--tx3); padding: 2px 0 6px; }
.lech3a91-readonly {
  background: var(--p50); border-bottom: 1px solid var(--bd);
  color: var(--warn); font-size: 11.5px; padding: 5px 12px; flex: none;
}
.lech3a91-readonly[hidden] { display: none; }

/* ----------------------------------------------------------------- locks */
.lech3a91-lock {
  display: inline-grid; place-items: center; width: 15px; height: 15px;
  border-radius: 4px; background: var(--p); color: var(--onp); flex: none;
}
.lech3a91-protag {
  font-size: 9px; font-weight: 800; letter-spacing: .06em; color: var(--onp);
  background: var(--p); border-radius: 4px; padding: 1px 4px; flex: none;
}

/* ------------------------------------------------------------------ menu */
.lech3a91-menuwrap { position: relative; }
.lech3a91-menu {
  position: absolute; right: 0; top: calc(100% + 4px); min-width: 180px;
  background: var(--card); border: 1px solid var(--bd); border-radius: var(--r);
  box-shadow: var(--shadow); padding: 4px; z-index: 5;
}
.lech3a91-menu[hidden] { display: none; }
.lech3a91-menuitem {
  display: flex; align-items: center; gap: 7px; width: 100%;
  padding: 7px 9px; border: none; border-radius: 7px; background: none;
  font: inherit; font-size: 12.5px; color: var(--tx); cursor: pointer; text-align: left;
}
.lech3a91-menuitem:hover { background: var(--p50); }
.lech3a91-menuitem .lech3a91-sub { margin-left: auto; font-size: 10.5px; color: var(--tx3); }

/* --------------------------------------------------------------- prompts */
.lech3a91-plist { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.lech3a91-pitem {
  border: 1px solid var(--bd); border-radius: var(--r); background: var(--card);
  padding: 7px 9px;
}
.lech3a91-pitem .lech3a91-phead { display: flex; align-items: center; gap: 6px; }
.lech3a91-pitem .lech3a91-ptitle { flex: 1; min-width: 0; font-weight: 600; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lech3a91-pitem .lech3a91-pbody { font-size: 11.5px; color: var(--tx2); margin-top: 3px; max-height: 3.9em; overflow: hidden; }
.lech3a91-prow { display: flex; gap: 4px; margin-top: 6px; }

/* ------------------------------------------------------------------ misc */
.lech3a91-spacer { flex: 1; }
.lech3a91-foot { padding: 8px 12px; background: var(--card); border-top: 1px solid var(--bd); flex: none; display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--tx3); }
.lech3a91-foot a { color: var(--pd); font-weight: 700; text-decoration: none; }
.lech3a91-foot a:hover { text-decoration: underline; }
.lech3a91-tier { font-weight: 800; letter-spacing: .05em; font-size: 10px; padding: 2px 6px; border-radius: 5px; background: var(--p50); color: var(--pd); }
.lech3a91-tier.lech3a91-tier--pro { background: var(--p); color: var(--onp); }

@media (prefers-reduced-motion: reduce) {
  .lech3a91-root * { animation: none !important; transition: none !important; }
}
`;

  // src/shared/i18n.ts
  function msg(name, fallback = "") {
    try {
      const m = chrome.i18n.getMessage(name);
      if (m !== "") return m;
    } catch {
    }
    return fallback;
  }
  function msgf(name, substitutions, fallback = "") {
    try {
      const m = chrome.i18n.getMessage(name, substitutions);
      if (m !== "") return m;
    } catch {
    }
    return fallback;
  }

  // src/content/host.ts
  var handles = null;
  var railExpanded = false;
  var MARK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  var RAIL_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  function mountHost(onRailExpand) {
    if (handles !== null) return handles;
    if (document.getElementById(HOST_ID) !== null) return null;
    try {
      const host = document.createElement("div");
      host.id = HOST_ID;
      host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;";
      const root = host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = LECH_CSS;
      root.appendChild(style);
      const wrap = document.createElement("div");
      wrap.className = "lech3a91-root";
      const panel = document.createElement("section");
      panel.className = "lech3a91-panel";
      panel.setAttribute("aria-label", "Le Chat Suite");
      panel.hidden = true;
      const head = document.createElement("header");
      head.className = "lech3a91-head";
      const mark = document.createElement("span");
      mark.className = "lech3a91-mark";
      mark.innerHTML = MARK_SVG;
      const title = document.createElement("div");
      title.className = "lech3a91-title";
      title.textContent = "Le Chat Suite";
      const subtitle = document.createElement("small");
      subtitle.textContent = "Folders \xB7 Prompts \xB7 Export";
      title.appendChild(subtitle);
      const spacer = document.createElement("span");
      spacer.className = "lech3a91-spacer";
      head.append(mark, title, spacer);
      const readonly = document.createElement("div");
      readonly.className = "lech3a91-readonly";
      readonly.textContent = msg("csReadonly", "Changes can\u2019t be saved right now (storage full).");
      readonly.hidden = true;
      const body = document.createElement("div");
      body.className = "lech3a91-body";
      const foot = document.createElement("footer");
      foot.className = "lech3a91-foot";
      panel.append(head, readonly, body, foot);
      const rail = document.createElement("button");
      rail.type = "button";
      rail.className = "lech3a91-rail";
      rail.setAttribute("aria-label", "Open Le Chat Suite");
      rail.innerHTML = RAIL_SVG;
      rail.hidden = true;
      rail.addEventListener("click", () => {
        railExpanded = true;
        try {
          onRailExpand();
        } catch {
        }
      });
      wrap.append(panel, rail);
      root.appendChild(wrap);
      document.documentElement.appendChild(host);
      handles = { host, root, panel, rail, containers: { head, readonly, body, foot } };
      return handles;
    } catch {
      return null;
    }
  }
  function unmountHost() {
    try {
      handles?.host.parentNode?.removeChild(handles.host);
    } catch {
    }
    handles = null;
    railExpanded = false;
  }
  function collapseToRail() {
    railExpanded = false;
    if (handles === null) return;
    try {
      handles.panel.hidden = true;
      handles.rail.hidden = false;
    } catch {
    }
  }
  function dockPanel(rect, visible) {
    if (handles === null) return;
    try {
      const { panel, rail } = handles;
      if (!visible) {
        panel.hidden = true;
        rail.hidden = true;
        return;
      }
      if (rect === null) {
        rail.hidden = false;
        panel.hidden = !railExpanded;
        if (railExpanded) {
          panel.style.left = "8px";
          panel.style.top = "30vh";
        }
        return;
      }
      rail.hidden = true;
      panel.hidden = false;
      const left = Math.max(0, Math.round(rect.right + 8));
      const top = Math.max(8, Math.round(rect.top + 56));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.maxHeight = `${Math.max(240, Math.round(rect.height - 64))}px`;
    } catch {
    }
  }
  function setTheme(theme) {
    if (handles === null) return;
    try {
      const wrap = handles.root.querySelector(".lech3a91-root");
      if (wrap === null) return;
      if (theme === "auto") wrap.removeAttribute("data-lech3a91-theme");
      else wrap.setAttribute("data-lech3a91-theme", theme);
    } catch {
    }
  }

  // src/content/ui-types.ts
  function freshUiState() {
    return {
      promptsOpen: false,
      exportOpen: false,
      moveMenuFor: null,
      newFolderOpen: false,
      editingFolderId: null,
      colorsFor: null,
      promptForm: null,
      promptQuery: "",
      composerNote: false,
      drafts: {}
    };
  }

  // src/shared/urls.ts
  var CHECKOUT_BASE = "https://zovo.one/pricing?utm_source=le-chat-suite&utm_medium=extension&utm_campaign=upgrade";
  function checkoutUrl(surface) {
    return CHECKOUT_BASE + "&utm_content=" + surface;
  }

  // src/shared/funnel.ts
  var sink = null;
  var queue = Promise.resolve();
  function enqueue(job) {
    const run = queue.then(job);
    queue = run.catch(() => {
    });
    return run;
  }
  var DETAIL_STR_CAP = 64;
  function cleanStr(v) {
    return typeof v === "string" && v !== "" ? v.slice(0, DETAIL_STR_CAP) : void 0;
  }
  function cleanNum(v) {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : void 0;
  }
  function buildRecord(name, detail) {
    const rec = { name, t: Date.now() };
    const surface = cleanStr(detail.surface);
    if (surface !== void 0) rec.surface = surface;
    const feature = cleanStr(detail.feature);
    if (feature !== void 0) rec.feature = feature;
    const trigger = cleanStr(detail.trigger);
    if (trigger !== void 0) rec.trigger = trigger;
    const reason = cleanStr(detail.reason);
    if (reason !== void 0) rec.reason = reason;
    const plan = cleanStr(detail.plan);
    if (plan !== void 0) rec.plan = plan;
    const tier2 = cleanStr(detail.tier);
    if (tier2 !== void 0) rec.tier = tier2;
    const steps = cleanNum(detail.steps);
    if (steps !== void 0) rec.steps = steps;
    const count = cleanNum(detail.count);
    if (count !== void 0) rec.count = count;
    return rec;
  }
  function append(f, name, rec) {
    f.counters[name] = (f.counters[name] ?? 0) + 1;
    f.events.push(rec);
    if (f.events.length > MAX_FUNNEL_EVENTS) f.events.splice(0, f.events.length - MAX_FUNNEL_EVENTS);
  }
  function pingSink(name, detail, rec) {
    try {
      if (sink === null) return;
      const d = { ...detail, t: rec.t };
      if (rec.installId !== void 0) d.installId = rec.installId;
      sink(name, d);
    } catch {
    }
  }
  async function emit(name, detail = {}) {
    const rec = buildRecord(name, detail);
    await enqueue(async () => {
      try {
        const f = await readFunnel();
        if (f.installId !== "") rec.installId = f.installId;
        append(f, name, rec);
        await storageSet2(K.funnel, f);
      } catch {
      }
    });
    pingSink(name, detail, rec);
  }
  async function emitOnce(name, detail = {}) {
    await enqueue(async () => {
      try {
        const f = await readFunnel();
        if (f.seen[name] === true) return;
        const rec = buildRecord(name, detail);
        if (f.installId !== "") rec.installId = f.installId;
        f.seen[name] = true;
        append(f, name, rec);
        await storageSet2(K.funnel, f);
        pingSink(name, detail, rec);
      } catch {
      }
    });
  }

  // src/shared/feature-gate.ts
  function folderCap(tier2) {
    return tier2 === "pro" ? PRO_FOLDER_CAP : FREE_FOLDER_CAP;
  }
  function promptCap(tier2) {
    return tier2 === "pro" ? PRO_PROMPT_CAP : FREE_PROMPT_CAP;
  }
  function canCreateFolder(tier2, count) {
    return count < folderCap(tier2) ? true : { paywall: "cap-folders" };
  }
  function canCreatePrompt(tier2, count) {
    return count < promptCap(tier2) ? true : { paywall: "cap-prompts" };
  }
  function canUsePdf(tier2) {
    return tier2 === "pro" ? true : { paywall: "export-pdf" };
  }
  function canUseColors(tier2) {
    return tier2 === "pro" ? true : { paywall: "sidebar" };
  }
  function usageLabel(tier2, count, cap) {
    return tier2 === "pro" ? `${count} (unlimited)` : `${count} of ${cap}`;
  }

  // src/content/dom.ts
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls !== void 0 && cls !== "") node.className = cls;
    if (text !== void 0) node.textContent = text;
    return node;
  }
  var LOCK_SVG = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  function lockBadge() {
    const s = el("span", "lech3a91-lock");
    s.innerHTML = LOCK_SVG;
    s.title = msg("csProFeature", "Unlocks with Pro");
    return s;
  }
  var X_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var PENCIL_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  var CHEVRON_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var SWAP_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3L4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/></svg>';
  function iconButton(svg, label) {
    const b = el("button", "lech3a91-iconbtn");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML = svg === "x" ? X_SVG : svg === "pencil" ? PENCIL_SVG : svg === "swap" ? SWAP_SVG : CHEVRON_SVG;
    return b;
  }

  // src/content/dnd.ts
  var payload = null;
  var sourceWired = false;
  function applyDragAttrs(rows) {
    for (const row of rows) {
      try {
        if (!(row instanceof HTMLElement)) continue;
        if (!row.isConnected) continue;
        if (row.getAttribute("data-lech3a91-drag") === "1" && row.draggable) continue;
        row.draggable = true;
        row.setAttribute("data-lech3a91-drag", "1");
      } catch {
      }
    }
  }
  function payloadFromRow(row) {
    const href = row instanceof HTMLAnchorElement ? row.href : row.getAttribute("href");
    if (href === null || href === "") return null;
    const convKey = convKeyFromHref(href);
    if (convKey === "") return null;
    return { convKey, title: sanitizeTitle(row.textContent ?? "") };
  }
  function initDragSource(doc = document) {
    if (sourceWired) return;
    sourceWired = true;
    doc.addEventListener(
      "dragstart",
      (e) => {
        try {
          const t = e.target;
          if (!(t instanceof Element)) return;
          const row = t.closest("[data-lech3a91-drag]");
          if (row === null) return;
          const p = payloadFromRow(row);
          if (p === null) return;
          payload = p;
          e.dataTransfer?.setData("text/plain", p.convKey);
          if (e.dataTransfer !== null) e.dataTransfer.effectAllowed = "link";
        } catch {
        }
      },
      true
    );
    doc.addEventListener(
      "dragend",
      () => {
        try {
          window.setTimeout(() => {
            payload = null;
          }, 0);
        } catch {
          payload = null;
        }
      },
      true
    );
  }
  function consumeDragPayload() {
    const p = payload;
    payload = null;
    return p;
  }
  var DROP_SEL = "[data-lech3a91-folder]";
  function wireDropTargets(container, onDrop) {
    let highlighted = null;
    const clearHighlight = () => {
      try {
        highlighted?.classList.remove("lech3a91-drop");
      } catch {
      }
      highlighted = null;
    };
    container.addEventListener("dragover", (e) => {
      try {
        if (payload === null) return;
        const t = e.target instanceof Element ? e.target.closest(DROP_SEL) : null;
        if (t === null) {
          clearHighlight();
          return;
        }
        e.preventDefault();
        if (e.dataTransfer !== null) e.dataTransfer.dropEffect = "link";
        if (highlighted !== t) {
          clearHighlight();
          highlighted = t;
          t.classList.add("lech3a91-drop");
        }
      } catch {
      }
    });
    container.addEventListener("dragleave", (e) => {
      try {
        const t = e.target instanceof Element ? e.target.closest(DROP_SEL) : null;
        if (t !== null && t === highlighted && e.relatedTarget === null) clearHighlight();
      } catch {
      }
    });
    container.addEventListener("drop", (e) => {
      try {
        const t = e.target instanceof Element ? e.target.closest(DROP_SEL) : null;
        clearHighlight();
        if (t === null) return;
        const folderId = t.getAttribute("data-lech3a91-folder");
        const p = consumeDragPayload();
        if (folderId === null || folderId === "" || p === null) return;
        e.preventDefault();
        onDrop(folderId, p);
      } catch {
      }
    });
  }

  // src/shared/palette.ts
  var FOLDER_COLORS = [
    "#b9a9b8",
    // 0 neutral (default)
    "#d147d1",
    // 1 primary magenta
    "#8c47d1",
    // 2 accent purple
    "#4770d1",
    // 3 blue
    "#3aa0c9",
    // 4 sky
    "#3d9e6e",
    // 5 green
    "#c98f2e",
    // 6 amber
    "#c95143"
    // 7 red
  ];
  function folderColor(colorId) {
    return FOLDER_COLORS[colorId] ?? FOLDER_COLORS[0] ?? "#b9a9b8";
  }

  // src/content/folders.ts
  async function finish(r, actions2) {
    if ("error" in r) actions2.writeFailed();
  }
  async function createFolder(ctx, ui2, actions2, name) {
    const clean = sanitizeTitle(name).slice(0, FOLDER_NAME_MAX);
    if (clean === "") return;
    const gate = canCreateFolder(ctx.tier, ctx.folders.length);
    if (gate !== true) {
      revealCap(ui2, actions2, "folders");
      return;
    }
    const folder = {
      id: uuid(),
      name: clean,
      colorId: 0,
      collapsed: false,
      order: ctx.folders.reduce((max, f) => Math.max(max, f.order), 0) + 1,
      createdAt: Date.now()
    };
    await finish(
      await rmw(K.folders, sanitizeFolders, (list) => {
        list.push(folder);
        return list;
      }),
      actions2
    );
    delete ui2.drafts["new-folder"];
    ui2.newFolderOpen = false;
    void emit("feature_used", { feature: "folders", surface: "sidebar" });
    void emitOnce("first_value", { feature: "folders", surface: "sidebar" });
  }
  async function renameFolder(actions2, id, name) {
    const clean = sanitizeTitle(name).slice(0, FOLDER_NAME_MAX);
    if (clean === "") return;
    await finish(
      await rmw(K.folders, sanitizeFolders, (list) => {
        const f = list.find((x) => x.id === id);
        if (f !== void 0) f.name = clean;
        return list;
      }),
      actions2
    );
  }
  async function deleteFolder(actions2, id) {
    await finish(
      await rmw(K.folders, sanitizeFolders, (list) => list.filter((f) => f.id !== id)),
      actions2
    );
    await finish(
      await rmw(K.convmap, sanitizeConvmap, (map) => {
        for (const [key, entry] of Object.entries(map)) {
          if (entry.folderId === id) delete map[key];
        }
        return map;
      }),
      actions2
    );
  }
  async function toggleCollapse(actions2, id) {
    await finish(
      await rmw(K.folders, sanitizeFolders, (list) => {
        const f = list.find((x) => x.id === id);
        if (f !== void 0) f.collapsed = !f.collapsed;
        return list;
      }),
      actions2
    );
  }
  async function setColor(ctx, ui2, actions2, id, colorId) {
    if (canUseColors(ctx.tier) !== true) {
      revealCap(ui2, actions2, "colors");
      return;
    }
    await finish(
      await rmw(K.folders, sanitizeFolders, (list) => {
        const f = list.find((x) => x.id === id);
        if (f !== void 0) f.colorId = colorId;
        return list;
      }),
      actions2
    );
  }
  async function assignConversation(actions2, convKey, title, folderId) {
    if (convKey === "" || folderId === "") return;
    await finish(
      await rmw(K.convmap, sanitizeConvmap, (map) => {
        map[convKey] = { folderId, lastTitle: sanitizeTitle(title), seenAt: Date.now() };
        gcConvmap(map);
        return map;
      }),
      actions2
    );
    void emit("feature_used", { feature: "assign", surface: "sidebar" });
  }
  async function unassignConversation(actions2, convKey) {
    await finish(
      await rmw(K.convmap, sanitizeConvmap, (map) => {
        delete map[convKey];
        return map;
      }),
      actions2
    );
  }
  function revealCap(ui2, actions2, which) {
    const wasHidden = ui2.drafts[`cap-open:${which}`] !== "1";
    ui2.drafts[`cap-open:${which}`] = "1";
    void emit("cap_hit", { feature: which, surface: "sidebar" });
    if (wasHidden) void emit("paywall_shown", { trigger: which, surface: "sidebar" });
    actions2.rerender();
  }
  function capNote(which, ctx, ui2) {
    const note = el("div", "lech3a91-note");
    const capId = which === "folders" ? "cap-folders" : "colors";
    note.setAttribute("data-lech3a91-cap", which);
    note.hidden = ui2.drafts[`cap-open:${which}`] !== "1";
    if (!note.hidden) note.setAttribute("data-cap-hit", capId);
    const text = el("div");
    if (which === "folders") {
      text.textContent = ctx.tier === "pro" ? `${folderCap(ctx.tier)}-folder limit reached.` : msgf(
        "csCapFolders",
        [String(ctx.folders.length), String(folderCap(ctx.tier))],
        "$1 of $2 folders used. Pro lifts the cap for good. $99 once, 14-day money-back."
      );
    } else {
      text.textContent = msg("csFolderColorsPro", "Folder colors are a Pro unlock. Spot any project at a glance. $99 once, 14-day money-back.");
    }
    const row = el("div", "lech3a91-note-actions");
    if (!(which === "folders" && ctx.tier === "pro")) {
      const a = el("a", "", msg("csUpgradeToPro", "Unlock Pro"));
      a.href = checkoutUrl(which === "folders" ? "cap-folders" : "sidebar");
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("data-act", "upgrade");
      a.setAttribute("data-surface", which === "folders" ? "cap-folders" : "sidebar");
      row.appendChild(a);
    }
    const later = el("button", "lech3a91-later", msg("csMaybeLater", "Maybe later"));
    later.type = "button";
    later.setAttribute("data-act", "cap-later");
    later.setAttribute("data-cap", which);
    row.appendChild(later);
    note.append(text, row);
    return note;
  }
  function convRowsFor(folder, convmap) {
    const rows = [];
    for (const [key, entry] of Object.entries(convmap)) {
      if (entry.folderId === folder.id) {
        rows.push({ key, title: entry.lastTitle || msg("csUntitledConversation", "Untitled chat"), seenAt: entry.seenAt });
      }
    }
    rows.sort((a, b) => b.seenAt - a.seenAt);
    return rows.map(({ key, title }) => ({ key, title }));
  }
  function renderMoveMenu(container, ctx, ui2) {
    const forKey = ui2.moveMenuFor;
    if (forKey === null) return;
    const convKey = forKey === "__current__" ? ctx.convKey : forKey;
    const currentFolder = convKey !== "" ? ctx.convmap[convKey]?.folderId : void 0;
    const wrap = el("div", "lech3a91-form");
    wrap.setAttribute("data-lech3a91-movemenu", "1");
    const label = el("div", "lech3a91-label", msg("csMoveToFolderLabel", "Move to folder:"));
    wrap.appendChild(label);
    const targets = ctx.folders.filter((f) => f.id !== currentFolder);
    if (targets.length === 0) {
      wrap.appendChild(el("div", "lech3a91-empty", msg("csNoOtherFolder", "No other folder yet. Create one above.")));
    }
    for (const f of targets.slice(0, 12)) {
      const b = el("button", "lech3a91-btn lech3a91-btn--ghost lech3a91-btn--sm", f.name);
      b.type = "button";
      b.setAttribute("data-act", "assign-to");
      b.setAttribute("data-folder", f.id);
      b.setAttribute("data-conv", forKey);
      wrap.appendChild(b);
    }
    const cancel = el("button", "lech3a91-btn lech3a91-btn--ghost lech3a91-btn--sm", msg("csCancel", "Cancel"));
    cancel.type = "button";
    cancel.setAttribute("data-act", "move-cancel");
    wrap.appendChild(cancel);
    container.appendChild(wrap);
  }
  function renderFolder(list, folder, ctx, ui2) {
    if (ui2.editingFolderId === folder.id) {
      const form = el("div", "lech3a91-form");
      const input = el("input", "lech3a91-input");
      input.maxLength = FOLDER_NAME_MAX;
      input.value = ui2.drafts[`rename:${folder.id}`] ?? folder.name;
      input.setAttribute("data-draft", `rename:${folder.id}`);
      input.setAttribute("aria-label", msg("csFolderName", "Folder name"));
      const row = el("div", "lech3a91-btnrow");
      const save = el("button", "lech3a91-btn lech3a91-btn--primary lech3a91-btn--sm", msg("csSave", "Save"));
      save.type = "button";
      save.style.width = "auto";
      save.setAttribute("data-act", "folder-rename-save");
      save.setAttribute("data-id", folder.id);
      const cancel = el("button", "lech3a91-btn lech3a91-btn--ghost lech3a91-btn--sm", msg("csCancel", "Cancel"));
      cancel.type = "button";
      cancel.setAttribute("data-act", "folder-rename-cancel");
      row.append(save, cancel);
      form.append(input, row);
      list.appendChild(form);
      return;
    }
    const chip = el("button", "lech3a91-chip");
    chip.type = "button";
    chip.setAttribute("data-act", "folder-collapse");
    chip.setAttribute("data-id", folder.id);
    chip.setAttribute("data-lech3a91-folder", folder.id);
    const dot = el("span", "lech3a91-dot");
    dot.style.background = folderColor(folder.colorId);
    const rows = convRowsFor(folder, ctx.convmap);
    const name = el("span", "lech3a91-chipname", folder.name);
    const count = el("span", "lech3a91-chipcount", String(rows.length));
    const btns = el("span", "lech3a91-chipbtns");
    const colorsBtn = iconButton("pencil", msg("csFolderColor", "Folder color"));
    colorsBtn.setAttribute("data-act", "colors-open");
    colorsBtn.setAttribute("data-id", folder.id);
    if (ctx.tier !== "pro") colorsBtn.appendChild(lockBadge());
    const delBtn = iconButton("x", msg("csDeleteFolder", "Delete folder (chats stay in Le Chat)"));
    delBtn.setAttribute("data-act", "folder-delete");
    delBtn.setAttribute("data-id", folder.id);
    btns.append(colorsBtn, delBtn);
    chip.append(dot, name, count, btns);
    list.appendChild(chip);
    if (ui2.colorsFor === folder.id) {
      const sw = el("div", "lech3a91-swatches");
      FOLDER_COLORS.forEach((hex, colorId) => {
        const b = el("button", "lech3a91-swatch");
        b.type = "button";
        b.style.background = hex;
        b.setAttribute("aria-pressed", colorId === folder.colorId ? "true" : "false");
        b.setAttribute("aria-label", `Color ${colorId + 1}`);
        b.title = ctx.tier === "pro" ? msgf("csColorN", String(colorId + 1), `Color ${colorId + 1}`) : msg("csFolderColorsPro", "Folder colors are a Pro unlock. Spot any project at a glance. $99 once, 14-day money-back.");
        b.setAttribute("data-act", "swatch");
        b.setAttribute("data-id", folder.id);
        b.setAttribute("data-color", String(colorId));
        sw.appendChild(b);
      });
      list.appendChild(sw);
    }
    if (folder.collapsed) return;
    const convs = el("div", "lech3a91-convs");
    if (rows.length === 0) {
      convs.appendChild(el("div", "lech3a91-empty", msg("csDragHint", "Drag a chat here, or use \u201CMove this chat\u201D.")));
    }
    for (const row of rows) {
      const item = el("div", "lech3a91-conv");
      const link = el("a", "lech3a91-convname", row.title);
      link.href = `/chat/${row.key}`;
      link.title = row.title;
      const moveBtn = iconButton("swap", msg("csMoveToAnother", "Move to another folder"));
      moveBtn.setAttribute("data-act", "conv-move");
      moveBtn.setAttribute("data-conv", row.key);
      const unBtn = iconButton("x", msg("csRemoveFromFolder", "Remove from folder"));
      unBtn.setAttribute("data-act", "conv-unassign");
      unBtn.setAttribute("data-conv", row.key);
      item.append(link, moveBtn, unBtn);
      convs.appendChild(item);
    }
    list.appendChild(convs);
  }
  function renderFoldersSection(container, ctx, ui2) {
    container.textContent = "";
    const head = el("div", "lech3a91-sechead");
    head.append(
      el("span", "", msg("csFolders", "Folders")),
      el("span", "lech3a91-count", `${ctx.folders.length}/${folderCap(ctx.tier)}`)
    );
    container.appendChild(head);
    const list = el("div");
    for (const folder of ctx.folders) renderFolder(list, folder, ctx, ui2);
    renderMoveMenu(list, ctx, ui2);
    if (ui2.newFolderOpen) {
      const form = el("div", "lech3a91-form");
      const input = el("input", "lech3a91-input");
      input.maxLength = FOLDER_NAME_MAX;
      input.placeholder = msg("csFolderName", "Folder name");
      input.value = ui2.drafts["new-folder"] ?? "";
      input.setAttribute("data-draft", "new-folder");
      input.setAttribute("aria-label", msg("csNewFolderName", "New folder name"));
      const row = el("div", "lech3a91-btnrow");
      const save = el("button", "lech3a91-btn lech3a91-btn--primary lech3a91-btn--sm", msg("csCreateFolder", "Create folder"));
      save.type = "button";
      save.style.width = "auto";
      save.setAttribute("data-act", "folder-save");
      const cancel = el("button", "lech3a91-btn lech3a91-btn--ghost lech3a91-btn--sm", msg("csCancel", "Cancel"));
      cancel.type = "button";
      cancel.setAttribute("data-act", "folder-cancel");
      row.append(save, cancel);
      form.append(input, row);
      list.appendChild(form);
    } else {
      const row = el("div", "lech3a91-btnrow");
      const add = el("button", "lech3a91-btn lech3a91-btn--ghost lech3a91-btn--sm", msg("csNewFolder", "+ New folder"));
      add.type = "button";
      add.setAttribute("data-act", "folder-new");
      if (ctx.readOnly) add.disabled = true;
      row.appendChild(add);
      if (ctx.convKey !== "") {
        const move = el(
          "button",
          "lech3a91-btn lech3a91-btn--ghost lech3a91-btn--sm",
          msg("csMoveThisChat", "Move this chat \u25B8")
        );
        move.type = "button";
        move.setAttribute("data-act", "move-current");
        move.title = `Assign \u201C${ctx.convTitle || "this conversation"}\u201D to a folder`;
        row.appendChild(move);
      }
      list.appendChild(row);
    }
    container.appendChild(list);
    container.appendChild(capNote("folders", ctx, ui2));
    container.appendChild(capNote("colors", ctx, ui2));
  }
  function handleFoldersAction(act, target, ctx, ui2, actions2) {
    const id = target.getAttribute("data-id") ?? "";
    const conv = target.getAttribute("data-conv") ?? "";
    switch (act) {
      case "folder-new":
        ui2.newFolderOpen = true;
        actions2.rerender();
        return true;
      case "folder-cancel":
        ui2.newFolderOpen = false;
        delete ui2.drafts["new-folder"];
        actions2.rerender();
        return true;
      case "folder-save":
        void createFolder(ctx, ui2, actions2, ui2.drafts["new-folder"] ?? "");
        return true;
      case "folder-collapse":
        if (id !== "") void toggleCollapse(actions2, id);
        return true;
      case "folder-rename":
        ui2.editingFolderId = id;
        actions2.rerender();
        return true;
      case "folder-rename-cancel":
        if (id !== "") delete ui2.drafts[`rename:${id}`];
        ui2.editingFolderId = null;
        actions2.rerender();
        return true;
      case "folder-rename-save":
        void renameFolder(actions2, id, ui2.drafts[`rename:${id}`] ?? "").then(() => {
          delete ui2.drafts[`rename:${id}`];
          ui2.editingFolderId = null;
        });
        return true;
      case "folder-delete": {
        if (target.getAttribute("data-confirm") === "1") {
          void deleteFolder(actions2, id);
        } else {
          target.setAttribute("data-confirm", "1");
          target.title = msg("csConfirmDeleteFolder", "Click again to delete (chats stay in Le Chat)");
          window.setTimeout(() => {
            try {
              target.removeAttribute("data-confirm");
            } catch {
            }
          }, 3e3);
        }
        return true;
      }
      case "colors-open":
        ui2.colorsFor = ui2.colorsFor === id ? null : id;
        actions2.rerender();
        return true;
      case "swatch": {
        const colorId = Number(target.getAttribute("data-color") ?? "0");
        if (Number.isInteger(colorId) && id !== "") void setColor(ctx, ui2, actions2, id, colorId);
        return true;
      }
      case "move-current":
        ui2.moveMenuFor = ui2.moveMenuFor === "__current__" ? null : "__current__";
        actions2.rerender();
        return true;
      case "conv-move":
        ui2.moveMenuFor = ui2.moveMenuFor === conv ? null : conv;
        actions2.rerender();
        return true;
      case "move-cancel":
        ui2.moveMenuFor = null;
        actions2.rerender();
        return true;
      case "assign-to": {
        const folderId = target.getAttribute("data-folder") ?? "";
        const forKey = conv === "__current__" ? ctx.convKey : conv;
        const title = conv === "__current__" ? ctx.convTitle : ctx.convmap[forKey]?.lastTitle ?? "";
        ui2.moveMenuFor = null;
        void assignConversation(actions2, forKey, title, folderId);
        return true;
      }
      case "conv-unassign":
        if (conv !== "") void unassignConversation(actions2, conv);
        return true;
      case "cap-later": {
        const which = target.getAttribute("data-cap") ?? "";
        if (which !== "") {
          delete ui2.drafts[`cap-open:${which}`];
          const note = target.closest(".lech3a91-note");
          if (note instanceof HTMLElement) note.hidden = true;
          void emit("nudge_dismiss", { feature: which, surface: "sidebar" });
        }
        actions2.rerender();
        return true;
      }
      default:
        return false;
    }
  }

  // src/content/composer.ts
  function isTextarea(el2) {
    return el2 instanceof HTMLTextAreaElement;
  }
  function isEditable(el2) {
    return el2 instanceof HTMLElement && el2.isContentEditable;
  }
  function insertTextarea(el2, body) {
    try {
      const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      if (proto === void 0 || proto.set === void 0) return false;
      const start = el2.selectionStart ?? el2.value.length;
      const end = el2.selectionEnd ?? el2.value.length;
      const next = el2.value.slice(0, start) + body + el2.value.slice(end);
      proto.set.call(el2, next);
      const caret = start + body.length;
      try {
        el2.setSelectionRange(caret, caret);
      } catch {
      }
      el2.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }
  function insertEditable(el2, body) {
    try {
      el2.focus();
    } catch {
    }
    try {
      if (document.execCommand("insertText", false, body)) return true;
    } catch {
    }
    try {
      const sel = window.getSelection();
      if (sel === null) return false;
      if (sel.rangeCount === 0 || !el2.contains(sel.anchorNode)) {
        const range2 = document.createRange();
        range2.selectNodeContents(el2);
        range2.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range2);
      }
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(body));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      el2.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }
  function insertIntoComposer(resolution, body) {
    if (body === "") return false;
    if (resolution === void 0 || resolution.status !== "resolved") return false;
    const v = resolution.value;
    if (v === null || v.kind !== "element") return false;
    const el2 = v.el;
    if (!el2.isConnected) return false;
    if (isTextarea(el2)) return insertTextarea(el2, body);
    if (isEditable(el2)) return insertEditable(el2, body);
    return false;
  }

  // src/content/prompts.ts
  var PREVIEW_MAX = 140;
  async function finish2(r, actions2) {
    if ("error" in r) actions2.writeFailed();
  }
  async function createPrompt(ctx, ui2, actions2, title, body) {
    const cleanTitle = title.trim().slice(0, PROMPT_TITLE_MAX) || msg("csUntitledPrompt", "Untitled prompt");
    const cleanBody = body.slice(0, PROMPT_BODY_MAX);
    if (cleanBody.trim() === "") return;
    const gate = canCreatePrompt(ctx.tier, ctx.prompts.length);
    if (gate !== true) {
      revealCap2(ctx, ui2, actions2);
      return;
    }
    const now = Date.now();
    const prompt = {
      id: uuid(),
      title: cleanTitle,
      body: cleanBody,
      createdAt: now,
      updatedAt: now
    };
    await finish2(
      await rmw(K.prompts, sanitizePrompts, (list) => {
        list.push(prompt);
        return list;
      }),
      actions2
    );
    ui2.promptForm = null;
    delete ui2.drafts["prompt-title"];
    delete ui2.drafts["prompt-body"];
    void emit("feature_used", { feature: "prompts", surface: "sidebar" });
    void emitOnce("first_value", { feature: "prompts", surface: "sidebar" });
  }
  async function updatePrompt(ui2, actions2, id, title, body) {
    const cleanBody = body.slice(0, PROMPT_BODY_MAX);
    if (cleanBody.trim() === "") return;
    await finish2(
      await rmw(K.prompts, sanitizePrompts, (list) => {
        const p = list.find((x) => x.id === id);
        if (p !== void 0) {
          p.title = title.trim().slice(0, PROMPT_TITLE_MAX) || msg("csUntitledPrompt", "Untitled prompt");
          p.body = cleanBody;
          p.updatedAt = Date.now();
        }
        return list;
      }),
      actions2
    );
    ui2.promptForm = null;
    delete ui2.drafts["prompt-title"];
    delete ui2.drafts["prompt-body"];
  }
  async function deletePrompt(actions2, id) {
    await finish2(
      await rmw(K.prompts, sanitizePrompts, (list) => list.filter((p) => p.id !== id)),
      actions2
    );
  }
  function revealCap2(ctx, ui2, actions2) {
    const wasHidden = ui2.drafts["cap-open:prompts"] !== "1";
    ui2.drafts["cap-open:prompts"] = "1";
    void emit("cap_hit", { feature: "cap-prompts", surface: "sidebar" });
    if (wasHidden) void emit("paywall_shown", { trigger: "cap-prompts", surface: "sidebar" });
    actions2.rerender();
  }
  function capNote2(ctx, ui2) {
    const note = el("div", "lech3a91-note");
    note.setAttribute("data-lech3a91-cap", "prompts");
    note.hidden = ui2.drafts["cap-open:prompts"] !== "1";
    if (!note.hidden) note.setAttribute("data-cap-hit", "cap-prompts");
    const text = el("div");
    text.textContent = ctx.tier === "pro" ? `${promptCap(ctx.tier)}-prompt limit reached.` : msgf(
      "csCapPrompts",
      [String(ctx.prompts.length), String(promptCap(ctx.tier))],
      "$1 of $2 prompts saved. Pro lifts the cap for good. $99 once, 14-day money-back."
    );
    const row = el("div", "lech3a91-note-actions");
    if (ctx.tier !== "pro") {
      const a = el("a", "", msg("csUpgradeToPro", "Unlock Pro"));
      a.href = checkoutUrl("cap-prompts");
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("data-act", "upgrade");
      a.setAttribute("data-surface", "cap-prompts");
      row.appendChild(a);
    }
    const later = el("button", "lech3a91-later", msg("csMaybeLater", "Maybe later"));
    later.type = "button";
    later.setAttribute("data-act", "prompt-cap-later");
    row.appendChild(later);
    note.append(text, row);
    return note;
  }
  function matches(p, q) {
    if (q === "") return true;
    const needle = q.toLowerCase();
    return p.title.toLowerCase().includes(needle) || p.body.toLowerCase().includes(needle);
  }
  function renderForm(container, ctx, ui2) {
    if (ui2.promptForm === null) return;
    const editing = ui2.promptForm.mode === "edit" ? ctx.prompts.find((p) => p.id === ui2.promptForm.id) : void 0;
    const form = el("div", "lech3a91-form");
    const title = el("input", "lech3a91-input");
    title.maxLength = PROMPT_TITLE_MAX;
    title.placeholder = msg("csPromptTitle", "Prompt title");
    title.value = ui2.drafts["prompt-title"] ?? editing?.title ?? "";
    title.setAttribute("data-draft", "prompt-title");
    title.setAttribute("aria-label", msg("csPromptTitle", "Prompt title"));
    const body = el("textarea", "lech3a91-area");
    body.maxLength = PROMPT_BODY_MAX;
    body.placeholder = msg("csPromptBodyHint", "Prompt text, inserted at the caret when you use it");
    body.value = ui2.drafts["prompt-body"] ?? editing?.body ?? "";
    body.setAttribute("data-draft", "prompt-body");
    body.setAttribute("aria-label", msg("csPromptBody", "Prompt text"));
    const row = el("div", "lech3a91-btnrow");
    const save = el(
      "button",
      "lech3a91-btn lech3a91-btn--primary lech3a91-btn--sm",
      editing !== void 0 ? msg("csSaveChanges", "Save changes") : msg("csSavePrompt", "Save prompt")
    );
    save.type = "button";
    save.style.width = "auto";
    save.setAttribute("data-act", "prompt-save");
    const cancel = el("button", "lech3a91-btn lech3a91-btn--ghost lech3a91-btn--sm", msg("csCancel", "Cancel"));
    cancel.type = "button";
    cancel.setAttribute("data-act", "prompt-cancel");
    row.append(save, cancel);
    form.append(title, body, row);
    container.appendChild(form);
  }
  function renderPromptsSection(container, ctx, ui2) {
    container.textContent = "";
    const head = el("button", "lech3a91-sechead");
    head.type = "button";
    head.setAttribute("data-act", "prompts-toggle");
    head.setAttribute("aria-expanded", ui2.promptsOpen ? "true" : "false");
    head.append(
      el("span", "", msg("csPrompts", "Prompts")),
      el("span", "lech3a91-count", `${ctx.prompts.length}/${promptCap(ctx.tier)}`),
      el("span", "lech3a91-chev")
    );
    container.appendChild(head);
    if (!ui2.promptsOpen) return;
    const search = el("input", "lech3a91-input");
    search.placeholder = msg("csSearchPrompts", "Search prompts");
    search.value = ui2.promptQuery;
    search.setAttribute("data-prompt-search", "1");
    search.setAttribute("aria-label", msg("csSearchPrompts", "Search prompts"));
    container.appendChild(search);
    const list = el("div", "lech3a91-plist");
    const shown = ctx.prompts.filter((p) => matches(p, ui2.promptQuery.trim()));
    if (shown.length === 0) {
      list.appendChild(
        el(
          "div",
          "lech3a91-empty",
          ctx.prompts.length === 0 ? msg("csNoPrompts", "No saved prompts yet. Save your first one above.") : msg("csNoPromptsMatch", "No prompts match that search.")
        )
      );
    }
    for (const p of shown.slice(0, 50)) {
      const item = el("div", "lech3a91-pitem");
      const phead = el("div", "lech3a91-phead");
      phead.appendChild(el("span", "lech3a91-ptitle", p.title));
      const editBtn = iconButton("pencil", msg("csEditPrompt", "Edit prompt"));
      editBtn.setAttribute("data-act", "prompt-edit");
      editBtn.setAttribute("data-id", p.id);
      const delBtn = iconButton("x", msg("csDeletePrompt", "Delete prompt"));
      delBtn.setAttribute("data-act", "prompt-delete");
      delBtn.setAttribute("data-id", p.id);
      phead.append(editBtn, delBtn);
      const preview = el("div", "lech3a91-pbody", p.body.slice(0, PREVIEW_MAX));
      const row = el("div", "lech3a91-prow");
      const use = el("button", "lech3a91-btn lech3a91-btn--primary lech3a91-btn--sm", msg("csInsert", "Insert"));
      use.type = "button";
      use.style.width = "auto";
      use.setAttribute("data-act", "prompt-insert");
      use.setAttribute("data-id", p.id);
      row.appendChild(use);
      item.append(phead, preview, row);
      list.appendChild(item);
    }
    container.appendChild(list);
    if (ui2.composerNote) {
      container.appendChild(el("div", "lech3a91-hint", msg("csClickComposer", "Click into the message box first.")));
    }
    renderForm(container, ctx, ui2);
    if (ui2.promptForm === null) {
      const row = el("div", "lech3a91-btnrow");
      const add = el("button", "lech3a91-btn lech3a91-btn--ghost lech3a91-btn--sm", msg("csNewPrompt", "+ New prompt"));
      add.type = "button";
      add.setAttribute("data-act", "prompt-new");
      if (ctx.readOnly) add.disabled = true;
      row.appendChild(add);
      container.appendChild(row);
    }
    container.appendChild(capNote2(ctx, ui2));
  }
  function handlePromptsAction(act, target, ctx, ui2, actions2) {
    const id = target.getAttribute("data-id") ?? "";
    switch (act) {
      case "prompts-toggle":
        ui2.promptsOpen = !ui2.promptsOpen;
        actions2.rerender();
        return true;
      case "prompt-new":
        if (canCreatePrompt(ctx.tier, ctx.prompts.length) !== true) {
          revealCap2(ctx, ui2, actions2);
          return true;
        }
        ui2.promptForm = { mode: "new" };
        delete ui2.drafts["prompt-title"];
        delete ui2.drafts["prompt-body"];
        actions2.rerender();
        return true;
      case "prompt-edit":
        if (ctx.prompts.some((p) => p.id === id)) {
          ui2.promptForm = { mode: "edit", id };
          delete ui2.drafts["prompt-title"];
          delete ui2.drafts["prompt-body"];
          actions2.rerender();
        }
        return true;
      case "prompt-cancel":
        ui2.promptForm = null;
        delete ui2.drafts["prompt-title"];
        delete ui2.drafts["prompt-body"];
        actions2.rerender();
        return true;
      case "prompt-save":
        if (ui2.promptForm !== null && ui2.promptForm.mode === "edit") {
          void updatePrompt(
            ui2,
            actions2,
            ui2.promptForm.id,
            ui2.drafts["prompt-title"] ?? "",
            ui2.drafts["prompt-body"] ?? ""
          );
        } else {
          void createPrompt(
            ctx,
            ui2,
            actions2,
            ui2.drafts["prompt-title"] ?? "",
            ui2.drafts["prompt-body"] ?? ""
          );
        }
        return true;
      case "prompt-delete":
        if (target.getAttribute("data-confirm") === "1") {
          void deletePrompt(actions2, id);
        } else {
          target.setAttribute("data-confirm", "1");
          target.title = msg("csConfirmDelete", "Click again to delete");
          window.setTimeout(() => {
            try {
              target.removeAttribute("data-confirm");
            } catch {
            }
          }, 3e3);
        }
        return true;
      case "prompt-insert": {
        const p = ctx.prompts.find((x) => x.id === id);
        if (p === void 0) return true;
        const ok = insertIntoComposer(ctx.resolutions.composer, p.body);
        ui2.composerNote = !ok;
        if (ok) {
          void emit("feature_used", { feature: "insert", surface: "sidebar" });
          void emitOnce("first_value", { feature: "insert", surface: "sidebar" });
        } else {
          actions2.rerender();
        }
        return true;
      }
      case "prompt-cap-later":
        delete ui2.drafts["cap-open:prompts"];
        void emit("nudge_dismiss", { feature: "cap-prompts", surface: "sidebar" });
        actions2.rerender();
        return true;
      default:
        return false;
    }
  }

  // src/shared/markdown.ts
  function dayStamp(d = /* @__PURE__ */ new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  var SLUG_MAX = 40;
  function slugify(title, max = SLUG_MAX) {
    const s = sanitizeTitle(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "");
    return s === "" ? "conversation" : s;
  }
  function exportFilename(conv) {
    return `le-chat-${slugify(conv.title)}-${dayStamp(new Date(conv.exportedAt))}.md`;
  }
  function fenceFor(text) {
    let longest = 0;
    let run = 0;
    for (const ch of text) {
      if (ch === "`") {
        run++;
        if (run > longest) longest = run;
      } else {
        run = 0;
      }
    }
    return "`".repeat(Math.max(3, longest + 1));
  }
  function serializeTurn(turn) {
    const parts = [`## ${turn.role}`];
    for (const b of turn.blocks) {
      if (b.t === "code") {
        const fence = fenceFor(b.text);
        const lang = /^[A-Za-z0-9+#-]{0,24}$/.test(b.lang) ? b.lang : "";
        parts.push(`${fence}${lang}
${b.text.replace(/\n+$/g, "")}
${fence}`);
      } else {
        const text = b.text.trim();
        if (text !== "") parts.push(text);
      }
    }
    return parts.join("\n\n");
  }
  function toMarkdown(conv) {
    const title = sanitizeTitle(conv.title) || "Untitled conversation";
    const header = [
      `# ${title}`,
      `_Exported from Mistral Le Chat \xB7 ${dayStamp(new Date(conv.exportedAt))} \xB7 ${conv.url}_`
    ];
    const body = conv.turns.map(serializeTurn).join("\n\n");
    return `${header.join("\n\n")}

${body}
`;
  }

  // src/content/scrape.ts
  var MAX_TURNS = 500;
  var MAX_BLOCK_TEXT = 5e4;
  function codeLang(pre) {
    const code = pre.querySelector("code");
    if (code === null) return "";
    for (const cls of Array.from(code.classList)) {
      const m = /^language-([A-Za-z0-9+#-]{1,24})$/.exec(cls);
      if (m !== null && typeof m[1] === "string") return m[1];
    }
    return "";
  }
  function serializeInline(root) {
    const out = [];
    let depth = 0;
    const walk = (node) => {
      if (depth > 64) return;
      if (node.nodeType === 3) {
        out.push((node.textContent ?? "").replace(/\s+/g, " "));
        return;
      }
      if (node.nodeType !== 1) return;
      const el2 = node;
      const tag = el2.tagName;
      if (tag === "PRE") return;
      if (tag === "BR") {
        out.push("\n");
        return;
      }
      if (tag === "CODE") {
        const text = (el2.textContent ?? "").replace(/`/g, "\\`").trim();
        if (text !== "") out.push(`\`${text}\``);
        return;
      }
      depth++;
      for (const child of Array.from(el2.childNodes)) walk(child);
      depth--;
    };
    walk(root);
    return out.join("").replace(/ +\n/g, "\n").replace(/\n +/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_BLOCK_TEXT);
  }
  function turnBlocks(turn) {
    const blocks = [];
    const seen = /* @__PURE__ */ new Set();
    const candidates = Array.from(turn.querySelectorAll("pre, p, ul, ol, h1, h2, h3, h4, blockquote"));
    let budget = 200;
    for (const el2 of candidates) {
      if (budget <= 0) break;
      budget--;
      if (seen.has(el2)) continue;
      seen.add(el2);
      if (el2.tagName === "PRE") {
        const text2 = (el2.textContent ?? "").replace(/\n+$/g, "").slice(0, MAX_BLOCK_TEXT);
        if (text2.trim() === "") continue;
        blocks.push({ t: "code", lang: codeLang(el2), text: text2 });
        continue;
      }
      if (el2.parentElement !== null && el2.parentElement.closest("ul,ol") !== null && seen.has(el2.parentElement.closest("ul,ol"))) {
        continue;
      }
      const text = serializeInline(el2);
      if (text === "") continue;
      blocks.push({ t: "p", text });
    }
    if (blocks.length === 0) {
      const text = serializeInline(turn);
      if (text !== "") blocks.push({ t: "p", text });
    }
    return blocks;
  }
  function scrapeConversation(resolutions2, convTitle) {
    try {
      const turnsRes = resolutions2.msgTurns;
      if (turnsRes === void 0 || turnsRes.status !== "resolved") return null;
      const v = turnsRes.value;
      if (v === null || v.kind !== "elements" || v.els.length === 0) return null;
      const heuristic = turnsRes.candidateIndex === 3;
      const els = v.els.slice(0, MAX_TURNS);
      const flip = els.length > 0 && els[0] !== void 0 ? firstTurnIsAssistant(els[0]) : false;
      const turns = [];
      for (let i = 0; i < els.length; i++) {
        const el2 = els[i];
        if (el2 === void 0) continue;
        const blocks = turnBlocks(el2);
        if (blocks.length === 0) continue;
        turns.push({ role: resolveTurnRole(el2, i, flip), blocks });
      }
      if (turns.length === 0) return null;
      return {
        title: sanitizeTitle(convTitle) || sanitizeTitle(document.title) || msg("csUntitledConversation", "Untitled chat"),
        url: window.location.href,
        exportedAt: Date.now(),
        turns,
        heuristic
      };
    } catch {
      return null;
    }
  }

  // src/content/export-menu.ts
  var PRINT_ATTR = "lech3a91-print";
  var PRINT_ROOT_ATTR = "data-lech3a91-print-root";
  var PDF_SAFETY_MS = 5e3;
  var BLOB_REVOKE_MS = 6e4;
  function downloadMarkdown(ctx, mount) {
    const conv = scrapeConversation(ctx.resolutions, ctx.convTitle);
    if (conv === null) return false;
    let url = "";
    try {
      const blob = new Blob([toMarkdown(conv)], { type: "text/markdown;charset=utf-8" });
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFilename(conv);
      a.rel = "noopener";
      if (mount !== null) mount.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
        }
      }, BLOB_REVOKE_MS);
      void emit("feature_used", { feature: "export-md", surface: "sidebar" });
      void emitOnce("first_value", { feature: "export", surface: "sidebar" });
      return true;
    } catch {
      if (url !== "") {
        try {
          URL.revokeObjectURL(url);
        } catch {
        }
      }
      return false;
    }
  }
  var printSafety = 0;
  function cleanupPrintAttrs() {
    try {
      document.documentElement.removeAttribute(PRINT_ATTR);
      const root = document.querySelector(`[${PRINT_ROOT_ATTR}]`);
      root?.removeAttribute(PRINT_ROOT_ATTR);
    } catch {
    }
    if (printSafety !== 0) {
      window.clearTimeout(printSafety);
      printSafety = 0;
    }
  }
  function printPdf(ctx) {
    if (canUsePdf(ctx.tier) !== true) return false;
    const listRes = ctx.resolutions.msgList;
    if (listRes === void 0 || listRes.status !== "resolved") return false;
    const v = listRes.value;
    if (v === null || v.kind !== "element" || !v.el.isConnected) return false;
    try {
      document.documentElement.setAttribute(PRINT_ATTR, "1");
      v.el.setAttribute(PRINT_ROOT_ATTR, "1");
      window.addEventListener("afterprint", cleanupPrintAttrs, { once: true });
      printSafety = window.setTimeout(cleanupPrintAttrs, PDF_SAFETY_MS);
      window.print();
      void emit("feature_used", { feature: "export-pdf", surface: "sidebar" });
      return true;
    } catch {
      cleanupPrintAttrs();
      return false;
    }
  }
  function revealPdfCap(ui2, actions2) {
    const wasHidden = ui2.drafts["cap-open:pdf"] !== "1";
    ui2.drafts["cap-open:pdf"] = "1";
    void emit("cap_hit", { feature: "export-pdf", surface: "sidebar" });
    if (wasHidden) void emit("paywall_shown", { trigger: "export-pdf", surface: "sidebar" });
    actions2.rerender();
  }
  function pdfCapNote(ui2) {
    const note = el("div", "lech3a91-note");
    note.setAttribute("data-lech3a91-cap", "pdf");
    note.hidden = ui2.drafts["cap-open:pdf"] !== "1";
    if (!note.hidden) note.setAttribute("data-cap-hit", "export-pdf");
    note.appendChild(el("div", "", msg("csPdfPro", "PDF export is a Pro unlock. Print-perfect transcripts in one click. $99 once, 14-day money-back.")));
    const row = el("div", "lech3a91-note-actions");
    const a = el("a", "", msg("csUpgradeToPro", "Unlock Pro"));
    a.href = checkoutUrl("export-pdf");
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("data-act", "upgrade");
    a.setAttribute("data-surface", "export-pdf");
    const later = el("button", "lech3a91-later", msg("csMaybeLater", "Maybe later"));
    later.type = "button";
    later.setAttribute("data-act", "pdf-cap-later");
    row.append(a, later);
    note.appendChild(row);
    return note;
  }
  function renderExportSection(container, ctx, ui2) {
    container.textContent = "";
    const exportable = ctx.resolutions.msgList?.status === "resolved" && ctx.resolutions.msgTurns?.status === "resolved";
    const head = el("div", "lech3a91-sechead");
    head.append(el("span", "", msg("csExport", "Export")), el("span", "lech3a91-chev"));
    container.appendChild(head);
    const md = el("button", "lech3a91-btn lech3a91-btn--primary", msg("csExportMd", "Export Markdown"));
    md.type = "button";
    md.setAttribute("data-act", "export-md");
    md.title = msg("csMdLoadedTitle", "Save the loaded chat as .md. Scroll up first to load older messages.");
    if (!exportable) {
      md.disabled = true;
      md.title = msg("csOpenConv", "Open a chat to export it");
    }
    container.appendChild(md);
    const row = el("div", "lech3a91-btnrow");
    const pdf = el("button", "lech3a91-btn lech3a91-btn--ghost lech3a91-btn--sm", msg("csExportPdf", "Export PDF"));
    pdf.type = "button";
    pdf.setAttribute("data-act", "export-pdf");
    pdf.title = exportable ? msg("csPdfTitle", "Save this chat as a print-ready PDF") : msg("csOpenConv", "Open a chat to export it");
    if (ctx.tier !== "pro") pdf.appendChild(lockBadge());
    row.appendChild(pdf);
    container.appendChild(row);
    container.appendChild(pdfCapNote(ui2));
  }
  function handleExportAction(act, target, ctx, ui2, actions2) {
    switch (act) {
      case "export-md": {
        const rootNode = target.getRootNode();
        downloadMarkdown(ctx, rootNode instanceof ShadowRoot ? rootNode : null);
        return true;
      }
      case "export-pdf":
        if (canUsePdf(ctx.tier) !== true) {
          revealPdfCap(ui2, actions2);
          return true;
        }
        printPdf(ctx);
        return true;
      case "pdf-cap-later":
        delete ui2.drafts["cap-open:pdf"];
        void emit("nudge_dismiss", { feature: "export-pdf", surface: "sidebar" });
        actions2.rerender();
        return true;
      default:
        return false;
    }
  }

  // src/content/sidebar-ui.ts
  var UPGRADE_SURFACES = /* @__PURE__ */ new Set([
    "onboarding",
    "options",
    "popup",
    "sidebar",
    "cap-folders",
    "cap-prompts",
    "export-pdf",
    "backup"
  ]);
  var wired = false;
  var sections = null;
  var footerImpressionSent = false;
  function resetUI() {
    wired = false;
    sections = null;
    footerImpressionSent = false;
  }
  function visibleBlocks(ctx) {
    const r = ctx.resolutions;
    return {
      folders: ctx.settings.foldersEnabled && r.sidebar?.status === "resolved" && r.convRows?.status === "resolved",
      prompts: ctx.settings.promptsEnabled && r.composer?.status === "resolved",
      export: ctx.settings.exportEnabled && r.msgList?.status === "resolved" && r.msgTurns?.status === "resolved"
    };
  }
  function renderUI(handles3, ctx, ui2, actions2) {
    try {
      const { body, foot, readonly } = handles3.containers;
      const blocks = visibleBlocks(ctx);
      const anyVisible = blocks.folders || blocks.prompts || blocks.export;
      if (sections === null) {
        sections = {
          folders: el("section", "lech3a91-sec"),
          prompts: el("section", "lech3a91-sec"),
          export: el("section", "lech3a91-sec")
        };
      }
      body.textContent = "";
      if (blocks.folders) {
        renderFoldersSection(sections.folders, ctx, ui2);
        body.appendChild(sections.folders);
      }
      if (blocks.prompts) {
        renderPromptsSection(sections.prompts, ctx, ui2);
        body.appendChild(sections.prompts);
      }
      if (blocks.export) {
        renderExportSection(sections.export, ctx, ui2);
        body.appendChild(sections.export);
      }
      if (!anyVisible) {
        body.appendChild(
          el("div", "lech3a91-empty", msg("csIdle", "Le Chat Suite is idle on this page state."))
        );
      }
      readonly.hidden = !ctx.readOnly;
      foot.textContent = "";
      const tier2 = el("span", "lech3a91-tier", ctx.tier === "pro" ? "PRO" : "FREE");
      if (ctx.tier === "pro") tier2.classList.add("lech3a91-tier--pro");
      const meters = el(
        "span",
        "",
        `${usageLabel(ctx.tier, ctx.folders.length, folderCap(ctx.tier))} folders \xB7 ${usageLabel(ctx.tier, ctx.prompts.length, promptCap(ctx.tier))} prompts`
      );
      foot.append(tier2, meters);
      if (ctx.tier !== "pro") {
        const a = el("a", "", msg("csUpgrade", "Unlock Pro"));
        a.href = checkoutUrl("sidebar");
        a.target = "_blank";
        a.rel = "noopener";
        a.setAttribute("data-act", "upgrade");
        a.setAttribute("data-surface", "sidebar");
        foot.appendChild(a);
        if (!footerImpressionSent) {
          footerImpressionSent = true;
          void emit("paywall_shown", { trigger: "sidebar-footer", surface: "sidebar" });
        }
      }
      setTheme(ctx.settings.theme);
      const sidebarRes = ctx.resolutions.sidebar;
      const sidebarEl = sidebarRes?.status === "resolved" && sidebarRes.value?.kind === "element" ? sidebarRes.value.el : null;
      let rect = null;
      if (sidebarEl !== null && sidebarEl.isConnected) {
        try {
          const r = sidebarEl.getBoundingClientRect();
          rect = r.width > 0 && r.height > 0 ? r : null;
        } catch {
          rect = null;
        }
      }
      dockPanel(rect, anyVisible);
    } catch (e) {
      console.warn("[lech3a91] render skipped:", e);
    }
  }
  function wireUI(handles3, getCtx, ui2, actions2) {
    if (wired) return;
    wired = true;
    const { body, foot, head } = handles3.containers;
    const collapse = el("button", "lech3a91-iconbtn");
    collapse.type = "button";
    collapse.setAttribute("aria-label", msg("csCollapse", "Collapse to a floating button"));
    collapse.title = "Collapse";
    collapse.textContent = "\u2013";
    collapse.addEventListener("click", () => {
      collapseToRail();
    });
    head.appendChild(collapse);
    const onDrop = (folderId, p) => {
      void assignConversation(actions2, p.convKey, p.title, folderId);
    };
    wireDropTargets(body, onDrop);
    const dispatch = (act, target) => {
      const ctx = getCtx();
      if (handleFoldersAction(act, target, ctx, ui2, actions2)) return true;
      if (handlePromptsAction(act, target, ctx, ui2, actions2)) return true;
      if (handleExportAction(act, target, ctx, ui2, actions2)) return true;
      return false;
    };
    const onClick = (e) => {
      try {
        const t = e.target instanceof Element ? e.target.closest("[data-act]") : null;
        if (!(t instanceof HTMLElement)) return;
        const act = t.getAttribute("data-act") ?? "";
        if (act === "upgrade") {
          const surface = t.getAttribute("data-surface") ?? "sidebar";
          void emit("cta_click", {
            surface: UPGRADE_SURFACES.has(surface) ? surface : "sidebar"
          });
          return;
        }
        dispatch(act, t);
      } catch {
      }
    };
    body.addEventListener("click", onClick);
    foot.addEventListener("click", onClick);
    body.addEventListener("input", (e) => {
      try {
        const t = e.target;
        if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement)) return;
        const draft = t.getAttribute("data-draft");
        if (draft !== null && draft !== "") {
          ui2.drafts[draft] = t.value;
          return;
        }
        if (t.getAttribute("data-prompt-search") === "1") {
          ui2.promptQuery = t.value;
          actions2.rerender();
          const fresh = body.querySelector('[data-prompt-search="1"]');
          if (fresh instanceof HTMLInputElement) {
            fresh.focus();
            try {
              fresh.setSelectionRange(fresh.value.length, fresh.value.length);
            } catch {
            }
          }
        }
      } catch {
      }
    });
    body.addEventListener("keydown", (e) => {
      try {
        if (!(e instanceof KeyboardEvent) || e.key !== "Enter") return;
        const t = e.target;
        if (!(t instanceof HTMLInputElement)) return;
        const draft = t.getAttribute("data-draft") ?? "";
        if (draft === "new-folder") {
          e.preventDefault();
          dispatch("folder-save", t);
        } else if (draft.startsWith("rename:")) {
          e.preventDefault();
          const id = draft.slice("rename:".length);
          const saver = body.querySelector(`[data-act="folder-rename-save"][data-id="${id}"]`);
          if (saver instanceof HTMLElement) dispatch("folder-rename-save", saver);
        }
      } catch {
      }
    });
  }

  // src/content/content.ts
  var SCAN_GRACE_MS = 3e3;
  var SCAN_RETRY_MS = 500;
  var OBSERVER_DEBOUNCE_MS = 250;
  var HEARTBEAT_MS = 1e4;
  var HREF_POLL_MS = 750;
  var NAV_SETTLE_MS = 300;
  var RENDER_FEATURES = [
    "sidebar",
    "convRows",
    "convTitle",
    "composer",
    "msgList",
    "msgTurns"
  ];
  var state = "BOOT";
  var settings = null;
  var tier = "free";
  var resolutions = {};
  var handles2 = null;
  var ui = freshUiState();
  var readOnly = false;
  var booted = false;
  var scanningStartedAt = 0;
  var lastHref = "";
  var unsubscribe = null;
  async function buildCtx() {
    const [folders, prompts, convmap] = await Promise.all([
      getFolders(),
      getPrompts(),
      getConvmap()
    ]);
    const titleRes = resolutions.convTitle;
    const resolvedTitle = titleRes?.status === "resolved" && titleRes.value?.kind === "text" ? titleRes.value.text : "";
    return {
      settings: settings ?? defaultSettings(),
      tier,
      folders,
      prompts,
      convmap,
      resolutions,
      readOnly,
      convKey: currentConvKey(),
      convTitle: resolvedTitle || sanitizeTitle(document.title)
    };
  }
  var ctxSnapshot = {
    settings: defaultSettings(),
    tier: "free",
    folders: [],
    prompts: [],
    convmap: {},
    resolutions: {},
    readOnly: false,
    convKey: "",
    convTitle: ""
  };
  var actions = {
    rerender() {
      void rerender();
    },
    writeFailed() {
      readOnly = true;
      void rerender();
    }
  };
  async function rerender() {
    if (handles2 === null) return;
    try {
      ctxSnapshot = await buildCtx();
      renderUI(handles2, ctxSnapshot, ui, actions);
    } catch (e) {
      console.warn("[lech3a91] render skipped:", e);
    }
  }
  function blocksResolved() {
    const r = resolutions;
    let n = 0;
    if (r.sidebar?.status === "resolved" && r.convRows?.status === "resolved") n++;
    if (r.composer?.status === "resolved") n++;
    if (r.msgList?.status === "resolved" && r.msgTurns?.status === "resolved") n++;
    return n;
  }
  function recomputeMountedState() {
    const blocks = blocksResolved();
    if (blocks === 0) {
      state = "HIDDEN-DORMANT";
      if (handles2 !== null) void rerender();
      return;
    }
    state = blocks === 3 ? "MOUNTED-ACTIVE" : "MOUNTED-PARTIAL";
  }
  function refreshDragAttrs() {
    const rows = resolutions.convRows;
    if (rows?.status === "resolved" && rows.value?.kind === "elements") {
      applyDragAttrs(rows.value.els);
    }
  }
  function detachedFeature(id) {
    const r = resolutions[id];
    if (r === void 0 || r.status !== "resolved" || r.value === null) return false;
    if (r.value.kind === "element") return !r.value.el.isConnected;
    if (r.value.kind === "elements") return r.value.els.some((el2) => !el2.isConnected);
    return false;
  }
  async function healPass() {
    if (state === "DISABLED") return;
    const stale = [];
    for (const id of RENDER_FEATURES) {
      const r = resolutions[id];
      if (r === void 0 || r.status !== "resolved" || detachedFeature(id)) stale.push(id);
    }
    if (stale.length === 0) {
      recomputeMountedState();
      return;
    }
    if (stale.includes("sidebar") && !stale.includes("convRows")) stale.push("convRows");
    if (stale.includes("msgList") && !stale.includes("msgTurns")) stale.push("msgTurns");
    for (const id of stale) {
      try {
        resolutions[id] = await resolveFeature(id, document, resolutions);
      } catch {
        resolutions[id] = { id, status: "degraded", value: null, candidateIndex: -1 };
      }
    }
    recomputeMountedState();
    refreshDragAttrs();
    await rerender();
  }
  async function fullResolve() {
    resolutions = await resolveAll(document);
    recomputeMountedState();
  }
  async function boot() {
    if (booted) return;
    booted = true;
    state = "SCANNING";
    scanningStartedAt = Date.now();
    await fullResolve();
    let retries = 0;
    while (blocksResolved() === 0 && Date.now() - scanningStartedAt < SCAN_GRACE_MS) {
      if (retries >= SCAN_GRACE_MS / SCAN_RETRY_MS) break;
      retries++;
      await new Promise((r) => window.setTimeout(r, SCAN_RETRY_MS));
      await fullResolve();
    }
    recomputeMountedState();
    handles2 = mountHost(() => {
      void rerender();
    });
    if (handles2 !== null) {
      wireUI(handles2, () => ctxSnapshot, ui, actions);
      await rerender();
    }
    refreshDragAttrs();
    initDragSource(document);
  }
  async function disable() {
    state = "DISABLED";
    unmountHost();
    handles2 = null;
    booted = false;
    resolutions = {};
    resetUI();
  }
  var observerTimer = 0;
  var observer = new MutationObserver(() => {
    if (state === "DISABLED" || state === "BOOT") return;
    window.clearTimeout(observerTimer);
    observerTimer = window.setTimeout(() => {
      void healPass().catch(() => {
      });
    }, OBSERVER_DEBOUNCE_MS);
  });
  function startObservers() {
    try {
      observer.observe(document.body ?? document.documentElement, {
        childList: true,
        subtree: true
      });
    } catch {
    }
    window.setInterval(() => {
      if (state === "DISABLED" || state === "BOOT") return;
      void healPass().catch(() => {
      });
    }, HEARTBEAT_MS);
    let navTimer = 0;
    const onNav = () => {
      window.clearTimeout(navTimer);
      navTimer = window.setTimeout(() => {
        void (async () => {
          try {
            resolutions.convTitle = await resolveFeature("convTitle", document, resolutions);
            await healPass();
          } catch {
          }
        })();
      }, NAV_SETTLE_MS);
    };
    window.addEventListener("popstate", onNav);
    lastHref = window.location.href;
    window.setInterval(() => {
      try {
        if (window.location.href !== lastHref) {
          lastHref = window.location.href;
          onNav();
        }
      } catch {
      }
    }, HREF_POLL_MS);
  }
  function startStorageSync() {
    if (unsubscribe !== null) return;
    unsubscribe = subscribeLocal((changes) => {
      void (async () => {
        try {
          if (K.settings in changes) {
            const next = await getSettings();
            const wasEnabled = settings?.enabled ?? true;
            settings = next;
            if (!next.enabled && wasEnabled) {
              await disable();
              return;
            }
            if (next.enabled && !wasEnabled) {
              state = "BOOT";
              await boot();
              return;
            }
          }
          if (K.license in changes) tier = await getTier();
          if (K.folders in changes || K.prompts in changes || K.convmap in changes) {
            readOnly = false;
          }
          if (handles2 !== null && state !== "DISABLED") await rerender();
        } catch {
        }
      })();
    });
  }
  (async () => {
    try {
      if (document.getElementById(HOST_ID) !== null) return;
      settings = await getSettings();
      tier = await getTier();
      startStorageSync();
      startObservers();
      if (!settings.enabled) {
        state = "DISABLED";
        return;
      }
      await boot();
    } catch (e) {
      try {
        unmountHost();
      } catch {
      }
      console.warn("[lech3a91] dormant:", e);
    }
  })();
})();
