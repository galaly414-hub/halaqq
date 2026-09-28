/* ==========================================================================
   Halaq — Sticky booking bar
   ---------------------------------------------------------------------------
   Shows a compact pair of calls to action on small screens, once the hero
   buttons have scrolled out of view, and hides it again over the contact
   section so it never covers the address or opening hours.

   The bar is hidden from 64rem up in CSS, where the header already carries
   a persistent booking button. Exposed as window.Halaq.bookingBar
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;

  var bar = null;
  var heroAnchor = null;
  var hideAnchor = null;

  /**
   * Should the bar be on screen right now?
   * @returns {boolean}
   */
  function shouldShow() {
    if (!bar || !heroAnchor) return false;

    var pastHero = heroAnchor.getBoundingClientRect().bottom < 0;

    if (!pastHero) return false;

    /* Hide once the footer or contact details come into view. */
    if (hideAnchor) {
      var rect = hideAnchor.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.6) return false;
    }

    return true;
  }

  /**
   * Sync visibility with the current scroll position.
   */
  function update() {
    if (!bar) return;
    bar.classList.toggle("is-visible", shouldShow());
  }

  /**
   * Throttle updates to one per animation frame.
   */
  function schedule() {
    window.requestAnimationFrame(update);
  }

  /**
   * Wire the bar. Safe to call when the markup is absent.
   */
  function init() {
    bar = dom.$("[data-booking-bar]");
    heroAnchor = dom.$("[data-booking-hero]");
    hideAnchor = dom.$("[data-booking-hide]");

    if (!bar) return;

    /* Reserve room so the bar never sits on top of page content. */
    document.documentElement.classList.add("has-booking-bar");

    update();
    dom.on(window, "scroll", schedule, { passive: true });
    dom.on(window, "resize", schedule);
  }

  Halaq.bookingBar = {
    init: init,
    update: update
  };
})(window.Halaq = window.Halaq || {});
