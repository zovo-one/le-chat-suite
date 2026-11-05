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
  var FREE_FOLDER_CAP = 3;
  var FREE_PROMPT_CAP = 5;
  var PRO_FOLDER_CAP = 200;
  var PRO_PROMPT_CAP = 500;
  var PROMPT_BODY_MAX = 1e4;
  var PROMPT_TITLE_MAX = 120;
  var FOLDER_NAME_MAX = 60;

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
  async function getSettings() {
    return sanitizeSettings(await storageGet(K.settings));
  }
  async function getFolders() {
    return sanitizeFolders(await storageGet(K.folders));
  }
  async function getPrompts() {
    return sanitizePrompts(await storageGet(K.prompts));
  }
  var readSettings = getSettings;
  var readFolders = getFolders;
  var readPrompts = getPrompts;
  async function updateSettings(patch) {
    return rmw(K.settings, sanitizeSettings, (current) => ({ ...current, ...patch }));
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

  // src/pages/popup/popup.ts
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
  function applyPageTheme(theme) {
    const rootEl = document.documentElement;
    if (theme === "auto") rootEl.removeAttribute("data-theme");
    else rootEl.setAttribute("data-theme", theme);
    const seg = el("lech3a91-pop-theme-seg");
    if (!seg) return;
    for (const btn of Array.from(seg.querySelectorAll("[data-theme-choice]"))) {
      btn.setAttribute("aria-checked", String(btn.dataset["themeChoice"] === theme));
    }
  }
  var DEFAULT_NUDGE = {
    textKey: "popNudgePdf",
    textFallback: "PDF export is a Pro unlock. Print-perfect transcripts in one click. $99 once, not a subscription. 14-day money-back."
  };
  var NUDGE_COPY = {
    "export-pdf": DEFAULT_NUDGE,
    colors: {
      textKey: "popNudgeColors",
      textFallback: "Folder colors are a Pro unlock. Spot any project at a glance. $99 once covers every Pro feature. 14-day money-back."
    },
    backup: {
      textKey: "popNudgeBackup",
      textFallback: "Backup and restore are a Pro unlock. One JSON file holds everything. $99 once, yours forever. 14-day money-back."
    }
  };
  async function init() {
    localize(document);
    const foldersN = el("lech3a91-pop-folders-n");
    const foldersOf = el("lech3a91-pop-folders-of");
    const foldersLabel = el("lech3a91-pop-folders-label");
    const foldersBar = el("lech3a91-pop-folders-bar");
    const foldersBarWrap = el("lech3a91-pop-folders-barwrap");
    const promptsLine = el("lech3a91-pop-prompts-line");
    const promptsBar = el("lech3a91-pop-prompts-bar");
    const promptsBarWrap = el("lech3a91-pop-prompts-barwrap");
    const capNote = el("lech3a91-pop-cap-note");
    const tierFree = el("lech3a91-pop-tier-free");
    const tierPro = el("lech3a91-pop-tier-pro");
    const proCard = el("lech3a91-pop-pro-card");
    const upgradeCard = el("lech3a91-pop-upgrade");
    const nudge = el("lech3a91-pop-nudge");
    const nudgeText = el("lech3a91-pop-nudge-text");
    let settings = await readSettings();
    let tier = "free";
    try {
      tier = await getTier();
    } catch {
      tier = "free";
    }
    let folderCount = (await readFolders()).length;
    let promptCount = (await readPrompts()).length;
    let nudgeFeature = "export-pdf";
    applyPageTheme(settings.theme);
    const renderMeters = () => {
      const pro = tier === "pro";
      if (foldersN) foldersN.textContent = String(folderCount);
      if (foldersOf) {
        foldersOf.textContent = pro ? t("popUnlimitedWord", "unlimited") : msgf("popOfCap", [String(FREE_FOLDER_CAP)], "of $1");
      }
      if (foldersLabel) {
        const key = pro ? "popFoldersLabelPro" : "popFoldersLabel";
        foldersLabel.textContent = t(key, pro ? "folders \xB7 no limit on Pro" : "folders used");
        foldersLabel.setAttribute("data-i18n", key);
      }
      if (foldersBarWrap) foldersBarWrap.hidden = pro;
      if (foldersBar && !pro) {
        const pct = Math.min(100, Math.round(folderCount / FREE_FOLDER_CAP * 100));
        foldersBar.style.width = `${pct}%`;
      }
      if (promptsLine) {
        promptsLine.textContent = pro ? msgf("popPromptsLinePro", [String(promptCount)], "$1 prompts saved \xB7 unlimited") : msgf(
          "popPromptsLine",
          [String(promptCount), String(FREE_PROMPT_CAP)],
          "$1 of $2 prompts saved"
        );
      }
      if (promptsBarWrap) promptsBarWrap.hidden = pro;
      if (promptsBar && !pro) {
        const pct = Math.min(100, Math.round(promptCount / FREE_PROMPT_CAP * 100));
        promptsBar.style.width = `${pct}%`;
      }
      if (capNote) {
        if (!pro && folderCount >= FREE_FOLDER_CAP) {
          capNote.hidden = false;
          capNote.textContent = msgf(
            "popCapFolders",
            [String(folderCount), String(FREE_FOLDER_CAP)],
            "$1 of $2 folders used. Pro removes the limit for good."
          );
        } else if (!pro && promptCount >= FREE_PROMPT_CAP) {
          capNote.hidden = false;
          capNote.textContent = msgf(
            "popCapPrompts",
            [String(promptCount), String(FREE_PROMPT_CAP)],
            "$1 of $2 prompts used. Pro removes the limit for good."
          );
        } else {
          capNote.hidden = true;
          capNote.textContent = "";
        }
      }
    };
    let cardImpressionSent = false;
    const renderTier = () => {
      const pro = tier === "pro";
      if (tierFree) tierFree.hidden = pro;
      if (tierPro) tierPro.hidden = !pro;
      if (proCard) proCard.hidden = pro;
      if (upgradeCard) upgradeCard.hidden = pro;
      if (!pro && !cardImpressionSent && upgradeCard !== null) {
        cardImpressionSent = true;
        void emit("paywall_shown", { trigger: "calm-card", surface: "popup" });
      }
    };
    const bindToggle = (id, field) => {
      const input = el(id);
      if (!input) return;
      input.checked = settings[field];
      input.addEventListener("change", () => {
        settings = { ...settings, [field]: input.checked };
        void updateSettings({ [field]: input.checked });
      });
    };
    bindToggle("lech3a91-pop-enable", "enabled");
    bindToggle("lech3a91-pop-folders-toggle", "foldersEnabled");
    bindToggle("lech3a91-pop-prompts-toggle", "promptsEnabled");
    bindToggle("lech3a91-pop-export-toggle", "exportEnabled");
    el("lech3a91-pop-theme-seg")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-theme-choice]");
      if (!btn) return;
      const theme = btn.dataset["themeChoice"] ?? "auto";
      settings = { ...settings, theme };
      void updateSettings({ theme });
      applyPageTheme(theme);
    });
    const openTeaserNudge = (feature) => {
      nudgeFeature = feature;
      const copy = NUDGE_COPY[feature] ?? DEFAULT_NUDGE;
      if (nudgeText) nudgeText.textContent = t(copy.textKey, copy.textFallback);
      if (nudge) openPaywallNote(nudge, feature, "popup");
    };
    for (const teaser of Array.from(document.querySelectorAll(".lech3a91-teaser"))) {
      teaser.addEventListener("click", () => {
        openTeaserNudge(teaser.dataset["feature"] ?? "export-pdf");
      });
    }
    el("lech3a91-pop-nudge-upgrade")?.addEventListener("click", () => {
      void emit("cta_click", { surface: "popup", feature: nudgeFeature });
      window.open(checkoutUrl("popup"), "_blank", "noopener");
    });
    el("lech3a91-pop-nudge-later")?.addEventListener("click", () => {
      void emit("nudge_dismiss", { surface: "popup", feature: nudgeFeature });
      if (nudge) nudge.hidden = true;
    });
    el("lech3a91-pop-upgrade-cta")?.addEventListener("click", () => {
      void emit("cta_click", { surface: "popup", feature: "calm-card" });
      window.open(checkoutUrl("popup"), "_blank", "noopener");
    });
    el("lech3a91-pop-options-btn")?.addEventListener("click", () => {
      try {
        void chrome.runtime.openOptionsPage();
      } catch {
        window.open(chrome.runtime.getURL("src/pages/options/options.html"), "_blank", "noopener");
      }
    });
    renderMeters();
    renderTier();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (K.settings in changes) {
        void readSettings().then((s) => {
          settings = s;
          applyPageTheme(s.theme);
          const enable = el("lech3a91-pop-enable");
          if (enable) enable.checked = s.enabled;
          const folders = el("lech3a91-pop-folders-toggle");
          if (folders) folders.checked = s.foldersEnabled;
          const prompts = el("lech3a91-pop-prompts-toggle");
          if (prompts) prompts.checked = s.promptsEnabled;
          const exportT = el("lech3a91-pop-export-toggle");
          if (exportT) exportT.checked = s.exportEnabled;
        });
      }
      if (K.folders in changes) {
        void readFolders().then((f) => {
          folderCount = f.length;
          renderMeters();
        });
      }
      if (K.prompts in changes) {
        void readPrompts().then((p) => {
          promptCount = p.length;
          renderMeters();
        });
      }
      if (K.license in changes) {
        getTier().then((next) => {
          tier = next;
          renderTier();
          renderMeters();
        }).catch(() => {
          tier = "free";
          renderTier();
          renderMeters();
        });
      }
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    void init().catch(() => {
    });
  });
})();
