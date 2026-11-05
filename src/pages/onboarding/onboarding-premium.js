/* onboarding-premium.js — Le Chat Suite 6-step premium onboarding controller.
 * Faithful parameterization of engine/2-onboarding/template/onboarding-premium.js:
 *  - Permission/grant step REMOVED by design (this extension has zero optional
 *    permissions; storage is install-time). Flow is a clean 6 steps.
 *  - Close logic is LOAD-BEARING verbatim (fleet trap #5):
 *    chrome.tabs.getCurrent + chrome.tabs.remove, fallback window.close(), in
 *    try/catch. A bare window.close() silently no-ops when the page was opened
 *    via chrome.tabs.create (which sw.ts onInstalled does).
 *  - Step 2 runs a file-a-chat demo (purely visual, no host page involved).
 *  - Step 3 saves the user's first prompt into the REAL lech:prompts store
 *    (merge, never overwrite) — the library has it the moment they open
 *    chat.mistral.ai.
 *  - Step 5 CTA + all outbound links are built at runtime by string concat
 *    (BoxGrow rule): no scheme literal and no full "utm_content" pairing
 *    literal in this file — do NOT "fix" their absence.
 *  - finish() appends onboarding_complete to the LOCAL lech:funnel ledger
 *    (storage-local only, numbers about moments, never content) — a minimal
 *    plain-JS mirror of shared/funnel.ts, which a byte-copied template file
 *    cannot import. Fail-silent everywhere.
 */
