/* ==========================================================================
   Halaq — Header & mobile drawer navigation
   Handles: scrolled shadow state, the mobile drawer, active-section
   highlighting via IntersectionObserver, and the quick-search dialog.
   Exposed as window.Halaq.nav
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var SCROLL_THRESHOLD = 8;

  var drawer = null;
  var burger = null;
  var releaseFocus = null;

  /**
   * Add the shadowed header state after the page scrolls.
   * @param {HTMLElement} header
   */
  function initScrollState(header) {
    if (!header) return;

    function update() {
      header.classList.toggle("is-scrolled", window.scrollY > SCROLL_THRESHOLD);
    }

    update();
    dom.on(window, "scroll", update, { passive: true });
  }

  /**
   * Open the mobile drawer.
   */
  function openDrawer() {
    if (!drawer || drawer.open) return;

    releaseFocus = dom.trapFocus(drawer);
    drawer.showModal();
    dom.lockScroll(true);

    if (burger) burger.setAttribute("aria-expanded", "true");

    var firstLink = dom.$(".drawer-nav__link", drawer);
    if (firstLink) firstLink.focus();
  }

  /**
   * Close the mobile drawer.
   */
  function closeDrawer() {
    if (!drawer || !drawer.open) return;

    if (releaseFocus) {
      releaseFocus();
      releaseFocus = null;
    }
    drawer.close();
    dom.lockScroll(false);

    if (burger) burger.setAttribute("aria-expanded", "false");
  }

  /**
   * Wire the drawer open/close triggers.
   */
  function initDrawer() {
    drawer = dom.$("[data-drawer]");
    burger = dom.$("[data-drawer-trigger]");

    if (!drawer) return;

    if (burger) {
      dom.on(burger, "click", function () {
        if (drawer.open) closeDrawer();
        else openDrawer();
      });
    }

    // The close control inside the drawer panel
    dom.$$("[data-drawer-close]", drawer).forEach(function (button) {
      dom.on(button, "click", closeDrawer);
    });

    dom.on(drawer, "cancel", function (event) {
      event.preventDefault();
      closeDrawer();
    });

    dom.on(drawer, "click", function (event) {
      if (event.target === drawer) closeDrawer();
    });

    // Navigating away closes the drawer
    dom.$$("a", drawer).forEach(function (link) {
      dom.on(link, "click", closeDrawer);
    });
  }

  /**
   * Extract the hash target from a link, whether the link is a bare hash
   * ("#services") or a cross-page one ("index.html#services").
   * @param {Element} link
   * @returns {string|null}
   */
  function hashOf(link) {
    var href = link.getAttribute("href") || "";
    var index = href.indexOf("#");
    return index === -1 ? null : href.slice(index);
  }

  /**
   * Highlight the nav item for the section currently in view.
   * Uses aria-current so the active state is not conveyed by colour alone.
   */
  function initScrollSpy() {
    var links = dom.$$(".nav__link, .drawer-nav__link");
    if (!links.length || !("IntersectionObserver" in window)) return;

    var sections = links
      .map(function (link) {
        var hash = hashOf(link);
        return { link: link, hash: hash, target: hash ? dom.$(hash) : null };
      })
      .filter(function (item) {
        return item.hash && item.hash !== "#" && item.target;
      });

    if (!sections.length) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          var activeHash = "#" + entry.target.id;

          links.forEach(function (link) {
            var isActive = hashOf(link) === activeHash;
            link.classList.toggle("is-active", isActive);

            if (isActive) link.setAttribute("aria-current", "page");
            else link.removeAttribute("aria-current");
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );

    sections.forEach(function (item) {
      observer.observe(item.target);
    });
  }

  /**
   * Smooth-scroll for in-page links, including cross-page-shaped ones
   * ("index.html#services") when the path part points at the current file.
   */
  function initAnchors() {
    dom.delegate(document, "click", "a[href*='#']", function (event, link) {
      var href = link.getAttribute("href") || "";
      var index = href.indexOf("#");
      if (index === -1) return;

      var hash = href.slice(index);
      if (hash === "#" || hash.length < 2) return;

      /* Only take over when the link targets the page we are already on. */
      var path = href.slice(0, index);
      if (path) {
        var current = window.location.pathname.split("/").pop() || "index.html";
        if (path !== current) return;
      }

      var target = dom.$(hash);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });

      if (history.replaceState) history.replaceState(null, "", hash);

      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });
  }

  function init() {
    initScrollState(dom.$("[data-site-header]"));
    initDrawer();
    initScrollSpy();
    initAnchors();
  }

  Halaq.nav = {
    init: init,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer
  };
})(window.Halaq = window.Halaq || {});
