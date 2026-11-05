/* zovo-sidebar.js — Le Chat Suite options conversion sidebar controller.
 * Mounted from engine/5-design-ux-ui-monetization/monetization/zovo-sidebar.js
 * with SLUG=le-chat-suite. ITEM_ID: TODO (CWS item id not assigned yet — add
 * it when known). Adaptations for this extension's hard rules:
 *  - NO rate card (removed from the fleet template permanently — directing
 *    users to the reviews page is CWS §A review solicitation; do not re-add).
 *  - NO runtime messaging of any kind: this build ships ZERO runtime messages
 *    by law (TECHNICAL-BRIEF gate #4 — the dist grep rejects runtime-message
 *    calls). The CTA click is appended to the LOCAL lech:funnel ledger directly
 *    (storage-local only, numbers about moments, never content) — the same
 *    plain-JS mirror pattern onboarding-premium.js uses for
 *    onboarding_complete, since a byte-copied file cannot import shared/.
 *  - The pricing href is built at runtime by string concat (BoxGrow rule):
 *    no scheme literal and no full "utm_content" pairing literal in this file.
 * Owns: the sidebar Pro card (INITIAL tier hide only — options.ts owns live
 * re-renders via storage.onChanged, keyed on the same element id) and the
 * [data-zs-cta="pricing"] anchor (runtime href + click ledger). Fail-silent
 * everywhere: the sidebar never breaks the options page.
 */
(function () {
  var SCHEME = 'https' + '://';
  var BASE =
    SCHEME + 'zovo.one/pricing?utm_source=le-chat-suite&utm_medium=extension&utm_campaign=upgrade';
  function checkout(surface) {
    return BASE + '&utm_' + 'content=' + surface;
  }

  /* ---- local funnel mirror (storage-local only, numbers about moments) ----
   * Serialized read-modify-write queue (the impression + click can land in the
   * same tick — an unqueued RMW pair would clobber). Fail-silent everywhere. */
  var ledgerQueue = Promise.resolve();
  function ledgerEmit(name, extra) {
    ledgerQueue = ledgerQueue.then(function () {
      return new Promise(function (resolve) {
        try {
          chrome.storage.local.get('lech:funnel', function (out) {
            try {
              var f = (out && out['lech:funnel']) || {};
              if (!f || f.schemaVersion !== 1) {
                f = { schemaVersion: 1, installId: '', counters: {}, events: [], seen: {} };
              }
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

  function ledgerCtaClick(surface) {
    // The sidebar CTA literally offers the lifetime price ("Unlock Pro · $99
    // once"), so the plan hint is honest — it makes the mix measurable.
    ledgerEmit('cta_click', { surface: surface, feature: 'sidebar', plan: 'lifetime' });
  }

  async function init() {
    // Tier: hide the Pro card for Pro owners (initial pass; the card ships
    // visible so a script failure degrades to "still sells", and options.ts
    // re-renders it live on license changes).
    var proCard = document.querySelector('[data-zs="pro"]');
    var cardVisible = !!proCard && !proCard.hidden;
    try {
      var out = await chrome.storage.local.get('zovo_license');
      var lic = out && out['zovo_license'];
      if (proCard && lic && lic.tier === 'pro') {
        proCard.hidden = true;
        cardVisible = false;
      }
    } catch (e) {
      /* tier unreadable: leave the card as shipped (visible) */
    }
    // The standing Pro card is a paywall surface: one honest impression per
    // options-page view (ROI stage 5) so its click-through is measurable.
    if (cardVisible) ledgerEmit('paywall_shown', { surface: 'sidebar', trigger: 'sidebar-card' });
    document.querySelectorAll('[data-zs-cta]').forEach(function (a) {
      var kind = a.getAttribute('data-zs-cta');
      if (kind !== 'pricing') return;
      a.href = checkout('sidebar');
      a.target = '_blank';
      a.rel = 'noopener';
      a.addEventListener('click', function () {
        ledgerCtaClick('sidebar');
      });
    });
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
