/* ==========================================================================
   Halaq — Toast notifications
   Usage:
     Halaq.toast.show({ title: "تم الحفظ", message: "…", tone: "success" })
   The region is aria-live="polite"; every toast has role="status" so the
   text is announced without stealing focus.
   Exposed as window.Halaq.toast
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;

  /* One tone, one glyph, and no synonyms.

     "error" and "danger" were both reaching this function and rendering two
     different things: error produced a class the stylesheet has no rule for, so
     the toast came out untinted, and danger wore a cross — a glyph that means
     "dismiss this", not "something went wrong". Both now resolve to the same
     tone and the same triangle, and "error" is kept as an accepted spelling
     because callers already use it. */
  var TONES = {
    success: "check-circle",
    warning: "alert-triangle",
    danger: "alert-triangle",
    error: "alert-triangle",
    info: "info",
    brand: "info"
  };

  var DEFAULT_DURATION = 4200;
  var region = null;

  /**
   * Lazily create the live region.
   * @returns {HTMLElement}
   */
  function getRegion() {
    if (region && document.body.contains(region)) return region;

    region = dom.$("[data-toast-region]");

    if (!region) {
      region = dom.el("div", {
        class: "toast-region",
        "data-toast-region": "",
        role: "region",
        "aria-label": "الإشعارات",
        "aria-live": "polite",
        "aria-atomic": "false"
      });
      document.body.appendChild(region);
    }

    return region;
  }

  /**
   * Show a toast.
   * @param {Object} options
   * @param {string} options.title
   * @param {string} [options.message]
   * @param {string} [options.tone] - success | warning | danger | info | brand
   * @param {number} [options.duration] - milliseconds, 0 to disable auto-close
   * @returns {Function} dismiss
   */
  function show(options) {
    options = options || {};

    var tone = TONES[options.tone] ? options.tone : "info";
    var duration = typeof options.duration === "number" ? options.duration : DEFAULT_DURATION;

    var closeButton = dom.el("button", {
      type: "button",
      class: "toast__close",
      "aria-label": "إغلاق الإشعار"
    });
    closeButton.appendChild(dom.icon("close"));

    var content = dom.el("div", { class: "toast__content" }, [
      dom.el("p", { class: "toast__title", text: options.title || "" })
    ]);

    if (options.message) {
      content.appendChild(dom.el("p", { class: "toast__message", text: options.message }));
    }

    var node = dom.el("div", {
      class: "toast toast--" + tone,
      role: "status"
    }, [
      dom.el("span", { class: "toast__icon" }, [dom.icon(TONES[tone])]),
      content,
      closeButton
    ]);

    if (duration > 0) {
      node.appendChild(
        dom.el("span", {
          class: "toast__progress",
          style: "animation-duration:" + duration + "ms"
        })
      );
    }

    getRegion().appendChild(node);

    var timer = null;
    var dismissed = false;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      if (timer) window.clearTimeout(timer);

      node.classList.remove("is-visible");
      window.setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 240);
    }

    closeButton.addEventListener("click", dismiss);
    node.addEventListener("mouseenter", function () {
      if (timer) window.clearTimeout(timer);
    });
    node.addEventListener("mouseleave", function () {
      if (duration > 0) timer = window.setTimeout(dismiss, 1600);
    });

    // Let the browser paint the entry state before transitioning.
    window.requestAnimationFrame(function () {
      node.classList.add("is-visible");
    });

    if (duration > 0) timer = window.setTimeout(dismiss, duration);

    return dismiss;
  }

  /**
   * Clear every visible toast.
   */
  function clearAll() {
    dom.$$("[data-toast-region] .toast__close").forEach(function (button) {
      button.click();
    });
  }

  Halaq.toast = {
    show: show,
    clearAll: clearAll,
    success: function (title, message) {
      return show({ title: title, message: message, tone: "success" });
    },
    error: function (title, message) {
      return show({ title: title, message: message, tone: "danger" });
    },
    info: function (title, message) {
      return show({ title: title, message: message, tone: "info" });
    }
  };
})(window.Halaq = window.Halaq || {});
