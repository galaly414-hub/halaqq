/* ==========================================================================
   Halaq — Theme controller
   Dark is the default brand look; light is an accessibility-friendly
   alternative. The choice is stored in localStorage and applied as a
   data-theme attribute on <html> so CSS variables can swap instantly.
   Exposed as window.Halaq.theme
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var STORAGE_KEY = "halaq:theme";
  var DEFAULT_THEME = "dark";
  var THEMES = ["dark", "light"];

  var current = DEFAULT_THEME;
  var listeners = [];

  /**
   * Resolve the initial theme: stored value, else OS preference for light.
   * @returns {string}
   */
  function resolveInitial() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && THEMES.indexOf(stored) !== -1) return stored;
    } catch (error) {
      /* storage unavailable — fall through to the default */
    }

    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }

    return DEFAULT_THEME;
  }

  /**
   * Apply a theme to the document and notify listeners.
   * @param {string} theme
   * @param {boolean} [persist=true]
   */
  function apply(theme, persist) {
    if (THEMES.indexOf(theme) === -1) theme = DEFAULT_THEME;

    current = theme;
    document.documentElement.setAttribute("data-theme", theme);

    var meta = dom.$('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", theme === "light" ? "#f3eee6" : "#0e0d0c");
    }

    if (persist !== false) {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch (error) {
        /* ignore: theme simply will not persist */
      }
    }

    listeners.forEach(function (listener) {
      listener(current);
    });
  }

  /**
   * Flip between dark and light.
   */
  function toggle() {
    apply(current === "dark" ? "light" : "dark");
  }

  /**
   * Subscribe to theme changes.
   * @param {Function} listener
   * @returns {Function} unsubscribe
   */
  function onChange(listener) {
    listeners.push(listener);
    return function () {
      listeners = listeners.filter(function (item) {
        return item !== listener;
      });
    };
  }

  /**
   * Wire up every [data-theme-toggle] button on the page.
   * Each toggle keeps its icon and label in sync with the current theme.
   */
  function init() {
    apply(resolveInitial(), false);

    dom.$$("[data-theme-toggle]").forEach(function (button) {
      dom.on(button, "click", function () {
        toggle();
      });
    });

    onChange(function (theme) {
      var isDark = theme === "dark";

      dom.$$("[data-theme-toggle]").forEach(function (button) {
        var sun = dom.$(".icon--sun", button);
        var moon = dom.$(".icon--moon", button);

        if (sun) sun.style.display = isDark ? "" : "none";
        if (moon) moon.style.display = isDark ? "none" : "";

        button.setAttribute("aria-label", isDark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن");
        button.setAttribute("title", isDark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن");
      });
    });

    // Keep multiple tabs in sync
    dom.on(window, "storage", function (event) {
      if (event.key === STORAGE_KEY && event.newValue) {
        apply(event.newValue, false);
      }
    });
  }

  Halaq.theme = {
    init: init,
    apply: apply,
    toggle: toggle,
    onChange: onChange,
    get: function () {
      return current;
    }
  };
})(window.Halaq = window.Halaq || {});
