/* ==========================================================================
   Halaq — Admin · customers
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.customers

   Everyone who has ever booked, and the five things a front desk needs to
   recognise them: a name, a number, how often they come, when they were last
   in, and what they have spent.

   There is no customer record
   --------------------------
   Nothing in this project stores one, and adding one would be a second source
   of truth for facts the bookings already hold. A person here is whoever has
   booked under a mobile number, folded through the same `fmt.digits` the
   booking store's own findByPhone uses — so "050 111 0001", "٠٥٠١١١٠٠٠١" and
   "+966501110001" are one person rather than three customers.

   Three counts, never merged
   -------------------------
   This is the whole reason the screen is worth having, so the three are
   named, counted separately, and each says what it counts:

     bookings   every booking ever, including the cancelled and the no-shows.
                It is what the customer did.
     visits     bookings actually served. It is what the salon did.
     spent      money genuinely collected — from paid bookings only. A service
                that was done and not paid for is not spending, and counting it
                would put a number in a manager's pocket that is not there.

   Last visit means last visit
   ----------------------------
   The last time they were actually served, not the last time they booked. A
   booking three weeks out has not been a visit yet, and calling it one would
   be the single outrightly wrong figure on this screen.
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
     Reading

     Module state, so walking away to another section and coming back finds
     the same search — the same reason the bookings screen keeps its filters.
     ===================================================================== */

  var CUSTOMER_FILTERS = { q: "", visits: "" };

  function every() {
    return metrics.customers();
  }

  /**
   * @returns {Object[]}
   */
  function visible() {
    var state = CUSTOMER_FILTERS;
    var query = state.q.trim();

    return every().filter(function (customer) {
      if (state.visits === "returning" && customer.visits < 2) return false;
      if (state.visits === "first" && customer.visits >= 1 && customer.bookings > 1) {
        return false;
      }

      if (!query) return true;

      /* The number is searchable in every way it gets typed, because the
         commonest use of this screen is a customer standing at the desk
         reading out their number. */
      var haystack = [
        customer.name,
        customer.phone,
        String(customer.bookings),
        String(customer.spent)
      ].join(" ");

      return fmt.digits(haystack).indexOf(fmt.digits(query)) !== -1 ||
        haystack.toLowerCase().indexOf(query.toLowerCase()) !== -1;
    });
  }

  function filterOptions() {
    return [
      { value: "", label: "كل العملاء" },
      { value: "returning", label: "عائدون (زيارتان فأكثر)" },
      { value: "first", label: "زاروا مرة واحدة" }
    ];
  }

  /* =====================================================================
     One customer
     ===================================================================== */

  /**
   * "آخر زيارة" as a phrase a person can read out: "اليوم", "أمس", or a date.
   * Anything older gets the date, because "قبل 12 يوماً" is the kind of figure
   * that has to be checked.
   *
   * @param {Object} customer
   * @returns {string}
   */
  function lastVisitLabel(customer) {
    if (!customer.lastVisit) return "لا زيارة بعد";

    var day = customer.lastVisit;
    var today = metrics.today();

    if (day === today) return "اليوم";
    if (day === bookings.daysAgo(1)) return "أمس";

    return fmt.dateShort(day);
  }

  /**
   * @param {Object} customer
   * @param {Function} repaint
   * @returns {HTMLElement}
   */
  function customerCard(customer, repaint) {
    var returning = customer.visits >= 2;
    var hasDebt = customer.spent < customer.owed;

    return dom.el("article", {
      class: "customer-card",
      "data-customer": customer.phone
    }, [
      dom.el("header", { class: "customer-card__head" }, [
        ui.person({
          name: customer.name,
          initials: customer.name.slice(0, 1)
        }),

        dom.el("div", { class: "customer-card__badges" }, [
          returning
            ? ui.badge({ label: "عميل دائم", icon: "star", tone: "brand" })
            : null,

          customer.upcoming
            ? ui.badge({
                label: "موعد اليوم " + customer.upcoming.time,
                icon: "calendar-check",
                tone: "info"
              })
            : null,

          hasDebt
            ? ui.badge({
                label: "عليه " + fmt.money(customer.owed),
                icon: "banknote",
                tone: "warning"
              })
            : null
        ])
      ]),

      dom.el("p", { class: "customer-card__phone num", text: customer.phone }),

      dom.el("dl", { class: "customer-card__facts" }, [
        dom.el("div", { class: "customer-card__fact" }, [
          dom.el("dt", { text: "عدد الحجوزات" }),
          dom.el("dd", { class: "num", text: fmt.number(customer.bookings) })
        ]),

        dom.el("div", { class: "customer-card__fact" }, [
          dom.el("dt", { text: "الزيارات" }),
          dom.el("dd", { class: "num" }, [
            dom.el("span", { text: fmt.number(customer.visits) }),
            customer.missed
              ? dom.el("span", {
                  class: "customer-card__missed num",
                  text: "· " + customer.missed + " لم يأتِ"
                })
              : null
          ])
        ]),

        dom.el("div", { class: "customer-card__fact" }, [
          dom.el("dt", { text: "آخر زيارة" }),
          dom.el("dd", {
            text: lastVisitLabel(customer),
            title: customer.lastVisitAt || ""
          })
        ]),

        dom.el("div", {
          class: "customer-card__fact customer-card__fact--wide"
        }, [
          dom.el("dt", { text: "إجمالي الإنفاق" }),
          dom.el("dd", { class: "num", text: fmt.money(customer.spent) })
        ])
      ]),

      dom.el("details", { class: "customer-card__more" }, [
        dom.el("summary", { class: "customer-card__summary" }, [
          dom.icon("list", "icon--xs"),
          dom.el("span", { text: "سجلّ " + fmt.number(customer.bookings) + " حجزاً" })
        ]),

        dom.el("ol", { class: "customer-card__history" }, customer.records
          .slice()
          .reverse()
          .map(function (record) {
            return dom.el("li", { class: "history-row" }, [
              dom.el("span", { class: "history-row__date num", text: record.date }),

              dom.el("span", { class: "history-row__service", text: record.service.name }),

              ui.badge({
                label: bookings.statusLabel(record.status),
                icon: bookings.statusInfo(record.status).icon,
                tone: bookings.statusInfo(record.status).tone
              }),

              dom.el("span", {
                class: "history-row__paid num",
                text: bookings.isPaid(record)
                  ? fmt.money(record.price)
                  : "غير محصَّل"
              })
            ]);
          }))
      ])
    ]);
  }

  /* =====================================================================
     The screen
     ===================================================================== */

  /**
   * @param {Object} bar the toolbar handle, for clearing filters
   */
  function resultsView(bar) {
    var all = every();
    var list = visible();
    var state = CUSTOMER_FILTERS;

    var chips = [];

    if (state.q) {
      chips.push({
        label: "بحث: " + state.q,
        remove: function () {
          clearOne("q", bar);
        }
      });
    }

    if (state.visits) {
      chips.push({
        label: "الزيارات: " + (state.visits === "returning" ? "عائدون" : "مرة واحدة"),
        remove: function () {
          clearOne("visits", bar);
        }
      });
    }

    var totalSpent = all.reduce(function (sum, customer) {
      return sum + customer.spent;
    }, 0);

    var owing = all.reduce(function (sum, customer) {
      return sum + (customer.owed || 0);
    }, 0);

    return [
      ui.statRow([
        {
          label: "العملاء",
          value: all.length,
          num: true,
          icon: "contact",
          tone: "brand",
          hint: "بكل من حجز مرة واحدة على الأقل"
        },
        {
          label: "عائدون",
          value: all.filter(function (customer) {
            return customer.visits >= 2;
          }).length,
          num: true,
          icon: "star",
          tone: "success",
          hint: "زيارتان مكتملتان فأكثر"
        },
        {
          label: "إجمالي الإنفاق",
          value: fmt.money(totalSpent),
          icon: "banknote",
          tone: "neutral",
          hint: "من الحجوزات المحصَّلة فقط"
        },
        {
          label: "مستحق عليهم",
          value: fmt.money(owing),
          icon: "hourglass",
          tone: owing ? "warning" : "success",
          hint: owing ? "خدمات قُدّمت ولم تُحصَّل" : "لا مستحقات"
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
              data: { clearCustomerFilters: "" },
              onClick: function () {
                clearAll(bar);
              }
            })
          ])
        : null,

      list.length
        ? dom.el("div", { class: "customer-grid" }, list.map(function (customer) {
            return customerCard(customer, bar.repaint);
          }))
        : ui.emptyState({
            icon: "contact",
            title: all.length ? "لا عميل يطابق" : "لا يوجد عملاء",
            message: all.length
              ? "التصفية أضيق من النتائج. «مسح التصفية» يعيدها كلها."
              : "يظهر هنا كل من حجز في الصالون.",
            action: all.length
              ? null
              : null
          })
    ];
  }

  function clearOne(key, bar) {
    CUSTOMER_FILTERS[key] = "";

    if (key === "q" && bar.searchInput) bar.searchInput.value = "";
    if (key === "visits" && bar.controls.visits) bar.controls.visits.value = "";

    bar.repaint();
  }

  function clearAll(bar) {
    CUSTOMER_FILTERS.q = "";
    CUSTOMER_FILTERS.visits = "";

    if (bar.searchInput) bar.searchInput.value = "";
    if (bar.controls.visits) bar.controls.visits.value = "";

    bar.repaint();
  }

  /**
   * @param {Object} section from Halaq.admin.nav
   * @returns {HTMLElement}
   */
  function render(section) {
    var state = CUSTOMER_FILTERS;
    var host = dom.el("div", { "data-customer-results": "" });
    var bar = { controls: {}, searchInput: null, repaint: function () {} };

    function repaint() {
      dom.render(host, resultsView(bar));
    }

    bar.repaint = repaint;

    var visitsFilter = ui.filterSelect({
      id: "admin-customers-visits",
      label: "الزيارات",
      value: state.visits,
      options: filterOptions(),
      onchange: function (event) {
        state.visits = event.target.value;
        repaint();
      }
    });

    bar.controls.visits = visitsFilter.querySelector("select");

    var barNode = ui.toolbar({
      search: {
        id: "admin-customers-search",
        label: "ابحث باسم العميل أو رقم جواله",
        placeholder: "اسم العميل أو رقم الجوال…",
        value: state.q,
        oninput: function (event) {
          state.q = event.target.value;
          repaint();
        }
      },
      filters: [visitsFilter]
    });

    bar.searchInput = dom.$("#admin-customers-search", barNode);

    repaint();

    return dom.el("div", { class: "stack", "data-customers": "" }, [
      ui.pageHeader(section, {
        actions: [
          ui.button({
            label: "تحديث",
            icon: "refresh",
            variant: "ghost",
            size: "sm",
            data: { refreshCustomers: "" },
            onClick: function () {
              repaint();
            }
          })
        ]
      }),

      barNode,
      host
    ]);
  }

  admin.customers = {
    render: render,
    lastVisitLabel: lastVisitLabel
  };
})(window.Halaq = window.Halaq || {});
