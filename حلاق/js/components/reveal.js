/* ==========================================================================
   Halaq — Scroll reveal
   Progressive enhancement: elements marked [data-reveal] fade in once they
   enter the viewport. If IntersectionObserver is missing, or the user
   prefers reduced motion, everything is shown immediately.
   Exposed as window.Halaq.reveal
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var observer = null;

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * Create the shared observer on first use.
   * @returns {IntersectionObserver|null}
   */
  function getObserver() {
    if (observer || !("IntersectionObserver" in window)) return observer;

    observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );

    return observer;
  }

  /**
   * Mark and observe all [data-reveal] elements under `scope`.
   * @param {ParentNode} [scope=document]
   */
  function observe(scope) {
    var nodes = dom.$$("[data-reveal]", scope);

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      nodes.forEach(function (node) {
        node.classList.add("is-visible");
      });
      return;
    }

    var io = getObserver();

    nodes.forEach(function (node, index) {
      node.classList.add("reveal");
      // Stagger siblings slightly for a smoother cascade.
      var delay = node.getAttribute("data-reveal-delay");
      if (delay) {
        node.style.transitionDelay = delay + "ms";
      } else if (index < 6) {
        node.style.transitionDelay = index * 70 + "ms";
      }
      io.observe(node);
    });
  }

  Halaq.reveal = {
    observe: observe
  };
})(window.Halaq = window.Halaq || {});
