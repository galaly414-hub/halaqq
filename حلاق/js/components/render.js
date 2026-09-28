/* ==========================================================================
   Halaq — Renderers
   Turns the demo data into the reusable card / badge components.
   Each renderer takes a data object and returns a DOM node, so the same
   functions can be reused on other pages without touching the data layer.
   Exposed as window.Halaq.render
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;

  /* =====================================================================
     Shared partials
     ===================================================================== */

  /**
   * Star rating. Uses filled + outline stars plus a numeric value so the
   * rating is readable without relying on colour.
   * @param {number} value
   * @param {number} [count]
   * @returns {HTMLElement}
   */
  function rating(value, count) {
    var stars = dom.el("span", {
      class: "rating__stars",
      role: "img",
      "aria-label": "التقييم " + value + " من 5"
    });

    for (var i = 1; i <= 5; i += 1) {
      var star = dom.icon("star", "icon--fill");
      star.setAttribute("data-filled", String(i <= Math.round(value)));
      stars.appendChild(star);
    }

    var wrap = dom.el("span", { class: "rating" }, [stars]);

    wrap.appendChild(
      dom.el("span", { class: "rating__value num", text: String(value) })
    );

    if (typeof count === "number") {
      wrap.appendChild(
        dom.el("span", {
          class: "rating__count",
          text: "(" + fmt.number(count) + " تقييم)"
        })
      );
    }

    return wrap;
  }

  /**
   * Small metadata row: icon + value.
   * @param {string} iconName
   * @param {string} text
   * @returns {HTMLElement}
   */
  function metaItem(iconName, text) {
    return dom.el("span", { class: "cluster cluster--2 text-muted" }, [
      dom.el("span", { class: "cluster cluster--1" }, [dom.icon(iconName, "icon--sm")]),
      dom.el("span", { text: text })
    ]);
  }

  /**
   * Price + duration row shown in service card footers.
   * @param {Object} service
   * @returns {HTMLElement}
   */
  function priceRow(service) {
    return dom.el("div", { class: "cluster cluster--4" }, [
      dom.el("span", { class: "cluster cluster--2" }, [
        dom.icon("banknote", "icon--sm icon--brand"),
        dom.el("strong", { text: fmt.money(service.price) })
      ]),
      dom.el("span", { class: "cluster cluster--2" }, [
        dom.icon("clock", "icon--sm"),
        dom.el("span", {
          text: "المدة " + fmt.number(service.duration) + " دقيقة"
        })
      ])
    ]);
  }

  /* =====================================================================
     Service catalogue
     ===================================================================== */

  /**
   * Look up an Arabic label for a category id.
   * @param {string} id
   * @param {Array} categories
   * @returns {string}
   */
  function categoryLabel(id, categories) {
    var match = (categories || []).filter(function (item) {
      return item.id === id;
    })[0];
    return match ? match.label : id;
  }

  /**
   * Service card used by the services section and the services page.
   * Wrapped in .service-grid__item so the filter controller can hide it.
   * @param {Object} service
   * @param {Array} categories
   * @returns {HTMLElement}
   */
  function serviceCard(service, categories) {
    var heading = dom.el("div", { class: "service-card__heading" }, [
      dom.el("h3", { class: "service-card__name" }, [
        dom.el("a", {
          class: "card__link",
          href: "#",
          "data-service-id": service.id,
          text: service.name
        })
      ]),
      dom.el("span", {
        class: "service-card__category",
        text: categoryLabel(service.category, categories)
      })
    ]);

    var top = dom.el("div", { class: "service-card__top" }, [
      dom.el("span", { class: "service-card__icon" }, [
        dom.icon(service.icon || "scissors")
      ]),
      heading
    ]);

    if (service.badge) {
      top.appendChild(
        dom.el("div", { class: "card__actions" }, [
          dom.el(
            "span",
            { class: "badge badge--" + (service.badge.tone || "brand") },
            [service.badge.label]
          )
        ])
      );
    }

    /* First three inclusions keep the card scannable; the full list is
       rendered in the details dialog. */
    var includes = dom.el(
      "ul",
      { class: "service-card__includes", role: "list" },
      (service.includes || []).slice(0, 3).map(function (item) {
        return dom.el("li", {}, [
          dom.icon("check"),
          dom.el("span", { text: item })
        ]);
      })
    );

    var meta = dom.el("div", { class: "service-card__meta" }, [
      dom.el("p", { class: "service-card__price" }, [
        dom.el("span", { class: "num", text: fmt.number(service.price) }),
        dom.el("span", { class: "currency", text: "ر.س" })
      ]),
      dom.el("span", { class: "service-card__duration" }, [
        dom.icon("clock"),
        dom.el("span", { text: fmt.number(service.duration) + " دقيقة" })
      ])
    ]);

    var actions = dom.el("div", { class: "service-card__actions" }, [
      dom.el(
        "button",
        {
          type: "button",
          class: "btn btn--primary btn--sm service-card__book",
          "data-booking-cta": service.id
        },
        [
          dom.el("span", { text: "احجز هذه الخدمة" }),
          dom.icon("calendar-check", "icon--sm")
        ]
      ),
      dom.el(
        "button",
        {
          type: "button",
          class: "btn btn--ghost btn--sm service-card__details",
          "data-service-open": service.id
        },
        [dom.el("span", { text: "التفاصيل" })]
      )
    ]);

    var card = dom.el(
      "article",
      {
        class:
          "card card--interactive service-card" +
          (service.featured ? " service-card--featured" : "")
      },
      [
        top,
        dom.el("div", { class: "service-card__body" }, [
          dom.el("p", { class: "service-card__desc", text: service.description }),
          includes
        ]),
        /* Price and actions share one ruled footer: the number the customer
           came for, and the one control that acts on it, side by side. */
        dom.el("div", { class: "service-card__foot" }, [meta, actions])
      ]
    );

    return dom.el("div", {
      class: "service-grid__item",
      "data-category": service.category
    }, [card]);
  }

  /**
   * Category filter pills. Active state is aria-pressed, not colour alone.
   * @param {Array} categories
   * @param {string} [activeId]
   * @returns {HTMLElement}
   */
  function categoryFilter(categories, activeId) {
    return dom.el(
      "ul",
      { class: "service-filter__list", role: "list" },
      categories.map(function (category) {
        var isActive = category.id === (activeId || "all");

        return dom.el("li", { class: "service-filter__item" }, [
          dom.el(
            "button",
            {
              type: "button",
              class: "tag" + (isActive ? " is-active" : ""),
              "aria-pressed": isActive ? "true" : "false",
              "data-filter": category.id,
              text: category.label
            }
          )
        ]);
      })
    );
  }

  /* =====================================================================
     How it works — one step
     ===================================================================== */

  /**
   * @param {Object} step
   * @param {number} index
   * @returns {HTMLElement}
   */
  function stepCard(step, index) {
    return dom.el("li", { class: "step" }, [
      dom.el("span", { class: "step__index", "aria-hidden": "true" }, [
        dom.el("span", { class: "step__number", text: fmt.number(index + 1) }),
        dom.icon(step.icon, "step__icon")
      ]),
      dom.el("div", { class: "step__body" }, [
        dom.el("h3", { class: "step__title", text: step.title }),
        dom.el("p", { class: "step__desc", text: step.description })
      ])
    ]);
  }

  /* =====================================================================
     Hero availability slot
     ===================================================================== */

  var SLOT_STATES = {
    available: { label: "متاح", icon: "check" },
    soon: { label: "يكاد يمتلئ", icon: "clock" },
    full: { label: "محجوز", icon: "close" }
  };

  /**
   * Illustrative availability row inside the hero card. Demo only — the
   * real values come from the booking system.
   * @param {Object} slot
   * @returns {HTMLElement}
   */
  function slotRow(slot) {
    var state = SLOT_STATES[slot.status] || SLOT_STATES.available;

    return dom.el("li", { class: "hero__slot hero__slot--" + slot.status }, [
      dom.el("div", { class: "stack stack--1" }, [
        dom.el("span", { class: "hero__slot-time", text: slot.time }),
        dom.el("span", {
          class: "hero__slot-barber",
          text: slot.barber || "مع أي حلاق"
        })
      ]),
      dom.el("span", { class: "hero__slot-state" }, [
        dom.icon(state.icon),
        dom.el("span", { text: state.label })
      ])
    ]);
  }

  /* =====================================================================
     Barber card
     ===================================================================== */

  /**
   * @param {Object} barber
   * @returns {HTMLElement}
   */
  function barberCard(barber) {
    var statusText = {
      online: "متاح الآن",
      busy: "مشغول حالياً",
      offline: "غير متاح"
    }[barber.status] || "غير متاح";

    /* A monogram plate instead of a photo.
       There is no photography to show, and an empty grey box reads as a
       missing image. A brass plate with the initial set large is a
       deliberate mark that needs no picture to work. */
    var plate = dom.el("div", { class: "barber-card__plate" }, [
      dom.el("span", { class: "barber-card__monogram", "aria-hidden": "true" }, [
        barber.initials || barber.name.charAt(0)
      ]),
      dom.el("span", {
        class: "barber-card__presence barber-card__presence--" + barber.status,
        "aria-hidden": "true"
      }),
      dom.el("span", { class: "barber-card__status" }, [
        dom.icon("check", "icon--sm"),
        dom.el("span", { text: statusText })
      ])
    ]);

    /* Rating and experience side by side, divided by a hairline. */
    var facts = dom.el("div", { class: "barber-card__facts" }, [
      dom.el("div", { class: "barber-card__fact" }, [
        rating(barber.rating, barber.reviewsCount)
      ]),
      dom.el("div", { class: "barber-card__fact" }, [
        metaItem("award", fmt.number(barber.yearsOfExperience) + " سنة خبرة")
      ])
    ]);

    var body = dom.el("div", { class: "barber-card__body" }, [
      dom.el("div", { class: "barber-card__id" }, [
        dom.el("h3", { class: "barber-card__name", text: barber.name }),
        dom.el("p", { class: "barber-card__title", text: barber.title })
      ]),
      facts,
      dom.el("ul", { class: "barber-card__specialties", role: "list" },
        (barber.specialties || []).map(function (item) {
          return dom.el("li", { class: "tag", text: item });
        })
      )
    ]);

    return dom.el("article", {
      class:
        "card barber-card" + (barber.featured ? " barber-card--featured" : "")
    }, [plate, body]);
  }

  /* =====================================================================
     Review card
     ===================================================================== */

  /**
   * @param {Object} review
   * @returns {HTMLElement}
   */
  function reviewCard(review) {
    /* The review itself leads, set in the editorial face: a customer's own
       words are the most persuasive asset on the page and they should not
       be competing with an avatar for attention. */
    var quote = dom.el("div", { class: "review-card__quote" }, [
      dom.icon("quote", "review-card__mark"),
      dom.el("p", { class: "review-card__text", text: review.text })
    ]);

    var foot = dom.el("div", { class: "review-card__foot" }, [
      dom.el("div", { class: "cluster cluster--3 items-start" }, [
        dom.el("span", { class: "avatar avatar--sm", "aria-hidden": "true" }, [
          review.initials || review.author.charAt(0)
        ]),
        dom.el("div", { class: "stack stack--1" }, [
          dom.el("strong", { text: review.author }),
          dom.el("span", { class: "review-card__service", text: review.service })
        ])
      ]),
      rating(review.rating)
    ]);

    var meta = dom.el("div", { class: "review-card__meta" }, [
      metaItem("user", review.barber),
      dom.el("span", { class: "review-card__sep", text: "·" }),
      metaItem("calendar", fmt.dateShort(review.date))
    ]);

    return dom.el("article", { class: "card review-card" }, [quote, foot, meta]);
  }

  /* =====================================================================
     Feature card
     ===================================================================== */

  /**
   * @param {Object} feature
   * @returns {HTMLElement}
   */
  function featureCard(feature) {
    return dom.el("article", { class: "pillar" }, [
      dom.el("span", { class: "pillar__icon" }, [dom.icon(feature.icon)]),
      dom.el("h3", { class: "pillar__title", text: feature.title }),
      dom.el("p", { class: "pillar__desc", text: feature.description })
    ]);
  }

  /* =====================================================================
     Stat card
     ===================================================================== */

  /**
   * @param {Object} stat
   * @returns {HTMLElement}
   */
  function statCard(stat) {
    var value = typeof stat.value === "number" && !Number.isInteger(stat.value)
      ? stat.value.toFixed(1)
      : fmt.number(stat.value);

    return dom.el("article", { class: "stat-cell" }, [
      dom.el("span", { class: "stat-cell__icon" }, [dom.icon(stat.icon)]),
      dom.el("p", { class: "stat-cell__value num" }, [
        value + (stat.suffix || "")
      ]),
      dom.el("p", { class: "stat-cell__label", text: stat.label })
    ]);
  }

  /* =====================================================================
     Gallery tile
     ===================================================================== */

  /**
   * @param {Object} item
   * @returns {HTMLElement}
   */
  function galleryTile(item) {
    return dom.el("figure", { class: "card card--interactive" }, [
      dom.el("div", { class: "card__media" }, [
        dom.el("div", { class: "card__media-placeholder" }, [dom.icon(item.icon)])
      ]),
      dom.el("figcaption", { class: "card__body card__body--tight" }, [
        dom.el("span", { class: "card__title", text: item.title }),
        dom.el("span", { class: "card__subtitle", text: item.caption })
      ])
    ]);
  }

  /* =====================================================================
     Nav links
     ===================================================================== */

  /**
   * Build a list of nav links for the header or the drawer.
   * @param {Array} items
   * @param {string} listClass
   * @param {string} linkClass
   * @returns {HTMLElement}
   */
  function navList(items, listClass, linkClass) {
    return dom.el(
      "ul",
      { class: listClass, role: "list" },
      items.map(function (item) {
        return dom.el("li", {}, [
          dom.el(
            "a",
            { class: linkClass, href: item.href },
            [dom.icon(item.icon), dom.el("span", { text: item.label })]
          )
        ]);
      })
    );
  }

  Halaq.render = {
    rating: rating,
    metaItem: metaItem,
    priceRow: priceRow,
    categoryLabel: categoryLabel,
    serviceCard: serviceCard,
    categoryFilter: categoryFilter,
    stepCard: stepCard,
    slotRow: slotRow,
    barberCard: barberCard,
    reviewCard: reviewCard,
    featureCard: featureCard,
    statCard: statCard,
    galleryTile: galleryTile,
    navList: navList
  };
})(window.Halaq = window.Halaq || {});
