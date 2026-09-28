/* ==========================================================================
   Halaq — Application bootstrap
   Wires the components together and mounts the page content.

   The catalogue, the team and the copy still come from demoData — that is what
   it is for, and it is the single place to swap when they are served. The
   booking flow, the tracker and the admin are already on the real store, so
   anything a customer sees about a booking comes from there and not from here.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var render = Halaq.render;

  /* The mounted content. Read from Halaq.demoData on demand rather than
     captured at load time: the catalogue is fetched asynchronously, so at the
     moment this module is evaluated Halaq.demoData is still undefined, and a
     variable holding it would stay undefined for the life of the page. */
  var data = null;

  /* Service currently shown in the details dialog, so its "book" button can
     start the flow with that service already chosen. */
  var lastOpenedService = null;

  /**
   * The mounted content, or null before it has loaded.
   * @returns {Object|null}
   */
  function content() {
    return data;
  }

  /* =====================================================================
     Section mounting
     ===================================================================== */

  /**
   * Fill a container with a renderer + dataset. Safe to call repeatedly.
   * @param {string|Element} container
   * @param {Function} renderer
   * @param {Array} items
   */
  function mount(container, renderer, items) {
    var node = typeof container === "string" ? dom.$(container) : container;
    if (!node) return;
    dom.render(node, items.map(renderer));
  }

  /**
   * Mount every demo section on the page.
   * Each mount point is optional: a page that does not include a section
   * simply skips it, so the same bootstrap serves the home page and the
   * design-system showcase.
   */
  function mountContent() {
    /* Every section reads through list() rather than reaching into the payload
       directly. The loader builds this object from a database row set and from
       a local fallback file, and those two are not guaranteed to carry
       identical keys — a missing list is a real state, and it should render as
       an empty section rather than stop the rest of the page. */
    function list(key) {
      return Array.isArray(data[key]) ? data[key] : [];
    }

    /* The hero is the one nested object rather than a list. */
    var hero = data.hero && typeof data.hero === "object" ? data.hero : {};

    /* --- Hero --- */
    mount("[data-mount='hero-highlights']", function (item) {
      return dom.el("span", { class: "hero__highlight" }, [
        dom.icon(item.icon),
        dom.el("span", { text: item.label })
      ]);
    }, Array.isArray(hero.highlights) ? hero.highlights : []);

    mount("[data-mount='hero-slots']", render.slotRow, Array.isArray(hero.slots) ? hero.slots : []);

    /* --- Services --- */
    var services = list("services");
    var serviceGrid = dom.$("[data-mount='services']");
    if (serviceGrid) {
      dom.render(
        serviceGrid,
        services.map(function (service) {
          return render.serviceCard(service, list("serviceCategories"));
        })
      );
    }

    var serviceFilter = dom.$("[data-mount='service-filter']");
    if (serviceFilter) {
      dom.render(serviceFilter, [render.categoryFilter(list("serviceCategories"))]);
    }

    /* --- Booking journey --- */
    mount("[data-mount='how-it-works']", render.stepCard, list("howItWorks"));

    /* --- Supporting sections --- */
    mount("[data-mount='stats']", render.statCard, list("stats"));
    mount("[data-mount='barbers']", render.barberCard, list("barbers"));
    mount("[data-mount='features']", render.featureCard, list("features"));
    mount("[data-mount='reviews']", render.reviewCard, list("reviews"));
    mount("[data-mount='gallery']", render.galleryTile, list("gallery"));

    /* --- Navigation --- */
    var nav = list("nav");
    var desktopNav = dom.$("[data-mount='nav-desktop']");
    if (desktopNav) {
      dom.render(desktopNav, [render.navList(nav, "nav__list", "nav__link")]);
    }

    var drawerNav = dom.$("[data-mount='nav-drawer']");
    if (drawerNav) {
      dom.render(drawerNav, [
        render.navList(nav, "drawer-nav__list", "drawer-nav__link")
      ]);
    }

    var footerNav = dom.$("[data-mount='nav-footer']");
    if (footerNav) {
      dom.render(footerNav, [
        render.navList(nav, "site-footer__list", "site-footer__link")
      ]);
    }

    /* --- Small inline mounts --- */
    mount("[data-mount='year']", function (value) {
      return dom.el("span", { text: String(value) });
    }, [new Date().getFullYear()]);

    var brand = data.brand && typeof data.brand === "object" ? data.brand : {};

    mount("[data-mount='hours']", function (row) {
      return dom.el("li", { class: "contact-list__item" }, [
        dom.el("span", { class: "contact-list__icon" }, [dom.icon("clock")]),
        dom.el("span", {}, [
          dom.el("span", { class: "contact-list__label", text: row.days }),
          dom.el("span", { class: "contact-list__value num", text: row.time })
        ])
      ]);
    }, Array.isArray(brand.hours) ? brand.hours : []);

    /* Cheapest service price, shown in the sticky booking bar */
    var cheapest = services.reduce(function (lowest, service) {
      return !lowest || service.price < lowest.price ? service : lowest;
    }, null);

    var fromLabel = dom.$("[data-booking-from-price]");
    if (fromLabel && cheapest) {
      fromLabel.textContent = Halaq.format.money(cheapest.price);
    }
  }

  /* =====================================================================
     Service details dialog
     ===================================================================== */

  /**
   * Populate and open the service details dialog.
   * @param {string} serviceId
   */
  function openService(serviceId) {
    var services = Array.isArray(data && data.services) ? data.services : [];
    var service = services.filter(function (item) {
      return item.id === serviceId;
    })[0];

    if (!service) return;

    lastOpenedService = service.id;

    var modal = Halaq.modal.open("#service-modal", { title: service.name });
    if (!modal) return;

    var categories = Array.isArray(data.serviceCategories) ? data.serviceCategories : [];
    var includes = Array.isArray(service.includes) ? service.includes : [];

    dom.render(dom.$("[data-service-details]", modal), [
      dom.el("div", { class: "cluster cluster--2" }, [
        dom.el("span", { class: "icon-tile" }, [dom.icon(service.icon)]),
        dom.el("div", { class: "stack stack--1" }, [
          dom.el("strong", { text: service.name }),
          dom.el("span", {
            class: "text-muted",
            text: render.categoryLabel(service.category, categories)
          })
        ])
      ]),
      dom.el("p", { class: "text-secondary", text: service.description }),
      render.priceRow(service),
      dom.el("hr", { class: "divider" }),
      dom.el("h4", { class: "h5", text: "ماذا تشمل الخدمة" }),
      dom.el("ul", { class: "stack stack--2", role: "list" },
        includes.map(function (item) {
          return dom.el("li", { class: "cluster cluster--2 items-start" }, [
            dom.icon("check", "icon--sm icon--success"),
            dom.el("span", { class: "text-secondary", text: item })
          ]);
        })
      ),

      /* The way out of this dialog. Without it the details were a dead end:
         the customer read the price and had to close the dialog to go and find
         the booking button they had just been reading about. It carries no
         value of its own — openBooking() falls back to the service the dialog
         is currently showing — so it starts the flow with this service already
         chosen. */
      dom.el("div", { class: "modal__actions" }, [
        dom.el("button", {
          type: "button",
          class: "btn btn--primary btn--block",
          "data-booking-cta": ""
        }, [
          dom.icon("calendar-check", "icon--sm"),
          dom.el("span", { text: "احجز " + service.name })
        ])
      ])
    ]);
  }

  /* =====================================================================
     Demo form (validation showcase only)
     ===================================================================== */

  /**
   * Write the validation message for a field.
   * Writes into the inner <span> so the warning icon inside the message
   * wrapper survives — setting textContent on the wrapper would delete it.
   * @param {HTMLElement} field
   * @param {string} text
   */
  function setFieldError(field, text) {
    var wrapper = dom.$("[data-error-message]", field);
    if (!wrapper) return;

    var target = dom.$("span", wrapper) || wrapper;
    target.textContent = text || "";
  }

  /**
   * Minimal client-side validation used to demonstrate the field states.
   * Replace with real rules when the booking form is built.
   * @param {HTMLFormElement} form
   * @returns {boolean}
   */
  function validateForm(form) {
    var valid = true;

    dom.$$(".field", form).forEach(function (field) {
      var control = dom.$(".input, .textarea, .select", field);
      if (!control) return;

      var value = (control.value || "").trim();
      var failed = false;

      if (control.hasAttribute("required") && !value) {
        failed = true;
        setFieldError(field, "هذا الحقل مطلوب.");
      } else if (control.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        failed = true;
        setFieldError(field, "يرجى إدخال بريد إلكتروني صحيح.");
      } else if (control.type === "tel" && value && !/^[\d+\s()-]{7,}$/.test(value)) {
        failed = true;
        setFieldError(field, "يرجى إدخال رقم هاتف صحيح.");
      } else {
        setFieldError(field, "");
      }

      field.classList.toggle("is-invalid", failed);
      control.setAttribute("aria-invalid", failed ? "true" : "false");
      if (failed) valid = false;
    });

    return valid;
  }

  /**
   * Wire every demo form on the page.
   */
  function initDemoForms() {
    dom.$$("[data-demo-form]").forEach(function (form) {
      dom.on(form, "submit", function (event) {
        event.preventDefault();

        if (!validateForm(form)) {
          Halaq.toast.error(
            "يرجى تصحيح الحقول المطلوبة",
            "بعض الحقول تحتوي على بيانات غير صحيحة."
          );
          var firstInvalid = dom.$(
            ".field.is-invalid .input, .field.is-invalid .textarea, .field.is-invalid .select",
            form
          );
          if (firstInvalid) firstInvalid.focus();
          return;
        }

        var button = dom.$("[type='submit']", form);

        if (button) {
          button.setAttribute("data-loading", "true");
          button.setAttribute("aria-busy", "true");
          button.disabled = true;
        }

        // Simulated request — replaced by the real endpoint when the contact
        // channel is wired up.
        window.setTimeout(function () {
          if (button) {
            button.removeAttribute("data-loading");
            button.removeAttribute("aria-busy");
            button.disabled = false;
          }
          form.reset();
          dom.$$(".field", form).forEach(function (field) {
            field.classList.remove("is-invalid");
            setFieldError(field, "");
          });
          Halaq.toast.success(
            "تم استلام طلبك",
            "سنتواصل معك لتأكيد الموعد."
          );
        }, 1100);
      });

      // Clear the error state as soon as the user edits the field
      dom.on(form, "input", function (event) {
        var field = event.target.closest(".field");
        if (field && field.classList.contains("is-invalid")) {
          field.classList.remove("is-invalid");
          setFieldError(field, "");
          event.target.setAttribute("aria-invalid", "false");
        }
      });
    });
  }

  /* =====================================================================
     Booking calls to action
     ---------------------------------------------------------------------
     Steps 1 (service) and 2 (barber) live in js/components/booking-flow.js.
     Date and time selection is the next step and is not built yet, so the
     flow stops there.
     ===================================================================== */

  /**
   * Handle a booking call to action.
   * @param {Element} trigger
   */
  function openBooking(trigger) {
    var serviceId = trigger.getAttribute("data-booking-cta");

    /* The details dialog's own button carries no value, so fall back to the
       service it is currently showing. */
    if (!serviceId && lastOpenedService) serviceId = lastOpenedService;

    /* Booking opened from inside the details dialog replaces it rather than
       stacking on top. The customer has read what they came to read, and a
       second dialog above the first only lengthens the way out — and leaves the
       close button fighting the one above it for the Escape key. */
    var details = dom.$("#service-modal");
    if (details && details.open) Halaq.modal.close(details);

    Halaq.bookingFlow.open(serviceId || null);
  }

  /**
   * Wire every booking-related control on the page.
   *
   * "لدي حجز بالفعل" is a plain link to track.html rather than a button: it
   * goes to another page, so it should behave like one, work without
   * JavaScript, and be openable in a new tab. Nothing to wire.
   */
  function initBookingCtas() {
    dom.delegate(document, "click", "[data-booking-cta]", function (event, trigger) {
      event.preventDefault();
      openBooking(trigger);
    });
  }

  /* =====================================================================
     Global shortcuts
     ===================================================================== */

  /**
   * "/" focuses the search field, "Escape" closes any open layer.
   */
  function initShortcuts() {
    dom.on(document, "keydown", function (event) {
      var tag = (event.target.tagName || "").toLowerCase();

      if (event.key === "/" && tag !== "input" && tag !== "textarea") {
        var search = dom.$("[data-search-input]");
        if (search) {
          event.preventDefault();
          search.focus();
        }
      }
    });
  }

  /* =====================================================================
     Boot
     ===================================================================== */

  /**
   * Wire everything on the page. Runs once the catalogue is in hand.
   *
   * The DOM-only wiring is deliberately done before the wait and the
   * data-dependent work after it: the theme, the modals and the booking flow
   * only need the markup, so they are live immediately and the page is usable
   * while the catalogue is still arriving. Only the sections that render
   * catalogue content wait.
   */
  async function init() {
    // Theme first so every later measurement uses the final tokens.
    Halaq.theme.init();
    Halaq.modal.init();

    /* Markup-only wiring, so it is not held up by the network. */
    Halaq.services.init();
    Halaq.bookingBar.init();
    Halaq.bookingFlow.init();
    initBookingCtas();
    initShortcuts();

    dom.delegate(document, "click", "[data-service-open]", function (event, trigger) {
      event.preventDefault();
      openService(trigger.getAttribute("data-service-open"));
    });

    dom.delegate(document, "click", ".card__link", function (event, link) {
      event.preventDefault();
      openService(link.getAttribute("data-service-id"));
    });

    /* The catalogue. demoDataReady always settles — the loader falls back to
       the local files rather than rejecting — but a last-resort guard here
       means a bootstrap failure still leaves a working page instead of an
       unhandled rejection and a blank screen. */
    try {
      await (Halaq.demoDataReady || Promise.resolve(Halaq.demoData));
    } catch (error) {
      console.error("تعذّر تحميل بيانات المحتوى:", error);
    }

    data = Halaq.demoData || {};

    // Content must be mounted before the nav controller runs: the scroll
    // spy resolves ".nav__link" targets, which do not exist until then.
    mountContent();

    Halaq.nav.init();
    initDemoForms();
    Halaq.reveal.observe();

    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  Halaq.app = { init: init, mount: mount, openService: openService };
})(window.Halaq = window.Halaq || {});
