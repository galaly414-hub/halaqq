/* ==========================================================================
   Halaq — Service filter
   ---------------------------------------------------------------------------
   Client-side filtering for the services catalogue. It only toggles the
   visibility of rendered cards; it never mutates the service data, so the
   same behaviour works once the list comes from an API.

   The selected category is mirrored into the URL hash (#services=beard) so a
   filtered view can be linked or reloaded. Exposed as window.Halaq.services
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;

  var grid = null;
  var filter = null;
  var countNode = null;
  var emptyNode = null;

  /* Arabic noun forms for the result counter. "two" is written as a word
     rather than "2 خدمتان", which is ungrammatical. */
  var SERVICE_FORMS = {
    zero: "لا توجد خدمات مطابقة",
    one: "خدمة مطابقة",
    two: "خدمتان مطابقتان",
    few: "خدمات مطابقة",
    many: "خدمة مطابقة"
  };

  /**
   * Arabic plural for a counted noun: zero, one, two, 3–10, 11+.
   * @param {number} count
   * @param {Object} forms
   * @returns {string}
   */
  function plural(count, forms) {
    if (count === 0) return forms.zero;
    if (count === 1) return forms.one;
    if (count === 2) return forms.two;
    if (count >= 3 && count <= 10) return forms.few;
    return forms.many;
  }

  /**
   * Items currently rendered in the grid.
   * @returns {Element[]}
   */
  function items() {
    return grid ? dom.$$(".service-grid__item", grid) : [];
  }

  /**
   * Set the pressed state on exactly one pill.
   * @param {Element} button
   */
  function setPressed(button) {
    dom.$$("[data-filter]").forEach(function (pill) {
      var isActive = pill === button;
      pill.classList.toggle("is-active", isActive);
      pill.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  /**
   * Apply a category filter.
   * @param {string} categoryId
   * @param {boolean} [updateHash=true]
   */
  function apply(categoryId, updateHash) {
    if (!grid) return;

    var shown = 0;

    items().forEach(function (item) {
      var category = item.getAttribute("data-category");
      var match = categoryId === "all" || category === categoryId;

      item.hidden = !match;
      if (match) shown += 1;
    });

    var matchingPill = dom.$('[data-filter="' + categoryId + '"]');
    if (matchingPill) setPressed(matchingPill);

    if (countNode) {
      /* "2" reads as the word خدمتان, so the digit is omitted for the dual. */
      dom.render(countNode,
        shown === 2
          ? [dom.el("span", { text: plural(shown, SERVICE_FORMS) })]
          : [
              dom.el("strong", { class: "num", text: fmt.number(shown) }),
              dom.el("span", { text: " " + plural(shown, SERVICE_FORMS) })
            ]
      );
    }

    if (emptyNode) emptyNode.classList.toggle("is-visible", shown === 0);

    if (updateHash !== false) writeHash(categoryId);
  }

  /**
   * Reflect the filter in the address bar without jumping the page.
   * @param {string} categoryId
   */
  function writeHash(categoryId) {
    if (!window.history || !window.history.replaceState) return;

    var base = window.location.pathname + window.location.search;

    if (categoryId === "all") {
      window.history.replaceState(null, "", base + "#services");
    } else {
      window.history.replaceState(null, "", base + "#services=" + categoryId);
    }
  }

  /**
   * Read a category from the URL, e.g. #services=beard
   * @returns {string}
   */
  function readHash() {
    var match = window.location.hash.match(/^#services=([a-z-]+)$/);
    if (!match) return "all";

    var known = dom.$$("[data-filter]").some(function (pill) {
      return pill.getAttribute("data-filter") === match[1];
    });

    return known ? match[1] : "all";
  }

  /**
   * Wire the filter. Safe to call when the markup is absent.
   * @param {Element} [gridNode]
   */
  function init(gridNode) {
    grid = gridNode || dom.$("[data-services-grid]");
    filter = dom.$("[data-services-filter]");
    countNode = dom.$("[data-services-count]");
    emptyNode = dom.$("[data-services-empty]");

    if (!grid) return;

    if (filter) {
      dom.on(filter, "click", function (event) {
        var pill = event.target.closest("[data-filter]");
        if (!pill || !filter.contains(pill)) return;

        event.preventDefault();
        apply(pill.getAttribute("data-filter"));
      });
    }

    // Keep multiple pills in sync when navigating with arrow keys.
    if (filter) {
      dom.on(filter, "keydown", function (event) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

        var pills = dom.$$("[data-filter]");
        var current = pills.indexOf(document.activeElement);
        if (current === -1) return;

        event.preventDefault();

        /* Arrow moves along the reading direction, so ArrowLeft advances. */
        var offset = event.key === "ArrowLeft" ? 1 : -1;
        var next = pills[(current + offset + pills.length) % pills.length];

        if (next) {
          next.focus();
          apply(next.getAttribute("data-filter"));
        }
      });
    }

    dom.on(window, "hashchange", function () {
      apply(readHash(), false);
    });

    apply(readHash(), false);
  }

  Halaq.services = {
    init: init,
    apply: apply
  };
})(window.Halaq = window.Halaq || {});
