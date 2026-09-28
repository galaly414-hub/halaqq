/* ==========================================================================
   Halaq — Admin metrics
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.metrics

   What every number on the admin side *means*, in one place, with no DOM in
   it. The dashboard and the bookings list answer the same questions — how
   many are waiting, what has been paid, who is free — and if each screen did
   its own arithmetic they would drift apart and eventually disagree in front
   of a receptionist. So the arithmetic lives here, returns plain data, and
   the views only draw it.

   Nothing here is stored and nothing here is invented. Every figure is derived
   from Halaq.bookings at the moment it is asked for, so a metric with no
   bookings behind it reads zero and says so in its hint rather than showing
   a plausible-looking placeholder.

   The vocabulary
   --------------
   The store's seven states split three ways, and the split matters because the
   headline numbers must not double-count each other:

     UPCOMING   confirmed  — booked, has not walked in yet
     WAITING    waiting, attended — here, holding a ticket, not in the chair
     SERVED     done       — finished, and the only state that has been paid

   cancelled and no_show are terminal and never counted as anything but a
   miss. `in_service` is a moment, not a queue: exactly one person per lane is
   in it, so it is reported on its own rather than folded into "waiting".

   The salon day
   -------------
   "Today" is the store's own demo day, not the wall clock. The store skips
   Saturday because the salon is closed, so on a Saturday the dashboard still
   reports the day it is actually operating rather than an empty one.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var fmt = Halaq.format;
  var admin = Halaq.admin = Halaq.admin || {};

  var roster = admin.roster;

  /* =====================================================================
     Vocabulary
     ===================================================================== */

  var UPCOMING = { confirmed: true };
  var WAITING = { waiting: true, attended: true };
  var SERVED = { done: true };
  var MISSED = { cancelled: true, no_show: true };

  /* A status is never carried by colour alone, so every badge needs a tone to
     go with the word. These match the meanings the tracking page already uses
     for the same seven states. */
  var STATUS_TONE = {
    confirmed: "info",
    waiting: "warning",
    attended: "warning",
    in_service: "brand",
    done: "success",
    cancelled: "neutral",
    no_show: "danger"
  };

  /* Payment is on site for every booking today, so this is one entry. It is
     written as a lookup rather than hard-coded into the table because a real
     backend adds card and transfer here, and the column should not have to be
     rewritten when it does. */
  var PAYMENT = {
    onsite: { label: "دفع في الصالون", tone: "neutral", icon: "banknote" }
  };

  /**
   * The full descriptor for how a payment was taken.
   *
   * One entry today because nothing is charged online, and a real backend
   * adds card and transfer here without the column needing a rewrite. The
   * record carries `method`; this file carries the wording.
   *
   * @param {Object|string} recordOrMethod
   * @returns {{label: string, tone: string, icon: string}}
   */
  function paymentInfo(recordOrMethod) {
    var method = typeof recordOrMethod === "string"
      ? recordOrMethod
      : (recordOrMethod && recordOrMethod.payment
          ? recordOrMethod.payment.method
          : "onsite");

    return PAYMENT[method] || PAYMENT.onsite;
  }

  /* =====================================================================
     Payments

     What is owed and what has been taken. Two different questions, kept
     apart, and the split is the whole point of the screen.
     ===================================================================== */

  /**
   * Split bookings into what has been paid and what has not.
   *
   * Only bookings that could have been paid for are in here at all: a
   * cancelled booking, or one where the customer never showed, has nothing to
   * collect and would sit in the unpaid list forever looking like a debt.
   *
   * @param {Object[]} [records] defaults to the whole store
   * @returns {{paid: Object[], unpaid: Object[], todayPaid: Object[],
   *            todayUnpaid: Object[], revenue: number, owed: number,
   *            method: Object}}
   */
  function payments(records) {
    var list = records || Halaq.bookings.all();
    var day = today();

    /* A missed booking is not a debt. Only a service that was actually
       delivered — or is being delivered — can be charged for. */
    var chargeable = list.filter(chargeableOnly);

    var paid = chargeable.filter(function (record) {
      return Halaq.bookings.isPaid(record);
    });

    var unpaid = chargeable.filter(function (record) {
      return !Halaq.bookings.isPaid(record);
    });

    return {
      paid: paid,
      unpaid: unpaid,
      todayPaid: paid.filter(function (record) {
        return record.date === day;
      }),
      todayUnpaid: unpaid.filter(function (record) {
        return record.date === day;
      }),
      revenue: total(paid),
      owed: total(unpaid),
      method: PAYMENT.onsite
    };
  }

  /**
   * Could this booking have been paid for at all?
   *
   * Cancelled and no-show have nothing to collect, so they are excluded from
   * both revenue and what is owed. One predicate, used by the payments screen,
   * the customers screen and the reports, because a booking that is debt on
   * one screen and not debt on another is the exact bug this file exists to
   * prevent.
   *
   * @param {Object} record
   * @returns {boolean}
   */
  function chargeableOnly(record) {
    return !MISSED[record.status];
  }

  /* =====================================================================
     Revenue

     One definition, used by the dashboard's sales tile, the payments screen
     and the reports page. It is the money actually taken — a booking marked
     paid — and never the sum of what finished services were priced at, which
     would report the whole day's takings before a single riyal had been
     counted.
     ===================================================================== */

  /**
   * The money actually collected from a set of records.
   * @param {Object[]} [records] defaults to the whole store
   * @returns {number}
   */
  function revenue(records) {
    return total((records || Halaq.bookings.all()).filter(function (record) {
      return chargeableOnly(record) && Halaq.bookings.isPaid(record);
    }));
  }

  /**
   * The money owed on a set of records: chargeable, and not yet collected.
   * @param {Object[]} [records] defaults to the whole store
   * @returns {number}
   */
  function owed(records) {
    return total((records || Halaq.bookings.all()).filter(function (record) {
      return chargeableOnly(record) && !Halaq.bookings.isPaid(record);
    }));
  }

  /**
   * The number of bills collected.
   * @param {Object[]} [records]
   * @returns {number}
   */
  function paidCount(records) {
    return (records || Halaq.bookings.all()).filter(function (record) {
      return chargeableOnly(record) && Halaq.bookings.isPaid(record);
    }).length;
  }

  /* =====================================================================
     Customers

     Derived, never stored. There is no customer record anywhere in this
     project, and adding one would be a second source of truth for facts the
     bookings already hold: a person is whoever has booked under this number.
     ===================================================================== */

  /**
   * Every customer, folded out of the booking record.
   *
   * Keyed on the mobile number, folded through fmt.digits, because that is the
   * one thing a returning customer is reliably identified by — and because the
   * same folding is what booking-store.findByPhone() already does. "050 111
   * 0001" and "٠٥٠١١١٠٠٠١" are one person.
   *
   * A booking with no usable number cannot be attributed to anybody, so it is
   * skipped rather than lumped into one nameless customer: a row called
   * "بدون جوال" with fourteen bookings is not information.
   *
   * @param {Object[]} [records] defaults to the whole store
   * @returns {Array<Object>}
   */
  function customers(records) {
    var list = records || Halaq.bookings.all();
    var groups = {};

    list.forEach(function (record) {
      var phone = fmt.digits(record.customer && record.customer.phone);
      if (!phone) return;

      if (!groups[phone]) {
        groups[phone] = {
          phone: phone,
          /* The latest spelling of the name wins. A record three weeks old
             should not rename somebody who has since fixed a typo. */
          name: record.customer.name || "",
          nameFrom: record.id,
          records: []
        };
      }

      var group = groups[phone];
      group.records.push(record);

      if (record.id > group.nameFrom) {
        group.name = record.customer.name || group.name;
        group.nameFrom = record.id;
      }
    });

    return Object.keys(groups).map(function (phone) {
      return summariseCustomer(groups[phone]);
    }).sort(function (a, b) {
      /* Most spending first, then most visits, then by name — so the customers
         a front desk should know about are at the top without being told to
         sort. */
      if (b.spent !== a.spent) return b.spent - a.spent;
      if (b.visits !== a.visits) return b.visits - a.visits;
      return a.name.localeCompare(b.name, "ar");
    });
  }

  /**
   * One customer's record, with the five things a front desk asks about them.
   *
   * The three counts are deliberately different, because conflating them is
   * the mistake this screen exists to prevent:
   *
   *   bookings  every booking ever, including cancelled and no-shows — it is
   *             what the customer did
   *   visits    bookings actually served — it is what the salon did
   *   spent     money actually collected, from paid bookings only. A service
   *             that was done and not paid for is not spending.
   *
   * @param {Object} group
   * @returns {Object}
   */
  function summariseCustomer(group) {
    var records = group.records.slice().sort(function (a, b) {
      return a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id - b.id;
    });

    var served = records.filter(function (record) {
      return SERVED[record.status];
    });

    var paid = records.filter(function (record) {
      return Halaq.bookings.isPaid(record);
    });

    /* Money still owed, on the same terms as `spent`: delivered or being
       delivered, and not collected. Cancelled and no-shows are skipped, so a
       missed appointment is never a debt. */
    var owed = records.filter(function (record) {
      return chargeableOnly(record) && !Halaq.bookings.isPaid(record);
    });

    var missed = records.filter(function (record) {
      return MISSED[record.status];
    });

    var last = served[served.length - 1] || null;
    var upcoming = records.filter(function (record) {
      return UPCOMING[record.status];
    }).sort(bySlot)[0] || null;

    return {
      phone: group.phone,
      name: group.name,
      bookings: records.length,
      visits: served.length,
      missed: missed.length,
      spent: total(paid),
      owed: total(owed),
      unpaidCount: owed.length,
      /* "Last visit" is the last time they were actually served, not the last
         time they booked. A booking three weeks out has not been a visit yet,
         and calling it one would be the one number on this screen that is
         simply wrong. */
      lastVisit: last ? last.date : "",
      lastVisitAt: last ? (last.date + " " + last.time) : "",
      /* Shown so a returning customer can be recognised at the desk, and
         flagged when they are expected again. */
      upcoming: upcoming,
      records: records
    };
  }

  /**
   * The day the salon is operating.
   * @returns {string} "YYYY-MM-DD"
   */
  function today() {
    return Halaq.bookings.demoDate();
  }

  /* =====================================================================
     Counting
     ===================================================================== */

  /**
   * Split records into the three buckets the headline numbers use.
   *
   * @param {Object[]} [records] defaults to the whole store
   * @returns {{today: Object[], upcoming: Object[], waiting: Object[],
   *            served: Object[], missed: Object[], inService: Object[]}}
   */
  function split(records) {
    var list = records || Halaq.bookings.all();
    var day = today();

    var out = {
      today: [], upcoming: [], waiting: [],
      served: [], missed: [], inService: []
    };

    list.forEach(function (record) {
      if (record.date === day) out.today.push(record);

      if (UPCOMING[record.status]) out.upcoming.push(record);
      else if (WAITING[record.status]) out.waiting.push(record);
      else if (SERVED[record.status]) out.served.push(record);
      else if (MISSED[record.status]) out.missed.push(record);
      else if (record.status === "in_service") out.inService.push(record);
    });

    return out;
  }

  /**
   * Sum of a set of records, skipping anything without a price so a malformed
   * record cannot quietly become revenue.
   *
   * @param {Object[]} records
   * @returns {number}
   */
  function total(records) {
    return records.reduce(function (sum, record) {
      return sum + (Number(record.price) || 0);
    }, 0);
  }

  /**
   * How long the people who are actually waiting have left, averaged.
   *
   * The store's estimate is zero for whoever is next and for the person in the
   * chair — correctly, since neither is waiting any more — so averaging those
   * in would drag the figure down to mean something it does not. Only
   * non-zero estimates are averaged, and a salon with nobody waiting reads
   * zero rather than a made-up figure.
   *
   * @param {Object[]} [records] the waiting set; defaults to all of them
   * @returns {number} minutes, rounded
   */
  function averageWait(records) {
    var waiting = records || split().waiting;

    var estimates = waiting
      .map(function (record) {
        return Halaq.bookings.estimateMinutes(record);
      })
      .filter(function (minutes) {
        return minutes > 0;
      });

    if (!estimates.length) return 0;

    return Math.round(estimates.reduce(function (a, b) {
      return a + b;
    }, 0) / estimates.length);
  }

  /**
   * Barbers who can take a customer right now.
   *
   * Two conditions, and both have to hold: on the team, and not out of shift.
   * Read from the admin roster rather than the demo file, so disabling someone
   * or moving them out of their shift changes this number immediately.
   *
   * @returns {{available: Object[], team: Object[], enabled: number}}
   */
  function barbers() {
    var team = (roster && roster.all ? roster.all() : Halaq.demoData.barbers) || [];
    var enabled = (roster && roster.active ? roster.active() : team) || team;

    return {
      team: team,
      enabled: enabled,
      available: enabled.filter(function (barber) {
        return roster ? roster.isAvailable(barber) : barber.status === "online";
      })
    };
  }

  /**
   * The average ticket on a set of paid records.
   * @param {Object[]} records
   * @returns {number}
   */
  function averageTicket(records) {
    if (!records.length) return 0;
    return Math.round(total(records) / records.length);
  }

  /* =====================================================================
     The eight headline numbers

     Two of them are counts of the same records on purpose and are told apart
     by scope: "الخدمات المكتملة" is the whole record, "المدفوعات" is what has
     been collected today. And two of them share the paid records but differ in
     unit, one being how many and the other how much. Both pairs say so in
     their hint, because a number without its scope is the easiest thing on a
     dashboard to misread.
     ===================================================================== */

  /**
   * @param {Object[]} [records]
   * @returns {Array} statCard descriptors, in reading order
   */
  function dashboardStats(records) {
    var parts = split(records);
    var team = barbers();

    var todayServed = parts.today.filter(function (record) {
      return SERVED[record.status];
    });

    /* Collected is its own fact, not "services finished today". A booking
       served ten minutes ago whose bill has not been taken is money owed, and
       the tile has to say the first thing rather than the flattering one. */
    var collectedToday = parts.today.filter(function (record) {
      return Halaq.bookings.isPaid(record);
    });

    var todayRevenue = total(collectedToday);
    var wait = averageWait(parts.waiting);

    return [
      {
        key: "today",
        label: "حجوزات اليوم",
        value: fmt.number(parts.today.length),
        num: true,
        icon: "calendar-check",
        tone: "brand",
        hint: parts.today.length
          ? fmt.dateShort(today())
          : "لا حجوزات على هذا اليوم"
      },
      {
        key: "upcoming",
        label: "الحجوزات القادمة",
        value: fmt.number(parts.upcoming.length),
        num: true,
        icon: "clock",
        tone: parts.upcoming.length ? "info" : "neutral",
        hint: parts.upcoming.length ? "مؤكدة ولم يحضر صاحبها" : "لا أحد في قائمة المجيء"
      },
      {
        key: "waiting",
        label: "العملاء المنتظرون",
        value: fmt.number(parts.waiting.length),
        num: true,
        icon: "hourglass",
        tone: parts.waiting.length ? "warning" : "neutral",
        hint: parts.waiting.length
          ? "بالانتظار على كل المسارات"
          : "الطابور فارغ"
      },
      {
        key: "served",
        label: "الخدمات المكتملة",
        value: fmt.number(parts.served.length),
        num: true,
        icon: "check-double",
        tone: parts.served.length ? "success" : "neutral",
        hint: parts.served.length ? "من كامل السجل" : "لم تبدأ بعد"
      },
      {
        key: "payments",
        label: "المدفوعات",
        value: fmt.number(collectedToday.length),
        num: true,
        icon: "credit-card",
        tone: collectedToday.length ? "success" : "neutral",
        hint: collectedToday.length
          ? "فواتير محصَّلة اليوم"
          : (todayServed.length ? "خدمات اليوم لم تُحصَّل بعد" : "لا تحصيل اليوم")
      },
      {
        key: "sales",
        label: "مبيعات اليوم",
        value: fmt.money(todayRevenue),
        icon: "banknote",
        tone: todayRevenue ? "success" : "neutral",
        hint: collectedToday.length
          ? "متوسط الفاتورة " + fmt.money(averageTicket(collectedToday))
          : "لا يُحتسب قبل التحصيل"
      },
      {
        key: "wait",
        label: "متوسط وقت الانتظار",
        value: wait ? fmt.number(wait) + " د" : "—",
        num: true,
        icon: "activity",
        tone: wait > 30 ? "danger" : (wait ? "info" : "neutral"),
        hint: wait ? "تقديري، لمن ينتظر الآن" : "لا أحد ينتظر"
      },
      {
        key: "barbers",
        label: "الحلاقون المتاحون",
        value: fmt.number(team.available.length) + " / " + fmt.number(team.team.length),
        num: true,
        icon: "users",
        tone: team.available.length ? "success" : "warning",
        hint: team.available.length ? "يستقبلون عملاء الآن" : "الفريق مشغول"
      }
    ];
  }

  /**
   * The status mix, so the landing view shows the seven-state vocabulary with
   * the same labels the customer sees. If these ever disagree with the
   * tracking page, a receptionist will be the one to notice.
   *
   * @param {Object[]} [records]
   * @returns {Array} statCard descriptors
   */
  function statusStats(records) {
    var counts = Halaq.bookings.counts();

    return Object.keys(Halaq.bookings.STATUS).map(function (key) {
      var info = Halaq.bookings.statusInfo(key);
      var count = counts[key] || 0;

      return {
        key: key,
        label: info.label,
        value: fmt.number(count),
        num: true,
        icon: info.icon,
        tone: count ? STATUS_TONE[key] : "neutral",
        hint: count ? "من الحجوزات" : "لا شيء"
      };
    });
  }

  /* =====================================================================
     Badge descriptors — data, so the same word and glyph always travel
     together and no view invents its own
     ===================================================================== */

  /**
   * @param {Object} record
   * @returns {{label: string, icon: string, tone: string, key: string}}
   */
  function statusBadge(record) {
    var info = Halaq.bookings.statusInfo(record.status);

    return {
      key: record.status,
      label: info.label,
      icon: info.icon,
      tone: STATUS_TONE[record.status] || "neutral"
    };
  }

  /**
   * @param {Object} record
   * @returns {{label: string, icon: string, tone: string, method: string}}
   */
  function paymentBadge(record) {
    var method = (record.payment && record.payment.method) || "onsite";
    var known = PAYMENT[method] || {
      label: "غير محدد",
      tone: "neutral",
      icon: "info"
    };

    return {
      method: method,
      label: known.label,
      icon: known.icon,
      tone: known.tone
    };
  }

  /**
   * Who a booking is with, or that the salon will decide.
   * @param {Object} record
   * @returns {{label: string, any: boolean, initials: string, id: string}}
   */
  function barberOf(record) {
    if (record.anyBarber || !record.barber) {
      return { label: "أي حلاق", any: true, initials: "؟", id: "any" };
    }

    var known = roster ? roster.get(record.barber.id) : null;
    var fromDemo = (Halaq.demoData.barbers || []).filter(function (barber) {
      return barber.id === record.barber.id;
    })[0];

    return {
      label: (known && known.name) || record.barber.name,
      any: false,
      id: record.barber.id,
      initials: (known && known.initials) ||
        (fromDemo && fromDemo.initials) ||
        (record.barber.name || "؟").slice(0, 1)
    };
  }

  /* =====================================================================
     The queue

     Grouped by barber rather than by the store's lane letter, because a lane
     is a queue ticket prefix while a barber is who the customer is actually
     waiting for — and because a barber added on the admin screen has no lane
     letter at all until the store is given one.
     ===================================================================== */

  /**
   * Front-desk order within a group: the slot, then the order booked.
   * @param {Object} a
   * @param {Object} b
   * @returns {number}
   */
  function bySlot(a, b) {
    return a.time.localeCompare(b.time) || a.id - b.id;
  }

  /**
   * Every live queue for today, one entry per barber plus one for the bookings
   * with no barber yet.
   *
   * "Live" is the store's own flag, so this is exactly the set the tracking
   * page treats as being in the salon: waiting, called, and in the chair.
   *
   * @returns {Array<Object>} lane views
   */
  function lanes() {
    var day = today();

    var live = Halaq.bookings.all().filter(function (record) {
      return record.date === day && Halaq.bookings.statusInfo(record.status).live;
    });

    var groups = {};

    live.forEach(function (record) {
      var who = barberOf(record);
      if (!groups[who.id]) groups[who.id] = [];
      groups[who.id].push(record);
    });

    return Object.keys(groups).map(function (key) {
      var records = groups[key].sort(bySlot);

      /* The chair is only "in_service". A customer who has been called is
         standing at the desk, not in it, so the two get their own slots: a
         lane that showed an empty chair while somebody was being waited on
         would be telling the front desk the wrong thing. */
      var serving = records.filter(function (record) {
        return record.status === "in_service";
      })[0] || null;

      var called = records.filter(function (record) {
        return record.status === "attended";
      })[0] || null;

      var waiting = records.filter(function (record) {
        return record.status === "waiting";
      });

      var who = barberOf(records[0]);

      return {
        id: key,
        any: who.any,
        name: who.any ? "أي حلاق" : who.label,
        initials: who.initials,
        /* the letter the customer was given, so the front desk can say it out
           loud and the customer can hear it */
        lane: records[0] ? records[0].queue.lane : "",
        serving: serving,
        called: called,
        next: waiting[0] || null,
        rest: waiting.slice(1),
        /* everyone queued at this barber: called plus still waiting */
        waitingCount: waiting.length + (called ? 1 : 0),
        estimateMinutes: waiting[0]
          ? Halaq.bookings.estimateMinutes(waiting[0])
          : 0
      };
    }).sort(function (a, b) {
      /* the shared lane last: it is the fallback, not a person waiting */
      if (a.any !== b.any) return a.any ? 1 : -1;
      return a.name.localeCompare(b.name, "ar");
    });
  }

  /**
   * Today's bookings that are still "confirmed" — booked, not yet arrived.
   *
   * They are not in any queue yet, so `lanes()` cannot show them, but they are
   * the people a receptionist is waiting for, and they are the only ones who
   * can be marked as having arrived.
   *
   * @returns {Object[]}
   */
  function expected() {
    var day = today();

    return Halaq.bookings.all().filter(function (record) {
      return record.date === day && record.status === "confirmed";
    }).sort(bySlot);
  }

  /**
   * The numbers the queue screen leads with.
   *
   * @returns {{lanes: number, serving: number, waiting: number,
   *            estimateMinutes: number, waitingNumber: string}}
   */
  function queueSummary() {
    var views = lanes();

    return {
      lanes: views.length,
      serving: views.filter(function (view) {
        return !!view.serving;
      }).length,
      waiting: views.reduce(function (sum, view) {
        return sum + view.waitingCount;
      }, 0),
      estimateMinutes: averageWait(split().waiting),
      /* the next name to be called, across every lane */
      waitingNumber: (function () {
        var next = views.map(function (view) {
          return view.next;
        }).filter(Boolean).sort(bySlot)[0];

        return next ? next.waitingNumber : "";
      })()
    };
  }

  admin.metrics = {
    today: today,
    split: split,
    total: total,
    averageWait: averageWait,
    averageTicket: averageTicket,
    barbers: barbers,
    lanes: lanes,
    expected: expected,
    queueSummary: queueSummary,
    payments: payments,
    paymentInfo: paymentInfo,
    customers: customers,
    revenue: revenue,
    owed: owed,
    paidCount: paidCount,
    chargeableOnly: chargeableOnly,
    bySlot: bySlot,
    dashboardStats: dashboardStats,
    statusStats: statusStats,
    statusBadge: statusBadge,
    paymentBadge: paymentBadge,
    barberOf: barberOf,

    STATUS_TONE: STATUS_TONE,
    PAYMENT: PAYMENT,
    UPCOMING: UPCOMING,
    WAITING: WAITING,
    SERVED: SERVED,
    MISSED: MISSED
  };
})(window.Halaq = window.Halaq || {});
