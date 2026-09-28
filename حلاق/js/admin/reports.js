/* ==========================================================================
   Halaq — Admin reports
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.reports

   What the salon did, over a period the manager chooses.

   Revenue means collected
   -----------------------
   Every figure here that is called revenue is money that was actually taken —
   a booking marked paid on the payments screen. It is deliberately not the sum
   of what finished services were priced at. A report that counted a service as
   revenue the moment the chair was empty would tell a manager the day's takings
   before the first riyal was counted, and the number would be the one figure
   nobody could ever check. `metrics.revenue()` is the same function the
   dashboard's sales tile and the payments screen read, so the three cannot
   drift.

   Cancelled and no-shows are excluded from revenue and from what is owed. A
   missed appointment is not money.

   Waiting time is an estimate, and says so
   -----------------------------------------
   The store keeps no "served at" timestamp, so there is no measured wait to
   report and this screen does not invent one. What it can do is reconstruct the
   wait each booking was *quoted* when it was made: the service lengths of every
   booking ahead of it in the same lane on the same day. That is a real figure
   derived from real records, it is what the customer was shown, and it is
   labelled as an estimate wherever it appears. Reporting zero for a salon with
   no queue, and "—" rather than a number for a period with nobody who waited,
   are both answered honestly rather than defaulted to 0.

   Periods count open days
   -----------------------
   The salon is shut on Saturdays, so "the last 7 days" here means the last 7
   days it was open, and says so. Counting seven calendar days would silently
   compare this week against a week with one trading day missing, which is the
   kind of difference nobody notices until the report is believed.

   Filter state lives on this module, not inside render(), so walking to
   another section and back finds the same period chosen — the same rule the
   other screens follow.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var admin = Halaq.admin = Halaq.admin || {};

  var ui = admin.ui;
  var metrics = admin.metrics;
  var charts = admin.charts;
  var roster = admin.roster;
  var bookings = Halaq.bookings;

  /* The open day. Mirrors the store's own rule rather than inventing a
     calendar, so "today" here is the same day the queue screen calls today. */
  var CLOSED_WEEKDAY = 6;

  /* =====================================================================
     Periods
     ===================================================================== */

  var RANGES = [
    { value: "today", label: "اليوم" },
    { value: "week", label: "آخر ٧ أيام عمل" },
    { value: "month", label: "آخر ٣٠ يوم عمل" },
    { value: "calendar", label: "الشهر الحالي" },
    { value: "all", label: "كل السجل" },
    { value: "custom", label: "فترة مخصصة" }
  ];

  /**
   * A "YYYY-MM-DD" key `steps` open days before today.
   *
   * Steps over the closed day rather than landing on it, so a period never
   * starts on a morning the salon was shut. Mirrors booking-store's daysAgo.
   *
   * @param {number} steps
   * @returns {string}
   */
  function openDaysAgo(steps) {
    if (!steps) return metrics.today();

    return bookings.daysAgo(steps);
  }

  /**
   * The first open day of the calendar month `dayKey` falls in.
   * @param {string} dayKey
   * @returns {string}
   */
  function monthStart(dayKey) {
    var parts = String(dayKey || metrics.today()).split("-");

    if (parts.length !== 3) return dayKey;

    var month = parts[0] + "-" + parts[1];
    var best = null;
    var probe = new Date(
      Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])
    );

    for (var i = 0; i < 31; i += 1) {
      var key = [
        probe.getFullYear(),
        String(probe.getMonth() + 1).padStart(2, "0"),
        String(probe.getDate()).padStart(2, "0")
      ].join("-");

      if (key.slice(0, 7) !== month) break;
      if (probe.getDay() !== CLOSED_WEEKDAY) best = key;

      probe.setDate(probe.getDate() - 1);
    }

    return best || dayKey;
  }

  /**
   * Resolve a range key into a concrete, inclusive pair of dates.
   *
   * @param {string} range
   * @param {{from: string, to: string}} [custom]
   * @returns {{from: string, to: string, key: string, label: string,
   *            days: number, open: boolean}}
   */
  function period(range, custom) {
    var today = metrics.today();
    var all = bookings.all();

    var from = today;
    var to = today;
    var key = range || "week";

    if (key === "week") from = openDaysAgo(6);
    else if (key === "month") from = openDaysAgo(29);
    else if (key === "calendar") from = monthStart(today);
    else if (key === "all") {
      from = all.length
        ? all.map(function (record) { return record.date; }).sort()[0]
        : today;
    } else if (key === "custom") {
      var wanted = custom || {};
      from = wanted.from || openDaysAgo(6);
      to = wanted.to || today;

      /* A reversed custom range is a typo, and silently swapping it would
         report a period nobody asked for. It is swapped here *and* the screen
         says the period is reversed, rather than quietly showing a result. */
      if (from > to) {
        var flip = from;
        from = to;
        to = flip;
        key = "custom-reversed";
      }
    }

    var days = Math.max(1, Math.round(
      (Date.parse(to) - Date.parse(from)) / 86400000
    ) + 1);

    return {
      from: from,
      to: to,
      key: key,
      label: labelFor(key, from, to),
      days: days,
      open: key !== "custom-reversed"
    };
  }

  /**
   * The range in words, so the filter and the sentence under it cannot say
   * different things.
   *
   * @param {string} key
   * @param {string} from
   * @param {string} to
   * @returns {string}
   */
  function labelFor(key, from, to) {
    if (key === "today") return "اليوم، " + fmt.dateLong(from);
    if (key === "week") return "آخر ٧ أيام عمل، حتى " + fmt.dateShort(to);
    if (key === "month") return "آخر ٣٠ يوم عمل، حتى " + fmt.dateShort(to);
    if (key === "calendar") return "من " + fmt.dateShort(from) + " إلى " + fmt.dateShort(to);
    if (key === "all") return "كل السجل، من " + fmt.dateShort(from) + " إلى " + fmt.dateShort(to);
    if (key === "custom-reversed") {
      return "التاريخان معكوكان؛ عُكسا إلى " + fmt.dateShort(from) +
        " – " + fmt.dateShort(to);
    }

    return "من " + fmt.dateShort(from) + " إلى " + fmt.dateShort(to);
  }

  /* =====================================================================
     The numbers
     ===================================================================== */

  /**
   * Records inside a period, inclusive at both ends.
   * @param {string} from
   * @param {string} to
   * @param {Object[]} [records]
   * @returns {Object[]}
   */
  function between(from, to, records) {
    return (records || bookings.all()).filter(function (record) {
      return record.date >= from && record.date <= to;
    });
  }

  /**
   * The four revenue figures, which do not depend on the range filter.
   *
   * Fixed deliberately: a manager asking "how was the month" should not have to
   * change a dropdown to find out, and the report is far less useful if the
   * answer to "what did we take today" moves when the filter does.
   *
   * @returns {Array<Object>} statCard descriptors
   */
  function revenueCards() {
    var today = metrics.today();
    var all = bookings.all();

    var todayRecords = between(today, today, all);
    var weekRecords = between(openDaysAgo(6), today, all);
    var monthRecords = between(monthStart(today), today, all);

    var make = function (label, hint, records) {
      var value = metrics.revenue(records);

      return {
        label: label,
        value: fmt.money(value),
        icon: "banknote",
        tone: value ? "success" : "neutral",
        hint: hint + " · " + fmt.number(metrics.paidCount(records)) + " فاتورة محصَّلة"
      };
    };

    return [
      make("إيراد اليوم", "المحصَّل اليوم", todayRecords),
      make("إيراد آخر ٧ أيام", "المحصَّل في آخر ٧ أيام عمل", weekRecords),
      make("إيراد الشهر الحالي", "المحصَّل منذ أول يوم عمل في الشهر", monthRecords),
      make("إيراد كل السجل", "المحصَّل منذ أول حجز", all)
    ];
  }

  /**
   * How many bookings there are, and how they turned out.
   *
   * @param {string} from
   * @param {string} to
   * @returns {{total: number, done: number, cancelled: number, noShow: number,
   *            open: number, upcoming: number, missed: number,
   *            averageWait: number, waitedCount: number, records: Object[]}}
   */
  function volume(from, to) {
    var records = between(from, to);

    var count = function (status) {
      return records.filter(function (record) {
        return record.status === status;
      }).length;
    };

    var waits = quotedWaits(records);
    var withWait = waits.filter(function (minutes) {
      return minutes > 0;
    });

    return {
      total: records.length,
      done: count("done"),
      cancelled: count("cancelled"),
      noShow: count("no_show"),
      inService: count("in_service"),
      waiting: count("waiting") + count("attended"),
      upcoming: count("confirmed"),
      records: records,

      /* null rather than 0 when nobody waited: "0 minutes" would read as
         "the queue moved instantly", which is a different claim. */
      averageWait: withWait.length
        ? Math.round(withWait.reduce(function (a, b) { return a + b; }, 0) / withWait.length)
        : null,
      waitedCount: withWait.length
    };
  }

  /**
   * The wait each booking was quoted, per record.
   *
   * Walks each lane's day in booking order and accumulates the service lengths
   * of everything ahead. Returns a value per record, aligned with `records` by
   * index, and 0 for a record that was first in its lane — which had no wait
   * and must not drag the average down to mean something it does not.
   *
   * @param {Object[]} records
   * @returns {number[]} minutes, same order as `records`
   */
  function quotedWaits(records) {
    var lanes = {};

    records.forEach(function (record) {
      var key = (record.queue && record.queue.lane) || "?";
      if (!lanes[key]) lanes[key] = [];
      lanes[key].push(record);
    });

    var byId = {};

    Object.keys(lanes).forEach(function (key) {
      var ordered = lanes[key].slice().sort(metrics.bySlot);
      var ahead = 0;

      ordered.forEach(function (record) {
        /* A cancelled booking and a no-show never sat in the chair, so
           neither holds a place in front of anybody. */
        var held = !metrics.MISSED[record.status];

        byId[record.id] = held && ahead > 0
          ? Math.max(5, Math.round(ahead / 5) * 5)
          : 0;

        if (held) ahead += Number(record.duration) || 0;
      });
    });

    return records.map(function (record) {
      return byId[record.id] || 0;
    });
  }

  /**
   * Revenue for each day of the period, with the empty days included.
   *
   * The empty days are the point: a bar chart that skips them makes a busy week
   * and a quiet one look identical, and the day the salon took nothing is
   * usually the day a manager wants to ask about.
   *
   * @param {string} from
   * @param {string} to
   * @returns {Array<{key: string, label: string, value: number, hint: string}>}
   */
  function dailyRevenue(from, to) {
    var records = between(from, to);
    var out = [];

    var probe = new Date(from + "T00:00:00");
    var last = new Date(to + "T00:00:00");
    var today = metrics.today();

    while (probe <= last && out.length < 400) {
      var key = [
        probe.getFullYear(),
        String(probe.getMonth() + 1).padStart(2, "0"),
        String(probe.getDate()).padStart(2, "0")
      ].join("-");

      var dayRecords = records.filter(function (record) {
        return record.date === key;
      });

      out.push({
        key: key,
        label: fmt.dateShort(key),
        value: metrics.revenue(dayRecords),
        hint: fmt.number(dayRecords.length) + " حجز" +
          (probe.getDay() === CLOSED_WEEKDAY ? " · يوم مغلق" : "") +
          (key === today ? " · اليوم" : "")
      });

      probe.setDate(probe.getDate() + 1);
    }

    return out;
  }

  /**
   * Count bookings by status, for the mix chart.
   *
   * @param {Object[]} records
   * @returns {Array<{key: string, label: string, value: number, tone: string}>}
   */
  function statusMix(records) {
    return Object.keys(bookings.STATUS).map(function (key) {
      var badge = metrics.statusBadge({ status: key });

      return {
        key: key,
        label: badge.label,
        tone: badge.tone,
        value: records.filter(function (record) {
          return record.status === key;
        }).length
      };
    });
  }

  /**
   * Count a dimension and rank it.
   *
   * @param {Object[]} records
   * @param {Function} keyOf   (record) => group key
   * @param {Function} nameOf  (groupKey, recordsInGroup) => display label
   * @param {Function} [extra] (recordsInGroup) => a hint, e.g. revenue
   * @returns {Array<{key: string, label: string, value: number, hint: string}>}
   */
  function rankBy(records, keyOf, nameOf, extra) {
    var groups = {};

    records.forEach(function (record) {
      var key = keyOf(record);
      if (key === null || key === undefined || key === "") return;

      if (!groups[key]) groups[key] = [];
      groups[key].push(record);
    });

    return Object.keys(groups).map(function (key) {
      var rows = groups[key];

      return {
        key: key,
        label: nameOf(key, rows),
        value: rows.length,
        hint: extra ? extra(rows) : ""
      };
    }).sort(function (a, b) {
      return b.value - a.value ||
        a.label.localeCompare(b.label, "ar");
    });
  }

  /**
   * The services booked most, named as they were sold.
   *
   * The name comes off the record, not off the catalogue, and the latest
   * spelling wins — so a service renamed since a booking was made is reported
   * under the name the salon is using now without rewriting what the customer
   * was charged then.
   *
   * @param {Object[]} records
   * @returns {Array<Object>}
   */
  function topServices(records) {
    return rankBy(
      records,
      function (record) { return record.service && record.service.id; },
      function (key, rows) {
        var latest = rows[rows.length - 1].service;
        return latest.name || key;
      },
      function (rows) {
        return fmt.money(metrics.revenue(rows)) + " محصَّلة";
      }
    );
  }

  /**
   * The barbers with the most bookings.
   *
   * "Any barber" is a real row and is not folded away: those are customers the
   * salon still had to serve, and hiding them would make every barber look
   * busier than they were.
   *
   * @param {Object[]} records
   * @returns {Array<Object>}
   */
  function topBarbers(records) {
    return rankBy(
      records,
      function (record) { return metrics.barberOf(record).id; },
      function (key) {
        if (key === "any") return "غير محدد (أي حلاق)";
        if (roster && roster.get) {
          var known = roster.get(key);
          if (known) return known.name;
        }
        return metrics.barberOf({ barber: { id: key, name: key }, anyBarber: false }).label;
      },
      function (rows) {
        return fmt.money(metrics.revenue(rows)) + " محصَّلة";
      }
    );
  }

  /**
   * Everything the screen draws, in one object, so the view never has to
   * compute and the tests can ask the questions directly.
   *
   * @param {string} range
   * @param {{from: string, to: string}} [custom]
   * @returns {Object}
   */
  function report(range, custom) {
    var window = period(range, custom);
    var stats = volume(window.from, window.to);

    return {
      window: window,
      range: window.key,
      stats: stats,
      revenue: revenueCards(),
      series: dailyRevenue(window.from, window.to),
      mix: statusMix(stats.records),
      services: topServices(stats.records),
      barbers: topBarbers(stats.records)
    };
  }

  /* =====================================================================
     The screen
     ===================================================================== */

  var REPORT_FILTERS = { range: "week", from: "", to: "" };

  function rangeOptions() {
    return [{ value: "", label: "كل الفترات" }].concat(RANGES);
  }

  /**
   * @param {Object} bar the toolbar handle
   */
  function resultsView(bar) {
    var data = report(REPORT_FILTERS.range, {
      from: REPORT_FILTERS.from,
      to: REPORT_FILTERS.to
    });

    var window = data.window;
    var stats = data.stats;
    var custom = REPORT_FILTERS.range === "custom";
    var chips = [];

    if (REPORT_FILTERS.range) {
      chips.push({
        label: "الفترة: " + window.label,
        remove: function () { clearOne("range", bar); }
      });
    }

    if (custom) {
      chips.push({
        label: "من " + fmt.dateShort(window.from),
        remove: function () { clearOne("from", bar); }
      });
      chips.push({
        label: "إلى " + fmt.dateShort(window.to),
        remove: function () { clearOne("to", bar); }
      });
    }

    var waitValue = stats.averageWait === null
      ? "—"
      : fmt.number(stats.averageWait) + " د";

    var waitHint = stats.averageWait === null
      ? "لم ينتظر أحد في هذه الفترة"
      : "تقديري، لـ" + fmt.number(stats.waitedCount) + " حجز كان له من ينتظره";

    return [
      ui.statRow(data.revenue),

      ui.card({
        title: "الحركة في الفترة",
        description: window.label + " — " + fmt.number(stats.total) + " حجز"
      }, [
        ui.statRow([
          {
            label: "إجمالي الحجوزات",
            value: fmt.number(stats.total),
            num: true,
            icon: "calendar-check",
            tone: stats.total ? "brand" : "neutral",
            hint: window.days > 1
              ? fmt.number(window.days) + " يوم"
              : fmt.dateLong(window.from)
          },
          {
            label: "الحجوزات المكتملة",
            value: fmt.number(stats.done),
            num: true,
            icon: "check-double",
            tone: stats.done ? "success" : "neutral",
            hint: stats.total
              ? Math.round((stats.done / stats.total) * 100) + "٪ من الحجوزات"
              : "لا شيء"
          },
          {
            label: "الحجوزات الملغاة",
            value: fmt.number(stats.cancelled),
            num: true,
            icon: "ban",
            tone: stats.cancelled ? "neutral" : "neutral",
            hint: "لا تُحتسب إيراداً ولا ديناً"
          },
          {
            label: "الحجوزات التي لم يحضر",
            value: fmt.number(stats.noShow),
            num: true,
            icon: "user-x",
            tone: stats.noShow ? "warning" : "neutral",
            hint: "لا تُحتسب إيراداً ولا ديناً"
          },
          {
            label: "متوسط وقت الانتظار",
            value: waitValue,
            num: stats.averageWait !== null,
            icon: "hourglass",
            tone: stats.averageWait > 30 ? "danger" : (stats.averageWait ? "info" : "neutral"),
            hint: waitHint
          }
        ]),

        !window.open
          ? dom.el("p", { class: "form-warning", role: "status" }, [
              dom.icon("alert-triangle", "icon--sm"),
              dom.el("span", { text: "تاريخا البداية والنهاية كانا معكوسين، فعُكسا." })
            ])
          : null,

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
                data: { clearReportFilters: "" },
                onClick: function () { clearAll(bar); }
              })
            ])
          : null
      ]),

      stats.total
        ? dom.el("div", { class: "report-grid" }, [
            ui.card({
              title: "الإيراد اليومي",
              description: "ما حُصّل في كل يوم من الفترة. الأيام الفارغة ظاهرة عمداً."
            }, [
              charts.barChart({
                title: "الإيراد المحصَّل لكل يوم",
                unit: "ر.س",
                series: data.series,
                valueName: "المحصَّل",
                limit: 30
              })
            ]),

            ui.card({
              title: "كيف انتهت الحجوزات",
              description: "توزيع حالات الحجوزات في الفترة نفسها."
            }, [
              charts.stackedBar({
                title: "توزيع حالات الحجوزات",
                unit: "حجزاً",
                parts: data.mix
              }) || ui.emptyState({
                icon: "inbox",
                title: "لا حجوزات",
                message: "لا توجد حجوزات في هذه الفترة لتوزيعها."
              })
            ]),

            ui.card({
              title: "الخدمات الأكثر طلباً",
              description: "باسمها وقت الحجز، فلا يغيّرها تعديل قائمة الخدمات لاحقاً."
            }, [
              charts.rankedBars({
                title: "الخدمات الأكثر طلباً",
                unit: "حجزاً",
                rows: data.services
              }) || ui.emptyState({
                icon: "scissors",
                title: "لا خدمات",
                message: "لم تُحجز أي خدمة في هذه الفترة."
              })
            ]),

            ui.card({
              title: "الحلاقون الأكثر حجزاً",
              description: "الحجوزات التي وُسّمت لكل حلاق، بما فيها غير المحددة."
            }, [
              charts.rankedBars({
                title: "الحلاقون الأكثر حجزاً",
                unit: "حجزاً",
                rows: data.barbers
              }) || ui.emptyState({
                icon: "users",
                title: "لا حجوزات",
                message: "لم تُحجز أي خدمة في هذه الفترة."
              })
            ])
          ])
        : ui.card({
            title: "لا توجد حجوزات في هذه الفترة",
            description: "غيّر الفترة من الأعلى ليرى التقرير ما كان في غيرها."
          }, [
            dom.el("div", { class: "report-nothing" }, [
              dom.el("p", {
                class: "report-nothing__text",
                text: "لا حجوزات بين " + fmt.dateShort(window.from) +
                  " و" + fmt.dateShort(window.to) + "، فلا أرقام تُرسم. " +
                  "الفترة الفارغة ليست صفراً: هي غياب بيانات."
              })
            ])
          ])
    ];
  }

  function clearOne(key, bar) {
    REPORT_FILTERS[key] = "";

    if (bar.controls[key]) bar.controls[key].value = "";
    if (key === "from" || key === "to") {
      var node = dom.$("[data-reports-custom]", bar.node);
      if (node) node.hidden = REPORT_FILTERS.range !== "custom";
    }

    bar.repaint();
  }

  function clearAll(bar) {
    REPORT_FILTERS.range = "";
    REPORT_FILTERS.from = "";
    REPORT_FILTERS.to = "";

    if (bar.searchInput) bar.searchInput.value = "";
    Object.keys(bar.controls).forEach(function (key) {
      if (bar.controls[key]) bar.controls[key].value = "";
    });

    var custom = dom.$("[data-reports-custom]", bar.node);
    if (custom) custom.hidden = true;

    bar.repaint();
  }

  /**
   * @param {Object} section from Halaq.admin.nav
   * @returns {HTMLElement}
   */
  function render(section) {
    var host = dom.el("div", { "data-report-results": "" });
    var bar = { controls: {}, node: null, searchInput: null, repaint: function () {} };

    function repaint() {
      dom.render(host, resultsView(bar));
    }

    bar.repaint = repaint;

    var rangeSelect = ui.filterSelect({
      id: "admin-reports-range",
      label: "الفترة",
      value: REPORT_FILTERS.range,
      options: rangeOptions(),
      onchange: function (event) {
        REPORT_FILTERS.range = event.target.value;
        var custom = dom.$("[data-reports-custom]", barNode);
        if (custom) custom.hidden = REPORT_FILTERS.range !== "custom";
        repaint();
      }
    });

    var fromInput = dom.el("input", {
      class: "input",
      id: "admin-reports-from",
      type: "date",
      value: REPORT_FILTERS.from,
      onchange: function (event) {
        REPORT_FILTERS.from = event.target.value;
        repaint();
      }
    });

    var toInput = dom.el("input", {
      class: "input",
      id: "admin-reports-to",
      type: "date",
      value: REPORT_FILTERS.to,
      onchange: function (event) {
        REPORT_FILTERS.to = event.target.value;
        repaint();
      }
    });

    var customWrap = dom.el("div", {
      class: "reports-custom",
      "data-reports-custom": "",
      hidden: REPORT_FILTERS.range !== "custom"
    }, [
      ui.field({
        id: "admin-reports-from",
        label: "من تاريخ",
        control: fromInput
      }),
      ui.field({
        id: "admin-reports-to",
        label: "إلى تاريخ",
        control: toInput
      })
    ]);

    var barNode = dom.el("div", { class: "toolbar", role: "search" }, [
      rangeSelect,
      customWrap,

      dom.el("div", { class: "toolbar__end" }, [
        ui.button({
          label: "مسح التصفية",
          icon: "close",
          variant: "ghost",
          size: "sm",
          data: { clearReportFilters: "" },
          onClick: function () { clearAll(bar); }
        })
      ])
    ]);

    bar.node = barNode;
    bar.controls.range = dom.$("#admin-reports-range", barNode);
    bar.controls.from = fromInput;
    bar.controls.to = toInput;

    repaint();

    return dom.el("div", { class: "stack", "data-reports": "" }, [
      ui.pageHeader(section, {
        actions: [
          ui.button({
            label: "تحديث",
            icon: "refresh",
            variant: "ghost",
            size: "sm",
            data: { refreshReports: "" },
            onClick: function () {
              repaint();
            }
          })
        ]
      }),

      dom.el("p", { class: "report-lede" }, [
        dom.icon("info", "icon--sm"),
        dom.el("span", {
          text: "كل الأرقام هنا من التحصيل المسجَّل، لا من أسعار الخدمات المكتملة. " +
            "والحجز الملغي أو الذي لم يحضر صاحب لا يُحتسب إيراداً ولا يُقيَّد على أحد."
        })
      ]),

      barNode,
      host
    ]);
  }

  admin.reports = {
    render: render,
    report: report,
    period: period,
    between: between,
    revenueCards: revenueCards,
    volume: volume,
    dailyRevenue: dailyRevenue,
    statusMix: statusMix,
    topServices: topServices,
    topBarbers: topBarbers,
    quotedWaits: quotedWaits,
    monthStart: monthStart,
    openDaysAgo: openDaysAgo,

    RANGES: RANGES,
    CLOSED_WEEKDAY: CLOSED_WEEKDAY,
    filters: REPORT_FILTERS
  };
})(window.Halaq = window.Halaq || {});
