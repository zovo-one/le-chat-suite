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

// src/shared/validate.ts
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
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
async function storageSet(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
    return { ok: true };
  } catch (e) {
    return isQuotaError(e) ? { error: "quota" } : { error: "unknown" };
  }
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
async function getSettings() {
  return sanitizeSettings(await storageGet(K.settings));
}
async function writeSettings(s) {
  return storageSet(K.settings, sanitizeSettings(s));
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
async function emitOnce(name, detail = {}) {
  await enqueue(async () => {
    try {
      const f = await readFunnel();
      if (f.seen[name] === true) return;
      const rec = buildRecord(name, detail);
      if (f.installId !== "") rec.installId = f.installId;
      f.seen[name] = true;
      append(f, name, rec);
      await storageSet(K.funnel, f);
      pingSink(name, detail, rec);
    } catch {
    }
  });
}

// src/sw/sw.ts
var ONBOARDING_PAGE = "src/pages/onboarding/onboarding-premium.html";
async function seedDefaults() {
  try {
    const raw = await storageGet(K.settings);
    if (raw === void 0) {
      await writeSettings(defaultSettings());
      return;
    }
    const merged = { ...defaultSettings(), ...await getSettings() };
    await writeSettings(merged);
  } catch {
  }
}
async function seedFunnelInstallId() {
  try {
    const f = await readFunnel();
    if (f.installId !== "") return;
    const fresh = defaultFunnel();
    fresh.installId = crypto.randomUUID();
    fresh.counters = f.counters;
    fresh.events = f.events;
    fresh.seen = f.seen;
    await storageSet(K.funnel, fresh);
  } catch {
  }
}
async function migrate(fromVersion) {
  try {
    switch (fromVersion) {
      default:
        break;
    }
  } catch {
  }
}
chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    try {
      if (details.reason === "install") {
        await seedDefaults();
        await seedFunnelInstallId();
        void emitOnce("install");
        await chrome.tabs.create({ url: chrome.runtime.getURL(ONBOARDING_PAGE) });
      } else if (details.reason === "update") {
        await migrate(details.previousVersion ?? "1.0.0");
      }
    } catch {
    }
  })();
});
