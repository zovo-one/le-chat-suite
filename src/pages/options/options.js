"use strict";
(() => {
  // src/shared/types.ts
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
  var LICENSE_KEY_LENGTH = 24;
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
  var readSettings = getSettings;
  var readFolders = getFolders;
  var readPrompts = getPrompts;
  var readConvmap = getConvmap;
  async function writeSettings(s) {
    return storageSet2(K.settings, sanitizeSettings(s));
  }
  async function updateSettings(patch) {
    return rmw(K.settings, sanitizeSettings, (current) => ({ ...current, ...patch }));
  }
  async function writeFolders(folders) {
    return storageSet2(K.folders, sanitizeFolders(folders));
  }
  async function writePrompts(prompts) {
    return storageSet2(K.prompts, sanitizePrompts(prompts));
  }
  async function writeConvmap(map) {
    return storageSet2(K.convmap, gcConvmap(sanitizeConvmap(map)));
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
    const tier = funnelStr(e.tier);
    if (tier !== void 0) rec.tier = tier;
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

  // src/shared/feature-gate.ts
  function folderCap(tier) {
    return tier === "pro" ? PRO_FOLDER_CAP : FREE_FOLDER_CAP;
  }
  function promptCap(tier) {
    return tier === "pro" ? PRO_PROMPT_CAP : FREE_PROMPT_CAP;
  }
  function canCreateFolder(tier, count) {
    return count < folderCap(tier) ? true : { paywall: "cap-folders" };
  }
  function canCreatePrompt(tier, count) {
    return count < promptCap(tier) ? true : { paywall: "cap-prompts" };
  }
  function canUseColors(tier) {
    return tier === "pro" ? true : { paywall: "sidebar" };
  }
  function canUseBackup(tier) {
    return tier === "pro" ? true : { paywall: "backup" };
  }

  // src/shared/backup.ts
  var BACKUP_APP = "le-chat-suite";
  var BACKUP_SCHEMA_VERSION = 1;
  async function buildBackup() {
    const [folders, prompts, convmap, settings] = await Promise.all([
      getFolders(),
      getPrompts(),
      getConvmap(),
      getSettings()
    ]);
    return {
      app: BACKUP_APP,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: Date.now(),
      folders,
      prompts,
      convmap,
      settings
    };
  }
  function isObject3(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  function validateBackup(input) {
    let raw = input;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        return { error: "not-json" };
      }
    }
    if (!isObject3(raw)) return { error: "not-json" };
    if (raw.app !== BACKUP_APP) return { error: "wrong-app" };
    if (raw.schemaVersion !== BACKUP_SCHEMA_VERSION) return { error: "wrong-version" };
    if (!Array.isArray(raw.folders)) return { error: "bad-field", field: "folders" };
    if (!Array.isArray(raw.prompts)) return { error: "bad-field", field: "prompts" };
    if (!isObject3(raw.convmap)) return { error: "bad-field", field: "convmap" };
    if (!isObject3(raw.settings)) return { error: "bad-field", field: "settings" };
    const backup = {
      app: BACKUP_APP,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: typeof raw.exportedAt === "number" && Number.isFinite(raw.exportedAt) ? Math.floor(raw.exportedAt) : 0,
      folders: sanitizeFolders(raw.folders),
      prompts: sanitizePrompts(raw.prompts),
      convmap: sanitizeConvmap(raw.convmap),
      settings: sanitizeSettings(raw.settings)
    };
    return { ok: true, backup };
  }
  function planRestore(backup, current) {
    const folders = current.folders.map((f) => ({ ...f }));
    const prompts = current.prompts.map((p) => ({ ...p }));
    const convmap = { ...current.convmap };
    const remappedFolderIds = {};
    const remappedPromptIds = {};
    const folderById = new Map(folders.map((f) => [f.id, f]));
    let nextOrder = folders.reduce((max, f) => Math.max(max, f.order), 0) + 1;
    for (const incoming of backup.folders) {
      const existing = folderById.get(incoming.id);
      if (existing !== void 0) {
        if (existing.name === incoming.name) continue;
        const fresh = { ...incoming, id: uuid(), order: nextOrder++ };
        remappedFolderIds[incoming.id] = fresh.id;
        folderById.set(fresh.id, fresh);
        folders.push(fresh);
        continue;
      }
      const copy = { ...incoming, order: nextOrder++ };
      folderById.set(copy.id, copy);
      folders.push(copy);
    }
    const promptIds = new Set(prompts.map((p) => p.id));
    for (const incoming of backup.prompts) {
      if (promptIds.has(incoming.id)) {
        const fresh = { ...incoming, id: uuid() };
        remappedPromptIds[incoming.id] = fresh.id;
        promptIds.add(fresh.id);
        prompts.push(fresh);
        continue;
      }
      promptIds.add(incoming.id);
      prompts.push({ ...incoming });
    }
    for (const [convKey, entry] of Object.entries(backup.convmap)) {
      const mappedFolder = remappedFolderIds[entry.folderId] ?? entry.folderId;
      if (!folderById.has(mappedFolder)) continue;
      if (convmap[convKey] !== void 0) continue;
      convmap[convKey] = { ...entry, folderId: mappedFolder };
    }
    return {
      folders,
      prompts,
      convmap,
      settings: backup.settings,
      // settings are a full replace (user confirmed restore)
      remappedFolderIds,
      remappedPromptIds
    };
  }
  async function restoreBackup(backup) {
    try {
      const [folders, prompts, convmap, settings] = await Promise.all([
        getFolders(),
        getPrompts(),
        getConvmap(),
        getSettings()
      ]);
      const plan = planRestore(backup, { folders, prompts, convmap, settings });
      const r1 = await writeFolders(plan.folders);
      if ("error" in r1) return r1;
      const r2 = await writePrompts(plan.prompts);
      if ("error" in r2) return r2;
      const r3 = await writeConvmap(plan.convmap);
      if ("error" in r3) return r3;
      return writeSettings(plan.settings);
    } catch {
      return { error: "unknown" };
    }
  }

  // src/shared/license.ts
  var VERIFY_URL = "https://zgubxqomnbmxgbdhvwja.supabase.co/functions/v1/verify-extension-license";
  var ANON_KEY = "sb_publishable_RG4IVO9Qm23_xPzdQjdFPQ_QHBwbOLv";
  var EXTENSION_KEY = "le-chat-suite";
  var VERIFY_TIMEOUT_MS = 8e3;
  function isVerdict(o) {
    return typeof o === "object" && o !== null && typeof o.valid === "boolean";
  }
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
  async function writeLicenseBlob(record) {
    try {
      await chrome.storage.local.set({ [K.license]: record });
      return true;
    } catch {
      return false;
    }
  }
  function isObject4(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  async function activateKey(rawKey) {
    const key = (typeof rawKey === "string" ? rawKey : "").trim().toUpperCase();
    if (!keyIsValid(key)) return { error: "invalid-key" };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), VERIFY_TIMEOUT_MS);
    try {
      const res = await fetch(VERIFY_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: ANON_KEY,
          authorization: `Bearer ${ANON_KEY}`
        },
        body: JSON.stringify({ license_key: key, extension: EXTENSION_KEY }),
        signal: ctrl.signal
      });
      if (!res.ok) return { error: "invalid-key" };
      let body;
      try {
        body = await res.json();
      } catch {
        return { error: "invalid-key" };
      }
      if (!isVerdict(body) || body.valid !== true) return { error: "invalid-key" };
      const record = {
        key,
        tier: "pro",
        checksum: typeof body.tier === "string" ? body.tier : "pro",
        activatedAt: Date.now()
      };
      const ok = await storageSet(K.license, record);
      if (!ok) return { error: "storage-failure" };
      return { tier: "pro" };
    } catch {
      return { error: "invalid-key" };
    } finally {
      clearTimeout(timer);
    }
  }
  async function deactivate() {
    const record = { tier: "free", deactivatedAt: Date.now() };
    await writeLicenseBlob(record);
  }
  async function getTier() {
    const blob = await readLicenseBlob();
    if (!isObject4(blob) || blob.tier !== "pro") return "free";
    const key = normalizeKey(blob.key);
    if (key === null || !keyIsValid(key)) return "free";
    if (typeof blob.checksum !== "string") return "free";
    const m = KEY_RE.exec(key);
    if (!hexEq(blob.checksum, m[4])) return "free";
    return "pro";
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
    const tier = cleanStr(detail.tier);
    if (tier !== void 0) rec.tier = tier;
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
  function openPaywallNote(note, cap, surface) {
    const wasHidden = note.hidden;
    note.setAttribute("data-cap-hit", cap);
    note.hidden = false;
    void emit("cap_hit", { feature: cap, surface });
    if (wasHidden) void emit("paywall_shown", { trigger: cap, surface });
  }

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

  // src/pages/options/options.ts
  function el(id) {
    return document.getElementById(id);
  }
  function t(key, fallback) {
    return msg(key, fallback);
  }
  function localize(root) {
    try {
      for (const node of Array.from(root.querySelectorAll("[data-i18n]"))) {
        const key = node.getAttribute("data-i18n");
        if (!key) continue;
        const text = msg(key);
        if (text !== "") node.textContent = text;
      }
      for (const node of Array.from(root.querySelectorAll("[data-i18n-attr]"))) {
        const spec = node.getAttribute("data-i18n-attr");
        if (!spec) continue;
        for (const pair of spec.split(";")) {
          const [attr, key] = pair.split(":").map((s) => s.trim());
          if (!attr || !key) continue;
          const text = msg(key);
          if (text !== "") node.setAttribute(attr, text);
        }
      }
    } catch {
    }
  }
  function setMsg(target, state, text) {
    if (!target) return;
    if (state !== "") target.dataset["state"] = state;
    else delete target.dataset["state"];
    target.textContent = text;
  }
  function newId() {
    try {
      return crypto.randomUUID();
    } catch {
      return `id-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    }
  }
  function dateStamp() {
    const d = /* @__PURE__ */ new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }
  function armable(btn, label, run) {
    let armed = false;
    let timer = 0;
    const reset = () => {
      armed = false;
      window.clearTimeout(timer);
      btn.textContent = label;
      btn.classList.remove("lech3a91-btn--danger");
    };
    btn.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        btn.textContent = t("confirmBtn", "Confirm?");
        btn.classList.add("lech3a91-btn--danger");
        timer = window.setTimeout(reset, 3e3);
        return;
      }
      reset();
      run();
    });
    btn.addEventListener("blur", reset);
  }
  function applyPageTheme(theme) {
    const rootEl = document.documentElement;
    if (theme === "auto") rootEl.removeAttribute("data-theme");
    else rootEl.setAttribute("data-theme", theme);
    const seg = el("lech3a91-opt-theme-seg");
    if (!seg) return;
    for (const b of Array.from(seg.querySelectorAll("[data-theme-choice]"))) {
      b.setAttribute("aria-checked", String(b.dataset["themeChoice"] === theme));
    }
  }
  async function init() {
    localize(document);
    let settings = await readSettings();
    let tier = "free";
    try {
      tier = await getTier();
    } catch {
      tier = "free";
    }
    let folders = await readFolders();
    let prompts = await readPrompts();
    let convmap = await readConvmap();
    let editing = false;
    applyPageTheme(settings.theme);
    const storageFail = (msgEl) => {
      setMsg(msgEl, "err", t("optStorageFail", "Changes can't be saved right now (storage full)."));
    };
    const report = (r, msgEl) => {
      if ("error" in r) {
        storageFail(msgEl);
        return false;
      }
      return true;
    };
    const tierFree = el("lech3a91-opt-tier-free");
    const tierPro = el("lech3a91-opt-tier-pro");
    const getproBtn = el("lech3a91-opt-getpro");
    const sidebarPro = el("lech3a91-opt-sidebar-pro");
    const sidebarCompare = el("lech3a91-opt-sidebar-compare");
    const backupLock = el("lech3a91-opt-backup-lock");
    const colorsLock = el("lech3a91-opt-colors-lock");
    const colorsRow = el("lech3a91-opt-colors-row");
    const colorsHint = el("lech3a91-opt-colors-hint");
    const renderTier = () => {
      const pro = tier === "pro";
      if (tierFree) tierFree.hidden = pro;
      if (tierPro) tierPro.hidden = !pro;
      if (getproBtn) getproBtn.hidden = pro;
      if (sidebarPro) sidebarPro.hidden = pro;
      if (sidebarCompare) sidebarCompare.hidden = pro;
      if (backupLock) backupLock.hidden = pro;
      if (colorsLock) colorsLock.hidden = pro;
      if (colorsRow) colorsRow.setAttribute("aria-disabled", String(pro));
      if (colorsHint) {
        const key = pro ? "optColorsHintPro" : "optColorsHintFree";
        colorsHint.textContent = t(
          key,
          pro ? "Set each folder's color from the Le Chat Suite panel on chat.mistral.ai." : "Pro gives every folder its own color \u2014 set from the panel on chat.mistral.ai."
        );
        colorsHint.setAttribute("data-i18n", key);
      }
      renderUsage();
      void renderLicense();
    };
    getproBtn?.addEventListener("click", () => {
      void emit("cta_click", { surface: "options", feature: "header" });
      window.open(checkoutUrl("options"), "_blank", "noopener");
    });
    const bindToggle = (id, field) => {
      const input = el(id);
      if (!input) return;
      input.checked = settings[field];
      input.addEventListener("change", () => {
        settings = { ...settings, [field]: input.checked };
        void updateSettings({ [field]: input.checked });
      });
    };
    bindToggle("lech3a91-opt-enable", "enabled");
    bindToggle("lech3a91-opt-folders-enabled", "foldersEnabled");
    bindToggle("lech3a91-opt-prompts-enabled", "promptsEnabled");
    bindToggle("lech3a91-opt-export-enabled", "exportEnabled");
    el("lech3a91-opt-theme-seg")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-theme-choice]");
      if (!btn) return;
      const theme = btn.dataset["themeChoice"] ?? "auto";
      settings = { ...settings, theme };
      void updateSettings({ theme });
      applyPageTheme(theme);
    });
    const foldersUsage = el("lech3a91-opt-folders-usage");
    const promptsUsage = el("lech3a91-opt-prompts-usage");
    function renderUsage() {
      const pro = tier === "pro";
      if (foldersUsage) {
        foldersUsage.textContent = pro ? msgf("optUsagePro", [String(folders.length)], "$1 \xB7 unlimited") : msgf("optUsage", [String(folders.length), String(FREE_FOLDER_CAP)], "$1 of $2 used");
      }
      if (promptsUsage) {
        promptsUsage.textContent = pro ? msgf("optUsagePro", [String(prompts.length)], "$1 \xB7 unlimited") : msgf("optUsage", [String(prompts.length), String(FREE_PROMPT_CAP)], "$1 of $2 used");
      }
    }
    const foldersNudge = el("lech3a91-opt-folders-nudge");
    const foldersNudgeText = el("lech3a91-opt-folders-nudge-text");
    const promptsNudge = el("lech3a91-opt-prompts-nudge");
    const promptsNudgeText = el("lech3a91-opt-prompts-nudge-text");
    const backupNudge = el("lech3a91-opt-backup-nudge");
    let foldersNudgeSurface = "cap-folders";
    let promptsNudgeSurface = "cap-prompts";
    const openNudge = (note, textEl, text, feature) => {
      if (textEl) textEl.textContent = text;
      if (note) openPaywallNote(note, feature, "options");
    };
    const wireNudgeButtons = (upgradeId, laterId, note, feature, surface) => {
      el(upgradeId)?.addEventListener("click", () => {
        void emit("cta_click", { surface: "options", feature });
        window.open(checkoutUrl(surface()), "_blank", "noopener");
      });
      el(laterId)?.addEventListener("click", () => {
        void emit("nudge_dismiss", { surface: "options", feature });
        if (note) note.hidden = true;
      });
    };
    wireNudgeButtons(
      "lech3a91-opt-folders-upgrade",
      "lech3a91-opt-folders-later",
      foldersNudge,
      "folders",
      () => foldersNudgeSurface
    );
    wireNudgeButtons(
      "lech3a91-opt-prompts-upgrade",
      "lech3a91-opt-prompts-later",
      promptsNudge,
      "prompts",
      () => promptsNudgeSurface
    );
    wireNudgeButtons(
      "lech3a91-opt-backup-upgrade",
      "lech3a91-opt-backup-later",
      backupNudge,
      "backup",
      () => "backup"
    );
    const foldersList = el("lech3a91-opt-folders-list");
    const foldersEmpty = el("lech3a91-opt-folders-empty");
    const folderMsg = el("lech3a91-opt-folder-msg");
    const folderInput = el("lech3a91-opt-folder-input");
    if (folderInput) folderInput.maxLength = FOLDER_NAME_MAX;
    const sortedFolders = () => [...folders].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    const chatsInFolder = (id) => {
      let n = 0;
      for (const key of Object.keys(convmap)) {
        if (convmap[key]?.folderId === id) n += 1;
      }
      return n;
    };
    function makeRowButton(text, ariaLabel) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "zovo-btn zovo-btn--ghost lech3a91-btn--sm";
      b.textContent = text;
      b.setAttribute("aria-label", ariaLabel);
      return b;
    }
    function renderFolders() {
      if (!foldersList || !foldersEmpty) return;
      foldersList.replaceChildren();
      const list = sortedFolders();
      foldersEmpty.hidden = list.length > 0;
      foldersList.hidden = list.length === 0;
      for (const folder of list) {
        foldersList.appendChild(buildFolderRow(folder));
      }
    }
    function buildFolderRow(folder) {
      const li = document.createElement("li");
      li.className = "lech3a91-list__row";
      const dot = document.createElement("span");
      dot.className = "lech3a91-dot";
      dot.setAttribute("aria-hidden", "true");
      if (folder.colorId > 0) dot.dataset["set"] = "true";
      const main = document.createElement("span");
      main.className = "lech3a91-list__main";
      const name = document.createElement("span");
      name.className = "lech3a91-list__name";
      name.textContent = folder.name;
      const meta = document.createElement("span");
      meta.className = "lech3a91-list__meta";
      const chats = chatsInFolder(folder.id);
      meta.textContent = msgf("optFolderMeta", [String(chats)], "$1 chats filed");
      main.append(name, meta);
      const actions = document.createElement("span");
      actions.className = "lech3a91-list__actions";
      const renameBtn = makeRowButton(
        t("optFolderRename", "Rename"),
        msgf("optFolderRenameAria", [folder.name], "Rename folder $1")
      );
      renameBtn.addEventListener("click", () => startFolderRename(folder, li));
      const deleteBtn = makeRowButton(
        t("optFolderDelete", "Delete"),
        msgf("optFolderDeleteAria", [folder.name], "Delete folder $1")
      );
      armable(deleteBtn, t("optFolderDelete", "Delete"), () => void deleteFolder(folder.id));
      actions.append(renameBtn, deleteBtn);
      li.append(dot, main, actions);
      return li;
    }
    function startFolderRename(folder, li) {
      editing = true;
      li.classList.add("lech3a91-list__row--editing");
      li.replaceChildren();
      const form = document.createElement("span");
      form.className = "lech3a91-list__editform";
      const input = document.createElement("input");
      input.className = "zovo-input";
      input.type = "text";
      input.maxLength = FOLDER_NAME_MAX;
      input.value = folder.name;
      input.setAttribute("aria-label", t("optFolderRename", "Rename"));
      const row = document.createElement("span");
      row.className = "lech3a91-list__editactions";
      const save = makeRowButton(t("optSave", "Save"), t("optSave", "Save"));
      save.classList.replace("zovo-btn--ghost", "zovo-btn--primary");
      const cancel = makeRowButton(t("optCancel", "Cancel"), t("optCancel", "Cancel"));
      row.append(save, cancel);
      form.append(input, row);
      li.appendChild(form);
      input.focus();
      input.select();
      const done = () => {
        editing = false;
        renderFolders();
      };
      cancel.addEventListener("click", done);
      save.addEventListener("click", () => void saveFolderRename(folder, input.value, done));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void saveFolderRename(folder, input.value, done);
        if (e.key === "Escape") done();
      });
    }
    async function saveFolderRename(folder, rawName, done) {
      const name = rawName.trim().slice(0, FOLDER_NAME_MAX);
      if (name === "") {
        setMsg(folderMsg, "err", t("optFolderNeedName", "Give the folder a name."));
        return;
      }
      const next = folders.map((f) => f.id === folder.id ? { ...f, name } : f);
      const r = await writeFolders(next);
      if (!report(r, folderMsg)) return;
      folders = next;
      setMsg(folderMsg, "", "");
      done();
    }
    async function deleteFolder(id) {
      const nextFolders = folders.filter((f) => f.id !== id);
      const nextMap = {};
      for (const key of Object.keys(convmap)) {
        const entry = convmap[key];
        if (entry && entry.folderId !== id) nextMap[key] = entry;
      }
      const r1 = await writeFolders(nextFolders);
      if (!report(r1, folderMsg)) return;
      const r2 = await writeConvmap(nextMap);
      if (!report(r2, folderMsg)) return;
      folders = nextFolders;
      convmap = nextMap;
      renderFolders();
      renderAssignments();
      renderUsage();
    }
    el("lech3a91-opt-folder-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!folderInput) return;
      const name = folderInput.value.trim().slice(0, FOLDER_NAME_MAX);
      if (name === "") {
        setMsg(folderMsg, "err", t("optFolderNeedName", "Give the folder a name."));
        return;
      }
      if (folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
        setMsg(folderMsg, "err", t("optFolderNameTaken", "A folder with this name already exists."));
        return;
      }
      if (tier === "pro" && folders.length >= PRO_FOLDER_CAP) {
        setMsg(folderMsg, "err", t("optFolderProCap", "You've reached the 200-folder safety limit."));
        return;
      }
      const gate = canCreateFolder(tier, folders.length);
      if (gate !== true) {
        foldersNudgeSurface = gate.paywall;
        openNudge(
          foldersNudge,
          foldersNudgeText,
          msgf(
            "optFolderCap",
            [String(folders.length), String(FREE_FOLDER_CAP)],
            "$1 of $2 folders used. Pro lifts the cap and adds colors, PDF and backup. $99 once, 14-day money-back."
          ),
          "cap-folders"
        );
        return;
      }
      void (async () => {
        const maxOrder = folders.reduce((m, f) => Math.max(m, f.order), 0);
        const next = [
          ...folders,
          { id: newId(), name, colorId: 0, collapsed: false, order: maxOrder + 1, createdAt: Date.now() }
        ];
        const r = await writeFolders(next);
        if (!report(r, folderMsg)) return;
        folders = next;
        folderInput.value = "";
        setMsg(folderMsg, "", "");
        renderFolders();
        renderUsage();
        void emit("feature_used", { feature: "folders", surface: "options" });
        void emitOnce("first_value", { feature: "folders", surface: "options" });
      })();
    });
    colorsRow?.addEventListener("click", () => {
      if (tier === "pro") return;
      if (canUseColors(tier) === true) return;
      foldersNudgeSurface = "options";
      openNudge(
        foldersNudge,
        foldersNudgeText,
        t("optColorsNudge", "Folder colors are a Pro unlock, and Pro lifts every other cap too. $99 once, not a subscription. 14-day money-back."),
        "colors"
      );
    });
    const assignList = el("lech3a91-opt-assign-list");
    const assignEmpty = el("lech3a91-opt-assign-empty");
    const assignMsg = el("lech3a91-opt-assign-msg");
    function renderAssignments() {
      if (!assignList || !assignEmpty) return;
      assignList.replaceChildren();
      const keys = Object.keys(convmap).sort(
        (a, b) => (convmap[b]?.seenAt ?? 0) - (convmap[a]?.seenAt ?? 0)
      );
      assignEmpty.hidden = keys.length > 0;
      assignList.hidden = keys.length === 0;
      for (const key of keys) {
        const entry = convmap[key];
        if (entry) assignList.appendChild(buildAssignRow(key, entry));
      }
    }
    function buildAssignRow(convKey, entry) {
      const li = document.createElement("li");
      li.className = "lech3a91-list__row";
      const main = document.createElement("span");
      main.className = "lech3a91-list__main";
      const name = document.createElement("span");
      name.className = "lech3a91-list__name";
      name.textContent = entry.lastTitle !== "" ? entry.lastTitle : t("optAssignUntitled", "Untitled chat");
      const meta = document.createElement("span");
      meta.className = "lech3a91-list__meta zovo-mono";
      meta.textContent = convKey;
      main.append(name, meta);
      const select = document.createElement("select");
      select.className = "zovo-input lech3a91-list__select";
      select.setAttribute("aria-label", t("optAssignMoveAria", "Move this conversation to another folder"));
      const known = sortedFolders();
      if (!known.some((f) => f.id === entry.folderId)) {
        const ph = new Option(t("optAssignPick", "Choose a folder"), "", true, true);
        ph.disabled = true;
        select.appendChild(ph);
      }
      for (const f of known) {
        select.appendChild(new Option(f.name, f.id, false, f.id === entry.folderId));
      }
      select.addEventListener("change", () => {
        const folderId = select.value;
        if (folderId === "") return;
        void (async () => {
          const next = { ...convmap, [convKey]: { ...entry, folderId } };
          const r = await writeConvmap(next);
          if (!report(r, assignMsg)) return;
          convmap = next;
          setMsg(assignMsg, "", "");
          renderAssignments();
          renderFolders();
        })();
      });
      const unfile = makeRowButton(
        t("optAssignRemove", "Unfile"),
        t("optAssignRemoveAria", "Remove this conversation from its folder")
      );
      armable(unfile, t("optAssignRemove", "Unfile"), () => {
        void (async () => {
          const next = { ...convmap };
          delete next[convKey];
          const r = await writeConvmap(next);
          if (!report(r, assignMsg)) return;
          convmap = next;
          renderAssignments();
          renderFolders();
        })();
      });
      const actions = document.createElement("span");
      actions.className = "lech3a91-list__actions";
      actions.append(select, unfile);
      li.append(main, actions);
      return li;
    }
    const promptsList = el("lech3a91-opt-prompts-list");
    const promptsEmpty = el("lech3a91-opt-prompts-empty");
    const promptMsg = el("lech3a91-opt-prompt-msg");
    const promptTitle = el("lech3a91-opt-prompt-title");
    const promptBody = el("lech3a91-opt-prompt-body");
    if (promptTitle) promptTitle.maxLength = PROMPT_TITLE_MAX;
    if (promptBody) promptBody.maxLength = PROMPT_BODY_MAX;
    const sortedPrompts = () => [...prompts].sort((a, b) => a.createdAt - b.createdAt);
    function renderPrompts() {
      if (!promptsList || !promptsEmpty) return;
      promptsList.replaceChildren();
      const list = sortedPrompts();
      promptsEmpty.hidden = list.length > 0;
      promptsList.hidden = list.length === 0;
      for (const prompt of list) {
        promptsList.appendChild(buildPromptRow(prompt));
      }
    }
    function buildPromptRow(prompt) {
      const li = document.createElement("li");
      li.className = "lech3a91-list__row";
      const main = document.createElement("span");
      main.className = "lech3a91-list__main";
      const name = document.createElement("span");
      name.className = "lech3a91-list__name";
      name.textContent = prompt.title;
      const meta = document.createElement("span");
      meta.className = "lech3a91-list__meta";
      meta.textContent = prompt.body.length > 80 ? `${prompt.body.slice(0, 80)}\u2026` : prompt.body;
      main.append(name, meta);
      const actions = document.createElement("span");
      actions.className = "lech3a91-list__actions";
      const editBtn = makeRowButton(
        t("optPromptEdit", "Edit"),
        msgf("optPromptEditAria", [prompt.title], "Edit prompt $1")
      );
      editBtn.addEventListener("click", () => startPromptEdit(prompt, li));
      const deleteBtn = makeRowButton(
        t("optPromptDelete", "Delete"),
        msgf("optPromptDeleteAria", [prompt.title], "Delete prompt $1")
      );
      armable(deleteBtn, t("optPromptDelete", "Delete"), () => void deletePrompt(prompt.id));
      actions.append(editBtn, deleteBtn);
      li.append(main, actions);
      return li;
    }
    function startPromptEdit(prompt, li) {
      editing = true;
      li.classList.add("lech3a91-list__row--editing");
      li.replaceChildren();
      const form = document.createElement("span");
      form.className = "lech3a91-list__editform";
      const title = document.createElement("input");
      title.className = "zovo-input";
      title.type = "text";
      title.maxLength = PROMPT_TITLE_MAX;
      title.value = prompt.title;
      title.setAttribute("aria-label", t("optPromptTitleAria", "Prompt title"));
      const body = document.createElement("textarea");
      body.className = "zovo-input lech3a91-textarea";
      body.rows = 4;
      body.maxLength = PROMPT_BODY_MAX;
      body.value = prompt.body;
      body.setAttribute("aria-label", t("optPromptBodyAria", "Prompt text"));
      const row = document.createElement("span");
      row.className = "lech3a91-list__editactions";
      const save = makeRowButton(t("optSave", "Save"), t("optSave", "Save"));
      save.classList.replace("zovo-btn--ghost", "zovo-btn--primary");
      const cancel = makeRowButton(t("optCancel", "Cancel"), t("optCancel", "Cancel"));
      row.append(save, cancel);
      form.append(title, body, row);
      li.appendChild(form);
      title.focus();
      title.select();
      const done = () => {
        editing = false;
        renderPrompts();
      };
      cancel.addEventListener("click", done);
      save.addEventListener("click", () => void savePromptEdit(prompt, title.value, body.value, done));
    }
    async function savePromptEdit(prompt, rawTitle, rawBody, done) {
      const title = rawTitle.trim().slice(0, PROMPT_TITLE_MAX);
      const body = rawBody.slice(0, PROMPT_BODY_MAX);
      if (title === "" || body.trim() === "") {
        setMsg(promptMsg, "err", t("optPromptNeedBoth", "Give the prompt a title and some text."));
        return;
      }
      const next = prompts.map(
        (p) => p.id === prompt.id ? { ...p, title, body, updatedAt: Date.now() } : p
      );
      const r = await writePrompts(next);
      if (!report(r, promptMsg)) return;
      prompts = next;
      setMsg(promptMsg, "", "");
      done();
    }
    async function deletePrompt(id) {
      const next = prompts.filter((p) => p.id !== id);
      const r = await writePrompts(next);
      if (!report(r, promptMsg)) return;
      prompts = next;
      renderPrompts();
      renderUsage();
    }
    el("lech3a91-opt-prompt-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!promptTitle || !promptBody) return;
      const title = promptTitle.value.trim().slice(0, PROMPT_TITLE_MAX);
      const body = promptBody.value.slice(0, PROMPT_BODY_MAX);
      if (title === "" || body.trim() === "") {
        setMsg(promptMsg, "err", t("optPromptNeedBoth", "Give the prompt a title and some text."));
        return;
      }
      if (tier === "pro" && prompts.length >= PRO_PROMPT_CAP) {
        setMsg(promptMsg, "err", t("optPromptProCap", "You've reached the 500-prompt safety limit."));
        return;
      }
      const gate = canCreatePrompt(tier, prompts.length);
      if (gate !== true) {
        promptsNudgeSurface = gate.paywall;
        openNudge(
          promptsNudge,
          promptsNudgeText,
          msgf(
            "optPromptCap",
            [String(prompts.length), String(FREE_PROMPT_CAP)],
            "$1 of $2 prompts saved. Pro lifts the cap and adds colors, PDF and backup. $99 once, 14-day money-back."
          ),
          "cap-prompts"
        );
        return;
      }
      void (async () => {
        const now = Date.now();
        const next = [...prompts, { id: newId(), title, body, createdAt: now, updatedAt: now }];
        const r = await writePrompts(next);
        if (!report(r, promptMsg)) return;
        prompts = next;
        promptTitle.value = "";
        promptBody.value = "";
        setMsg(promptMsg, "", "");
        renderPrompts();
        renderUsage();
        void emit("feature_used", { feature: "prompts", surface: "options" });
        void emitOnce("first_value", { feature: "prompts", surface: "options" });
      })();
    });
    const backupMsg = el("lech3a91-opt-backup-msg");
    const restoreFile = el("lech3a91-opt-restore-file");
    const restoreConfirm = el("lech3a91-opt-restore-confirm");
    let pendingBackup = null;
    el("lech3a91-opt-backup-btn")?.addEventListener("click", () => {
      const gate = canUseBackup(tier);
      if (gate !== true) {
        if (backupNudge) openPaywallNote(backupNudge, "backup", "options");
        return;
      }
      void (async () => {
        try {
          const backup = await buildBackup();
          const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `le-chat-suite-backup-${dateStamp()}.json`;
          a.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 6e4);
          setMsg(backupMsg, "ok", t("optBackupDone", "Backup downloaded. Keep it somewhere safe."));
        } catch {
          setMsg(backupMsg, "err", t("optBackupFail", "The backup couldn't be built. Try again."));
        }
      })();
    });
    el("lech3a91-opt-restore-btn")?.addEventListener("click", () => {
      const gate = canUseBackup(tier);
      if (gate !== true) {
        if (backupNudge) openPaywallNote(backupNudge, "backup", "options");
        return;
      }
      restoreFile?.click();
    });
    restoreFile?.addEventListener("change", () => {
      const input = restoreFile;
      if (!input) return;
      const file = input.files?.[0];
      if (!file) return;
      void (async () => {
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const result = validateBackup(parsed);
          if ("error" in result) {
            setMsg(backupMsg, "err", t("optRestoreBad", "That file isn't a Le Chat Suite backup. Choose your exported JSON file."));
            return;
          }
          pendingBackup = result.backup;
          if (restoreConfirm) restoreConfirm.hidden = false;
          setMsg(backupMsg, "", "");
        } catch {
          setMsg(backupMsg, "err", t("optRestoreBad", "That file isn't a Le Chat Suite backup."));
        } finally {
          input.value = "";
        }
      })();
    });
    el("lech3a91-opt-restore-yes")?.addEventListener("click", () => {
      const backup = pendingBackup;
      pendingBackup = null;
      if (restoreConfirm) restoreConfirm.hidden = true;
      if (!backup) return;
      void (async () => {
        const r = await restoreBackup(backup);
        if (!report(r, backupMsg)) {
          setMsg(backupMsg, "err", t("optRestoreFail", "The restore couldn't be saved. Try again."));
          return;
        }
        setMsg(backupMsg, "ok", t("optRestoreDone", "Backup restored. Your folders and prompts are back."));
      })();
    });
    el("lech3a91-opt-restore-no")?.addEventListener("click", () => {
      pendingBackup = null;
      if (restoreConfirm) restoreConfirm.hidden = true;
    });
    const wipeMsg = el("lech3a91-opt-wipe-msg");
    const wipeConfirm = el("lech3a91-opt-wipe-confirm");
    el("lech3a91-opt-wipe-btn")?.addEventListener("click", () => {
      if (wipeConfirm) wipeConfirm.hidden = false;
    });
    el("lech3a91-opt-wipe-no")?.addEventListener("click", () => {
      if (wipeConfirm) wipeConfirm.hidden = true;
    });
    el("lech3a91-opt-wipe-yes")?.addEventListener("click", () => {
      if (wipeConfirm) wipeConfirm.hidden = true;
      void (async () => {
        try {
          await chrome.storage.local.remove([K.settings, K.folders, K.prompts, K.convmap, K.selcache]);
          setMsg(wipeMsg, "ok", t("optWipeDone", "All data erased. Your license is untouched."));
        } catch {
          setMsg(wipeMsg, "err", t("optStorageFail", "Changes can't be saved right now (storage full)."));
        }
      })();
    });
    const licenseFree = el("lech3a91-opt-license-free");
    const licenseProPanel = el("lech3a91-opt-license-pro");
    const licenseForm = el("lech3a91-opt-license-form");
    const licenseInput = el("lech3a91-opt-license-input");
    const licenseMsg = el("lech3a91-opt-license-msg");
    const licenseMsgPro = el("lech3a91-opt-license-msg-pro");
    const licenseKeyShown = el("lech3a91-opt-license-key-shown");
    if (licenseInput) licenseInput.maxLength = Math.max(licenseInput.maxLength, LICENSE_KEY_LENGTH);
    const maskKey = (key) => key.length >= 8 ? `${key.slice(0, 5)}\xB7\xB7\xB7\xB7-\xB7\xB7\xB7\xB7-\xB7\xB7\xB7\xB7` : "\xB7\xB7\xB7\xB7";
    const readStoredKey = async () => {
      try {
        const rec = (await chrome.storage.local.get(K.license))?.[K.license];
        if (typeof rec === "object" && rec !== null && rec.tier === "pro" && typeof rec.key === "string") {
          return rec.key;
        }
      } catch {
      }
      return null;
    };
    async function renderLicense() {
      const pro = tier === "pro";
      if (licenseFree) licenseFree.hidden = pro;
      if (licenseProPanel) licenseProPanel.hidden = !pro;
      if (licenseKeyShown) {
        const key = pro ? await readStoredKey() : null;
        licenseKeyShown.textContent = pro ? key !== null ? maskKey(key) : t("optLicenseActive", "License active on this device") : "";
      }
    }
    licenseForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!licenseInput) return;
      const raw = licenseInput.value.trim();
      setMsg(licenseMsg, "", "");
      void (async () => {
        const res = await activateKey(raw);
        if ("tier" in res) {
          tier = "pro";
          licenseInput.value = "";
          renderTier();
          void emit("key_verified", { tier: "pro", surface: "options" });
          setMsg(licenseMsgPro, "ok", t("licenseActivated", "Pro activated. Every cap on this device is gone."));
        } else if (res.error === "storage-failure") {
          setMsg(
            licenseMsg,
            "err",
            t("licenseStorageError", "The key checked out but couldn't be saved on this device. Try again.")
          );
        } else {
          void emit("verify_failed", { reason: "invalid-key", surface: "options" });
          setMsg(
            licenseMsg,
            "err",
            t("licenseInvalid", "That key didn't check out. Check the key and try again.")
          );
        }
      })().catch(() => {
        setMsg(licenseMsg, "err", t("licenseInvalid", "That key didn't check out. Check the key and try again."));
      });
    });
    el("lech3a91-opt-license-deactivate")?.addEventListener("click", () => {
      void (async () => {
        await deactivate();
        tier = "free";
        renderTier();
        setMsg(licenseMsg, "ok", t("licenseDeactivated", "Pro deactivated on this device."));
      })().catch(() => {
      });
    });
    el("lech3a91-opt-license-upgrade")?.addEventListener("click", () => {
      void emit("cta_click", { surface: "options", feature: "license-panel" });
      window.open(checkoutUrl("options"), "_blank", "noopener");
    });
    renderTier();
    renderFolders();
    renderPrompts();
    renderAssignments();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (K.settings in changes) {
        void readSettings().then((s) => {
          settings = s;
          applyPageTheme(s.theme);
          const enable = el("lech3a91-opt-enable");
          if (enable) enable.checked = s.enabled;
          const f = el("lech3a91-opt-folders-enabled");
          if (f) f.checked = s.foldersEnabled;
          const p = el("lech3a91-opt-prompts-enabled");
          if (p) p.checked = s.promptsEnabled;
          const x = el("lech3a91-opt-export-enabled");
          if (x) x.checked = s.exportEnabled;
        });
      }
      if (K.folders in changes && !editing) {
        void readFolders().then((next) => {
          folders = next;
          renderFolders();
          renderAssignments();
          renderUsage();
        });
      }
      if (K.prompts in changes && !editing) {
        void readPrompts().then((next) => {
          prompts = next;
          renderPrompts();
          renderUsage();
        });
      }
      if (K.convmap in changes && !editing) {
        void readConvmap().then((next) => {
          convmap = next;
          renderAssignments();
          renderFolders();
        });
      }
      if (K.license in changes) {
        getTier().then((next) => {
          tier = next;
          renderTier();
        }).catch(() => {
          tier = "free";
          renderTier();
        });
      }
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    void init().catch(() => {
    });
  });
})();
