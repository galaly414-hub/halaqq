/* ==========================================================================
   Halaq — Booking tracker
   ---------------------------------------------------------------------------
   DEMO VIEW LAYER. track.html in one component.
   Exposed as window.Halaq.bookingTracker

   A customer who has already booked should not need a phone call to find out
   where they are. They give the booking number and the mobile number they
   booked with, and this page answers the only questions that matter: what is
   my number, whose turn is it, how many are ahead of me, roughly how long,
   and who is cutting my hair.

   Both numbers are required. One alone would let anyone walk the list, so a
   wrong pair gives one deliberately vague answer that never says which half
   was wrong.

   Every figure comes from Halaq.bookings.track(), which recomputes against the
   queue as it stands. Nothing is baked into the markup, so "تحديث الحالة"
   re-reads the record and shows where the queue has moved to.

   The page is composed as a service, not a dashboard. The order a customer
   reads in is: my number, then whose turn it is, then how far away that is,
   then the line itself, then the appointment. Everything is presentational —
   the store, the verification and Supabase are read exactly as before.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var schedule = Halaq.bookingSchedule;

  /* The booking number as the salon writes it, checked before any lookup so a
     typo is reported as a typo rather than as a failed verification. */
  var NUMBER_SHAPE = /^HLQ\d{6}\d{2,4}$/i;

  /* Room for a local Saudi mobile and for one written with the country code. */
  var PHONE_MIN = 9;
  var PHONE_MAX = 15;

  /* A long queue is summarised rather than drawn. */
  var MAX_PIPS = 8;

  /* How long a changed figure stays highlighted, and how long the skeleton
     stays up if the lookup comes back instantly. Both exist to make a change
     legible; neither is a loading threshold that could mask an error. */
  var FLASH_MS = 2000;
  var MIN_LOADING_MS = 420;

  /* Status -> the badge tone on the live board. Label and icon still come
     from the store, so the two can never disagree. */
  var TONE = {
    confirmed: "info",
    waiting: "warning",
    attended: "warning",
    in_service: "brand",
    done: "success",
    cancelled: "danger",
    no_show: "danger"
  };

  /* How each state is drawn in the queue rail. "word" is printed beside the
     mark, so the rail still reads correctly with the icons removed. */
  var PIPE = {
    done: { icon: "check", word: "تمت الخدمة" },
    in_service: { icon: "razor", word: "في الكرسي الآن" },
    attended: { icon: "user-check", word: "حضر" },
    waiting: { icon: "hourglass", word: "بانتظار دوره" }
  };

  /* The four figures that can move while the page is open. Each is written
     into the DOM with data-live="<key>" so a change can be highlighted
     without re-rendering the whole board. */
  var LIVE_KEYS = ["nowServing", "peopleAhead", "estimateMinutes", "status"];

  /* One answer for a wrong pair, whatever was wrong with it. Saying which
     half was wrong would confirm that the other half exists. */
  var MISMATCH_TITLE = "لم نتمكن من تأكيد الحجز";
  var MISMATCH_TEXT =
    "لم نعثر على حجز بهذه البيانات. تأكد من رقم الحجز ورقم الجوال كما " +
    "كتبتَهما عند الحجز، أو تواصل معنا على 055 123 4567.";

  /* =====================================================================
     Validation
     ===================================================================== */

  /**
   * @param {string} value
   * @returns {string} "" when fine, otherwise the message to show
   */
  function numberError(value) {
    var digits = fmt.digits(value);

    if (!digits) return "اكتب رقم الحجز.";

    if (!NUMBER_SHAPE.test(digits)) {
      return "رقم الحجز يبدأ بـ HLQ ويتبعه تاريخ ورقم، مثل HLQ-260927-014.";
    }

    return "";
  }

  /**
   * @param {string} value
   * @returns {string} "" when fine, otherwise the message to show
   */
  function phoneError(value) {
    var digits = fmt.digits(value);

    if (!digits) return "اكتب رقم الجوال الذي حجزت به.";

    if (digits.length < PHONE_MIN || digits.length > PHONE_MAX) {
      return "رقم الجوال غير مكتمل. اكتبه كما هو في الحجز.";
    }

    return "";
  }

  /* =====================================================================
     Live figures
     ===================================================================== */

  /**
   * "HH:MM" for right now, so the page can say when it last looked.
   * @returns {string}
   */
  function nowClock() {
    var probe = new Date();

    return fmt.time(
      String(probe.getHours()).padStart(2, "0") + ":" +
      String(probe.getMinutes()).padStart(2, "0")
    );
  }

  /**
   * The figures a refresh can change, flattened for comparison.
   * @param {Object} live
   * @returns {Object}
   */
  function snapshotOf(live) {
    return {
      nowServing: live.nowServing || "",
      peopleAhead: live.peopleAhead,
      estimateMinutes: live.estimateMinutes,
      status: live.status.label
    };
  }

  /**
   * Highlight the figures that moved since the last render.
   *
   * A queue that updates silently is a queue nobody trusts, so each value
   * that changes gets a short, single-pass highlight. The class is removed
   * on a timer rather than by an animation end event, because a value that
   * changes twice inside two seconds still has to end in a readable state.
   *
   * @param {Object} previous
   * @param {Object} next
   * @param {ParentNode} root
   */
  function flashChanges(previous, next, root) {
    if (!previous) return;

    LIVE_KEYS.forEach(function (key) {
      if (previous[key] === next[key]) return;

      dom.$$("[data-live=" + key + "]", root).forEach(function (node) {
        node.classList.remove("is-updated");
        /* Reading layout flushes the class so the animation restarts even
           when the same figure changes twice in a row. */
        void node.offsetWidth;
        node.classList.add("is-updated");

        window.setTimeout(function () {
          node.classList.remove("is-updated");
        }, FLASH_MS);
      });
    });
  }

  /**
   * Counts by state, for the rail's summary line.
   * @param {Object[]} lane
   * @returns {Object}
   */
  function laneCounts(lane) {
    return lane.reduce(function (tally, item) {
      tally[item.status] = (tally[item.status] || 0) + 1;
      return tally;
    }, {});
  }

  /**
   * The record actually in the chair, so the plate can name their barber
   * instead of showing a bare number. Taken from the lane the store already
   * returned, not recomputed.
   *
   * @param {Object[]} lane
   * @returns {Object|null}
   */
  function servingRecord(lane) {
    return lane.filter(function (item) {
      return item.status === "in_service";
    })[0] || null;
  }

  /**
   * The line about how many people are in front, in Arabic that counts
   * properly: zero, one, two, three-to-ten, then more.
   *
   * @param {number} n
   * @returns {string}
   */
  function aheadPhrase(n) {
    if (n === 0) return "لا أحد بانتظارك. دورك هو التالي.";
    if (n === 1) return "شخص واحد بانتظارك قبل دورك.";
    if (n === 2) return "شخصان بانتظارك قبل دورك.";
    if (n <= 10) return fmt.number(n) + " أشخاص بانتظارك قبل دورك.";

    return fmt.number(n) + " شخصاً بانتظارك قبل دورك.";
  }

  /* =====================================================================
     Small view pieces
     ===================================================================== */

  /**
   * One labelled fact. `num` keeps Latin digits from being reshaped inside an
   * RTL paragraph.
   *
   * @param {string} label
   * @param {string} value
   * @param {{num?: boolean, icon?: string}} [opts]
   * @returns {HTMLElement}
   */
  function fact(label, value, opts) {
    opts = opts || {};

    return dom.el("div", { class: "tracker__fact" + (opts.wide ? " tracker__fact--wide" : "") }, [
      dom.el("span", { class: "tracker__fact-label" }, [
        dom.icon(opts.icon || "info", "icon--sm"),
        dom.el("span", { text: label })
      ]),
      dom.el("strong", {
        class: "tracker__fact-value" + (opts.num ? " num" : ""),
        text: value
      })
    ]);
  }

  /* =====================================================================
     The live board
     ===================================================================== */

  /**
   * The customer's own number. This is the loudest thing on the page by a
   * wide margin, and it is the only element that gets the inked ground.
   *
   * @param {Object} live
   * @returns {HTMLElement}
   */
  function minePlate(live) {
    return dom.el("section", { class: "tracker__mine" }, [
      dom.el("span", { class: "tracker__mine-eyebrow" }, [
        dom.icon("ticket", "icon--sm"),
        dom.el("span", { text: "رقم انتظارك" })
      ]),

      dom.el("strong", {
        class: "tracker__mine-number num",
        "data-waiting-number": live.waitingNumber,
        text: live.waitingNumber
      }),

      dom.el("div", { class: "tracker__mine-foot" }, [
        dom.el("span", { class: "tracker__lane" }, [
          dom.el("span", { class: "tracker__lane-label", text: "المسار" }),
          dom.el("span", { class: "tracker__lane-chip num", text: live.laneLabel })
        ]),
        dom.el("span", {
          class: "tracker__mine-state",
          text: aheadPhrase(live.peopleAhead)
        })
      ])
    ]);
  }

  /**
   * Whose turn it is right now. A separate plate, never merged with the
   * customer's own number: the whole point is telling the two apart at a
   * glance.
   *
   * @param {Object} live
   * @returns {HTMLElement}
   */
  function servingPlate(live) {
    var serving = servingRecord(live.lane || []);
    var isYou = live.nowServingIsYou;
    var name = serving
      ? (serving.anyBarber ? "أي حلاق متاح" : serving.barber.name)
      : "";

    return dom.el("section", {
      class: "tracker__serving" + (isYou ? " is-you" : ""),
      "aria-label": "الرقم الذي يُخدم الآن"
    }, [
      dom.el("span", { class: "tracker__serving-eyebrow" }, [
        dom.icon("razor", "icon--sm"),
        dom.el("span", { text: "يُخدم الآن" })
      ]),

      live.nowServing
        ? dom.el("strong", {
            class: "tracker__serving-number num",
            "data-live": "nowServing",
            "data-now-serving": live.nowServing,
            text: live.nowServing
          })
        : dom.el("strong", {
            class: "tracker__serving-number is-empty",
            text: "لا أحد"
          }),

      isYou
        ? dom.el("span", { class: "tracker__serving-flag" }, [
            dom.icon("check", "icon--xs"),
            dom.el("span", { text: "هذا دورك" })
          ])
        : null,

      dom.el("span", {
        class: "tracker__serving-note",
        text: live.nowServing
          ? (isYou ? "الخدمة بدأت معك الآن." : (name ? "مع " + name : "على هذا المسار."))
          : "الكرسي فارغ على هذا المسار حالياً."
      })
    ]);
  }

  /**
   * The two distance figures, side by side and ruled.
   * @param {Object} live
   * @returns {HTMLElement}
   */
  function figures(live) {
    return dom.el("section", { class: "tracker__figures" }, [
      dom.el("div", { class: "tracker__figure" }, [
        dom.el("span", { class: "tracker__figure-label" }, [
          dom.icon("users", "icon--sm"),
          dom.el("span", { text: "قبل دورك" })
        ]),
        dom.el("strong", {
          class: "tracker__figure-value num",
          "data-live": "peopleAhead",
          "data-people-ahead": live.peopleAhead,
          text: fmt.number(live.peopleAhead)
        })
      ]),

      dom.el("div", { class: "tracker__figure" }, [
        dom.el("span", { class: "tracker__figure-label" }, [
          dom.icon("clock", "icon--sm"),
          dom.el("span", { text: "الوقت المتوقع" })
        ]),
        dom.el("strong", {
          class: "tracker__figure-value num" + (live.estimateMinutes ? "" : " is-empty"),
          "data-live": "estimateMinutes",
          "data-estimate": live.estimateMinutes,
          text: live.estimateMinutes ? fmt.number(live.estimateMinutes) + " د"
                                      : "أنت التالي"
        })
      ])
    ]);
  }

  /* =====================================================================
     The queue rail
     ===================================================================== */

  /**
   * The line itself: one mark per person on the lane, connected by a rail
   * that fills as people are served. Every state differs by glyph, by word
   * and by colour, and the customer is marked on the rail as well as in the
   * board above it.
   *
   * @param {Object} live
   * @param {Object} record
   * @returns {HTMLElement}
   */
  function queueRail(live, record) {
    /* A booking that is no longer queued — done, cancelled, missed — has no
       place in the line, so the rail is replaced by the status note. */
    if (!live.inQueue) {
      return dom.el("div", { class: "tracker__queue tracker__queue--empty" }, [
        dom.el("span", { class: "tracker__empty-mark" }, [dom.icon("check-double", "icon--lg")]),
        dom.el("div", { class: "tracker__empty-text" }, [
          dom.el("p", { class: "tracker__empty-title", text: live.status.label }),
          dom.el("p", { class: "tracker__empty-note", "data-queue-none": "", text: live.status.note })
        ])
      ]);
    }

    var lane = live.lane || [];
    var counts = laneCounts(lane);
    var shown = lane.slice(0, MAX_PIPS);
    var hidden = lane.length - shown.length;

    var marks = shown.map(function (item, index) {
      var isYou = item.id === record.id;
      var style = PIPE[item.status] || PIPE.waiting;

      return dom.el("li", {
        class: "tracker__mark is-" + item.status + (isYou ? " is-you" : ""),
        "data-mark-state": item.status
      }, [
        dom.el("span", { class: "tracker__mark-dot" }, [
          dom.icon(style.icon, "icon--sm"),
          isYou
            ? dom.el("span", { class: "tracker__mark-flag", text: "أنت" })
            : null
        ]),

        dom.el("span", { class: "tracker__mark-text" }, [
          dom.el("span", { class: "tracker__mark-word", text: style.word }),
          dom.el("span", {
            class: "tracker__mark-number num",
            text: isYou ? item.waitingNumber : String(index + 1)
          })
        ]),

        /* The mark carries a name too, so the order is not a purely visual
           thing even before the word beneath it is read. */
        dom.el("span", {
          class: "sr-only",
          text: live.status.label + "، " + style.word + (isYou ? "، هذا دورك" : "")
        })
      ]);
    });

    if (hidden > 0) {
      marks.push(dom.el("li", { class: "tracker__mark tracker__mark--more" }, [
        dom.el("span", { class: "tracker__mark-number num", text: "+" + hidden }),
        dom.el("span", { class: "tracker__mark-word", text: "أخرى بعد" })
      ]));
    }

    var served = (counts.done || 0) + (counts.in_service || 0);

    return dom.el("section", { class: "tracker__queue" }, [
      dom.el("div", { class: "tracker__queue-head" }, [
        dom.el("span", { class: "tracker__queue-title" }, [
          dom.icon("layers", "icon--sm"),
          dom.el("span", { text: "ترتيب الانتظار على المسار " + live.laneLabel })
        ]),
        dom.el("span", {
          class: "tracker__queue-meta num",
          text: fmt.number(served) + " من " + fmt.number(lane.length) + " تم تقديمهم"
        })
      ]),

      dom.el("ol", {
        class: "tracker__rail",
        "data-queue-strip": "",
        "aria-label": "ترتيب الانتظار على المسار " + live.laneLabel
      }, marks)
    ]);
  }

  /**
   * The board: status first in words, then the three plates, then the line.
   *
   * @param {Object} live
   * @param {Object} record
   * @returns {HTMLElement}
   */
  function liveBoard(live, record) {
    var tone = TONE[record.status] || "info";

    return dom.el("section", {
      class: "tracker__live is-" + tone,
      "data-status": record.status
    }, [
      dom.el("div", { class: "tracker__live-head" }, [
        dom.el("span", { class: "tracker__live-badge" }, [
          dom.el("span", { class: "tracker__live-dot", "aria-hidden": "true" }),
          dom.el("span", { text: "حالة حجزك الآن" })
        ]),

        dom.el("div", { class: "tracker__live-text" }, [
          dom.el("p", {
            class: "tracker__live-label",
            "data-live": "status",
            "data-status-label": "",
            text: live.status.label
          }),
          dom.el("p", { class: "tracker__live-note", text: live.status.note })
        ]),

        dom.el("span", { class: "tracker__live-icon" }, [dom.icon(live.status.icon, "icon--lg")])
      ]),

      dom.el("div", { class: "tracker__board" }, [
        minePlate(live),
        servingPlate(live),
        figures(live)
      ]),

      queueRail(live, record)
    ]);
  }

  /* =====================================================================
     Details
     ===================================================================== */

  /**
   * Everything about the booking itself, kept below the live board so the eye
   * lands on "where am I" first.
   *
   * @param {Object} record
   * @returns {HTMLElement}
   */
  function detailsCard(record) {
    var barberName = record.anyBarber ? "أي حلاق متاح" : record.barber.name;
    var initials = record.anyBarber
      ? ""
      : String(record.barber.name || "").trim().split(/\s+/).slice(0, 2)
          .map(function (part) { return part.charAt(0); }).join("");

    return dom.el("section", { class: "tracker__details" }, [
      dom.el("h2", { class: "tracker__h2" }, [
        dom.el("span", { text: "تفاصيل الحجز" })
      ]),

      /* The appointment is a band of its own rather than one cell among
         seven: it is the second thing a customer looks for after their
         number. */
      dom.el("div", { class: "tracker__when" }, [
        dom.el("span", { class: "tracker__when-eyebrow" }, [
          dom.icon("calendar-check", "icon--sm"),
          dom.el("span", { text: "موعدك" })
        ]),
        dom.el("div", { class: "tracker__when-body" }, [
          dom.el("strong", { class: "tracker__when-time num", text: fmt.time(record.time) }),
          dom.el("span", {
            class: "tracker__when-date",
            text: schedule.fullLabel(record.date)
          })
        ])
      ]),

      dom.el("div", { class: "tracker__barber" }, [
        dom.el("span", { class: "tracker__barber-mark" }, [
          initials
            ? dom.el("span", { text: initials })
            : dom.icon("users", "icon--sm")
        ]),
        dom.el("div", { class: "tracker__barber-text" }, [
          dom.el("span", { class: "tracker__barber-label", text: "الحلاق" }),
          dom.el("span", { class: "tracker__barber-name", text: barberName }),
          record.anyBarber
            ? dom.el("span", {
                class: "tracker__barber-note",
                text: "يحدده المركز عند وصولك"
              })
            : null
        ])
      ]),

      dom.el("div", { class: "tracker__facts" }, [
        fact("رقم الحجز", record.bookingNumber, { num: true, icon: "ticket" }),
        fact("الخدمة", record.service.name, { icon: "scissors" }),
        fact("المدة", fmt.number(record.duration) + " دقيقة", { num: true, icon: "clock" }),
        fact("السعر", fmt.money(record.price), { icon: "tag" }),
        fact("المسار", record.queue.lane, { num: true, icon: "layers" }),
        fact("العميل", record.customer.name, { icon: "contact", wide: true })
      ]),

      dom.el("p", {
        class: "tracker__payment" + (record.payment.paid ? " is-paid" : "")
      }, [
        dom.icon(record.payment.paid ? "check-double" : "banknote", "icon--sm"),
        dom.el("div", { class: "tracker__payment-text" }, [
          dom.el("span", {
            class: "tracker__payment-state",
            text: record.payment.paid ? "تم الدفع" : "لم تُدفع بعد"
          }),
          dom.el("span", { class: "tracker__payment-note", text: record.payment.note })
        ])
      ])
    ]);
  }

  /**
   * The ticket the customer was handed, built by the same component that built
   * it at confirmation time, so the two can never disagree.
   *
   * @param {Object} record
   * @returns {HTMLElement}
   */
  function ticketCard(record) {
    return dom.el("section", { class: "tracker__ticket" }, [
      dom.el("h2", { class: "tracker__h2" }, [
        dom.el("span", { text: "تذكرتك" })
      ]),
      Halaq.bookingTicket.render(record, { compact: true })
    ]);
  }

  /* =====================================================================
     Loading, empty and error
     ===================================================================== */

  /**
   * The skeleton shown while a pair is being verified. It is the shape of the
   * board it replaces, so nothing jumps when the real one lands.
   *
   * @returns {HTMLElement}
   */
  function loadingBoard() {
    function bar(width, tall) {
      return dom.el("span", {
        class: "tracker__skeleton-bar" + (tall ? " is-tall" : ""),
        style: "inline-size:" + width
      });
    }

    return dom.el("div", {
      class: "tracker__result-body",
      "data-result": "loading",
      "aria-busy": "true"
    }, [
      dom.el("section", { class: "tracker__live is-loading" }, [
        dom.el("div", { class: "tracker__live-head" }, [
          dom.el("span", { class: "tracker__skeleton-line" }),
          dom.el("span", { class: "tracker__skeleton-line is-short" })
        ]),

        dom.el("div", { class: "tracker__board" }, [
          dom.el("div", { class: "tracker__skeleton is-plate" }, [bar("42%", true), bar("62%")]),
          dom.el("div", { class: "tracker__skeleton" }, [bar("54%", true), bar("78%")]),
          dom.el("div", { class: "tracker__skeleton" }, [bar("46%", true), bar("70%")])
        ]),

        dom.el("div", { class: "tracker__skeleton" }, [bar("88%"), bar("70%"), bar("60%")]),

        dom.el("p", { class: "tracker__loading-note" }, [
          dom.icon("refresh", "icon--sm"),
          dom.el("span", { text: "جارٍ قراءة حالتك من الصالون" })
        ])
      ])
    ]);
  }

  /**
   * The state a customer sees before they have searched: what the page will
   * answer, so the form is not a blank box with two inputs.
   *
   * @returns {HTMLElement}
   */
  function previewBoard() {
    var items = [
      { icon: "ticket", text: "رقم انتظارك" },
      { icon: "razor", text: "الرقم الذي يُخدم الآن" },
      { icon: "users", text: "عدد من يسبقك في الدور" },
      { icon: "clock", text: "الوقت المتوقع تقريباً" }
    ];

    return dom.el("div", { class: "tracker__preview" }, [
      dom.el("span", { class: "tracker__preview-label", text: "ستقرأ لك الصفحة" }),
      dom.el("ul", { class: "tracker__preview-list" }, items.map(function (item) {
        return dom.el("li", { class: "tracker__preview-item" }, [
          dom.icon(item.icon, "icon--sm"),
          dom.el("span", { text: item.text })
        ]);
      }))
    ]);
  }

  /* =====================================================================
     The page
     ===================================================================== */

  /**
   * @typedef {Object} TrackerView
   * @property {HTMLElement} el      the whole tracker
   * @property {HTMLFormElement} form
   * @property {HTMLElement} result  the live region results are written into
   * @property {function} submit     run a search
   * @property {function} refresh    re-read the record last found
   * @property {function} lookup     verify a pair without touching the DOM
   */

  /**
   * Build the tracker.
   * @param {Object} [opts]
   * @param {Object[]} [opts.demo] records to offer as ready-made samples
   * @returns {TrackerView}
   */
  function view(opts) {
    opts = opts || {};

    var lastFound = null;
    var lastSnapshot = null;
    var pendingTimer = null;

    /* ---- a field with its error slot wired for assistive tech ---- */

    function field(id, label, attrs, hint) {
      var input = dom.el("input", Object.assign({
        class: "input",
        id: id,
        name: id,
        "aria-describedby": id + "-error" + (hint ? " " + id + "-hint" : "")
      }, attrs));

      var error = dom.el("p", {
        class: "field__error tracker__error",
        id: id + "-error",
        role: "alert"
      });
      error.hidden = true;

      var node = dom.el("div", { class: "field tracker__field" }, [
        dom.el("label", { class: "field__label", for: id, text: label }),
        input,
        hint ? dom.el("p", { class: "field__hint", id: id + "-hint", text: hint }) : null,
        error
      ]);

      return {
        input: input,
        node: node,
        setError: function (message) {
          error.textContent = message || "";
          error.hidden = !message;
          input.setAttribute("aria-invalid", message ? "true" : "false");
          input.classList.toggle("is-invalid", !!message);
        }
      };
    }

    var number = field(
      "tracker-number",
      "رقم الحجز",
      {
        type: "text",
        autocomplete: "off",
        spellcheck: "false",
        dir: "ltr",
        placeholder: "HLQ-260927-014"
      },
      "كما هو في تذكرتك أو في رسالة التأكيد."
    );

    var phone = field(
      "tracker-phone",
      "رقم الجوال",
      {
        type: "tel",
        autocomplete: "tel",
        inputmode: "tel",
        dir: "ltr",
        placeholder: "0500000000"
      },
      "الرقم الذي حجزت به، للتأكد أن الحجز لك."
    );

    var result = dom.el("div", {
      class: "tracker__result",
      "data-tracker-result": "",
      "aria-live": "polite"
    });

    function message(kind, title, text, icon, action) {
      dom.render(result, [
        dom.el("div", {
          class: "tracker__message is-" + kind,
          "data-message": kind,
          role: "status"
        }, [
          dom.el("span", { class: "tracker__message-mark" }, [dom.icon(icon, "icon--lg")]),
          dom.el("div", { class: "tracker__message-text" }, [
            dom.el("p", { class: "tracker__message-title", text: title }),
            dom.el("p", { class: "tracker__message-body", text: text }),
            action
              ? dom.el("a", {
                  class: "tracker__message-action",
                  href: "tel:+966551234567"
                }, [
                  dom.icon("phone", "icon--sm"),
                  dom.el("span", { text: action })
                ])
              : null
          ])
        ])
      ]);
    }

    function show(record) {
      lastFound = record;

      var live = Halaq.bookings.track(record);

      /* The rail draws the lane itself, so it needs the list, not just the
         summary. Both come from the store so the ordering lives in one place. */
      live.lane = Halaq.bookings.laneRecords(record);
      live.laneLabel = record.queue.lane;
      live.inQueue = live.positionInLane > 0;

      var snapshot = snapshotOf(live);

      dom.render(result, [
        dom.el("div", { class: "tracker__result-body", "data-result": "found" }, [
          liveBoard(live, record),
          detailsCard(record),
          ticketCard(record),

          dom.el("div", { class: "tracker__actions" }, [
            dom.el("button", {
              type: "button",
              class: "btn btn--secondary",
              "data-action": "refresh"
            }, [
              dom.icon("refresh", "icon--sm"),
              dom.el("span", { text: "تحديث الحالة" })
            ]),
            dom.el("a", {
              class: "btn btn--ghost",
              href: "index.html#booking",
              "data-action": "new-booking"
            }, [
              dom.icon("calendar-check", "icon--sm"),
              dom.el("span", { text: "حجز موعد جديد" })
            ])
          ]),

          dom.el("p", { class: "tracker__stamp" }, [
            dom.icon("refresh", "icon--sm"),
            dom.el("span", {
              text: "آخر تحديث " + nowClock() +
                " — تتحدّث الصفحة تلقائياً كلما تغيّرت حالتك."
            })
          ])
        ])
      ]);

      flashChanges(lastSnapshot, snapshot, result);
      lastSnapshot = snapshot;
    }

    /**
     * Draw the skeleton, then run the work once it has been on screen long
     * enough to read as a response rather than a flicker.
     *
     * @param {function} work
     */
    function withLoading(work) {
      if (pendingTimer) window.clearTimeout(pendingTimer);

      dom.render(result, [loadingBoard()]);

      pendingTimer = window.setTimeout(function () {
        pendingTimer = null;
        work();
      }, MIN_LOADING_MS);
    }

    function submit(event) {
      if (event) event.preventDefault();

      var numberMessage = numberError(number.input.value);
      var phoneMessage = phoneError(phone.input.value);

      number.setError(numberMessage);
      phone.setError(phoneMessage);

      if (numberMessage || phoneMessage) return false;

      withLoading(function () {
        var found = Halaq.bookings.verify(number.input.value, phone.input.value);

        if (!found.ok) {
          lastFound = null;
          lastSnapshot = null;
          message(
            "error",
            MISMATCH_TITLE,
            MISMATCH_TEXT,
            "alert-triangle",
            "اتصل بالصالون على 055 123 4567"
          );
          return;
        }

        show(found.record);
      });

      return true;
    }

    function refresh() {
      if (!lastFound) return false;

      var record = lastFound;

      withLoading(function () {
        show(record);
      });

      return true;
    }

    var form = dom.el("form", {
      class: "tracker__form",
      novalidate: true,
      onsubmit: submit
    }, [
      dom.el("div", { class: "tracker__form-grid" }, [number.node, phone.node]),
      dom.el("button", {
        type: "submit",
        class: "btn btn--primary btn--block",
        "data-action": "submit",
        text: "عرض حالة الحجز"
      })
    ]);

    dom.delegate(result, "click", "[data-action=refresh]", function (event) {
      event.preventDefault();
      refresh();
    });

    var samples = dom.el("div", { class: "tracker__samples-host" });

    mountSamples(opts.demo, samples);

    var el = dom.el("div", { class: "tracker", "data-tracker": "" }, [
      dom.el("div", { class: "tracker__intro" }, [
        dom.el("h1", { class: "tracker__title", text: "تابع حجزك" }),
        dom.el("p", {
          class: "tracker__lede",
          text: "اكتب رقم الحجز ورقم الجوال، وستعرف حالتك ورقم دورك " +
            "والوقت المتوقع تقريباً."
        })
      ]),

      form,
      previewBoard(),
      result,
      samples
    ]);

    return {
      el: el,
      form: form,
      result: result,
      submit: submit,
      refresh: refresh,
      numberField: number,
      phoneField: phone
    };
  }

  /**
   * A short, clearly-labelled set of demo pairs, so the page can be tried
   * without booking first. Each one fills the form and searches.
   *
   * @param {Object[]} [records]
   * @returns {HTMLElement|null}
   */
  function sampleList(records) {
    if (!records || !records.length) return null;

    var items = records.slice(0, 4).map(function (record) {
      return dom.el("li", { class: "tracker__sample" }, [
        dom.el("button", {
          type: "button",
          class: "btn btn--ghost btn--sm",
          "data-sample-number": record.bookingNumber,
          "data-sample-phone": record.customer.phone,
          text: record.bookingNumber + " — " + Halaq.bookings.statusLabel(record.status)
        })
      ]);
    });

    return dom.el("details", { class: "tracker__samples" }, [
      dom.el("summary", { class: "tracker__samples-summary", text: "أمثلة لتجربة الصفحة" }),
      dom.el("ul", { class: "tracker__sample-list" }, items)
    ]);
  }

  /**
   * Put the sample list in the page, once the demo rows exist.
   *
   * The seeding call is asynchronous, so a plain `opts.demo.length` check would
   * always read zero and the list would never appear. Handling both shapes
   * keeps view() usable with a plain array as well.
   *
   * @param {Object[]|Promise<Object[]>} source
   * @param {HTMLElement} host
   */
  function mountSamples(source, host) {
    function put(records) {
      var node = sampleList(records);
      if (node) host.appendChild(node);
    }

    if (source && typeof source.then === "function") {
      source.then(put, function () {
        /* No demo rows is a perfectly good state; the page simply offers no
           samples. */
      });
    } else {
      put(source);
    }
  }

  /* =====================================================================
     Boot
     ===================================================================== */

  /**
   * Mount the tracker. The demo rows are seeded here and nowhere else, so the
   * home page still starts with an empty store and a booking made there is
   * never buried under sample data.
   *
   * @param {ParentNode} [root]
   * @returns {TrackerView|null}
   */
  function init(root) {
    var mount = (root || document).querySelector("[data-tracker]");

    if (!mount) return null;

    var seeded = Halaq.bookings.seedDemoIfEmpty();
    var tracker = view({ demo: seeded });

    /* The placeholder is replaced rather than filled, so a second mount can
       never leave two forms on the page. */
    mount.parentNode.replaceChild(tracker.el, mount);

    dom.delegate(tracker.el, "click", "[data-sample-number]", function (event, trigger) {
      event.preventDefault();

      tracker.numberField.input.value = trigger.getAttribute("data-sample-number");
      tracker.phoneField.input.value = trigger.getAttribute("data-sample-phone");

      tracker.submit();
    });

    /* A link from the ticket can carry both numbers, and then there is no
       reason to make the customer press the button. */
    var params = new URLSearchParams(window.location.search);
    var fromUrl = params.get("booking");
    var phoneFromUrl = params.get("phone");

    if (fromUrl) tracker.numberField.input.value = fromUrl;

    if (fromUrl && phoneFromUrl) {
      tracker.phoneField.input.value = phoneFromUrl;
      tracker.submit();
    } else if (fromUrl) {
      tracker.phoneField.input.focus();
    }

    return tracker;
  }

  Halaq.bookingTracker = {
    init: init,
    view: view,
    numberError: numberError,
    phoneError: phoneError
  };
})(window.Halaq = window.Halaq || {});
