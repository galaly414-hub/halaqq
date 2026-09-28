/* ==========================================================================
   Halaq — Digital ticket
   ---------------------------------------------------------------------------
   DEMO VIEW LAYER. Turns a record from Halaq.bookings into DOM.
   Exposed as window.Halaq.bookingTicket

   The flow shows the ticket inline on the confirmation step and again, larger,
   in a dialog. Both are the same builder, so the two can never disagree.

   render(record, options)   options.compact drops the decorative frame
   renderQueue(record)       the "متابعة الانتظار" view
   qrPlaceholder(seed, opts) the QR stand-in
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var schedule = Halaq.bookingSchedule;

  /* A QR "version 2" grid: 25 modules a side, the smallest size that still
     looks like a QR at ticket scale. */
  var GRID = 25;
  var FINDER = 7;

  /* =====================================================================
     QR placeholder
     ===================================================================== */

  /**
   * FNV-1a, so the same booking number always draws the same pattern. A real
   * QR encodes data; this only has to look like one and stay stable.
   * @param {string} text
   * @returns {number}
   */
  function seedOf(text) {
    var hash = 2166136261;
    var source = String(text || "");

    for (var i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }

    return hash >>> 0;
  }

  /**
   * xorshift32 — small, fast, and stable across engines.
   * @param {number} seed
   * @returns {function():number}
   */
  function random(seed) {
    var state = seed || 1;

    return function () {
      state ^= state << 13;
      state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 4294967296;
    };
  }

  /**
   * Is this module inside one of the three position-finding squares?
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  function inFinder(x, y) {
    var corners = [
      [0, 0],
      [GRID - FINDER, 0],
      [0, GRID - FINDER]
    ];

    return corners.some(function (corner) {
      return x >= corner[0] && x < corner[0] + FINDER &&
        y >= corner[1] && y < corner[1] + FINDER;
    });
  }

  /**
   * One square path subpath per module. A single <path> instead of 300
   * <rect>s keeps the DOM small, and even-odd fill carves the finder rings
   * out of one shape.
   * @param {string} seed
   * @returns {string}
   */
  function modulePath(seed) {
    var next = random(seedOf(seed));
    var path = "";

    for (var y = 0; y < GRID; y += 1) {
      for (var x = 0; x < GRID; x += 1) {
        if (inFinder(x, y)) continue;
        /* Leave a quiet band along the finders, as the real format does. */
        if ((x === 7 || y === 7) && x < GRID - 8 && y < GRID - 8) continue;
        if (next() > 0.52) path += "M" + x + " " + y + "h1v1h-1z";
      }
    }

    /* finder: outer ring, hollow middle, solid core */
    var corners = [[0, 0], [GRID - FINDER, 0], [0, GRID - FINDER]];

    corners.forEach(function (corner) {
      var x = corner[0];
      var y = corner[1];

      path += "M" + x + " " + y + "h" + FINDER + "v" + FINDER + "h-" + FINDER + "z";
      path += "M" + (x + 1) + " " + (y + 1) + "h5v5h-5z";
      path += "M" + (x + 2) + " " + (y + 2) + "h3v3h-3z";
    });

    return path;
  }

  /**
   * A QR-shaped placeholder. It carries the booking number in its accessible
   * name, and says plainly that it is a placeholder rather than pretending to
   * be scannable.
   *
   * @param {string} seed usually the booking number
   * @param {Object} [options]
   * @param {string} [options.className]
   * @param {boolean} [options.decorative] skip the accessible name entirely
   * @returns {HTMLElement}
   */
  function qrPlaceholder(seed, options) {
    var settings = options || {};

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + GRID + " " + GRID);
    svg.setAttribute("class", "ticket-qr__code" + (settings.className ? " " + settings.className : ""));
    svg.setAttribute("focusable", "false");

    if (settings.decorative) {
      svg.setAttribute("aria-hidden", "true");
    } else {
      svg.setAttribute("role", "img");
      svg.setAttribute(
        "aria-label",
        "رمز الاستجابة السريعة للحجز رقم " + seed
      );
    }

    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", modulePath(seed));
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("class", "ticket-qr__modules");

    svg.appendChild(path);

    return dom.el("div", { class: "ticket-qr", "data-qr-placeholder": "true" }, [
      svg,
      dom.el("span", { class: "ticket-qr__caption", text: "رمز الاستجابة السريعة" })
    ]);
  }

  /* =====================================================================
     Ticket
     ===================================================================== */

  /**
   * Brand details, which live in two places depending on which data module
   * has loaded. Either is fine; the ticket must not care.
   * @returns {Object}
   */
  function brand() {
    return (Halaq.data && Halaq.data.brand) || (Halaq.demoData && Halaq.demoData.brand) || {};
  }

  /**
   * First letters of a name, for the monogram plate. Arabic letters only —
   * there is no Latin fallback path here on purpose.
   * @param {string} name
   * @returns {string}
   */
  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);

    if (!parts.length) return "";
    if (parts.length === 1) return parts[0].slice(0, 2);

    return parts[0].charAt(0) + parts[1].charAt(0);
  }

  /**
   * A ruled row: icon, label, value.
   * @param {Object} row
   * @returns {HTMLElement}
   */
  function detailRow(row) {
    return dom.el("div", { class: "ticket__row" }, [
      dom.el("span", { class: "ticket__row-icon" }, [dom.icon(row.icon)]),
      dom.el("dt", { class: "ticket__row-label", text: row.label }),
      dom.el("dd", {
        class: "ticket__row-value" + (row.numeric ? " num" : ""),
        text: row.value || "—"
      })
    ]);
  }

  /**
   * A named party — the barber, the customer — with a monogram plate in
   * place of a photograph, so the ticket never depends on remote imagery.
   * @param {Object} party
   * @returns {HTMLElement}
   */
  function partyBlock(party) {
    var mark = party.mark
      ? dom.el("span", { class: "ticket__party-mark", text: party.mark })
      : dom.el("span", { class: "ticket__party-mark" }, [dom.icon(party.icon, "icon--sm")]);

    return dom.el("div", { class: "ticket__party-item" }, [
      mark,
      dom.el("div", { class: "ticket__party-text" }, [
        dom.el("span", { class: "ticket__party-label", text: party.label }),
        dom.el("span", { class: "ticket__party-name", text: party.name || "—" }),
        dom.el("span", { class: "ticket__party-note", text: party.note || "" })
      ])
    ]);
  }

  /**
   * The payment block: the money first, then whether it has been settled.
   * The two are never merged, because "how much" and "have I paid" are
   * different questions and the customer asks them at different moments.
   *
   * @param {Object} record
   * @returns {HTMLElement}
   */
  function paymentBlock(record) {
    var paid = !!record.payment.paid;

    return dom.el("div", { class: "ticket__pay" }, [
      dom.el("div", { class: "ticket__pay-total" }, [
        dom.el("span", { class: "ticket__pay-label", text: "الإجمالي" }),
        dom.el("strong", { class: "ticket__pay-value num", text: fmt.money(record.price) })
      ]),

      dom.el("p", { class: "ticket__pay-status is-" + (paid ? "paid" : "due") }, [
        dom.icon(paid ? "check-double" : "banknote", "icon--xs"),
        dom.el("span", { text: paid ? "تم الدفع" : "تدفع داخل الصالون" })
      ])
    ]);
  }

  /**
   * Everything the front desk needs, in the order a person reads it.
   *
   * The order is the hierarchy: who is being called, which booking it belongs
   * to and when, who is cutting and for whom, then the money. Anything a
   * customer can quote at the desk sits in the first two bands.
   *
   * @param {Object} record
   * @returns {HTMLElement}
   */
  function render(record, options) {
    var settings = options || {};
    var info = brand();
    var status = Halaq.bookings.statusInfo(record.status);
    var lane = (record.queue && record.queue.lane) || "—";
    var ahead = (record.queue && record.queue.ahead) || 0;

    var head = dom.el("header", { class: "ticket__head" }, [
      dom.el("span", { class: "ticket__mark" }, [dom.icon("scissors", "icon--sm")]),
      dom.el("span", { class: "ticket__brandline" }, [
        dom.el("span", { class: "ticket__brand", text: info.name || "حلاق" }),
        dom.el("span", { class: "ticket__kind", text: "تذكرة حجز" })
      ]),
      dom.el("span", { class: "ticket__status" }, [
        dom.icon(status.icon, "icon--xs"),
        dom.el("span", { text: status.label })
      ])
    ]);

    /* The waiting number is the loudest thing on the ticket by a wide
       margin: it is the one figure the room needs spoken across. */
    var queue = dom.el("section", { class: "ticket__queue" }, [
      dom.el("span", { class: "ticket__queue-eyebrow", text: "دورك في الانتظار" }),

      dom.el("strong", {
        class: "ticket__queue-number num",
        "data-queue-number": record.waitingNumber,
        text: record.waitingNumber
      }),

      dom.el("div", { class: "ticket__queue-meta" }, [
        dom.el("span", { class: "ticket__lane" }, [
          dom.el("span", { class: "ticket__lane-label", text: "المسار" }),
          dom.el("span", { class: "ticket__lane-chip num", text: lane })
        ]),
        dom.el("span", {
          class: "ticket__queue-ahead",
          text: ahead === 0 ? "أنت التالي في الدور" : fmt.number(ahead) + " قبل دورك"
        })
      ])
    ]);

    var stub = dom.el("section", { class: "ticket__stub" }, [
      dom.el("div", { class: "ticket__stub-item" }, [
        dom.el("span", { class: "ticket__stub-label", text: "رقم الحجز" }),
        dom.el("strong", {
          class: "ticket__stub-value num",
          "data-ticket-number": "booking",
          text: record.bookingNumber
        })
      ]),

      dom.el("div", { class: "ticket__stub-item ticket__stub-item--when" }, [
        dom.el("span", { class: "ticket__stub-label", text: "موعدك" }),
        dom.el("strong", { class: "ticket__stub-time num", text: fmt.time(record.time) }),
        dom.el("span", { class: "ticket__stub-date", text: schedule.fullLabel(record.date) })
      ])
    ]);

    var party = dom.el("div", { class: "ticket__party" }, [
      partyBlock({
        icon: "user-check",
        mark: record.anyBarber ? "" : initials(record.barber && record.barber.name),
        label: "الحلاق",
        name: record.anyBarber ? "أي حلاق متاح" : record.barber.name,
        note: record.anyBarber ? "يحدده المركز عند وصولك" : ""
      }),

      partyBlock({
        icon: "contact",
        label: "العميل",
        name: record.customer.name,
        note: record.customer.phone
      })
    ]);

    var details = dom.el("dl", { class: "ticket__details" }, [
      detailRow({ icon: "scissors", label: "الخدمة", value: record.service.name }),
      detailRow({
        icon: "clock",
        label: "المدة",
        value: fmt.number(record.duration) + " دقيقة",
        numeric: true
      })
    ]);

    var body = dom.el("div", { class: "ticket__body" }, [
      dom.el("div", { class: "ticket__main" }, [party, details]),
      dom.el("div", { class: "ticket__aside" }, [
        settings.qr === false ? null : qrPlaceholder(record.bookingNumber),
        paymentBlock(record)
      ])
    ]);

    /* Only the printer ever sees this, so it is written for paper: the shop
       details a customer needs to find the door, and nothing else. */
    var printOnly = dom.el("div", { class: "ticket__print" }, [
      dom.el("span", { class: "ticket__print-shop", text: info.name || "حلاق" }),
      info.address
        ? dom.el("span", { class: "ticket__print-line" }, [
            dom.icon("map-pin", "icon--xs"),
            dom.el("span", { text: info.address })
          ])
        : null,
      info.phone
        ? dom.el("span", { class: "ticket__print-line" }, [
            dom.icon("phone", "icon--xs"),
            dom.el("span", { text: info.phone })
          ])
        : null,
      dom.el("span", {
        class: "ticket__print-line ticket__print-note",
        text: "اعرض هذه التذكرة عند الوصول إلى الصالون."
      })
    ]);

    var foot = dom.el("footer", { class: "ticket__foot" }, [
      dom.el("p", { class: "ticket__note" }, [
        dom.icon("info", "icon--sm"),
        dom.el("span", { text: record.payment.note })
      ]),
      dom.el("p", {
        class: "ticket__stamp num",
        text: Halaq.bookings.statusLabel(record.status)
      })
    ]);

    return dom.el("article", {
      class: "ticket" + (settings.compact ? " ticket--compact" : ""),
      "data-ticket": record.bookingNumber,
      "aria-label": "تذكرة الحجز رقم " + record.bookingNumber
    }, [head, queue, dom.el("div", { class: "ticket__perf", "aria-hidden": "true" }), stub, body, printOnly, foot]);
  }

  /**
   * The waiting view behind "متابعة الانتظار". The figures come from
   * Halaq.bookings.track(), which recomputes them against the queue as it
   * stands now — not the snapshot taken when the booking was issued, which
   * goes stale the moment anyone ahead is served.
   *
   * @param {Object} record
   * @returns {HTMLElement}
   */
  function renderQueue(record) {
    var live = Halaq.bookings.track(record);
    var ahead = live.peopleAhead;

    return dom.el("div", { class: "queue" }, [
      dom.el("section", { class: "queue__card" }, [
        dom.el("span", { class: "queue__label", text: "رقم انتظارك" }),

        dom.el("strong", {
          class: "queue__number num",
          "data-queue-number": record.waitingNumber,
          text: record.waitingNumber
        }),

        dom.el("div", { class: "queue__lane" }, [
          dom.el("span", { class: "queue__lane-chip num", text: record.queue.lane }),
          dom.el("span", {
            class: "queue__lane-text",
            text: "المسار " + record.queue.lane + " — " +
              (record.anyBarber ? "أي حلاق متاح" : record.barber.name)
          })
        ]),

        dom.el("p", {
          class: "queue__position",
          text: ahead === 0
            ? "أنت التالي في الدور على هذا المسار."
            : fmt.number(ahead) + " بانتظارك قبل دورك على هذا المسار."
        })
      ]),

      dom.el("section", { class: "queue__panel" }, [
        live.nowServing
          ? dom.el("p", { class: "queue__now" }, [
              dom.el("span", { class: "queue__now-label", text: "الرقم الذي يُخدم الآن" }),
              dom.el("strong", { class: "queue__now-number num", text: live.nowServing })
            ])
          : null,

        dom.el("p", {
          class: "queue__when",
          text: "موعدك: " + schedule.fullLabel(record.date) + " الساعة " + fmt.time(record.time)
        }),

        dom.el("p", { class: "queue__hint" }, [
          dom.icon("info", "icon--sm"),
          dom.el("span", {
            text: "رقم دورك يتغيّر مع كل خدمة تنتهي قبله. " +
              "احتفظ برقم حجزك للاستفسار في أي وقت."
          })
        ])
      ])
    ]);
  }

  Halaq.bookingTicket = {
    render: render,
    renderQueue: renderQueue,
    qrPlaceholder: qrPlaceholder
  };
})(window.Halaq = window.Halaq || {});
