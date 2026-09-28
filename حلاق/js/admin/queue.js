/* ==========================================================================
   Halaq — Admin · queue management
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.queue

   The screen a receptionist actually stands in front of. It answers two
   questions and nothing else: who is in the chair right now, and who is next.

   Two lists, not one
   ------------------
   The lanes hold the people already in the salon. The expected list holds the
   ones who have a booking today but have not walked in yet, and they are kept
   apart on purpose: a "confirmed" booking is not in anyone's queue, so mixing
   it into the lanes would put a number on a customer who is not in the
   building. The only move that brings someone across is "arrived", and it is
   offered where they are visible.

   Every move goes through MOVES
   -----------------------------
   The buttons on this screen are not decoration. MOVES is the whole of the
   legal state machine, and the click handler checks the move against the
   record's current status before touching anything. A move that is not listed
   for the current status is refused, so a stale button — a second click on a
   row that has already moved on — cannot push a booking somewhere it should
   not go. The store's setStatus() stays deliberately permissive; this is where
   the rule lives.

   Nothing here decides anything. The figures are metrics.js's, the markup is
   ui.js's, and the records are the booking store's own, so this screen and the
   customer's tracking page can never tell two different stories about the same
   booking.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var admin = Halaq.admin = Halaq.admin || {};

  var ui = admin.ui;
  var metrics = admin.metrics;
  var bookings = Halaq.bookings;

  /* =====================================================================
     The moves

     Keyed by the status a booking is in now. An empty list means finished:
     nothing more can be done to it from the front desk.
     ===================================================================== */

  var MOVES = {
    confirmed: [
      { key: "arrive", label: "تسجيل الحضور", icon: "user-check", to: "waiting" }
    ],

    waiting: [
      { key: "call", label: "استدعاء العميل", icon: "bell", to: "attended" },
      { key: "serve", label: "بدء الخدمة", icon: "razor", to: "in_service" },
      { key: "skip", label: "تخطّي العميل", icon: "chevron-right", to: "no_show", confirm: true },
      { key: "cancel", label: "إلغاء الحجز", icon: "ban", to: "cancelled", confirm: true }
    ],

    attended: [
      { key: "serve", label: "بدء الخدمة", icon: "razor", to: "in_service" },
      { key: "skip", label: "تخطّي العميل", icon: "chevron-right", to: "no_show", confirm: true },
      { key: "cancel", label: "إلغاء الحجز", icon: "ban", to: "cancelled", confirm: true }
    ],

    in_service: [
      { key: "finish", label: "إنهاء الخدمة", icon: "check-double", to: "done" }
    ],

    done: [],
    cancelled: [],
    no_show: []
  };

  /**
   * The moves offered for a record in its current status.
   * @param {Object} record
   * @returns {Array<Object>}
   */
  function movesFor(record) {
    return (record && MOVES[record.status]) || [];
  }

  /**
   * Is this move still legal? Checked at click time, because the buttons are
   * drawn from the status and the status can change under them.
   *
   * @param {Object} record
   * @param {Object} move
   * @returns {boolean}
   */
  function allows(record, move) {
    return movesFor(record).some(function (candidate) {
      return candidate.key === move.key;
    });
  }

  /* =====================================================================
     Confirming the two moves that cannot be undone by clicking again

     Skipping a customer and cancelling a booking both take a booking out of
     the queue for good. They are the only two actions here that lose
     something, so they are the only two that ask — and they ask through the
     admin's one confirmation dialog, which owns Escape, backdrop dismissal
     and returning focus to the button that opened it.
     ===================================================================== */

  /**
   * Run a move, asking first if it is one of the destructive ones.
   *
   * @param {Object} record
   * @param {Object} move
   * @param {Function} repaint
   */
  function run(record, move, repaint) {
    if (move.confirm) {
      admin.confirm.ask({
        title: move.label,
        description: move.to === "no_show"
          ? "سيُحذف العميل من الطابور ولن يُستدعى. الحجز يبقى محفوظاً بتاريخه."
          : "سيُلغى الحجز ويُحذف العميل من الطابور. الحجز يبقى محفوظاً بتاريخه.",
        subject: describe(record),
        confirmLabel: move.to === "no_show" ? "تخطّي" : "إلغاء الحجز",
        onConfirm: function () {
          commit(record, move, repaint);
        }
      });
      return;
    }

    commit(record, move, repaint);
  }

  /**
   * Apply a move, if the record is still where the move expects it to be.
   *
   * @param {Object} record
   * @param {Object} move
   * @param {Function} repaint
   */
  function commit(record, move, repaint) {
    /* The record is read from the store again rather than trusting the copy
       the button closed over. Between drawing and clicking, the status can
       have changed, and a move that no longer applies is not run. */
    var current = bookings.get(record.bookingNumber);

    if (!current) {
      Halaq.toast.error("الحجز غير موجود", "ربما أُعيد تحميل البيانات. حدّث الصفحة.");
      repaint();
      return;
    }

    if (!allows(current, move)) {
      repaint();
      return;
    }

    var updated = bookings.setStatus(current.bookingNumber, move.to);
    if (!updated) return;

    /* The rail's counters are derived from the same records. */
    if (admin.app && admin.app.paintCounts) admin.app.paintCounts();

    repaint();

    Halaq.toast.success(
      move.label + " · " + updated.customer.name,
      "الحجز الآن بحالة: " + bookings.statusLabel(updated.status)
    );
  }

  /* =====================================================================
     Drawing
     ===================================================================== */

  /**
   * "Ahmed Al-Rashid · cut 40 min · ticket A007" — enough to recognise a
   * person in the confirm dialog without being a table.
   *
   * @param {Object} record
   * @returns {string}
   */
  function describe(record) {
    return record.customer.name + " · " + record.service.name +
      " · تذكرة " + record.waitingNumber;
  }

  /**
   * The move buttons for one record.
   *
   * @param {Object} record
   * @param {Function} repaint
   * @returns {Node|null}
   */
  function moveButtons(record, repaint) {
    var moves = movesFor(record);

    if (!moves.length) return null;

    return dom.el("div", { class: "queue-actions" }, moves.map(function (move) {
      return ui.button({
        label: move.label,
        icon: move.icon,
        /* The move a receptionist is most likely to want is the primary one;
           the ones that destroy something are ghost, so they do not sit next
           to each other as two equal-looking buttons. */
        variant: move.confirm ? "ghost" : "primary",
        size: "sm",
        data: {
          queueMove: move.key,
          booking: record.bookingNumber
        },
        onClick: function () {
          run(record, move, repaint);
        }
      });
    }));
  }

  /**
   * One customer: who, what, how long they have been waiting, and what can be
   * done about it.
   *
   * @param {Object} record
   * @param {{lead?: boolean, queuePos?: number, repaint: Function}} opts
   * @returns {HTMLElement}
   */
  function personRow(record, opts) {
    var status = bookings.statusInfo(record.status);
    var minutes = bookings.estimateMinutes(record);

    return dom.el("article", {
      class: "queue-person" + (opts.lead ? " queue-person--now" : ""),
      "data-booking-row": record.bookingNumber
    }, [
      opts.queuePos
        ? dom.el("span", { class: "queue-person__pos num", text: String(opts.queuePos) })
        : null,

      dom.el("div", { class: "queue-person__who" }, [
        dom.el("div", { class: "queue-person__line" }, [
          dom.el("p", { class: "queue-person__name", text: record.customer.name }),
          ui.badge({
            label: status.label,
            icon: status.icon,
            tone: status.tone
          })
        ]),

        dom.el("p", { class: "queue-person__what" }, [
          dom.el("span", { text: record.service.name }),
          dom.el("span", { class: "queue-person__dot", "aria-hidden": "true", text: "·" }),
          dom.el("span", { class: "num", text: record.duration + " د" }),
          record.customer.phone
            ? [
                dom.el("span", { class: "queue-person__dot", "aria-hidden": "true", text: "·" }),
                dom.el("span", { class: "num", text: record.customer.phone })
              ]
            : null
        ]),

        dom.el("p", { class: "queue-person__ticket" }, [
          dom.el("span", { text: "تذكرة " }),
          dom.el("span", { class: "num", text: record.waitingNumber }),
          dom.el("span", { class: "queue-person__dot", "aria-hidden": "true", text: "·" }),
          dom.el("span", { text: "موعد " }),
          dom.el("span", { class: "num", text: record.time })
        ])
      ]),

      dom.el("div", { class: "queue-person__wait" }, [
        minutes
          ? dom.el("span", { class: "queue-person__estimate num" }, [
              dom.icon("clock", "icon--xs"),
              dom.el("span", { text: minutes + " د تقريباً" })
            ])
          : dom.el("span", { class: "queue-person__estimate is-current", text: "الآن" })
      ]),

      moveButtons(record, opts.repaint)
    ]);
  }

  /**
   * One barber's column: who is in the chair, who is next, who else is here.
   *
   * @param {Object} view  from metrics.lanes()
   * @param {Function} repaint
   * @returns {HTMLElement}
   */
  function laneCard(view, repaint) {
    return dom.el("section", {
      class: "lane",
      "data-lane": view.id
    }, [
      dom.el("header", { class: "lane__head" }, [
        dom.el("div", { class: "lane__id" }, [
          ui.person({
            name: view.name,
            initials: view.initials,
            muted: view.any ? "يبدأ به الاستقبال" : null
          }),

          dom.el("div", { class: "lane__tags" }, [
            view.lane
              ? ui.badge({
                  label: "المسار " + view.lane,
                  icon: "ticket",
                  tone: "neutral"
                })
              : null,

            view.any
              ? ui.badge({
                  label: "طابور مشترك",
                  icon: "users",
                  tone: "info"
                })
              : null,

            view.waitingCount
              ? ui.badge({
                  label: view.waitingCount + " منتظر",
                  icon: "clock",
                  tone: "neutral"
                })
              : null
          ])
        ]),

        dom.el("div", { class: "lane__wait" }, [
          view.next && view.estimateMinutes
            ? [
                dom.el("span", { class: "lane__wait-label", text: "انتظار التالي" }),
                dom.el("span", { class: "lane__wait-value num", text: view.estimateMinutes + " د" })
              ]
            : dom.el("span", { class: "lane__wait-label", text: "لا أحد ينتظر" })
        ])
      ]),

      dom.el("div", { class: "lane__now" }, [
        view.serving
          ? personRow(view.serving, { lead: true, repaint: repaint })
          : dom.el("p", { class: "lane__idle" }, [
              dom.icon("razor", "icon--sm"),
              dom.el("span", { text: "الكرسي فارغ" })
            ])
      ]),

      /* Called but not seated. Its own row, because a customer standing at
         the desk is a different situation from one still in the waiting
         room, and the next move for each is different. */
      view.called
        ? dom.el("div", { class: "lane__called" }, [
            dom.el("h3", { class: "lane__sub" }, [
              dom.el("span", { text: "تم استدعاؤه" })
            ]),
            personRow(view.called, { lead: true, repaint: repaint })
          ])
        : null,

      view.next
        ? dom.el("div", { class: "lane__next" }, [
            dom.el("h3", { class: "lane__sub" }, [
              dom.el("span", { text: "التالي" })
            ]),
            personRow(view.next, { repaint: repaint })
          ])
        : null,

      view.rest.length
        ? dom.el("div", { class: "lane__rest" }, [
            dom.el("h3", { class: "lane__sub" }, [
              dom.el("span", { text: "بقية المنتظرين" }),
              dom.el("span", { class: "lane__sub-count num", text: String(view.rest.length) })
            ]),

            dom.el("ol", { class: "queue-rest" }, view.rest.map(function (record, index) {
              return dom.el("li", { class: "queue-rest__item" }, [
                personRow(record, { queuePos: index + 2, repaint: repaint })
              ]);
            }))
          ])
        : null
    ]);
  }

  /**
   * Today's bookings that have not arrived. Kept out of the lanes, because
   * they are not in anyone's queue yet.
   *
   * @param {Function} repaint
   * @returns {HTMLElement}
   */
  function expectedCard(repaint) {
    var list = metrics.expected();

    return ui.card({
      title: "المتوقعون اليوم",
      description: "حجوزات اليوم التي لم يصل أصحابها بعد. لا يدخل أحد الطابور قبل تسجيل حضوره."
    }, [
      list.length
        ? dom.el("ol", { class: "queue-rest queue-rest--expected" }, list.map(function (record) {
            return dom.el("li", { class: "queue-rest__item" }, [
              personRow(record, { repaint: repaint })
            ]);
          }))
        : ui.emptyState({
            icon: "check-double",
            title: "لا أحد منتظر في الخارج",
            message: "كل حجوزات اليوم وصلت بالفعل."
          })
    ]);
  }

  /**
   * The screen.
   *
   * @param {Object} section from Halaq.admin.nav
   * @returns {HTMLElement}
   */
  function render(section) {
    var statsHost = dom.el("div", { "data-queue-stats": "" });
    var lanesHost = dom.el("div", { class: "lanes", "data-lanes": "" });
    var expectedHost = dom.el("div", { "data-expected": "" });

    function repaint() {
      var summary = metrics.queueSummary();

      dom.render(statsHost, ui.statRow([
        {
          label: "في الطابور الآن",
          value: summary.waiting,
          num: true,
          icon: "clock",
          tone: "info",
          hint: summary.waiting === 1 ? "عميل واحد" : summary.waiting + " عملاء"
        },
        {
          label: "قيد الخدمة",
          value: summary.serving,
          num: true,
          icon: "razor",
          tone: "success",
          hint: "من " + summary.lanes + " طوابير"
        },
        {
          label: "متوسط الانتظار",
          value: summary.estimateMinutes + " د",
          num: true,
          icon: "hourglass",
          tone: "neutral",
          hint: "تقدير من متوسط مدة الخدمة"
        },
        {
          label: "يُستدعى بعده",
          value: summary.waitingNumber || "—",
          num: !!summary.waitingNumber,
          icon: "bell",
          tone: "warning",
          hint: summary.waitingNumber
            ? "أول رقم في الطابور"
            : "لا أحد في الانتظار"
        }
      ]));

      var views = metrics.lanes();

      dom.render(lanesHost, views.length
        ? views.map(function (view) {
            return laneCard(view, repaint);
          })
        : [ui.emptyState({
            icon: "razor",
            title: "لا أحد في الصالون الآن",
            message: "الطوابير تظهر هنا بمجرد تسجيل حضور أول عميل."
          })]);

      dom.render(expectedHost, [expectedCard(repaint)]);
    }

    repaint();

    return dom.el("div", { class: "stack", "data-queue": "" }, [
      ui.pageHeader(section, {
        actions: [
          /* The store has no change event, so a booking made elsewhere — on
             the public page, or on the bookings screen — does not reach this
             one on its own. Refreshing is explicit rather than automatic
             because a queue that redrew itself mid-read would be worse to
             work from than one that is a moment behind. */
          ui.button({
            label: "تحديث",
            icon: "refresh",
            variant: "ghost",
            size: "sm",
            data: { refreshQueue: "" },
            onClick: function () {
              repaint();
            }
          })
        ]
      }),
      statsHost,
      lanesHost,
      expectedHost
    ]);
  }

  admin.queue = {
    render: render,
    MOVES: MOVES,
    movesFor: movesFor,
    allows: allows
  };
})(window.Halaq = window.Halaq || {});