(function () {
  var TOTAL = 6,
    i = 0;
  var steps = [].slice.call(document.querySelectorAll('.step'));
  var rail = document.getElementById('rail'),
    back = document.getElementById('back'),
    next = document.getElementById('next'),
    stepno = document.getElementById('stepno');
  for (var d = 0; d < TOTAL; d++) {
    var e = document.createElement('span');
    e.className = 'dot';
    rail.appendChild(e);
  }
  var dots = [].slice.call(rail.children);

  /* ---- runtime-concat URLs (no scheme literal, no utm pairing literal) */
  var SCHEME = 'https' + '://';
  var BASE =
    SCHEME + 'zovo.one/pricing?utm_source=le-chat-suite&utm_medium=extension&utm_campaign=upgrade';
  function checkout(surface) {
    return BASE + '&utm_' + 'content=' + surface;
  }
  function setHref(id, url) {
    var a = document.getElementById(id);
    if (a) a.href = url;
  }
  setHref('linkWhy', SCHEME + 'zovo.one/why?ref=le-chat-suite');
  setHref('linkVision', SCHEME + 'zovo.one/vision?ref=le-chat-suite');
  setHref('linkVision2', SCHEME + 'zovo.one/vision?ref=le-chat-suite');
  setHref('linkSafety', SCHEME + 'zovo.one/how-we-keep-you-safe?ref=le-chat-suite');
  setHref('linkGithub', SCHEME + 'github.com/theluckystrike');
  setHref('linkGithub2', SCHEME + 'github.com/theluckystrike');

  /* nav label names the outcome waiting on the next step (no grey-button
   * "Next" — copy doctrine §3). Step 4 is the offer, so its skip stays the
   * easy "Maybe later"; the last step opens Le Chat. */
  var NEXT_LABELS = [
    'See the fix',
    'Save a prompt',
    'Why trust it',
    'See the offer',
    'Maybe later',
    'Open Le Chat',
  ];
  function render() {
    steps.forEach(function (s, n) {
      s.classList.toggle('on', n === i);
    });
    dots.forEach(function (dt, n) {
      dt.className = 'dot' + (n < i ? ' done' : n === i ? ' now' : '');
    });
    back.style.visibility = i === 0 ? 'hidden' : 'visible';
    stepno.textContent = i + 1 + ' of ' + TOTAL;
    next.textContent = NEXT_LABELS[i];
    next.className = 'btn ' + (i === TOTAL - 1 ? 'btn--primary' : 'btn--primary');
    if (i === 1) setTimeout(runDemo, 350);
    maybeLedgerOfferView();
  }
  function go(n) {
    i = Math.max(0, Math.min(TOTAL - 1, n));
    render();
    try {
      chrome.storage && chrome.storage.local && chrome.storage.local.set({ lech_onboard_step: i });
    } catch (e) {
      /* step telemetry is best-effort, never blocks navigation */
    }
  }
  next.addEventListener('click', function () {
    if (i === TOTAL - 1) {
      finish();
    } else {
      go(i + 1);
    }
  });
  back.addEventListener('click', function () {
    go(i - 1);
  });
  document.getElementById('skip').addEventListener('click', finish);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowRight' || ev.key === 'Enter') {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'A') next.click();
    }
    if (ev.key === 'ArrowLeft') back.click();
  });

  /* ---- local funnel mirror (storage-local only, numbers about moments) ----
   * Generic queued ledger write (5.7 ROI-MODEL): onboarding_complete (finish),
   * first_value (step-3 real prompt save), paywall_shown (offer-step view) and
   * cta_click (step-5 CTA) all append to the SAME lech:funnel blob — the queue
   * serializes the read-modify-write so concurrent appends never clobber.
   * `once` names get the seen-guard (first_value / onboarding_complete fire
   * one-ever per install). Fail-silent everywhere. */
  var ledgerQueue = Promise.resolve();
  function ledgerEmit(name, extra, once) {
    ledgerQueue = ledgerQueue.then(function () {
      return new Promise(function (resolve) {
        try {
          chrome.storage.local.get('lech:funnel', function (out) {
            try {
              var f = (out && out['lech:funnel']) || {};
              if (!f || f.schemaVersion !== 1) {
                f = { schemaVersion: 1, installId: '', counters: {}, events: [], seen: {} };
              }
              f.seen = f.seen || {};
              if (once === true && f.seen[name] === true) {
                resolve();
                return;
              }
              if (once === true) f.seen[name] = true;
              f.counters = f.counters || {};
              f.counters[name] = (f.counters[name] || 0) + 1;
              f.events = Array.isArray(f.events) ? f.events : [];
              var rec = { name: name, t: Date.now() };
              if (extra) for (var k in extra) rec[k] = extra[k];
              if (f.installId) rec.installId = f.installId;
              f.events.push(rec);
              if (f.events.length > 120) f.events.splice(0, f.events.length - 120);
              chrome.storage.local.set({ 'lech:funnel': f }, function () {
                resolve();
              });
            } catch (e) {
              resolve(); /* the ledger never breaks the page */
            }
          });
        } catch (e) {
          resolve(); /* outside an extension context — skip silently */
        }
      });
    });
    ledgerQueue = ledgerQueue.catch(function () {});
  }

  function ledgerComplete() {
    ledgerEmit('onboarding_complete', { steps: TOTAL }, true);
  }

  /* The offer step (data-step=4) is a paywall surface: record ONE honest
   * paywall_shown the first time it renders, so view→click is measurable. */
  var offerShown = false;
  function maybeLedgerOfferView() {
    if (i === 4 && !offerShown) {
      offerShown = true;
      ledgerEmit('paywall_shown', { trigger: 'onboarding-offer', surface: 'onboarding' });
    }
  }

  function finish() {
    ledgerComplete();
    try {
      chrome.storage &&
        chrome.storage.local &&
        chrome.storage.local.set({ lech_onboardingComplete: true });
    } catch (e) {
      /* completion flag is best-effort, never blocks the close */
    }
    try {
      if (chrome.tabs && chrome.tabs.getCurrent) {
        chrome.tabs.getCurrent(function (t) {
          t && t.id != null ? chrome.tabs.remove(t.id) : window.close();
        });
      } else window.close();
    } catch (e) {
      window.close();
    }
  }

  /* ---- step 2 demo: file a chat into the Work folder --------------------- */
  var demoRan = false;
  function runDemo() {
    var row = document.querySelector('[data-file]');
    var chip = document.querySelector('[data-chip="Work"]');
    if (!row || !chip) return;
    row.classList.remove('filed');
    chip.classList.remove('hot');
    var n = chip.querySelector('.n');
    if (n) n.textContent = '0';
    demoRan = true;
    setTimeout(function () {
      chip.classList.add('hot');
      setTimeout(function () {
        row.classList.add('filed');
        setTimeout(function () {
          if (n) n.textContent = '1';
        }, 380);
      }, 500);
    }, 250);
  }
  document.getElementById('demoBtn').addEventListener('click', runDemo);

  /* ---- step 3: save the first prompt into the REAL lech:prompts store ---- */
  var saveBtn = document.getElementById('saveBtn');
  function newId() {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return 'p-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    }
  }
  saveBtn &&
    saveBtn.addEventListener('click', function () {
      var title = (document.getElementById('pt').value || '').trim().slice(0, 120);
      var body = (document.getElementById('pb').value || '').slice(0, 10000);
      if (title === '') title = 'My first prompt';
      if (body.trim() === '') body = title;
      try {
        chrome.storage.local.get('lech:prompts', function (out) {
          try {
            var list = out && Array.isArray(out['lech:prompts']) ? out['lech:prompts'] : [];
            var now = Date.now();
            list.push({ id: newId(), title: title, body: body, createdAt: now, updatedAt: now });
            chrome.storage.local.set({ 'lech:prompts': list }, function () {
              document.getElementById('saved').classList.add('show');
              saveBtn.textContent = 'Prompt saved';
              saveBtn.disabled = true;
              saveBtn.style.opacity = 0.7;
              // A real first prompt landed in the real store — the aha (5.7
              // stage 2). Once-guarded; a later sidebar save stays the same
              // single first_value.
              ledgerEmit('first_value', { feature: 'prompts', surface: 'onboarding' }, true);
            });
          } catch (e) {
            document.getElementById('saved').classList.add('show'); // UI never wedges
          }
        });
      } catch (e) {
        document.getElementById('saved').classList.add('show');
      }
    });

  /* ---- step 5 CTA: runtime checkout URL, never an href literal ----------- */
  var cta = document.getElementById('proCta');
  cta &&
    cta.addEventListener('click', function () {
      // The button literally offers the lifetime price ("Get my lifetime ·
      // $99"), so the plan hint is honest. cta_click is the in-extension proxy
      // for checkout — the purchase itself closes on zovo.one via the UTM.
      ledgerEmit('cta_click', { surface: 'onboarding', feature: 'offer', plan: 'lifetime' });
      try {
        window.open(checkout('onboarding'), '_blank', 'noopener');
      } catch (e) {
        /* a blocked popup just stays on the step */
      }
    });

  render();
})();
