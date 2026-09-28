/* ==========================================================================
   Halaq — Booking flow
   ---------------------------------------------------------------------------
   Step 1  choose one service
   Step 2  choose one barber, or "أي حلاق متاح"
   Step 3  choose a date and a time slot
   Step 4  customer details (name, mobile, optional email)
   Step 5  review everything, with the price and the payment note
   Step 6  confirmation: booking number, waiting number, digital ticket

   Steps 1 and 2 use native radio inputs sharing a name, so single-selection,
   arrow-key navigation and grouping semantics come from the browser. The
   flow owns only the visible step, the gating of Continue, and the collected
   booking, which lives in `state` and survives every step change and every
   close/reopen until reset() is called.

   Confirming on step 5 writes a record into Halaq.bookings — that store is
   the seam the admin side will read from. Halaq.bookingTicket turns a record
   into the ticket shown on step 6 and in its own dialog.

   Exposed as window.Halaq.bookingFlow
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var schedule = Halaq.bookingSchedule;
  var ticket = Halaq.bookingTicket;

  /* "any available barber" is a real choice, not a fallback */
  var ANY_BARBER = "any";

  var STEPS = [
    {
      title: "اختر الخدمة",
      description: "الخطوة الأولى: اختر الخدمة التي تناسبك.",
      prompt: "اختر خدمة واحدة للمتابعة. السعر والمدة تقريبية.",
      missing: "اختر خدمة للمتابعة"
    },
    {
      title: "اختر الحلاق",
      description: "الخطوة الثانية: اختر الحلاق، أو اترك الاختيار للمركز.",
      prompt: "اختر من يناسبك، أو اترك الخيار للمركز.",
      missing: "اختر حلاقاً للمتابعة"
    },
    {
      title: "اختر التاريخ والوقت",
      description: "الخطوة الثالثة: اختر اليوم ثم الموعد المتاح.",
      prompt: "المواعيد المتاحة لهذا اليوم.",
      missing: "اختر يوماً وموعداً"
    },
    {
      title: "بياناتك",
      description: "الخطوة الرابعة: أدخل بياناتك لإتمام الحجز.",
      prompt: "نحتاج اسمك ورقم جوالك لإتمام الحجز.",
      missing: "أكمل بياناتك للمتابعة"
    },
    {
      title: "راجع حجزك",
      description: "الخطوة الخامسة: تأكّد من التفاصيل قبل التأكيد.",
      prompt: "راجع التفاصيل وتأكّد من السعر والمدة.",
      missing: "أكمل بياناتك للمتابعة"
    },
    {
      title: "تم تأكيد الحجز",
      description: "الخطوة السادسة: حجزك مؤكّد، وهذه تذكرتك.",
      prompt: "احتفظ برقم الحجز ورقم الانتظار.",
      missing: ""
    }
  ];

  var STATUS_TEXT = {
    online: "متاح الآن",
    busy: "مشغول حالياً",
    offline: "غير متاح"
  };

  /* The booking being collected. Module-private, because nothing outside the
     flow has any business mutating a half-made booking: it lives here, it
     survives every step change and every close/reopen, and it is thrown away
     by reset(). Declared here rather than inside open() on purpose — opening
     the dialog twice must not silently discard a customer who came back to
     finish what they started. */
  var state = {
    step: 1,
    serviceId: null,
    barberId: null,
    date: null, /* "YYYY-MM-DD" */
    time: null, /* "HH:MM" */
    customer: { name: "", phone: "", email: "" }
  };

  var dialog = null;
  var ticketDialog = null;
  var nodes = {};
  var monthCursor = null; /* Date the calendar is showing */
  var confirmed = null; /* the record issued on step 6, if any */

  /* True while a step change is in flight. Guards the footer's Continue, which
     would otherwise fire the same change — and on the last step the same
     booking request — twice. Presentation only: it never decides whether a step
     is allowed to advance. */
  var busy = false;

  // Cache for services and barbers
  var servicesCache = null;
  var barbersCache = null;

  /**
   * Load services from Supabase
   */
  async function loadServices() {
    if (servicesCache) return servicesCache;
    var result = await Halaq.supabase.db.services.getAll(true);
    if (result.data) {
      servicesCache = result.data.map(function (s) {
        return {
          id: s.id,
          name: s.name_ar,
          description: s.description_ar,
          category: s.category,
          price: s.price,
          duration: s.duration_minutes,
          icon: s.icon || "scissors",
          featured: s.display_order < 3,
          badge: s.badge_label ? { label: s.badge_label, tone: s.badge_tone } : null,
          includes: s.includes || []
        };
      });
    }
    return servicesCache || [];
  }

  /**
   * Load barbers from Supabase
   */
  async function loadBarbers() {
    if (barbersCache) return barbersCache;
    var result = await Halaq.supabase.db.barbers.getAll(true);
    if (result.data) {
      barbersCache = result.data.map(function (b) {
        return {
          id: b.id,
          name: b.name,
          title: b.title,
          initials: b.name.charAt(0),
          yearsOfExperience: b.years_experience,
          rating: b.rating,
          reviewsCount: b.reviews_count,
          status: b.status === "متاح" ? "online" : (b.status === "مشغول" ? "busy" : "offline"),
          specialties: [],
          serviceIds: [],
          featured: b.display_order === 1
        };
      });
    }
    return barbersCache || [];
  }

  /**
   * Load barber services relationships
   *
   * One request for the whole table, grouped per barber, rather than one
   * request per barber. The per-barber version is a sequential waterfall — the
   * second call cannot start until the first has returned the id it filters on
   * — and every step of it is blocking the customer, who is waiting on the
   * booking dialog opening.
   */
  async function loadBarberServices() {
    var barbers = await loadBarbers();
    var result = await Halaq.supabase.db.barberServices.getAll();

    var byBarber = {};
    (result.data || []).forEach(function (row) {
      if (!row || !row.barber_id || !row.service_id) return;
      if (!byBarber[row.barber_id]) byBarber[row.barber_id] = [];
      byBarber[row.barber_id].push(row.service_id);
    });

    barbers.forEach(function (barber) {
      barber.serviceIds = byBarber[barber.id] || [];
    });
    return barbers;
  }

  /**
   * Initialize data caches
   */
  async function initDataCaches() {
    await loadServices();
    await loadBarberServices();
  }

  /**
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async function findService(id) {
    var services = await loadServices();
    return services.filter(function (item) { return item.id === id; })[0] || null;
  }

  /**
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async function findBarber(id) {
    var barbers = await loadBarbers();
    return barbers.filter(function (item) { return item.id === id; })[0] || null;
  }

  /**
   * Barbers who actually offer a service.
   * @param {string} serviceId
   * @returns {Promise<Object[]>}
   */
  async function barbersFor(serviceId) {
    var team = await loadBarbers();

    var matched = team.filter(function (barber) {
      return (barber.serviceIds || []).indexOf(serviceId) !== -1;
    });

    return matched.length ? matched : team;
  }

  /**
   * @param {string} id
   * @returns {string}
   */
  function categoryLabel(id) {
    var match = (Halaq.demoData.serviceCategories || []).filter(function (item) {
      return item.id === id;
    })[0];
    return match ? match.label : id;
  }

  /**
   * The chosen barber's name, resolving the "any" option.
   * @returns {string}
   */
  function barberName() {
    if (state.barberId === ANY_BARBER) return "أي حلاق متاح";
    var barber = findBarber(state.barberId);
    return barber ? barber.name : "";
  }

  /**
   * Everything collected so far, in one object.
   * @returns {Object}
   */
  function selection() {
    var service = findService(state.serviceId);

    return {
      step: state.step,
      service: service,
      barber: state.barberId === ANY_BARBER ? null : findBarber(state.barberId),
      anyBarber: state.barberId === ANY_BARBER,
      date: state.date,
      dateLabel: state.date ? schedule.fullLabel(state.date) : "",
      time: state.time,
      timeLabel: state.time ? fmt.time(state.time) : "",
      customer: state.customer
    };
  }

  /* =====================================================================
     Customer validation
     ===================================================================== */

  var MESSAGES = {
    nameRequired: "اكتب الاسم الكامل.",
    nameShort: "اكتب الاسم الكامل (اسمان على الأقل).",
    nameChars: "الاسم يقبل الحروف والمسافات فقط.",
    phoneRequired: "اكتب رقم الجوال.",
    phoneInvalid: "أدخل رقم جوال سعودي صحيح، مثل 050 000 0000.",
    emailInvalid: "أدخل بريداً إلكترونياً صحيحاً."
  };

  /* Arabic-Indic and Eastern Arabic digits are common on Saudi keyboards, so
     fmt.digits() folds them and drops spacing before any comparison. */
  var normaliseDigits = fmt.digits;

  /**
   * Check one field.
   * @param {string} field
   * @returns {string} an Arabic message, or "" when valid
   */
  function validateField(field) {
    var value = (state.customer[field] || "").trim();

    if (field === "name") {
      if (!value) return MESSAGES.nameRequired;

      var parts = value.split(/\s+/).filter(Boolean);

      if (parts.length < 2) return MESSAGES.nameShort;

      if (!/^[\p{L}][\p{L}\s'’.·-]*$/u.test(value)) return MESSAGES.nameChars;

      return "";
    }

    if (field === "phone") {
      if (!value) return MESSAGES.phoneRequired;

      var digits = normaliseDigits(value).replace(/^\+?/, "");

      /* 05XXXXXXXX, 9665XXXXXXXX, or the bare 9 digits after the country code. */
      var valid =
        /^05\d{8}$/.test(digits) ||
        /^9665\d{8}$/.test(digits) ||
        /^5\d{8}$/.test(digits) ||
        /^\+?9665\d{8}$/.test(normaliseDigits(value));

      return valid ? "" : MESSAGES.phoneInvalid;
    }

    if (field === "email") {
      if (!value) return ""; /* optional */
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? "" : MESSAGES.emailInvalid;
    }

    return "";
  }

  var CUSTOMER_FIELDS = ["name", "phone", "email"];

  /**
   * Validate every customer field.
   * @returns {boolean}
   */
  function customerValid() {
    return CUSTOMER_FIELDS.every(function (field) {
      return validateField(field) === "";
    });
  }

  /**
   * Write a message into a field's error slot and set its invalid state.
   * The message lives in an inner <span> so the warning icon inside the
   * wrapper survives.
   * @param {string} field
   * @param {boolean} [force] show the message even if the field is untouched
   */
  function showFieldError(field, force) {
    var control = dom.$("#booking-" + field);
    var wrapper = control ? control.closest(".field") : null;
    if (!control || !wrapper) return;

    var message = validateField(field);
    var slot = dom.$("[data-error-message]", wrapper);
    var target = dom.$("span", slot) || slot;

    var touched = control.getAttribute("data-touched") === "true";

    if (message && (touched || force)) {
      target.textContent = message;
      wrapper.classList.add("is-invalid");
      control.setAttribute("aria-invalid", "true");
    } else {
      target.textContent = "";
      wrapper.classList.remove("is-invalid");
      control.setAttribute("aria-invalid", "false");
    }
  }

  /* =====================================================================
     Option cards (steps 1 and 2)
     ===================================================================== */

  /**
   * Wrap a radio input and its visual card.
   * @param {Object} options
   * @returns {HTMLElement}
   */
  function pickCard(options) {
    var input = dom.el("input", {
      type: "radio",
      class: "pick-card__input",
      name: options.name,
      value: options.value,
      checked: options.checked || false
    });

    var body = dom.el("span", { class: "pick-card__body" }, [
      dom.el("span", { class: "pick-card__icon" }, [dom.icon(options.icon)]),
      dom.el("span", { class: "pick-card__text" }, [
        dom.el("span", { class: "pick-card__name", text: options.title }),
        options.subtitle
          ? dom.el("span", { class: "pick-card__subtitle", text: options.subtitle })
          : null
      ])
    ]);

    var side = dom.el("span", { class: "pick-card__side" }, options.meta || []);

    var card = dom.el("span", { class: "pick-card__inner" }, [
      body,
      side,
      dom.el("span", { class: "pick-card__check", "aria-hidden": "true" }, [
        dom.icon("check")
      ])
    ]);

    if (options.status) {
      card.appendChild(
        dom.el("span", {
          class: "pick-card__status status status--" + options.status
        }, [
          dom.el("span", { class: "status__dot", "aria-hidden": "true" }),
          dom.el("span", {
            text: options.statusText || STATUS_TEXT[options.status] || ""
          })
        ])
      );
    }

    var label = dom.el(
      "label",
      {
        class: "pick-card" + (options.className ? " " + options.className : ""),
        "data-pick-value": options.value
      },
      [input, card]
    );

    if (options.unavailable) {
      input.disabled = true;
      label.classList.add("is-unavailable");
    }

    return label;
  }

  /**
   * @param {Object} service
   * @returns {HTMLElement[]}
   */
  function serviceMeta(service) {
    return [
      dom.el("span", { class: "pick-card__price num", text: fmt.money(service.price) }),
      dom.el("span", { class: "pick-card__duration" }, [
        dom.icon("clock", "icon--sm"),
        dom.el("span", { text: fmt.number(service.duration) + " دقيقة" })
      ])
    ];
  }

  /**
   * The state a step shows when it genuinely has nothing to offer.
   *
   * Shared by both pickable steps, because "there is nothing here" needs the
   * same care wherever it lands: an icon, a sentence saying what is missing, and
   * a way forward. A blank panel reads as a broken page.
   *
   * @param {string} title
   * @param {string} message
   * @param {string} [iconName]
   * @returns {HTMLElement}
   */
  function pickEmpty(title, message, iconName) {
    return dom.el("div", { class: "pick-empty" }, [
      dom.el("span", { class: "pick-empty__icon" }, [
        dom.icon(iconName || "inbox", "icon--lg")
      ]),
      dom.el("div", { class: "pick-empty__body" }, [
        dom.el("p", { class: "pick-empty__title", text: title }),
        dom.el("p", { class: "pick-empty__text", text: message })
      ])
    ]);
  }

  /**
   * @returns {Promise<HTMLElement[]>}
   */
  async function renderServices() {
    var services = await loadServices();
    var categories = Halaq.demoData.serviceCategories || [];

    var sections = categories
      .filter(function (category) {
        return category.id !== "all";
      })
      .map(function (category) {
        var inCategory = services.filter(function (service) {
          return service.category === category.id;
        });

        if (!inCategory.length) return null;

        return dom.el("div", { class: "pick-group__section" }, [
          dom.el("p", { class: "pick-group__label" }, [
            dom.el("span", { text: category.label }),
            dom.el("span", {
              class: "pick-group__count num",
              text: fmt.number(inCategory.length)
            })
          ]),
          dom.el(
            "div",
            { class: "pick-list" },
            inCategory.map(function (service) {
              return pickCard({
                name: "booking-service",
                value: service.id,
                checked: service.id === state.serviceId,
                icon: service.icon || "scissors",
                title: service.name,
                subtitle: categoryLabel(service.category),
                meta: serviceMeta(service)
              });
            })
          )
        ]);
      })
      .filter(Boolean);

    /* An empty catalogue is a real state — the salon has not published its
       services yet — so it is named rather than left as a blank panel. */
    if (!sections.length) {
      return [pickEmpty(
        "لا توجد خدمات بعد",
        "لم تُنشر أي خدمة في قائمة الصالون بعد. تابع بعد قليل، أو اتصل بنا للحجز المباشر.",
        "scissors"
      )];
    }

    return sections;
  }

  /**
   * @returns {Promise<HTMLElement[]>}
   */
  async function renderBarbers() {
    var candidates = await barbersFor(state.serviceId);
    var service = await findService(state.serviceId);

    var anyCard = pickCard({
      name: "booking-barber",
      value: ANY_BARBER,
      checked: state.barberId === ANY_BARBER,
      icon: "users",
      title: "أي حلاق متاح",
      subtitle: "أول موعد متاح مع أي حلاق يقدّم هذه الخدمة",
      className: "pick-card--any",
      meta: [
        dom.el("span", { class: "pick-card__hint" }, [
          dom.icon("zap", "icon--sm"),
          dom.el("span", { text: "الأسرع في الحصول على موعد" })
        ])
      ]
    });

    /* Resolved once, before the loop. `await` is not allowed inside the
       non-async map callback below, and loadServices() is memoised by
       servicesCache, so hoisting it out costs nothing. */
    var offeredServices = await loadServices();

    var barberCards = candidates.map(function (barber) {
      var offered = offeredServices.filter(function (item) {
        return (barber.serviceIds || []).indexOf(item.id) !== -1;
      });

      return barberCardNode(barber, offered, barber.status === "offline");
    });

    var context = service
      ? dom.el("div", { class: "booking-flow__context-inner" }, [
          dom.el("span", { class: "icon-tile icon-tile--sm" }, [
            dom.icon(service.icon || "scissors")
          ]),
          dom.el("div", { class: "stack stack--1" }, [
            dom.el("span", { class: "booking-flow__context-label", text: "الخدمة المختارة" }),
            dom.el("strong", { class: "booking-flow__context-name", text: service.name })
          ]),
          dom.el("span", { class: "booking-flow__context-side" }, [
            dom.el("span", { class: "num", text: fmt.money(service.price) }),
            dom.el("span", { class: "text-muted num", text: fmt.number(service.duration) + " د" })
          ])
        ])
      : null;

    return [context, anyCard].concat(barberCards.filter(Boolean));
  }

  /**
   * @param {Object} barber
   * @param {Object[]} offered
   * @param {boolean} offline
   * @returns {HTMLElement}
   */
  function barberCardNode(barber, offered, offline) {
    var card = pickCard({
      name: "booking-barber",
      value: barber.id,
      checked: state.barberId === barber.id,
      icon: "user",
      title: barber.name,
      subtitle: barber.title,
      className: "pick-card--barber",
      status: barber.status,
      unavailable: offline,
      meta: [
        dom.el("span", { class: "pick-card__hint num" }, [
          dom.icon("award", "icon--sm"),
          dom.el("span", {
            text: fmt.number(barber.yearsOfExperience) + " سنة خبرة"
          })
        ]),
        dom.el("span", { class: "pick-card__hint num" }, [
          dom.icon("star", "icon--sm"),
          dom.el("span", { text: fmt.number(barber.rating) + " من 5" })
        ])
      ]
    });

    var list = dom.el(
      "span",
      { class: "pick-card__offers" },
      offered.map(function (service) {
        return dom.el("span", { class: "tag" }, [
          service.name,
          dom.el("span", { class: "tag__price num", text: fmt.money(service.price) })
        ]);
      })
    );

    var inner = dom.$(".pick-card__inner", card);

    if (offline) {
      inner.appendChild(
        dom.el("span", { class: "pick-card__note" }, [
          dom.icon("info", "icon--sm"),
          dom.el("span", { text: "غير متاح للحجز حالياً" })
        ])
      );
    }

    inner.appendChild(list);
    return card;
  }

  /* =====================================================================
     Step 3 — calendar and slots
     ===================================================================== */

  /**
   * The first date that has a free slot, so the customer lands on something
   * useful instead of an empty grid.
   * @returns {string|null}
   */
  function firstOpenDate() {
    var service = findService(state.serviceId);
    var windowDays = (Halaq.data.availability || {}).windowDays || 30;
    var start = schedule.today();

    for (var i = 0; i <= windowDays; i += 1) {
      var date = new Date(start);
      date.setDate(start.getDate() + i);

      var info = schedule.dayInfo(date, service, state.barberId);
      if (info.selectable) return info.key;
    }

    return null;
  }

  /**
   * The month the calendar may not page past.
   * @returns {Date}
   */
  function lastMonth() {
    var windowDays = (Halaq.data.availability || {}).windowDays || 30;
    var end = schedule.today();
    end.setDate(end.getDate() + windowDays);
    return new Date(end.getFullYear(), end.getMonth(), 1);
  }

  /**
   * @param {Date} a
   * @param {Date} b
   * @returns {boolean}
   */
  function sameMonth(a, b) {
    return (
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
    );
  }

  /**
   * @returns {HTMLElement}
   */
  function renderSchedule() {
    var service = findService(state.serviceId);

    if (!monthCursor) {
      monthCursor = state.date
        ? schedule.parseKey(state.date)
        : new Date(schedule.today().getFullYear(), schedule.today().getMonth(), 1);
    }

    var atStart = sameMonth(monthCursor, new Date(schedule.today().getFullYear(), schedule.today().getMonth(), 1));
    var atEnd = sameMonth(monthCursor, lastMonth());

    /* A compact line naming who the slots belong to. */
    var owner = dom.el("div", { class: "booking-flow__context-inner" }, [
      dom.el("span", { class: "icon-tile icon-tile--sm" }, [
        dom.icon(service ? service.icon || "scissors" : "scissors")
      ]),
      dom.el("div", { class: "stack stack--1" }, [
        dom.el("span", { class: "booking-flow__context-label", text: "تختار موعداً مع" }),
        dom.el("strong", {
          class: "booking-flow__context-name",
          text: (service ? service.name : "") + " — " + barberName()
        })
      ]),
      service
        ? dom.el("span", { class: "booking-flow__context-side" }, [
            dom.el("span", { class: "num", text: fmt.number(service.duration) + " د" })
          ])
        : null
    ]);

    var calendar = dom.el("div", { class: "calendar" }, [
      dom.el("div", { class: "calendar__bar" }, [
        dom.el("button", {
          type: "button",
          class: "btn btn--ghost btn--icon calendar__nav",
          "data-cal-prev": "",
          "aria-label": "الشهر السابق",
          disabled: atStart
        }, [dom.icon("chevron-right")]),
        dom.el("h3", {
          class: "calendar__month",
          "aria-live": "polite",
          text: schedule.monthLabel(monthCursor)
        }),
        dom.el("button", {
          type: "button",
          class: "btn btn--ghost btn--icon calendar__nav",
          "data-cal-next": "",
          "aria-label": "الشهر التالي",
          disabled: atEnd
        }, [dom.icon("chevron-left")])
      ]),
      schedule.weekdayHeader(),
      schedule.monthGrid(monthCursor, service, state.barberId, state.date)
    ]);

    var slotsTitle = state.date
      ? schedule.fullLabel(state.date)
      : "اختر يوماً أولاً";

    var slots = dom.el("div", { class: "slots" }, [
      dom.el("div", { class: "slots__head" }, [
        dom.el("h3", { class: "slots__title" }, [
          dom.icon("clock", "icon--sm"),
          dom.el("span", { text: slotsTitle })
        ]),
        schedule.slotLegend()
      ]),
      state.date
        ? schedule.slotGrid(state.date, service, state.barberId, state.time)
        : dom.el("p", { class: "slots__empty" }, [
            dom.icon("calendar"),
            dom.el("span", { text: "اختر يوماً من التقويم لعرض مواعيده." })
          ])
    ]);

    return [owner, calendar, slots];
  }

  /* =====================================================================
     Step 4 — customer details
     ===================================================================== */

  /**
   * A recap of everything chosen, so the customer can check it before
   * typing. It also proves the earlier steps survived.
   * @returns {HTMLElement}
   */
  function renderRecap() {
    var chosen = selection();
    var service = chosen.service;

    var rows = [
      {
        icon: "scissors",
        label: "الخدمة",
        value: service ? service.name : "—",
        note: service
          ? fmt.money(service.price) + " · " + fmt.number(service.duration) + " دقيقة"
          : ""
      },
      { icon: "user", label: "الحلاق", value: barberName() || "—", note: "" },
      {
        icon: "calendar",
        label: "التاريخ",
        value: chosen.dateLabel || "—",
        note: ""
      },
      {
        icon: "clock",
        label: "الوقت",
        value: chosen.timeLabel || "—",
        note: chosen.date ? chosen.timeLabel : "لم يُحدَّد بعد"
      }
    ];

    return dom.el("ul", { class: "recap", role: "list" },
      rows.map(function (row) {
        return dom.el("li", { class: "recap__row" }, [
          dom.el("span", { class: "recap__icon" }, [dom.icon(row.icon)]),
          dom.el("span", { class: "recap__text" }, [
            dom.el("span", { class: "recap__label", text: row.label }),
            dom.el("strong", { class: "recap__value", text: row.value })
          ]),
          row.note
            ? dom.el("span", { class: "recap__note num", text: row.note })
            : null
        ]);
      })
    );
  }

  /**
   * Copy the stored values back into the form, e.g. when returning to step 4.
   */
  function syncForm() {
    CUSTOMER_FIELDS.forEach(function (field) {
      var control = dom.$("#booking-" + field);
      if (!control) return;
      if (control.value !== state.customer[field]) control.value = state.customer[field] || "";
    });
  }

  /* =====================================================================
     Step 5 — review
     ===================================================================== */

  /**
   * One review line. `total` marks the rows that carry the money, so they can
   * be emphasised without the customer hunting for them.
   *
   * @param {Object} row
   * @returns {HTMLElement}
   */
  function reviewItem(row) {
    return dom.el("div", {
      class: "review__item" + (row.total ? " review__item--total" : "")
    }, [
      dom.el("span", { class: "review__icon" }, [dom.icon(row.icon)]),
      dom.el("dt", { class: "review__label", text: row.label }),
      dom.el("dd", {
        class: "review__value" + (row.numeric ? " num" : ""),
        text: row.value || "—"
      })
    ]);
  }

  /**
   * The last look before anything is issued. Everything the customer will be
   * held to is on this one screen, in one place, with the payment terms
   * stated plainly rather than tucked into a hint.
   * @returns {HTMLElement[]}
   */
  function renderReview() {
    var chosen = selection();
    var service = chosen.service || {};

    var rows = [
      { icon: "scissors", label: "الخدمة", value: service.name },
      { icon: "user", label: "الحلاق", value: barberName() },
      { icon: "calendar", label: "التاريخ", value: chosen.dateLabel },
      { icon: "clock", label: "الوقت", value: chosen.timeLabel, numeric: true },
      { icon: "user", label: "اسم العميل", value: state.customer.name },
      { icon: "phone", label: "رقم الجوال", value: state.customer.phone, numeric: true },
      {
        icon: "clock",
        label: "مدة الخدمة",
        value: fmt.number(service.duration) + " دقيقة",
        numeric: true
      },
      {
        icon: "banknote",
        label: "السعر",
        value: fmt.money(service.price),
        numeric: true,
        total: true
      }
    ];

    return [
      dom.el("div", { class: "review" }, [
        dom.el("div", { class: "review__head" }, [
          dom.el("span", { class: "review__head-icon" }, [dom.icon("check-circle")]),
          dom.el("div", { class: "review__head-text" }, [
            dom.el("span", { class: "h5", text: "مراجعة التفاصيل" }),
            dom.el("span", {
              class: "text-muted",
              text: "راجع ما يلي قبل تأكيد الحجز. للرجوع إلى أي خطوة استخدم زر رجوع."
            })
          ])
        ]),

        dom.el("dl", { class: "review__list" }, rows.map(reviewItem)),

        dom.el("div", { class: "review__payment" }, [
          dom.el("span", { class: "review__payment-icon" }, [dom.icon("banknote")]),
          dom.el("div", { class: "review__payment-text" }, [
            dom.el("span", {
              class: "review__payment-title",
              text: "الدفع داخل الصالون"
            }),
            dom.el("span", {
              class: "review__payment-note",
              text: Halaq.bookings.PAYMENT_NOTE
            })
          ])
        ])
      ])
    ];
  }

/* =====================================================================
   Step 6 — confirmation
   ===================================================================== */

  /**
   * Is there enough collected to issue a booking? Step 5 shows it, step 6
   * writes it, so both must refuse to run on a half-built state.
   * @returns {boolean}
   */
  function bookingComplete() {
    return !!state.serviceId &&
      !!state.barberId &&
      !!state.date &&
      !!state.time &&
      customerValid();
  }

  /**
   * Write the booking via Supabase RPC and remember it for the rest of the visit.
   *
   * @returns {Promise<Object|null>}
   */
  async function confirmBooking() {
    if (confirmed) return confirmed;
    if (!bookingComplete()) return null;

    var result = await Halaq.supabase.rpc.createBooking({
      customerName: state.customer.name,
      customerMobile: state.customer.phone,
      customerEmail: state.customer.email,
      serviceId: state.serviceId,
      barberId: state.barberId === ANY_BARBER ? null : state.barberId,
      bookingDate: state.date,
      startTime: state.time
    });

    if (result.error || !result.data?.success) {
      var errorMsg = result.error?.message || result.data?.error || "فشل في إنشاء الحجز";
      Halaq.toast.show({
        title: "تعذّر إتمام الحجز",
        message: errorMsg + " — لم يُحفظ أي حجز، فجرّب مرة أخرى.",
        tone: "danger",
        duration: 7000
      });
      return null;
    }

    confirmed = result.data.booking;
    return confirmed;
  }

  /**
   * @param {string} view "ticket" or "queue"
   */
  function openTicketDialog(view) {
    if (!confirmed || !ticketDialog) return;

    var body = dom.$("[data-ticket-body]", ticketDialog);
    var showQueue = view === "queue";

    dom.render(body, [
      showQueue ? ticket.renderQueue(confirmed) : ticket.render(confirmed)
    ]);

    /* Exactly one heading survives, and it is the one naming what is shown. */
    dom.$$("[data-ticket-heading], [data-ticket-queue-heading]", ticketDialog)
      .forEach(function (heading) {
        var isQueueHeading = heading.hasAttribute("data-ticket-queue-heading");
        heading.hidden = isQueueHeading !== showQueue;
      });

    /* Printing the waiting view would print a number the customer is not
       holding any more, so the printer only offers itself on the ticket. */
    var print = dom.$("[data-ticket-print]", ticketDialog);
    if (print) print.hidden = showQueue;

    Halaq.modal.open(ticketDialog);
  }

  /**
   * Send the page to the printer.
   *
   * The print stylesheet in css/components/booking-ticket.css takes over
   * from here: it hides the rest of the page, un-anchors the dialog, and
   * flattens the ticket onto white paper. Nothing about the record changes.
   */
  function printTicket() {
    window.print();
  }

  /**
   * @returns {HTMLElement[]}
   */
  function renderConfirmation() {
    var record = confirmBooking();

    /* Should be unreachable now that goTo() and confirmBooking() both check,
       but a step that renders nothing is worse than one that explains. */
    if (!record) {
      return [
        dom.el("div", { class: "confirm" }, [
          dom.el("span", { class: "confirm__mark is-error" }, [dom.icon("alert-triangle")]),
          dom.el("h3", { class: "h3 confirm__title", text: "الحجز غير مكتمل" }),
          dom.el("p", {
            class: "confirm__lead",
            text: "أكمل اختيار الخدمة والموعد وبياناتك قبل التأكيد."
          })
        ])
      ];
    }

    /* The queue is the action a customer reaches for while they are sitting
       in the room, so it leads. The ticket is the reference; printing is a
       quiet afterthought, not a peer of the other two. */
    var actions = dom.el("div", { class: "confirm__actions" }, [
      dom.el("button", {
        type: "button",
        class: "btn btn--primary confirm__action",
        "data-ticket-open": "queue"
      }, [
        dom.icon("hourglass"),
        dom.el("span", { text: "متابعة الانتظار" })
      ]),

      dom.el("button", {
        type: "button",
        class: "btn btn--outline confirm__action",
        "data-ticket-open": "ticket"
      }, [
        dom.icon("ticket"),
        dom.el("span", { text: "عرض التذكرة" })
      ]),

      dom.el("button", {
        type: "button",
        class: "btn btn--ghost confirm__action confirm__action--quiet",
        "data-ticket-print": "true"
      }, [
        dom.icon("printer"),
        dom.el("span", { text: "طباعة التذكرة" })
      ])
    ]);

    return [
      dom.el("div", { class: "confirm" }, [
        dom.el("span", { class: "confirm__mark" }, [dom.icon("check")]),

        dom.el("h3", { class: "h3 confirm__title", text: "تم تأكيد حجزك" }),

        dom.el("p", {
          class: "confirm__lead",
          text: "موعدك محفوظ. اعرض رقم الحجز عند الوصول إلى الصالون."
        }),

        dom.el("div", { class: "confirm__ticket" }, [ticket.render(record, { compact: true })]),

        actions,

        dom.el("p", {
          class: "confirm__done",
          text: Halaq.bookings.PAYMENT_NOTE
        })
      ])
    ];
  }

  /* =====================================================================
     Step state
     ===================================================================== */

  /**
   * @param {Element} scope
   */
  /**
   * Drop an issued confirmation because the booking underneath it changed.
   *
   * The record already handed out stays in the store — a customer who books
   * again genuinely has two bookings — but the flow must not show the old
   * numbers for the new choice, so the next arrival at step 6 issues a new
   * record instead of re-rendering this one.
   */
  function invalidateConfirmation() {
    confirmed = null;
  }

  function syncSelectedState(scope) {
    dom.$$(".pick-card", scope).forEach(function (card) {
      var input = dom.$(".pick-card__input", card);
      card.classList.toggle("is-selected", !!input && input.checked);
    });
  }

  /**
   * Short label for a completed step.
   * @param {number} index
   * @returns {string}
   */
  function stepNote(index) {
    if (index === 1) {
      var service = findService(state.serviceId);
      return service ? service.name : "";
    }

    if (index === 2) return barberName();

    if (index === 3) {
      if (state.date && state.time) {
        return schedule.fullLabel(state.date) + " — " + fmt.time(state.time);
      }
      return state.date ? schedule.fullLabel(state.date) : "";
    }

    if (index === 4) return state.customer.name;

    if (index === 5) {
      var service5 = findService(state.serviceId);
      return service5 ? fmt.money(service5.price) : "";
    }

    return "";
  }

  /**
   * Is the current step complete?
   * @returns {boolean}
   */
  function stepComplete() {
    if (state.step === 1) return !!state.serviceId;
    if (state.step === 2) return !!state.barberId;
    if (state.step === 3) return !!(state.date && state.time);
    if (state.step === 6) return true;
    /* Steps 4 and 5 both depend on the same customer details. */
    return customerValid();
  }

  function syncStep() {
    var step = STEPS[state.step - 1];

    if (nodes.title) nodes.title.textContent = step.title;
    if (nodes.description) nodes.description.textContent = step.description;

    dom.$$("[data-booking-panel]", dialog).forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-booking-panel") !== String(state.step);
    });

    dom.$$("[data-stepper-item]", dialog).forEach(function (item) {
      var index = Number(item.getAttribute("data-stepper-item"));
      var isCurrent = index === state.step;
      var isDone = index < state.step && !!stepNote(index);

      item.classList.toggle("is-active", isCurrent);
      item.classList.toggle("is-done", isDone);

      if (isCurrent) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");

      var icon = dom.$("[data-step-icon]", item);
      var done = dom.$("[data-step-done]", item);
      if (icon) icon.hidden = isDone;
      if (done) done.hidden = !isDone;

      var note = dom.$("[data-step-note]", item);
      if (note) note.textContent = isDone ? stepNote(index) : "";
    });

    if (nodes.back) nodes.back.disabled = state.step === 1;
    if (nodes.nextLabel) nodes.nextLabel.textContent = nextLabelFor(state.step);

    /* Step 6 ends the flow: its actions are in the panel, so the footer's
       Continue would be a dead control. */
    if (nodes.next) nodes.next.hidden = state.step === 6;
    if (nodes.hint) nodes.hint.hidden = state.step === 6;
    if (nodes.back) nodes.back.hidden = state.step === 6;

    syncSelectedState(dialog);
    syncGating();
  }

  /**
   * @param {number} step
   * @returns {string}
   */
  function nextLabelFor(step) {
    if (step === 4) return "متابعة";
    if (step === 5) return "تأكيد الحجز";
    return "متابعة";
  }

  function syncGating() {
    var ready = stepComplete();

    if (nodes.next) {
      /* `disabled` is the ready check and the busy lock in one property, and the
         lock has to win: a button that is mid-request must not come back to life
         because the new step happens to be one the customer has already filled
         in. */
      nodes.next.disabled = !ready || busy;
      nodes.next.setAttribute("aria-disabled", String(!ready));
    }

    if (nodes.hint) {
      /* Held while a step is resolving, or the new step's own message would
         replace the "working on it" line a frame before the work is done. It is
         the only part of the footer a screen reader announces, so it is the one
         that has to carry the message. */
      if (!busy) {
        nodes.hint.textContent = ready ? "" : STEPS[state.step - 1].missing;
        nodes.hint.classList.remove("is-busy");
      }
    }
  }

  /**
   * The footer's Continue, and the lock around it.
   *
   * Every step change ends in a network read, and the button would otherwise
   * stay live for the whole of it. A second press inside that window runs the
   * same step change twice, and on the last step that means asking the database
   * for the same booking twice. So the button takes its own loading state while
   * the step resolves — which is also the honest thing to show the customer:
   * the press did something.
   *
   * This is a presentation lock only. Whether the step can advance is still
   * decided by stepComplete() and nothing here changes that.
   */
  async function advance() {
    if (busy) return;

    busy = true;
    syncGating();

    if (nodes.next) nodes.next.setAttribute("data-loading", "true");
    if (nodes.back) nodes.back.disabled = true;
    if (nodes.hint) {
      nodes.hint.textContent = "جارٍ المتابعة…";
      nodes.hint.classList.add("is-busy");
    }

    try {
      await advanceStep();
    } finally {
      busy = false;

      if (nodes.next) nodes.next.removeAttribute("data-loading");

      /* Re-run the real check rather than simply re-enabling: the step may have
         changed, and it may now be one that is not yet complete. */
      syncGating();

      if (nodes.back) nodes.back.disabled = state.step === 1;
    }
  }

  /* =====================================================================
     Rendering
     ===================================================================== */

  /* =====================================================================
     Loading

     Both of the first two steps read their list from the network, and a panel
     that is simply empty until the answer arrives reads as "there is nothing
     here" — which is a different thing, and the customer is looking straight at
     it. The placeholder is option-shaped so the step does not re-lay-out the
     moment the cards land.

     Decorative throughout: it is hidden from assistive technology, and the
     step's own hint is what a screen reader is already being given.
     ===================================================================== */

  /**
   * @param {number} [count] how many placeholder options to draw
   * @returns {HTMLElement}
   */
  function optionsSkeleton(count) {
    var total = count || 4;
    var options = [];

    for (var i = 0; i < total; i += 1) {
      options.push(dom.el("div", { class: "skel-option" }, [
        dom.el("span", { class: "skel-option__mark" }),
        dom.el("span", { class: "skel-option__body" }, [
          dom.el("span", { class: "skel__bar is-mid" }),
          dom.el("span", { class: "skel__bar is-short" })
        ])
      ]));
    }

    return dom.el("div", {
      class: "skel-options",
      "aria-hidden": "true"
    }, options);
  }

  /**
   * Render the active step and empty the other steps' mount points.
   *
   * Clearing the inactive steps matters: stale nodes in a hidden panel stay
   * queryable and keep firing delegated events, which is how a click could
   * land on a step the customer is not even looking at. Only the mount
   * elements are emptied — the static markup around them is left alone.
   */
  async function renderStep() {
    var mounts = {
      1: nodes.services,
      2: nodes.barbers,
      3: nodes.schedule,
      4: nodes.recap,
      5: nodes.review,
      6: nodes.confirmation
    };

    Object.keys(mounts).forEach(function (key) {
      if (Number(key) === state.step) return;
      if (mounts[key]) mounts[key].textContent = "";
    });

    /* The placeholder goes in before the await, not after: a fetch that takes
       two seconds has to look like two seconds of work. */
    if (state.step === 1 || state.step === 2) {
      dom.render(mounts[state.step], [optionsSkeleton()]);
    }

    if (state.step === 1) {
      dom.render(nodes.services, await renderServices());
    } else if (state.step === 2) {
      dom.render(nodes.barbers, await renderBarbers());
    } else if (state.step === 3) {
      dom.render(nodes.schedule, renderSchedule());
    } else if (state.step === 4) {
      syncForm();
      dom.render(nodes.recap, [renderRecap()]);
    } else if (state.step === 5) {
      dom.render(nodes.review, renderReview());
    } else if (state.step === 6) {
      dom.render(nodes.confirmation, await renderConfirmation());
    }
  }

  /**
   * Make the stored date and time consistent with the current service and
   * barber. Availability is derived from both, so a choice made earlier may
   * no longer hold; anything that no longer fits is dropped, and anything
   * still valid is kept.
   */
  function reconcileSchedule() {
    var service = findService(state.serviceId);

    if (!state.date) {
      state.date = firstOpenDate();
      state.time = null;
      return;
    }

    var info = schedule.dayInfo(schedule.parseKey(state.date), service, state.barberId);

    if (!info.selectable) {
      state.date = firstOpenDate();
      state.time = null;
      return;
    }

    /* The day is still fine, but the exact slot may have gone. */
    if (state.time) {
      var stillFree = schedule.slotsFor(state.date, service, state.barberId).some(function (slot) {
        return slot.time === state.time && slot.selectable;
      });

      if (!stillFree) state.time = null;
    }
  }

  /**
   * Move to a step, re-rendering its panel. Navigating never discards a
   * choice: only changing the service or the barber does that, because those
   * two are what availability is derived from.
   * @param {number} step
   */
  async function goTo(step) {
    var target = Math.min(Math.max(step, 1), STEPS.length);

    /* Steps 5 and 6 rest on the whole booking, and step 6 issues a record.
       Rather than render half of a ticket, send the customer back to the first
       step still missing an answer. */
    if (target >= 5 && !bookingComplete()) target = resumeStep();

    state.step = target;

    if (state.step === 3) reconcileSchedule();

    await renderStep();
    syncStep();

    window.requestAnimationFrame(function () {
      var body = dom.$(".booking-flow__body", dialog);
      if (body) body.scrollTop = 0;
    });
  }

  /* =====================================================================
     Public API
     ===================================================================== */

  function cacheNodes() {
    nodes = {
      title: dom.$("[data-modal-title]", dialog),
      description: dom.$("[data-modal-description]", dialog),
      services: dom.$("[data-booking-services]", dialog),
      barbers: dom.$("[data-booking-barbers]", dialog),
      schedule: dom.$("[data-booking-schedule]", dialog),
      recap: dom.$("[data-booking-recap]", dialog),
      review: dom.$("[data-booking-review]", dialog),
      confirmation: dom.$("[data-booking-confirmation]", dialog),
      back: dom.$("[data-booking-back]", dialog),
      next: dom.$("[data-booking-next]", dialog),
      nextLabel: dom.$("[data-booking-next-label]", dialog),
      hint: dom.$("[data-booking-hint]", dialog)
    };
  }

  /**
   * The furthest step whose prerequisites are already met, i.e. the first one
   * still needing an answer. Used when the dialog is reopened so a customer
   * never lands on a step with nothing selected.
   * @returns {number}
   */
  function resumeStep() {
    if (!state.serviceId) return 1;
    if (!state.barberId) return 2;
    if (!state.date || !state.time) return 3;
    if (!customerValid()) return 4;
    /* Once a record exists the flow is finished; reopening shows the ticket
       again rather than sending the customer back through the review. */
    if (confirmed) return 6;
    return 5;
  }

  /**
   * Open the flow.
   *
   * Passing a serviceId starts a new booking for that service and discards
   * any downstream choice. Passing nothing resumes whatever was collected,
   * so a customer who closes the dialog by accident does not lose their work.
   *
   * @param {string} [serviceId]
   */
  async function open(serviceId) {
    if (!dialog) {
      dialog = dom.$("#booking-flow");
      if (!dialog) return;
      cacheNodes();
    }

    // Initialize data caches on first open
    await initDataCaches();

    var known = serviceId ? await findService(serviceId) : null;

    if (known) {
      state.serviceId = known.id;
      state.barberId = null;
      state.date = null;
      state.time = null;
      monthCursor = null;
      state.step = 1;
      /* A different booking means the old confirmation is stale. */
      confirmed = null;
    } else {
      state.step = resumeStep();
    }

    await renderStep();
    syncStep();

    Halaq.modal.open(dialog);
  }

  /**
   * Throw the whole booking away. The issued record stays in the store — a
   * booking that was really made is not erased by resetting the customer-side
   * flow, and the admin side still needs to see it.
   */
  function reset() {
    state.step = 1;
    state.serviceId = null;
    state.barberId = null;
    state.date = null;
    state.time = null;
    state.customer = { name: "", phone: "", email: "" };
    monthCursor = null;
    confirmed = null;

    CUSTOMER_FIELDS.forEach(function (field) {
      var control = dom.$("#booking-" + field);
      if (control) {
        control.value = "";
        control.removeAttribute("data-touched");
      }
      showFieldError(field);
    });
  }

  /**
   * Store a new value in the booking.
   * @param {string} field
   * @param {string} value
   */
  function setCustomerField(field, value) {
    state.customer[field] = value;

    var control = dom.$("#booking-" + field);
    if (control) control.setAttribute("data-touched", "true");

    invalidateConfirmation();
    showFieldError(field);
    syncGating();
  }

  /* =====================================================================
     Wiring
     ===================================================================== */

  function init() {
    var flow = dom.$("#booking-flow");
    if (!flow) return;

    dialog = flow;
    ticketDialog = dom.$("#ticket-dialog");
    cacheNodes();

    /* ---- steps 1 and 2: radio groups ---- */
    dom.delegate(flow, "change", ".pick-card__input", function (event, input) {
      if (!input.checked) return;

      if (input.name === "booking-service") {
        state.serviceId = input.value;
        /* A new service changes who can perform it, and which slots are free. */
        state.barberId = null;
        state.date = null;
        state.time = null;
        monthCursor = null;
      } else {
        state.barberId = input.value;
        state.date = null;
        state.time = null;
        monthCursor = null;
      }

      invalidateConfirmation();
      syncSelectedState(flow);
      syncGating();
    });

    /* ---- step 3: calendar ---- */
    dom.delegate(flow, "click", "[data-day]", function (event, day) {
      if (day.disabled) return;

      state.date = day.getAttribute("data-day");
      state.time = null;

      monthCursor = schedule.parseKey(state.date);
      invalidateConfirmation();
      renderStep();
      syncStep();
    });

    dom.on(nodes.schedule, "click", function (event) {
      var target = event.target.closest("[data-cal-prev], [data-cal-next]");
      if (!target || target.disabled) return;

      var isPrev = target.hasAttribute("data-cal-prev");
      var step = isPrev ? -1 : 1;

      monthCursor = new Date(
        monthCursor.getFullYear(),
        monthCursor.getMonth() + step,
        1
      );

      renderStep();
      syncStep();

      /* Re-rendering replaces the button, so focus has to be placed again.
         At either end of the range the button is now disabled and cannot hold
         focus, so the month heading takes it — it is the live region that
         announced the change. */
      var again = dom.$(
        isPrev ? "[data-cal-prev]" : "[data-cal-next]",
        nodes.schedule
      );

      if (again && !again.disabled) {
        again.focus();
      } else {
        var heading = dom.$(".calendar__month", nodes.schedule);
        if (heading) {
          if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
          heading.focus();
        }
      }
    });

    /* ---- step 3: slots ---- */
    dom.delegate(flow, "click", "[data-slot]", function (event, slot) {
      if (slot.disabled) return;

      var picked = slot.getAttribute("data-slot");

      /* Selecting the same slot again clears it. */
      state.time = state.time === picked ? null : picked;

      invalidateConfirmation();
      renderStep();
      syncStep();

      var again = dom.$('[data-slot="' + picked + '"]', nodes.schedule);
      if (again && state.time) again.focus();
    });

    /* ---- step 4: customer fields ---- */
    CUSTOMER_FIELDS.forEach(function (field) {
      var control = dom.$("#booking-" + field);
      if (!control) return;

      dom.on(control, "input", function () {
        state.customer[field] = control.value;

        /* Mark touched once there is something to judge, so a half-typed
           value does not flash an error while an empty field waits for blur. */
        if (control.value.trim()) control.setAttribute("data-touched", "true");

        invalidateConfirmation();
        showFieldError(field);
        syncGating();
      });

      /* Validate on the way out, so an empty required field explains itself. */
      dom.on(control, "blur", function () {
        control.setAttribute("data-touched", "true");
        showFieldError(field);
      });
    });

    /* ---- footer ---- */
    dom.on(nodes.back, "click", function () {
      goTo(state.step - 1);
    });

    dom.on(nodes.next, "click", function () {
      advance();
    });

    /* ---- step 6: the ticket and the queue ---- */
    dom.delegate(flow, "click", "[data-ticket-open]", function (event, button) {
      openTicketDialog(button.getAttribute("data-ticket-open"));
    });

    dom.delegate(flow, "click", "[data-ticket-print]", function () {
      printTicket();
    });

    /* ---- printing ----
       The ticket dialog opens on top of the flow, so both can be open at
       once and a naive print would render two copies of the same ticket.
       Marking whichever dialog is on top gives the stylesheet one
       unambiguous target — and it also covers the browser's own Print
       command, which never passes through the button. */
    dom.on(window, "beforeprint", function () {
      [flow, ticketDialog].forEach(function (dialog) {
        if (!dialog) return;
        if (dialog.open) dialog.setAttribute("data-print-active", "");
        else dialog.removeAttribute("data-print-active");
      });
    });

    dom.on(window, "afterprint", function () {
      [flow, ticketDialog].forEach(function (dialog) {
        if (dialog) dialog.removeAttribute("data-print-active");
      });
    });

    /* Keep the form in step when the customer types, and expose it. */
    CUSTOMER_FIELDS.forEach(function (field) {
      var control = dom.$("#booking-" + field);
      if (control) control.setAttribute("form", "booking-details");
    });
  }

  /**
   * Move forward one step, or report why the flow is blocked.
   */
  async function advanceStep() {
    if (state.step === 1) {
      if (!state.serviceId) return;
      await goTo(2);
      return;
    }

    if (state.step === 2) {
      if (!state.barberId) return;
      await goTo(3);
      return;
    }

    if (state.step === 3) {
      if (!state.date || !state.time) return;
      await goTo(4);
      return;
    }

    /* Steps 4 and 5 both gate on the same customer details, so validating once
       here covers either. */
    if (state.step === 4 || state.step === 5) {
      CUSTOMER_FIELDS.forEach(function (field) {
        var control = dom.$("#booking-" + field);
        if (control) control.setAttribute("data-touched", "true");
        showFieldError(field, true);
      });

      if (!customerValid()) {
        /* Going back to the form is the only way the customer can fix it. */
        var firstBad = CUSTOMER_FIELDS.filter(function (field) {
          return validateField(field) !== "";
        })[0];

        var target = dom.$("#booking-" + firstBad);
        if (target) target.focus();

        await goTo(4);
        return;
      }

      await goTo(state.step + 1);
      return;
    }

    if (state.step === 6) {
      openTicketDialog("ticket");
    }
  }

  Halaq.bookingFlow = {
    init: init,
    open: open,
    goTo: goTo,
    reset: reset,
    selection: selection,
    validate: customerValid,
    /* The record issued on step 6, or null before the customer confirms. */
    confirmation: function () {
      return confirmed;
    },
    state: state
  };
})(window.Halaq = window.Halaq || {});
