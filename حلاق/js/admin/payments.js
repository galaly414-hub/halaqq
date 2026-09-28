/* ==========================================================================
   Halaq — Admin · payments
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.payments

   What has been collected and what has not, and the one button that moves a
   bill from the second list to the first.

   Collected is not the same as finished
   -------------------------------------
   A booking moves through the queue on its own clock. `done` says the service
   happened; it says nothing about the till. The moment a customer is served
   and before the money is counted is the normal state of every booking, and a
   screen that inferred collection from completion would report the salon's
   whole day as revenue before a single riyal had been taken.

   So the flag is separate, it is written only by the front desk, and it
   defaults to false on every new booking — including the demo ones. The
   dashboard's payments and sales tiles read the same flag, so a booking
   marked paid here moves those two numbers too. There is one truth about the
   till, and this screen is where it is set.

   Cancelled and no-shows are not debts
   ------------------------------------
   A booking that was cancelled or that the customer never attended has nothing
   to collect. Listing them as unpaid would leave a permanent phantom in the
   outstanding total that nobody could ever clear, which is the fastest way to
   make a person stop trusting a number.

   One method, and it is not negotiable
   ------------------------------------
   Everything is paid inside the salon, so the method is stated on every row
   and is never a choice. The column exists to make that visible, not to offer
   an option that does not exist.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var admin = Halaq.admin = Halaq.admin || {};

  var ui = admin.ui;
  var metrics = admin.metrics;
  var bookings = Halaq.bookings;

  var PAYMENT_FILTERS = { q: "", state: "", when: "" };

  /**
   * @returns {Object[]}
   */
  function visible() {
    var state = PAYMENT_FILTERS;
    var query = state.q.trim();
    var day = metrics.today();

    var list = metrics.payments();

    var wanted = state.state === "paid" ? list.paid
      : state.state === "unpaid" ? list.unpaid
      : list.paid.concat(list.unpaid);

    return wanted
      .filter(function (record) {
        if (state.when === "today" && record.date !== day) return false;
        if (state.when === "old" && record.date === day) return false;

        if (!query) return true;

        var haystack = [
          record.customer.name,
          record.bookingNumber,
          record.waitingNumber,
          record.service.name
        ].join(" ");

        return fmt.digits(haystack).indexOf(fmt.digits(query)) !== -1 ||
          haystack.toLowerCase().indexOf(query.toLowerCase()) !== -1;
      })
      /* Unpaid first, then newest: the person standing at the till is the one
         being looked for, and a debt from three weeks ago should not sit
         above this morning's. */
      .sort(function (a, b) {
        if (bookings.isPaid(a) !== bookings.isPaid(b)) {
          return bookings.isPaid(a) ? 1 : -1;
        }
        return b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || b.id - a.id;
      });
  }

  /* =====================================================================
     Marking a payment
     ===================================================================== */

  /**
   * @param {Object} record
   * @param {Function} repaint
   */
  function markPaid(record, repaint) {
    /* Re-read rather than trusting the row: the list may be a moment behind,
       and a bill somebody else already took must not be taken twice. */
    var current = bookings.get(record.bookingNumber);

    if (!current) {
      Halaq.toast.error("الحجز غير موجود", "ربما أُعيد تحميل البيانات. حدّث الصفحة.");
      repaint();
      return;
    }

    if (bookings.isPaid(current)) {
      repaint();
      return;
    }

    var method = metrics.paymentBadge(current);

    admin.confirm.ask({
      title: "تسجيل تحصيل " + fmt.money(current.price),
      description: "يُسجَّل أن المبلغ أُخذ داخل الصالون. " +
        "يدخل في مبيعات اليوم وفي إجمالي إنفاق العميل.",
      subject: current.customer.name + " · " + current.service.name +
        " · تذكرة " + current.waitingNumber,
      confirmLabel: "تم التحصيل",
      onConfirm: function () {
        var saved = bookings.setPaid(current.bookingNumber, true);

        if (!saved) {
          Halaq.toast.error("تعذّر التسجيل", "الحجز غير موجود.");
          repaint();
          return;
        }

        if (admin.app && admin.app.paintCounts) admin.app.paintCounts();
        repaint();

        Halaq.toast.success(
          fmt.money(saved.price) + " · " + saved.customer.name,
          method.label + " · سُجِّل الآن"
        );
      }
    });
  }

  /**
   * Undo a collection. The only action on this screen that removes money from
   * a total, so it asks.
   *
   * @param {Object} record
   * @param {Function} repaint
   */
  function markUnpaid(record, repaint) {
    admin.confirm.ask({
      title: "إلغاء تسجيل " + fmt.money(record.price),
      description: "يعود المبلغ إلى قائمة المستحقات، ويُخصم من مبيعات اليوم. " +
        "استعمله عند تصحيح خطأ في التحصيل.",
      subject: record.customer.name + " · " + record.service.name,
      confirmLabel: "إلغاء التسجيل",
      onConfirm: function () {
        var saved = bookings.setPaid(record.bookingNumber, false);

        if (!saved) {
          Halaq.toast.error("تعذّر التعديل", "الحجز غير موجود.");
          repaint();
          return;
        }

        if (admin.app && admin.app.paintCounts) admin.app.paintCounts();
        repaint();

        Halaq.toast.info(
          "عاد " + fmt.money(saved.price) + " إلى المستحقات",
          saved.customer.name
        );
      }
    });
  }

  /* =====================================================================
     One booking
     ===================================================================== */

  /**
   * @param {Object} record
   * @param {Function} repaint
   * @returns {HTMLElement}
   */
  function paymentRow(record, repaint) {
    var paid = bookings.isPaid(record);
    var status = bookings.statusInfo(record.status);
    var method = metrics.paymentBadge(record);
    var who = metrics.barberOf(record);

    return dom.el("article", {
      class: "pay-row" + (paid ? " is-paid" : " is-unpaid"),
      "data-pay": record.bookingNumber
    }, [
      dom.el("div", { class: "pay-row__state" }, [
        ui.badge({
          label: paid ? "محصَّل" : "غير محصَّل",
          icon: paid ? "check" : "hourglass",
          tone: paid ? "success" : "warning"
        })
      ]),

      dom.el("div", { class: "pay-row__who" }, [
        dom.el("div", { class: "pay-row__line" }, [
          dom.el("p", { class: "pay-row__name", text: record.customer.name }),
          dom.el("span", { class: "pay-row__phone num", text: record.customer.phone || "" })
        ]),

        dom.el("p", { class: "pay-row__what" }, [
          dom.el("span", { text: record.service.name }),
          dom.el("span", { class: "pay-row__dot", "aria-hidden": "true", text: "·" }),
          dom.el("span", { text: who.label })
        ]),

        dom.el("p", { class: "pay-row__when" }, [
          ui.badge({ label: status.label, icon: status.icon, tone: status.tone }),
          dom.el("span", { class: "num", text: record.date + " · " + fmt.time(record.time) }),
          dom.el("span", { class: "num", text: "تذكرة " + record.waitingNumber })
        ])
      ]),

      dom.el("div", { class: "pay-row__method" }, [
        dom.el("span", { class: "pay-row__method-label", text: "طريقة الدفع" }),
        ui.badge({ label: method.label, icon: method.icon, tone: method.tone })
      ]),

      dom.el("div", { class: "pay-row__amount" }, [
        dom.el("span", {
          class: "pay-row__value num",
          text: fmt.money(record.price)
        })
      ]),

      dom.el("div", { class: "pay-row__action" }, [
        /* The row already carries data-pay, so the buttons say what they *do*
           rather than which row: two elements under one attribute name makes
           `[data-pay]` match the button as well as the invoice it sits in, and
           anything counting invoices then counts twice. */
        paid
          ? ui.button({
              label: "إلغاء التسجيل",
              icon: "refresh",
              variant: "ghost",
              size: "sm",
              data: { payAction: "unpay", booking: record.bookingNumber },
              onClick: function () {
                markUnpaid(record, repaint);
              }
            })
          : ui.button({
              label: "تم التحصيل",
              icon: "check",
              variant: "primary",
              size: "sm",
              data: { payAction: "pay", booking: record.bookingNumber },
              onClick: function () {
                markPaid(record, repaint);
              }
            })
      ])
    ]);
  }

  /* =====================================================================
     The screen
     ===================================================================== */

  function resultsView(bar) {
    var all = metrics.payments();
    var list = visible();
    var state = PAYMENT_FILTERS;
    var chips = [];

    if (state.q) {
      chips.push({
        label: "بحث: " + state.q,
        remove: function () { clearOne("q", bar); }
      });
    }

    if (state.state) {
      chips.push({
        label: state.state === "paid" ? "المحصَّلة فقط" : "غير المحصَّلة فقط",
        remove: function () { clearOne("state", bar); }
      });
    }

    if (state.when) {
      chips.push({
        label: state.when === "today" ? "حجوزات اليوم" : "ما قبل اليوم",
        remove: function () { clearOne("when", bar); }
      });
    }

    return [
      ui.statRow([
        {
          label: "محصَّل اليوم",
          value: fmt.money(metrics.total(all.todayPaid)),
          icon: "banknote",
          tone: "success",
          hint: fmt.number(all.todayPaid.length) + " فاتورة"
        },
        {
          label: "مستحق اليوم",
          value: fmt.money(metrics.total(all.todayUnpaid)),
          icon: "hourglass",
          tone: all.todayUnpaid.length ? "warning" : "success",
          hint: all.todayUnpaid.length
            ? fmt.number(all.todayUnpaid.length) + " فاتورة لم تُحصَّل"
            : "لا شيء معلّق"
        },
        {
          label: "إجمالي المحصَّل",
          value: fmt.money(all.revenue),
          icon: "check-double",
          tone: "neutral",
          hint: fmt.number(all.paid.length) + " فاتورة"
        },
        {
          label: "إجمالي المستحق",
          value: fmt.money(all.owed),
          icon: "ban",
          tone: all.owed ? "danger" : "success",
          hint: fmt.number(all.unpaid.length) + " فاتورة"
        }
      ]),

      chips.length
        ? dom.el("div", { class: "chips" }, [
            dom.el("div", { class: "chips__set" }, chips.map(function (chip) {
              return ui.chip({ label: chip.label, onRemove: chip.remove });
            })),

            ui.button({
              label: "مسح التصفية",
              icon: "close",
              variant: "ghost",
              size: "sm",
              data: { clearPaymentFilters: "" },
              onClick: function () { clearAll(bar); }
            })
          ])
        : null,

      list.length
        ? dom.el("div", { class: "pay-list" }, list.map(function (record) {
            return paymentRow(record, bar.repaint);
          }))
        : ui.emptyState({
            icon: "banknote",
            title: "لا فاتورة تطابق",
            message: (all.paid.length + all.unpaid.length)
              ? "التصفية أضيق من النتائج. «مسح التصفية» يعيدها كلها."
              : "لا حجوزات قابلة للتحصيل في السجل."
          })
    ];
  }

  function clearOne(key, bar) {
    PAYMENT_FILTERS[key] = "";

    if (key === "q" && bar.searchInput) bar.searchInput.value = "";
    if (key !== "q" && bar.controls[key]) bar.controls[key].value = "";

    bar.repaint();
  }

  function clearAll(bar) {
    PAYMENT_FILTERS.q = "";
    PAYMENT_FILTERS.state = "";
    PAYMENT_FILTERS.when = "";

    if (bar.searchInput) bar.searchInput.value = "";
    Object.keys(bar.controls).forEach(function (key) {
      if (bar.controls[key]) bar.controls[key].value = "";
    });

    bar.repaint();
  }

  /**
   * @param {Object} section from Halaq.admin.nav
   * @returns {HTMLElement}
   */
  function render(section) {
    var state = PAYMENT_FILTERS;
    var host = dom.el("div", { "data-payment-results": "" });
    var bar = { controls: {}, searchInput: null, repaint: function () {} };

    function repaint() {
      dom.render(host, resultsView(bar));
    }

    bar.repaint = repaint;

    var control = function (key, id, label, options) {
      var node = ui.filterSelect({
        id: id,
        label: label,
        value: state[key],
        options: options,
        onchange: function (event) {
          state[key] = event.target.value;
          repaint();
        }
      });

      bar.controls[key] = node.querySelector("select");
      return node;
    };

    var barNode = ui.toolbar({
      search: {
        id: "admin-payments-search",
        label: "ابحث باسم العميل أو رقم الحجز أو الخدمة",
        placeholder: "العميل، رقم الحجز، أو الخدمة…",
        value: state.q,
        oninput: function (event) {
          state.q = event.target.value;
          repaint();
        }
      },
      filters: [
        control("state", "admin-payments-state", "الحالة", [
          { value: "", label: "كل الفواتير" },
          { value: "unpaid", label: "غير محصَّلة" },
          { value: "paid", label: "محصَّلة" }
        ]),
        control("when", "admin-payments-when", "الفترة", [
          { value: "", label: "كل الأيام" },
          { value: "today", label: "اليوم" },
          { value: "old", label: "ما قبل اليوم" }
        ])
      ]
    });

    bar.searchInput = dom.$("#admin-payments-search", barNode);

    repaint();

    return dom.el("div", { class: "stack", "data-payments": "" }, [
      ui.pageHeader(section, {
        actions: [
          ui.button({
            label: "تحديث",
            icon: "refresh",
            variant: "ghost",
            size: "sm",
            data: { refreshPayments: "" },
            onClick: function () {
              repaint();
            }
          })
        ]
      }),

      ui.card({
        title: "طريقة الدفع",
        description: "كل الفواتير تُحصَّل داخل الصالون. لا يوجد دفع إلكتروني، " +
          "ولذلك لا تُعرض طريقة أخرى ولا يمكن اختيارها."
      }, [
        dom.el("div", { class: "method-note" }, [
          ui.badge({
            label: metrics.PAYMENT.onsite.label,
            icon: metrics.PAYMENT.onsite.icon,
            tone: metrics.PAYMENT.onsite.tone
          }),
          dom.el("p", {
            class: "method-note__text",
            text: bookings.PAYMENT_NOTE
          })
        ])
      ]),

      barNode,
      host
    ]);
  }

  admin.payments = {
    render: render
  };
})(window.Halaq = window.Halaq || {});
