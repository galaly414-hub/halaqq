/* ==========================================================================
   Halaq — Admin app boot
   ---------------------------------------------------------------------------
   Wires the guard, the shell, the router and the section registry together.

   Order matters and is the whole file:
     1. theme, so every later measurement uses the final tokens
     2. the auth guard, which may redirect and must run before anything is drawn
     3. demo data, and only then
     4. the shell, which replaces its own placeholder
     5. the first render, which the shell's router asks for

   The shell does not know how to draw a section, and this file does not know
   how to draw the navigation. They meet at one callback.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var admin = Halaq.admin = Halaq.admin || {};

  var auth = admin.auth;
  var nav = admin.nav;
  var shell = admin.shell;
  var sections = admin.sections;

  var mounted = null;

  /* Whether the store's first load has come back yet.

     The store is filled asynchronously, so the router asks for a section before
     there is anything in it. Two things follow from that, and both are about
     telling the truth on screen rather than about the data:

       1. Until the first load lands, the content region shows a loading screen.
          Rendering the dashboard over an empty store would print a confident
          zero on every tile.
       2. After it lands, the region is repainted whenever the store changes,
          so a booking marked from another tab shows up here without the
          receptionist having to press refresh. */
  var settled = false;

  /**
   * The counts beside the section names, so a receptionist can see that three
   * people are waiting without opening the queue at all.
   */
  function paintCounts() {
    var records = Halaq.bookings.all();

    var counts = {
      bookings: records.length,
      queue: records.filter(function (record) {
        return record.status === "waiting" ||
          record.status === "attended" ||
          record.status === "in_service";
      }).length
    };

    dom.$$("[data-count-for]").forEach(function (node) {
      var value = counts[node.getAttribute("data-count-for")];
      node.textContent = value ? fmt.number(value) : "";
    });
  }

  /**
   * Draw a section into the content area.
   *
   * @param {Object} section
   * @param {{keepFocus?: boolean}} [opts] `keepFocus` is for repaints caused by
   *        the data changing under the user, where moving focus would be rude
   */
  function paint(section, opts) {
    opts = opts || {};

    var target = dom.$("[data-admin-content]");
    if (!target) return;

    dom.render(target, settled
      ? sections.render(section)
      : sections.renderLoading(section));
    paintCounts();

    /* Moving focus into the content region is what makes a single-page
       router usable from a keyboard: without it, tabbing walks the sidebar
       again instead of reaching the new content. Skipped on a data-driven
       repaint, where the user did not ask to be moved anywhere. */
    if (opts.keepFocus) return;

    var main = dom.$("#main");
    if (main) main.focus({ preventScroll: true });
  }

  /**
   * Repaint after the store changed, without interrupting anybody.
   *
   * If the caret is inside the content region — a search box being typed into,
   * a select with the keyboard open — the region is left exactly as it is. Only
   * the counts beside the section names are refreshed, so a booking landing
   * from another tab updates the sidebar without pulling the receptionist out
   * of the field they are in. Everything else repaints.
   */
  function repaint() {
    paintCounts();

    var content = dom.$("[data-admin-content]");
    var active = document.activeElement;

    if (content && active && active !== document.body && content.contains(active)) {
      return;
    }

    paint(nav.resolve(window.location.hash.replace(/^#/, "")), { keepFocus: true });
  }

  async function init() {
    Halaq.theme.init();

    /* The guard. If nobody is signed in this never returns: auth.require()
       redirects to login.html and everything below is dead code. */
    var user = auth.require();
    if (!user) return null;

    /* The roster seeds itself from Halaq.demoData, and a section that reads the
       roster can reach the screen before the content load has finished. The
       "settled" flag below tracks the booking store, not this, so it is no
       guarantee: waiting here is what keeps the first paint from asking for
       data that has not arrived. demoDataReady always settles — the loader
       falls back to the local files rather than rejecting — and the guard means
       even a bootstrap failure still leaves a working page. */
    try {
      await (Halaq.demoDataReady || Promise.resolve(Halaq.demoData));
    } catch (error) {
      console.error("تعذّر تحميل بيانات المحتوى:", error);
    }

    /* Seeded here and only here, and only into an empty store, so the
       workspace is never a set of empty boxes but a real booking is never
       buried under samples either. */
    Halaq.bookings.seedDemoIfEmpty();

    /* The store's own change signal, registered before the first paint so
       nothing lands between the two. The store is also asked whether its first
       load already finished: it starts at module scope, and a cached or instant
       answer can come back before this file has finished booting, in which case
       the signal has been and gone and a screen waiting on it would never
       leave its loading state. */
    Halaq.bookings.onChange(function () {
      settled = true;
      repaint();
    });

    settled = Halaq.bookings.isSettled();

    mounted = shell.init({
      user: user,
      onRoute: paint
    });

    if (!mounted) return null;

    dom.delegate(document, "click", "[data-action=refresh-demo]", function (event) {
      event.preventDefault();

      settled = true;
      Halaq.bookings.seedDemoIfEmpty();

      /* Forced rather than the guarded repaint: the button lives inside the
         content region, so the guard would read the click as "somebody is
         typing" and skip the very repaint that was asked for. Repainted
         straight away so the screen answers the press at once, and repainted
         again when the store reports back. */
      paint(nav.resolve(window.location.hash.replace(/^#/, "")), { keepFocus: true });

      /* Then asked for the outcome rather than assuming it. The store's own
         change signal does the second repaint; this only reports. "تم التحديث"
         on a request that came back empty is the same lie as a dashboard full
         of zeroes — it tells the user their problem is solved. */
      Halaq.bookings.refresh().then(function () {
        if (Halaq.bookings.loadError()) {
          Halaq.toast.show({
            title: "لم يُحمَّل السجل",
            message: "تعذّر الوصول إلى الخادم. الأرقام المعروضة قد تكون ناقصة.",
            tone: "danger",
            duration: 6000
          });
          return;
        }

        Halaq.toast.show({
          title: "تم التحديث",
          message: "أُعيد تحميل سجل الحجوزات.",
          tone: "success"
        });
      });
    });

    /* The bell belongs to the page rather than the shell, so it is wired
       here — and it says something, rather than opening an empty panel. */
    dom.delegate(document, "click", "[data-action=notifications]", function () {
      Halaq.toast.show({
        title: "لا توجد إشعارات",
        message: "ستظهر هنا تنبيهات الطابور وتجاوز مواعيد الحجز.",
        tone: "info"
      });
    });

    /* A session cleared in another tab should take this one with it. */
    dom.on(window, "storage", function (event) {
      if (event.key === "halaq.admin.session" && !event.newValue) auth.logout();
    });

    document.documentElement.classList.add("is-ready");

    return mounted;
  }

  admin.app = {
    init: init,
    paint: paint,
    paintCounts: paintCounts
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.Halaq = window.Halaq || {});
