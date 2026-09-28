/* ==========================================================================
   Halaq — Admin section registry
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.sections

   One entry per section that says what it is going to do and what it will
   need. A section is a function that returns DOM for a given section, and the
   router puts it in the content area. Swapping a real screen in means changing
   the return value, not the shell.

   What lives where
   -----------------
   The dashboard and the bookings list are here, because they are presentation
   over the shared metrics and neither writes to a store. The queue, the
   roster, services, customers, payments, reports and settings each have their
   own file, because each either writes to a store or owns a dialog; a screen
   of that size does not belong in a registry. This file's handlers point at
   them, so adding a screen is one entry in nav.js and one handler here.

   Where the numbers come from is not here. Every figure is metrics.js's or
   reports.js's, and this file only decides how to draw it, so the dashboard and
   the bookings list can never disagree about what the day looks like.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var admin = Halaq.admin = Halaq.admin || {};

  var nav = admin.nav;
  var ui = admin.ui;
  var metrics = admin.metrics;
  var charts = admin.charts;

  /* =====================================================================
     Shared: the notice a not-yet-built screen shows
     ===================================================================== */

  /**
   * @param {Object} section
   * @param {Array}  planned  what the screen will do
   * @param {Object} [opts]
   * @param {string} [opts.title]
   * @param {string} [opts.text]
   * @returns {HTMLElement}
   */
  function notice(section, planned, opts) {
    opts = opts || {};

    return dom.el("div", { class: "notice", "data-notice": section.id }, [
      dom.el("span", { class: "notice__icon" }, [dom.icon(section.icon, "icon--lg")]),

      dom.el("div", {}, [
        dom.el("p", {
          class: "notice__title",
          text: opts.title || "هذه الشاشة لم تُبنَ بعد"
        }),
        dom.el("p", {
          class: "notice__text",
          text: opts.text ||
            "هيكل التنقل والرأس جاهز، والمكوّنات المشتركة جاهزة. " +
            "بقيت البيانات التي تعرضها هذه الشاشة."
        }),

        planned && planned.length
          ? dom.el("ul", { class: "notice__list" }, planned.map(function (line) {
              return dom.el("li", { class: "notice__list-item" }, [
                dom.icon("check", "icon--xs"),
                dom.el("span", { text: line })
              ]);
            }))
          : null
      ])
    ]);
  }

  /* =====================================================================
     Dashboard

     Nothing on this screen is worked out here. Every figure belongs to
     metrics.js or to reports.js, and this file only decides how to draw it, so
     the dashboard and the reports can never tell two different stories about
     the same day.

     The order of the screen is the order a receptionist needs it in:

       1. What needs deciding now. The attention band comes before the numbers,
          because a screen that opens with eight tiles and no instruction makes
          the reader sort them into a problem themselves.
       2. What the day looks like. Who is here, and what the states are.
       3. The shape of the period. Bookings per day and per hour, the money, and
          what people actually asked for.
       4. The detail. The newest records, and the way out to every screen that
          acts on any of it — a dashboard that can only be looked at is a
          screenshot, not a workspace.

     One thing this screen will not do is invent a time. The store keeps no
     "served at" timestamp, so there is no measured wait to report and no
     reliable "now" to judge lateness against. Both are derived from the lane's
     own slot order instead, and where even that is not available the figure is
     left out rather than filled in.
     ===================================================================== */

  /* Trading days covered by the trend charts. Ten is about a fortnight of
     calendar time — long enough to show a weekday pattern, short enough that
     every bar is still its own bar rather than a texture. */
  var DASH_DAYS = 10;

  /**
   * "HH:MM" as minutes past midnight, or null for anything unparseable.
   *
   * Null rather than zero on purpose: a booking with no usable time is unknown,
   * and folding it to midnight would make it look like the earliest in the day.
   *
   * @param {string} value
   * @returns {number|null}
   */
  function timeValue(value) {
    var match = /^(\d{1,2}):(\d{2})$/.exec(String(value == null ? "" : value).trim());

    if (!match) return null;

    var hours = Number(match[1]);
    var minutes = Number(match[2]);

    if (hours > 23 || minutes > 59) return null;

    return hours * 60 + minutes;
  }

  /**
   * The window the trends cover: the last DASH_DAYS days the salon traded, up
   * to and including today.
   * @returns {{from: string, to: string}}
   */
  function dashWindow() {
    return {
      from: Halaq.bookings.daysAgo(DASH_DAYS - 1),
      to: metrics.today()
    };
  }

  /**
   * A labelled figure. Real <dt>/<dd>, because these are names and values
   * rather than loose text, and a screen reader should hear the pairing.
   *
   * @param {string} label
   * @param {string} value
   * @returns {HTMLElement}
   */
  function fact(label, value) {
    return dom.el("div", { class: "dash-fact" }, [
      dom.el("dt", { class: "dash-fact__label", text: label }),
      dom.el("dd", { class: "dash-fact__value num", text: value })
    ]);
  }

  /**
   * The money line at the top of the day, with the two figures that give it
   * meaning. A total on its own cannot be read: three hundred riyals across nine
   * customers and across two are very different days, and only one of them is
   * healthy.
   *
   * The note under the figure is the point of the block. Revenue here is money
   * actually taken, never the sum of what finished services were priced at, so
   * the screen says so rather than letting a quiet-looking figure be read as a
   * broken one.
   *
   * @param {Object} sales the "sales" descriptor from dashboardStats
   * @returns {HTMLElement}
   */
  function salesLede(sales) {
    var bills = metrics.payments();

    return dom.el("div", { class: "dash-lede" }, [
      dom.el("div", { class: "dash-lede__main" }, [
        dom.el("p", {
          class: "dash-lede__label",
          text: "مبيعات اليوم المحصَّلة"
        }),
        dom.el("p", {
          class: "dash-lede__value num",
          text: sales ? String(sales.value) : fmt.money(0)
        }),
        dom.el("p", {
          class: "dash-lede__note",
          text: "لا يُحتسب أي مبلغ قبل تسجيل دفعة، فخدمة اليوم غير المحصَّلة لا تظهر هنا."
        })
      ]),

      dom.el("dl", { class: "dash-facts" }, [
        fact("فواتير محصَّلة", fmt.number(bills.todayPaid.length)),
        fact("متوسط الفاتورة", bills.todayPaid.length
          ? fmt.money(metrics.averageTicket(bills.todayPaid))
          : "—"),
        fact("غير محصَّل", fmt.money(bills.owed))
      ])
    ]);
  }

  /**
   * The shortest and longest wait quoted to the people actually waiting.
   *
   * Both are the store's own estimate, not a measured time, so the labels say
   * "مقدَّر" rather than implying the front desk timed anybody. The range is
   * here because an average on its own hides the one person who has been
   * waiting an hour.
   *
   * @returns {Object|null}
   */
  function waitExtremes() {
    var rows = metrics.split().waiting.map(function (record) {
      return { record: record, minutes: Halaq.bookings.estimateMinutes(record) };
    }).filter(function (row) {
      /* Zero means "not waiting any more" — first in the lane, or in the chair
         — so those are excluded from both ends rather than counted as a
         flattering shortest. */
      return row.minutes > 0;
    });

    if (!rows.length) return null;

    return {
      shortest: rows.reduce(function (best, row) {
        return !best || row.minutes < best.minutes ? row : best;
      }, null),
      longest: rows.reduce(function (best, row) {
        return !best || row.minutes > best.minutes ? row : best;
      }, null)
    };
  }

  /**
   * One end of the waiting range.
   * @param {string} label
   * @param {{record: Object, minutes: number}} row
   * @param {string} tone
   * @returns {HTMLElement}
   */
  function rangeEnd(label, row, tone) {
    return dom.el("div", { class: "dash-range__end is-" + tone }, [
      dom.el("p", { class: "dash-range__label", text: label }),
      dom.el("p", {
        class: "dash-range__value num",
        text: fmt.number(row.minutes) + " د"
      }),
      dom.el("p", { class: "dash-range__who" }, [
        dom.icon("user", "icon--xs"),
        dom.el("span", {
          text: row.record.customer.name +
            (row.record.waitingNumber ? " · " + row.record.waitingNumber : "")
        })
      ])
    ]);
  }

  /**
   * @returns {HTMLElement}
   */
  function waitRange() {
    var extremes = waitExtremes();

    if (!extremes) {
      return dom.el("p", {
        class: "dash-note",
        text: "لا أحد ينتظر الآن، فلا مدة انتظار لعرضها."
      });
    }

    return dom.el("div", { class: "dash-range" }, [
      rangeEnd("أقصر انتظار مقدَّر", extremes.shortest, "success"),
      rangeEnd("أطول انتظار مقدَّر", extremes.longest,
        extremes.longest.minutes > 30 ? "danger" : "warning")
    ]);
  }

  /**
   * The moment a lane is running on, in minutes past midnight.
   *
   * There is no "now" anywhere in the store, so the only instant the data can
   * honestly speak about is the moment the chair in front empties. With nobody
   * in the chair this returns null rather than reaching for the browser's clock,
   * which would accuse the front desk of being late on the strength of the
   * viewing machine and nothing else.
   *
   * @param {Object} lane
   * @returns {number|null}
   */
  function laneClock(lane) {
    if (!lane.serving) return null;

    var start = timeValue(lane.serving.time);
    if (start === null) return null;

    return start + (Number(lane.serving.duration) || 0);
  }

  /**
   * People still queued whose booked slot has already gone by, on their own
   * lane's clock. Worst first, because that is the order the desk has to work
   * in.
   *
   * @returns {Array<{record: Object, lane: Object, minutesLate: number}>}
   */
  function overdue() {
    var out = [];

    metrics.lanes().forEach(function (lane) {
      var frees = laneClock(lane);
      if (frees === null) return;

      var queue = [lane.called, lane.next].concat(lane.rest).filter(Boolean);

      queue.forEach(function (record) {
        var due = timeValue(record.time);

        if (due === null || due >= frees) return;

        out.push({
          record: record,
          lane: lane,
          minutesLate: frees - due
        });
      });
    });

    return out.sort(function (a, b) {
      return b.minutesLate - a.minutesLate;
    });
  }

  /**
   * What needs a decision, in the order it needs one.
   *
   * Three kinds, and no more. A load that failed comes first, because every
   * other figure on the screen is conditioned on it. A booking confirmed and not
   * yet arrived is deliberately absent: that is the day's ordinary work, not an
   * exception, so it goes in the queue card as the next name to expect rather
   * than in a band whose whole job is to mean "act on this".
   *
   * @returns {Array<Object>}
   */
  function attention() {
    var items = [];

    /* A failed load leads everything, and it is a different colour from the rest
       because it is the one item that means the figures below cannot be trusted
       — as opposed to meaning somebody has to be dealt with. */
    if (Halaq.bookings.loadError()) {
      items.push({
        tone: "danger",
        icon: "alert-triangle",
        title: "تعذّر تحميل سجل الحجوزات",
        text: "لم يصل ردّ من الخادم، فما تراه أدناه قد يكون ناقصاً أو قديماً. " +
          "حاول مرة أخرى، وتحقّق من الاتصال إن تكرّر الأمر.",
        label: "إعادة المحاولة",
        retry: true
      });
    }

    var late = overdue();

    if (late.length) {
      items.push({
        tone: "warning",
        icon: "alert-triangle",
        title: fmt.number(late.length) + " تجاوز موعد حجزاً",
        text: "أقدمهم " + late[0].record.customer.name + " على المسار " +
          (late[0].lane.lane || "—") + "، متأخر " +
          fmt.number(late[0].minutesLate) + " دقيقة عن الموعد " +
          fmt.time(late[0].record.time) + ".",
        label: "فتح الطابور",
        section: "queue"
      });
    }

    var bills = metrics.payments();

    if (bills.owed > 0) {
      items.push({
        tone: "info",
        icon: "banknote",
        title: fmt.money(bills.owed) + " لم تُحصَّل بعد",
        text: fmt.number(bills.unpaid.length) +
          " خدمة قُدِّمت وفاتورتها ما زالت مفتوحة.",
        label: "فتح المدفوعات",
        section: "payments"
      });
    }

    return items;
  }

  /**
   * The band across the top: what needs deciding, or a plain statement that
   * nothing does. The clear state is said out loud rather than left blank,
   * because a band that appears and disappears reads as a glitch.
   *
   * @returns {HTMLElement}
   */
  function alertBand() {
    var items = attention();

    if (!items.length) {
      return dom.el("div", { class: "alert-band is-clear", "data-alerts": "" }, [
        dom.el("span", { class: "alert-band__mark" }, [dom.icon("check-circle", "icon--sm")]),
        dom.el("div", { class: "alert-band__body" }, [
          dom.el("p", {
            class: "alert-band__title",
            text: "لا شيء يستدعي الانتباه الآن"
          }),
          dom.el("p", {
            class: "alert-band__text",
            text: "لا أحد تجاوز موعده، ولا فاتورة مفتوحة. أرقام اليوم بالأسفل."
          })
        ])
      ]);
    }

    return dom.el("ul", { class: "alert-band", "data-alerts": "" }, items.map(function (item) {
      return dom.el("li", { class: "alert is-" + item.tone }, [
        dom.el("span", { class: "alert__icon" }, [dom.icon(item.icon, "icon--sm")]),

        dom.el("div", { class: "alert__body" }, [
          dom.el("p", { class: "alert__title", text: item.title }),
          dom.el("p", { class: "alert__text", text: item.text })
        ]),

        /* A retry has nowhere to navigate to — it is the same screen, asked
           again — so it uses the shell's own refresh control rather than a
           link that would look like it was going somewhere. */
        ui.button({
          label: item.label,
          icon: item.retry ? "refresh" : "chevron-left",
          variant: "ghost",
          size: "sm",
          href: item.retry ? null : nav.href(item.section),
          data: item.retry ? { action: "refresh-demo" } : { section: item.section }
        })
      ]);
    }));
  }

  /**
   * Who is in the chair and who is next, in one row.
   * @param {Object} lane
   * @returns {HTMLElement}
   */
  function laneRow(lane) {
    var state;
    var note;

    if (lane.serving) {
      state = ui.badge({ label: "في الكرسي", icon: "razor", tone: "success" });
      note = "الآن: " + lane.serving.customer.name +
        (lane.serving.waitingNumber ? " · " + lane.serving.waitingNumber : "");
    } else if (lane.called) {
      state = ui.badge({ label: "دُعي", icon: "user-check", tone: "info" });
      note = "بانتظار الدور: " + lane.called.customer.name;
    } else if (lane.waitingCount) {
      state = ui.badge({ label: "متاح", icon: "scissors", tone: "neutral" });
      note = "لا أحد في الكرسي، و" + fmt.number(lane.waitingCount) + " ينتظره.";
    } else {
      state = ui.badge({ label: "فارغ", icon: "coffee", tone: "neutral" });
      note = "لا حجز على هذا المسار.";
    }

    return dom.el("li", { class: "dash-lane" }, [
      dom.el("span", {
        class: "dash-lane__letter num",
        text: lane.lane || "—",
        "aria-hidden": "true"
      }),

      dom.el("div", { class: "dash-lane__body" }, [
        ui.person({ name: lane.name, initials: lane.initials }),
        dom.el("p", { class: "dash-lane__note", text: note })
      ]),

      dom.el("div", { class: "dash-lane__end" }, [
        state,
        lane.estimateMinutes
          ? dom.el("span", {
              class: "dash-lane__wait num",
              text: "≈ " + fmt.number(lane.estimateMinutes) + " د"
            })
          : null
      ])
    ]);
  }

  /**
   * @param {Object[]} lanes
   * @returns {HTMLElement}
   */
  function laneList(lanes) {
    if (!lanes.length) {
      return ui.emptyState({
        icon: "coffee",
        title: "لا أحد في الصالون",
        message: "لا يوجد في أي مسار اليوم. الحجوزات المؤكدة في الأسفل هي من لم يحضر بعد.",
        action: ui.button({
          label: "فتح الحجوزات",
          icon: "calendar-check",
          variant: "secondary",
          size: "sm",
          href: nav.href("bookings"),
          data: { section: "bookings" }
        })
      });
    }

    return dom.el("ul", { class: "dash-lanes", "data-lanes": "" }, lanes.map(laneRow));
  }

  /**
   * @returns {HTMLElement}
   */
  function queueCard() {
    var summary = metrics.queueSummary();
    var lanes = metrics.lanes();
    var expected = metrics.expected();
    var next = expected[0] || null;

    return ui.card({
      title: "الطابور الآن",
      description: "من في الكرسي، ومن بعده، على كل مسار.",
      bodyClass: "dash-body"
    }, [
      dom.el("div", { class: "dash-lede" }, [
        dom.el("div", { class: "dash-lede__main" }, [
          dom.el("p", { class: "dash-lede__label", text: "في الصالون الآن" }),
          dom.el("p", {
            class: "dash-lede__value num",
            text: fmt.number(summary.serving) + " / " + fmt.number(summary.waiting)
          }),
          dom.el("p", {
            class: "dash-lede__note",
            text: summary.waitingNumber
              ? "الدور التالي " + summary.waitingNumber
              : "لا أحد في قائمة الانتظار"
          })
        ]),

        dom.el("dl", { class: "dash-facts" }, [
          fact("مسارات نشطة", fmt.number(summary.lanes)),
          fact("متوسط الانتظار", summary.estimateMinutes
            ? fmt.number(summary.estimateMinutes) + " د"
            : "—"),
          fact("مؤكدة لم تحضر", fmt.number(expected.length))
        ])
      ]),

      waitRange(),

      laneList(lanes),

      next
        ? dom.el("p", { class: "dash-note" }, [
            dom.icon("clock", "icon--xs"),
            dom.el("span", {
              text: "أقرب حجز مؤكد: " + next.customer.name + " عند " +
                fmt.time(next.time) + "."
            })
          ])
        : null
    ]);
  }

  /**
   * @param {Object[]} records the window's records
   * @returns {HTMLElement}
   */
  function statusCard(records) {
    var mix = admin.reports.statusMix(records);

    return ui.card({
      title: "توزيع الحالات",
      description: "مفردات صفحة التتبّع نفسها، فلا يختلف اللفظان بين الصفحتين.",
      bodyClass: "dash-body"
    }, [
      charts.stackedBar({ title: "حالات الفترة", unit: "حجزاً", parts: mix }) ||
        ui.emptyState({
          icon: "inbox",
          title: "لا حجوزات في هذه الفترة",
          message: "لا حالة لتوزيعها بعد."
        }),

      dom.el("p", { class: "dash-note", text: "والأرقام التالية من كامل السجل، لا من الفترة:" }),

      ui.statRow(metrics.statusStats())
    ]);
  }

  /**
   * Bookings per day across the window, empty days included.
   *
   * The gaps are the point. A chart that only draws the days which had bookings
   * makes a busy fortnight and a quiet one look identical, and the day the salon
   * took nothing is usually the day somebody wants to ask about.
   *
   * @param {string} from
   * @param {string} to
   * @param {Object[]} records
   * @returns {Array<Object>}
   */
  function dailyCounts(from, to, records) {
    var out = [];
    var today = metrics.today();
    var probe = new Date(from + "T00:00:00");
    var last = new Date(to + "T00:00:00");

    while (probe <= last && out.length < 400) {
      var key = [
        probe.getFullYear(),
        String(probe.getMonth() + 1).padStart(2, "0"),
        String(probe.getDate()).padStart(2, "0")
      ].join("-");

      out.push({
        key: key,
        label: fmt.dateShort(key),
        value: records.filter(function (record) {
          return record.date === key;
        }).length,
        hint: key === today ? "اليوم" : ""
      });

      probe.setDate(probe.getDate() + 1);
    }

    return out;
  }

  /**
   * Today's bookings grouped into the hour they were booked for.
   *
   * Only the span between the earliest and latest booked hour is drawn. A salon
   * that took two bookings at ten and eleven should show two bars, not a run of
   * empty ones that would make the busy hours look thin by comparison — while a
   * genuine gap in the middle of the span is kept, because that is real.
   *
   * @param {Object[]} records today's records
   * @returns {Array<Object>}
   */
  function hourlyCounts(records) {
    var byHour = {};

    records.forEach(function (record) {
      var value = timeValue(record.time);
      if (value === null) return;

      var hour = Math.floor(value / 60);
      byHour[hour] = (byHour[hour] || 0) + 1;
    });

    var hours = Object.keys(byHour).map(Number).sort(function (a, b) {
      return a - b;
    });

    if (!hours.length) return [];

    var out = [];

    for (var hour = hours[0]; hour <= hours[hours.length - 1]; hour += 1) {
      var slot = (hour < 10 ? "0" : "") + hour + ":00";

      out.push({
        key: slot,
        label: fmt.time(slot),
        value: byHour[hour] || 0,
        hint: byHour[hour] ? "" : "لا حجز في هذه الساعة"
      });
    }

    return out;
  }

  /**
   * A card around a chart, with a real state for the case where the chart has
   * nothing to draw.
   *
   * @param {{title: string, description?: string, chart: HTMLElement|null,
   *          from?: string, to?: string}} opts
   * @returns {HTMLElement}
   */
  function chartCard(opts) {
    return ui.card({
      title: opts.title,
      description: opts.description
    }, [
      opts.chart || ui.emptyState({
        icon: "bar-chart",
        title: "لا أرقام في هذه الفترة",
        message: opts.from && opts.to
          ? "لم يُسجَّل شيء بين " + fmt.dateShort(opts.from) + " و" +
            fmt.dateShort(opts.to) + "."
          : "لم يُسجَّل شيء في هذا اليوم بعد."
      })
    ]);
  }

  /**
   * @param {Object} options  from, to, records
   * @returns {HTMLElement}
   */
  function revenueCard(options) {
    var bills = metrics.payments();

    return ui.card({
      title: "الإيرادات",
      description: "ما حُصِّل فعلاً، لا ما كانت الخدمات تسوى عليه.",
      bodyClass: "dash-body"
    }, [
      dom.el("dl", { class: "dash-facts" }, [
        fact("إيراد الفترة", fmt.money(metrics.revenue(options.records))),
        fact("فواتير محصَّلة", fmt.number(metrics.paidCount(options.records))),
        fact("متوسط الفاتورة", bills.paid.length
          ? fmt.money(metrics.averageTicket(bills.paid))
          : "—"),
        fact("غير محصَّل", fmt.money(bills.owed))
      ]),

      charts.barChart({
        title: "التحصيل اليومي",
        unit: "ر.س",
        series: admin.reports.dailyRevenue(options.from, options.to),
        valueName: "المحصَّل"
      }) || dom.el("div", { class: "chart-empty" })
    ]);
  }

  /**
   * @param {Object[]} records the window's records
   * @returns {HTMLElement}
   */
  function servicesCard(records) {
    return ui.card({
      title: "أكثر الخدمات طلباً",
      description: "مرتبة بعدد الحجوزات، مع نصيب كل خدمة من المحصَّل."
    }, [
      charts.rankedBars({
        title: "الحجوزات حسب الخدمة",
        unit: "حجزاً",
        rows: admin.reports.topServices(records),
        limit: 6
      }) || ui.emptyState({
        icon: "scissors",
        title: "لا حجوزات في هذه الفترة",
        message: "لم تُسجَّل أي خدمة على مدى الفترة المعروضة."
      })
    ]);
  }

  /**
   * The roster as availability, which is the only question the dashboard asks
   * of it: who could take a customer right now.
   *
   * @returns {HTMLElement}
   */
  function teamCard() {
    var team = metrics.barbers();

    if (!team.team.length) {
      return ui.card({ title: "الفريق" }, [
        ui.emptyState({
          icon: "users",
          title: "لا يوجد حلاقون على القائمة",
          message: "أضف الحلاقين من شاشة الحلاقين ليظهروا هنا."
        })
      ]);
    }

    return ui.card({
      title: "الفريق",
      description: fmt.number(team.available.length) + " من " +
        fmt.number(team.team.length) + " يستقبلون عملاء الآن."
    }, [
      dom.el("ul", { class: "dash-team", "data-team": "" }, team.team.map(function (barber) {
        var info = admin.roster.statusOf(barber.id);
        var on = team.available.some(function (row) {
          return row.id === barber.id;
        });

        return dom.el("li", {
          class: "dash-team__row" + (on ? " is-on" : "")
        }, [
          dom.el("span", {
            class: "dash-team__mark",
            "aria-hidden": "true",
            text: barber.initials || (barber.name || "").slice(0, 1)
          }),

          dom.el("div", { class: "dash-team__body" }, [
            dom.el("p", { class: "dash-team__name", text: barber.name }),
            dom.el("p", {
              class: "dash-team__hours",
              text: admin.roster.hoursSummary(barber)
            })
          ]),

          ui.badge({
            label: info.label,
            icon: info.icon,
            tone: on ? info.tone : "neutral",
            dot: on
          })
        ]);
      }))
    ]);
  }

  /**
   * The newest records, so the dashboard's last word is a fact rather than a
   * summary — and every column carries the label the bookings screen uses.
   *
   * @returns {HTMLElement}
   */
  function recentBookings() {
    return ui.card({
      title: "أحدث الحجوزات",
      description: "آخر ما دخل السجل، من الأحدث.",
      flush: true,
      actions: [ui.button({
        label: "كل الحجوزات",
        icon: "chevron-left",
        variant: "ghost",
        size: "sm",
        href: nav.href("bookings"),
        data: { section: "bookings" }
      })]
    }, [
      ui.table({
        stacked: true,
        caption: "أحدث الحجوزات",
        columns: [
          {
            key: "bookingNumber",
            label: "رقم الحجز",
            num: true,
            render: function (record) {
              return dom.el("span", {
                class: "num cell-code",
                text: record.bookingNumber
              });
            }
          },
          {
            key: "customer",
            label: "العميل",
            render: function (record) {
              return ui.person({
                name: record.customer.name,
                muted: record.customer.phone
              });
            }
          },
          {
            key: "service",
            label: "الخدمة",
            render: function (record) {
              return dom.el("span", { class: "cell-stack" }, [
                dom.el("span", {
                  class: "cell-stack__main",
                  text: (record.service && record.service.name) || "—"
                }),
                dom.el("span", {
                  class: "cell-stack__sub num",
                  text: fmt.money(record.price)
                })
              ]);
            }
          },
          {
            key: "time",
            label: "الموعد",
            num: true,
            render: function (record) {
              return dom.el("span", { class: "num", text: fmt.time(record.time) });
            }
          },
          {
            key: "status",
            label: "الحالة",
            render: function (record) {
              var info = metrics.statusBadge(record);
              return ui.badge({
                label: info.label,
                icon: info.icon,
                tone: info.tone
              });
            }
          },
          {
            key: "payment",
            label: "الدفع",
            render: function (record) {
              /* A cancelled booking and a no-show have nothing to collect, so
                 they are not shown as an open bill — a green "collected" badge
                 on a booking nobody attended would be a lie in a badge. */
              if (!metrics.chargeableOnly(record)) {
                return ui.badge({ label: "لا يُحتسب", icon: "ban", tone: "neutral" });
              }

              if (!Halaq.bookings.isPaid(record)) {
                return ui.badge({
                  label: "غير محصَّل",
                  icon: "clock",
                  tone: "warning"
                });
              }

              var paid = metrics.paymentBadge(record);

              return ui.badge({
                label: paid.label,
                icon: paid.icon,
                tone: "success"
              });
            }
          }
        ],
        rows: Halaq.bookings.all().slice(0, 8),
        empty: {
          icon: "inbox",
          title: "لا حجوزات بعد",
          message: "لم يدخل أي حجز السجل، ولا خلل في العرض — ما زال اليوم يبدأ."
        }
      })
    ]);
  }

  /**
   * What the content area shows while the store's first load is outstanding.
   *
   * The page header is real — the title is known before any data arrives — and
   * only the figures are placeholders. Painting the section itself here would be
   * worse than a loading screen: every tile would read a confident zero, and a
   * salon with forty bookings today would look empty for as long as the fetch
   * took. Silence is honest; a zero is a claim.
   *
   * @param {Object} section
   * @returns {HTMLElement}
   */
  function renderLoading(section) {
    return dom.el("div", { class: "stack", "data-loading": "" }, [
      ui.pageHeader(section),

      dom.el("p", { class: "skel-note" }, [
        dom.icon("refresh", "icon--sm"),
        dom.el("span", { text: "جارٍ تحميل سجل الحجوزات…" })
      ]),

      /* The first thing every admin screen leads with, so the placeholder has
         the same silhouette as the finished screen behind it. */
      ui.card({ bodyClass: "skel-card" }, [
        dom.el("div", { class: "skel-stats" }, [1, 2, 3, 4].map(function () {
          return ui.skeleton({ rows: 3, class: "skel--stat" });
        }))
      ]),

      dom.el("div", { class: "dash-duo" }, [
        ui.card({ bodyClass: "skel-card" }, [ui.skeleton({ rows: 5 })]),
        ui.card({ bodyClass: "skel-card" }, [ui.skeleton({ rows: 5 })])
      ]),

      dom.el("div", { class: "dash-duo" }, [
        ui.card({ bodyClass: "skel-card" }, [ui.skeleton({ rows: 1, bar: "block" })]),
        ui.card({ bodyClass: "skel-card" }, [ui.skeleton({ rows: 1, bar: "block" })])
      ])
    ]);
  }

  function dashboard(section) {
    var all = Halaq.bookings.all();
    var span = dashWindow();

    var inSpan = all.filter(function (record) {
      return record.date >= span.from && record.date <= span.to;
    });

    var today = all.filter(function (record) {
      return record.date === span.to;
    });

    var daily = dailyCounts(span.from, span.to, all);
    var hours = hourlyCounts(today);

    /* The sales figure leads as a plate of its own, and the remaining seven
       tiles sit under it — so the number a manager opens the screen for is the
       one that is biggest, without a second definition of it being invented. */
    var sales = null;

    var tiles = metrics.dashboardStats().filter(function (stat) {
      if (stat.key !== "sales") return true;
      sales = stat;
      return false;
    });

    return dom.el("div", { class: "stack" }, [
      ui.pageHeader(section, {
        actions: [
          ui.button({
            label: "الطابور",
            icon: "list",
            variant: "ghost",
            size: "sm",
            href: nav.href("queue"),
            data: { section: "queue" }
          }),
          ui.button({
            label: "إدارة الحجوزات",
            icon: "calendar-check",
            variant: "ghost",
            size: "sm",
            href: nav.href("bookings"),
            data: { section: "bookings" }
          }),
          ui.button({
            label: "تحديث",
            icon: "refresh",
            variant: "ghost",
            size: "sm",
            data: { action: "refresh-demo" }
          })
        ]
      }),

      alertBand(),

      ui.card({
        title: "ملخّص اليوم",
        description: "أرقام مباشرة من سجل الحجوزات، لا قيم ثابتة.",
        bodyClass: "dash-body"
      }, [
        salesLede(sales),
        ui.statRow(tiles)
      ]),

      dom.el("div", { class: "dash-duo" }, [
        queueCard(),
        statusCard(inSpan)
      ]),

      dom.el("div", { class: "dash-duo" }, [
        chartCard({
          title: "الحجوزات خلال الفترة",
          description: "عدد الحجوزات في كل يوم عمل، بالأيام الفارغة بينها.",
          from: span.from,
          to: span.to,
          /* barChart draws an empty frame rather than nothing, so the state is
             decided here where there is a sentence worth saying. */
          chart: daily.length
            ? charts.barChart({
                title: "حجوزات يومية",
                unit: "حجزاً",
                series: daily,
                valueName: "حجز"
              })
            : null
        }),
        chartCard({
          title: "الحجوزات حسب الساعة",
          description: "توزيع حجوزات اليوم على ساعاته.",
          chart: hours.length
            ? charts.barChart({
                title: "حجوزات اليوم",
                unit: "حجزاً",
                series: hours,
                valueName: "حجز",
                /* The default summary names the peak *day* and prints money,
                   neither of which is true of a series keyed by the hour. */
                peak: function (top) {
                  return top && top.value
                    ? "أكثر ساعة ازدحاماً " + top.label + " · " +
                      fmt.number(top.value) + " حجزاً"
                    : "لا حجوزات اليوم";
                }
              })
            : null
        })
      ]),

      dom.el("div", { class: "dash-duo" }, [
        revenueCard({ from: span.from, to: span.to, records: inSpan }),
        servicesCard(inSpan)
      ]),

      dom.el("div", { class: "dash-duo" }, [
        teamCard(),
        chartCard({
          title: "الحجوزات حسب الحلاق",
          description: "الأكثر حجزاً في الفترة. حجز بلا حلاق محدد يظهر كسطر مستقل، لأن الصالون خدمه فعلاً.",
          from: span.from,
          to: span.to,
          chart: charts.rankedBars({
            title: "نصيب كل حلاق",
            unit: "حجزاً",
            rows: admin.reports.topBarbers(inSpan),
            limit: 6
          })
        })
      ]),

      recentBookings()
    ]);
  }

  /* =====================================================================
     Bookings

     The one screen that reads like a list, so it is the one that needs
     searching and filtering to be usable at all.

     Two decisions worth stating, because both are easy to get wrong:

     1. The filter state lives on this module, not inside the render, so
        walking to another section and back does not silently throw away what
        the receptionist had narrowed down to. It is visible as chips, and
        there is always a way to clear it, so it can never become a trap.

     2. Only the results region is re-painted. Re-rendering the whole screen on
        every keystroke would pull focus out of the search box on the first
        letter typed, which is the single most common way a filter like this
        gets abandoned.
     ===================================================================== */

  var BOOKINGS_FILTERS = {
    q: "",
    date: "",
    status: "",
    barber: "",
    service: ""
  };

  /**
   * Does this record match what was typed?
   *
   * Booking numbers, waiting tickets and phone numbers are compared as digits
   * only, so "014", "HLQ-260927-014", a number typed with spaces, and the
   * same number typed with Arabic-Indic digits all find the same booking.
   * Names and services are compared as text.
   *
   * @param {Object} record
   * @param {string} raw
   * @returns {boolean}
   */
  function matchesQuery(record, raw) {
    var wanted = String(raw || "").trim();
    if (!wanted) return true;

    var digits = fmt.digits(wanted);

    if (digits && (
      fmt.digits(record.bookingNumber).indexOf(digits) !== -1 ||
      fmt.digits(record.waitingNumber).indexOf(digits) !== -1 ||
      fmt.digits(record.customer.phone).indexOf(digits) !== -1
    )) return true;

    var text = wanted.toLowerCase();

    if ((record.customer.name || "").toLowerCase().indexOf(text) !== -1) return true;
    if (record.service && (record.service.name || "").toLowerCase().indexOf(text) !== -1) {
      return true;
    }

    return false;
  }

  /**
   * Every filter at once. They intersect, which is what someone narrowing a
   * list down expects: each one can only remove rows, never add them back.
   *
   * @param {Object[]} records
   * @param {Object} state
   * @returns {Object[]} in front-desk order
   */
  function applyFilters(records, state) {
    return records
      .filter(function (record) {
        if (state.date && record.date !== state.date) return false;
        if (state.status && record.status !== state.status) return false;

        if (state.service && (!record.service || record.service.id !== state.service)) {
          return false;
        }

        if (state.barber) {
          var who = metrics.barberOf(record);

          if (state.barber === "any") {
            if (!who.any) return false;
          } else if (who.any || !record.barber || record.barber.id !== state.barber) {
            return false;
          }
        }

        return matchesQuery(record, state.q);
      })
      .sort(function (a, b) {
        return a.date.localeCompare(b.date) ||
          a.time.localeCompare(b.time) ||
          a.id - b.id;
      });
  }

  /* ---- the option lists, built from the records actually present ---- */

  function unique(values) {
    return values.filter(function (value, index) {
      return value && values.indexOf(value) === index;
    });
  }

  /**
   * Days that have bookings, today first-labelled so the common case is one tap.
   * @returns {Array<{value: string, label: string}>}
   */
  function dateOptions() {
    var day = metrics.today();

    var dates = unique(Halaq.bookings.all().map(function (record) {
      return record.date;
    })).sort();

    return [{ value: "", label: "كل الأيام" }].concat(dates.map(function (date) {
      return {
        value: date,
        label: date === day ? "اليوم · " + fmt.dateShort(date) : fmt.dateShort(date)
      };
    }));
  }

  /**
   * @returns {Array<{value: string, label: string}>}
   */
  function statusOptions() {
    return [{ value: "", label: "كل الحالات" }].concat(
      Object.keys(Halaq.bookings.STATUS).map(function (key) {
        return { value: key, label: Halaq.bookings.statusLabel(key) };
      })
    );
  }

  /**
   * @returns {Array<{value: string, label: string}>}
   */
  function barberOptions() {
    var team = Halaq.demoData.barbers || [];

    return [{ value: "", label: "كل الحلاقين" }]
      .concat(team.map(function (barber) {
        return { value: barber.id, label: barber.name };
      }))
      .concat([{ value: "any", label: "غير محدد (أي حلاق)" }]);
  }

  /**
   * Only services that have bookings, so the list is never eleven options of
   * which ten answer "no results".
   * @returns {Array<{value: string, label: string}>}
   */
  function serviceOptions() {
    var used = {};

    Halaq.bookings.all().forEach(function (record) {
      if (record.service && record.service.id) used[record.service.id] = record.service.name;
    });

    return [{ value: "", label: "كل الخدمات" }].concat(
      Object.keys(used).sort().map(function (id) {
        return { value: id, label: used[id] };
      })
    );
  }

  /**
   * What each active filter is narrowing by, in words, so the list is never
   * quietly shorter than expected.
   * @param {Object} state
   * @returns {Array<{key: string, label: string}>}
   */
  function activeChips(state) {
    var chips = [];

    if (state.q) chips.push({ key: "q", label: "بحث: " + state.q });

    if (state.date) {
      var isToday = state.date === metrics.today();
      chips.push({
        key: "date",
        label: "التاريخ: " + (isToday ? "اليوم" : fmt.dateShort(state.date))
      });
    }

    if (state.status) {
      chips.push({
        key: "status",
        label: "الحالة: " + Halaq.bookings.statusLabel(state.status)
      });
    }

    if (state.barber) {
      var name = state.barber === "any"
        ? "غير محدد"
        : ((Halaq.demoData.barbers || []).filter(function (barber) {
            return barber.id === state.barber;
          })[0] || {}).name || state.barber;

      chips.push({ key: "barber", label: "الحلاق: " + name });
    }

    if (state.service) {
      var service = (Halaq.bookings.all().map(function (record) {
        return record.service;
      }).filter(function (item) {
        return item && item.id === state.service;
      })[0] || {});

      chips.push({ key: "service", label: "الخدمة: " + (service.name || state.service) });
    }

    return chips;
  }

  function bookings(section) {
    var state = BOOKINGS_FILTERS;
    var host = dom.el("div", { "data-bookings-results": "" });
    var searchInput = null;
    var controls = {};

    /**
     * Put one filter back to "everything" — from a chip, from the clear
     * button, or from the control itself. The control is synced either way,
     * so the dropdown and the list can never show two different things.
     */
    function clearOne(key) {
      state[key] = "";

      if (key === "q") {
        if (searchInput) searchInput.value = "";
      } else if (controls[key]) {
        controls[key].value = "";
      }

      repaint();
    }

    function clearAll() {
      Object.keys(state).forEach(function (key) {
        state[key] = "";

        if (key === "q") {
          if (searchInput) searchInput.value = "";
        } else if (controls[key]) {
          controls[key].value = "";
        }
      });

      repaint();
    }

    /* ---- the results ---- */

    function columns() {
      var showDate = !state.date;

      return [
        {
          key: "bookingNumber",
          label: "رقم الحجز",
          num: true,
          render: function (record) {
            return dom.el("span", { class: "num cell-code", text: record.bookingNumber });
          }
        },
        {
          key: "waitingNumber",
          label: "رقم الانتظار",
          num: true,
          render: function (record) {
            return dom.el("span", { class: "num", text: record.waitingNumber || "—" });
          }
        },
        {
          key: "customer",
          label: "العميل",
          render: function (record) {
            return ui.person({ name: record.customer.name });
          }
        },
        {
          key: "phone",
          label: "الجوال",
          num: true,
          render: function (record) {
            return dom.el("span", { class: "num", text: record.customer.phone || "—" });
          }
        },
        {
          key: "service",
          label: "الخدمة",
          render: function (record) {
            return dom.el("span", {
              text: (record.service && record.service.name) || "—"
            });
          }
        },
        {
          key: "barber",
          label: "الحلاق",
          render: function (record) {
            var who = metrics.barberOf(record);

            return who.any
              ? ui.badge({ label: who.label, icon: "users", tone: "neutral" })
              : ui.person({ name: who.label, initials: who.initials });
          }
        },
        {
          key: "time",
          label: "الوقت",
          render: function (record) {
            return dom.el("span", { class: "cell-stack" }, [
              dom.el("span", { class: "num", text: fmt.time(record.time) }),
              showDate
                ? dom.el("span", {
                    class: "cell-stack__sub",
                    text: record.date === metrics.today()
                      ? "اليوم"
                      : fmt.dateShort(record.date)
                  })
                : null
            ]);
          }
        },
        {
          key: "price",
          label: "السعر",
          num: true,
          align: "end",
          render: function (record) {
            return dom.el("span", { class: "num cell-strong", text: fmt.money(record.price) });
          }
        },
        {
          key: "payment",
          label: "الدفع",
          render: function (record) {
            var paid = metrics.paymentBadge(record);
            return ui.badge(paid);
          }
        },
        {
          key: "status",
          label: "الحالة",
          render: function (record) {
            return ui.badge(metrics.statusBadge(record));
          }
        }
      ];
    }

    function resultsView() {
      var all = Halaq.bookings.all();
      var rows = applyFilters(all, state);
      var chips = activeChips(state);
      var narrowed = rows.length !== all.length;

      return ui.card({
        flush: true,
        title: "سجل الحجوزات",
        description: narrowed
          ? fmt.number(rows.length) + " من " + fmt.number(all.length) + " حجز"
          : "كل الحجوزات (" + fmt.number(all.length) + ")",
        actions: [
          chips.length
            ? ui.button({
                label: "مسح التصفية",
                icon: "close",
                variant: "ghost",
                size: "sm",
                onClick: clearAll
              })
            : null
        ]
      }, [
        chips.length
          ? dom.el("div", { class: "chips", "data-chips": "" }, chips.map(function (chip) {
              return ui.chip({
                label: chip.label,
                onRemove: function () {
                  clearOne(chip.key);
                }
              });
            }))
          : null,

        ui.table({
          stacked: true,
          caption: "حجوزات الصالون، مع رقم الحجز ورقم الانتظار والعميل والحالة",
          columns: columns(),
          rows: rows,
          empty: {
            icon: "search",
            title: "لا حجوزات مطابقة",
            message: "جرّب كلمة بحث أقصر، أو أزل بعض عوامل التصفية.",
            action: chips.length
              ? ui.button({
                  label: "مسح التصفية",
                  variant: "secondary",
                  size: "sm",
                  onClick: clearAll
                })
              : null
          }
        })
      ]);
    }

    function repaint() {
      dom.render(host, resultsView());
    }

    /* ---- the controls, built once and never re-painted ---- */

    function toolbar() {
      var bar = ui.toolbar({
        search: {
          id: "admin-bookings-search",
          label: "ابحث برقم الحجز أو رقم الانتظار أو الجوال أو اسم العميل",
          placeholder: "رقم الحجز، الجوال، أو اسم العميل…",
          value: state.q,
          oninput: function (event) {
            state.q = event.target.value;
            repaint();
          }
        },
        filters: [
          ui.filterSelect({
            id: "admin-bookings-date",
            label: "التاريخ",
            value: state.date,
            options: dateOptions(),
            onchange: function (event) {
              state.date = event.target.value;
              repaint();
            }
          }),
          ui.filterSelect({
            id: "admin-bookings-status",
            label: "الحالة",
            value: state.status,
            options: statusOptions(),
            onchange: function (event) {
              state.status = event.target.value;
              repaint();
            }
          }),
          ui.filterSelect({
            id: "admin-bookings-barber",
            label: "الحلاق",
            value: state.barber,
            options: barberOptions(),
            onchange: function (event) {
              state.barber = event.target.value;
              repaint();
            }
          }),
          ui.filterSelect({
            id: "admin-bookings-service",
            label: "الخدمة",
            value: state.service,
            options: serviceOptions(),
            onchange: function (event) {
              state.service = event.target.value;
              repaint();
            }
          })
        ]
      });

      searchInput = dom.$("#admin-bookings-search", bar);
      controls = {
        date: dom.$("#admin-bookings-date", bar),
        status: dom.$("#admin-bookings-status", bar),
        barber: dom.$("#admin-bookings-barber", bar),
        service: dom.$("#admin-bookings-service", bar)
      };

      return bar;
    }

    repaint();

    return dom.el("div", { class: "stack" }, [
      ui.pageHeader(section, {
        actions: [
          ui.button({
            label: "تحديث",
            icon: "refresh",
            variant: "ghost",
            size: "sm",
            data: { action: "refresh-demo" }
          })
        ]
      }),

      toolbar(),
      host,

      notice(section, [
        "تغيير حالة الحجز من الجدول",
        "إجراءات جماعية على أكثر من حجز",
        "فتح تفاصيل الحجز في نافذة"
      ], {
        title: "ما لا تفعله هذه الشاشة بعد",
        text: "القراءة والبحث والتصفية مبنية على سجل الحجوزات نفسه. " +
          "بقيت الكتابة عليه، وهي تحتاج خادماً لا واجهة."
      })
    ]);
  }

  /* =====================================================================
     The rest
     ===================================================================== */

  /* What each screen will need. Written out now so the order of work is
     visible in the code rather than only in someone's head. This is the one
     entry left — a screen that is built says so by having a handler above
     rather than an entry here. */
  var PLANNED = {
    reports: [
      "تصدير التقرير إلى ملف",
      "مقارنة فترتين جنباً إلى جنب",
      "تقرير لكل حلاق بتفصيله"
    ]
  };

  /* Anything not dashboard- or bookings-specific renders the notice for its
     own section. */
  var HANDLERS = {};

  nav.ALL.forEach(function (section) {
    HANDLERS[section.id] = function () {
      return dom.el("div", { class: "stack" }, [
        ui.pageHeader(section),
        notice(section, PLANNED[section.id] || [])
      ]);
    };
  });

  HANDLERS.dashboard = dashboard;
  HANDLERS.bookings = bookings;

  /* The queue and the roster are whole screens with their own data and their
     own writes, so they live in their own files. The registry only points at
     them — which is the seam: a screen can be replaced without the shell, the
     router or this file knowing anything about it. */
  HANDLERS.queue = function (section) {
    return admin.queue.render(section);
  };

  HANDLERS.barbers = function (section) {
    return admin.team.render(section);
  };

  HANDLERS.services = function (section) {
    return admin.services.render(section);
  };

  HANDLERS.customers = function (section) {
    return admin.customers.render(section);
  };

  HANDLERS.payments = function (section) {
    return admin.payments.render(section);
  };

  /* Reports and settings are whole screens with their own data and their own
     writes, same as the queue and the roster, so they live in their own files
     and the registry only points at them. */
  HANDLERS.reports = function (section) {
    return admin.reports.render(section);
  };

  HANDLERS.settings = function (section) {
    return admin.settings.render(section);
  };

  /**
   * @param {Object} section
   * @returns {HTMLElement}
   */
  function render(section) {
    var handler = HANDLERS[section.id] || HANDLERS[nav.DEFAULT];

    return handler(section);
  }

  admin.sections = {
    render: render,
    renderLoading: renderLoading,
    PLANNED: PLANNED,
    /* Exposed so the filter behaviour can be asserted on without a DOM. */
    applyFilters: applyFilters,
    matchesQuery: matchesQuery,
    filters: BOOKINGS_FILTERS
  };
})(window.Halaq = window.Halaq || {});
