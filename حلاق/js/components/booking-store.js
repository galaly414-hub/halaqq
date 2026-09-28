/* ==========================================================================
   Halaq — Confirmed bookings (Supabase-backed)
   ---------------------------------------------------------------------------
   This module now uses Supabase for all data operations.
   The in-memory cache is kept for UI responsiveness, but all writes go to
   Supabase via RPC functions and direct table queries.
   Exposed as window.Halaq.bookings
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var fmt = Halaq.format;

  var STATUS = {
    confirmed: {
      label: "مؤكد",
      icon: "check-circle",
      note: "حجزك مؤكد. سننتظرك في الموعد.",
      live: false
    },
    waiting: {
      label: "في الانتظار",
      icon: "hourglass",
      note: "أنت في قائمة الانتظار. تابع رقم دورك من هنا.",
      live: true
    },
    attended: {
      label: "حضر",
      icon: "user-check",
      note: "تم تسجيل حضورك، وفي انتظار دورك.",
      live: true
    },
    in_service: {
      label: "جاري الخدمة",
      icon: "razor",
      note: "بدأت الخدمة الآن.",
      live: true
    },
    done: {
      label: "مكتمل",
      icon: "check-double",
      note: "تمت الخدمة. شكراً لزيارتك.",
      live: false
    },
    cancelled: {
      label: "ملغي",
      icon: "ban",
      note: "هذا الحجز ملغي. للحجز من جديد افتح صفحة الحجز.",
      live: false
    },
    no_show: {
      label: "لم يحضر",
      icon: "user-x",
      note: "لم يُسجَّل حضورك في موعده. يمكنك الحجز من جديد.",
      live: false
    }
  };

  var QUEUEING = { waiting: true, attended: true, in_service: true };

  var PAYMENT_NOTE = "الدفع يتم داخل الصالون بعد تقديم الخدمة.";

  var DEFAULT_SERVICE_MINUTES = 30;

  var records = [];
  var listeners = [];

  function notify() {
    listeners.forEach(function (fn) { fn(records); });
  }

  function mapBooking(b) {
    return {
      id: b.id,
      bookingNumber: b.booking_number,
      waitingNumber: b.waiting_number,
      status: b.booking_status,
      createdAt: b.created_at,
      service: {
        id: b.services?.id,
        name: b.services?.name_ar,
        price: b.price_snapshot,
        duration: b.duration_snapshot
      },
      barber: b.barbers ? { id: b.barbers.id, name: b.barbers.name } : null,
      anyBarber: !b.barber_id,
      date: b.booking_date,
      time: b.start_time,
      customer: {
        name: b.customers?.full_name,
        phone: b.customers?.mobile,
        email: b.customers?.email
      },
      price: b.price_snapshot,
      duration: b.duration_snapshot,
      payment: {
        method: "onsite",
        note: PAYMENT_NOTE,
        paid: b.payment_status === "مدفوع",
        paidAt: b.payment_paid_at || ""
      },
      queue: {
        lane: b.queue_entries?.[0]?.lane || "D",
        position: b.queue_entries?.[0]?.position || 0,
        ahead: b.queue_entries?.[0]?.ahead || 0,
        date: b.booking_date
      }
    };
  }

  function sortNewestFirst(a, b) {
    return new Date(b.createdAt) - new Date(a.createdAt);
  }

  /* One load, one signal, and the signal fires whether the load worked or not.

     The fetch, the query and the mapping are untouched — only the notification
     moved. A listener that repaints on this needs to hear about a failure as
     much as a success: if a screen waits for this signal to draw itself, staying
     quiet on an error would leave it on its loading state for good, which is the
     worst possible reading of "the network is down".

     The throw case is caught rather than allowed out, because a rejected load
     is the same event as a returned error and used to leave the caller with an
     unhandled rejection and no signal at all. */
  async function refreshFromSupabase() {
    var failure = "";

    try {
      var result = await Halaq.supabase.db.bookings.getAll();

      if (!result || result.error) {
        failure = (result && result.error && result.error.message) || "";
      } else if (result.data) {
        records = result.data.map(mapBooking).sort(sortNewestFirst);
      }
    } catch (error) {
      /* A throw is as much a failed load as a returned error, and used to leave
         the caller with an unhandled rejection and no signal at all. */
      failure = (error && error.message) || "";
    } finally {
      settled = true;
      loadError = failure;
      notify();
    }

    return records;
  }

  function getFromCache(bookingNumber) {
    var wanted = fmt.digits(bookingNumber).toUpperCase();
    return records.filter(function (item) {
      return fmt.digits(item.bookingNumber).toUpperCase() === wanted;
    })[0] || null;
  }

  function isQueueing(record) {
    return !!QUEUEING[record.status];
  }

  function laneQueue(record) {
    return records
      .filter(function (item) {
        return item.queue.lane === record.queue.lane &&
          item.date === record.date &&
          isQueueing(item);
      })
      .sort(function (a, b) {
        return a.time.localeCompare(b.time) || a.id - b.id;
      });
  }

  function nowServing(record) {
    var queue = laneQueue(record);
    var serving = queue.filter(function (item) { return item.status === "in_service"; })[0];
    return serving || queue[0] || null;
  }

  function peopleAhead(record) {
    if (!isQueueing(record)) return 0;
    var queue = laneQueue(record);
    var index = queue.map(function (item) { return item.id; }).indexOf(record.id);
    return index === -1 ? 0 : index;
  }

  function averageServiceMinutes(record) {
    var sameLane = records.filter(function (item) {
      return item.queue.lane === record.queue.lane && item.date === record.date;
    });
    if (!sameLane.length) return DEFAULT_SERVICE_MINUTES;
    var total = sameLane.reduce(function (sum, item) {
      return sum + (item.duration || DEFAULT_SERVICE_MINUTES);
    }, 0);
    return Math.round(total / sameLane.length);
  }

  function estimateMinutes(record) {
    if (!isQueueing(record)) return 0;
    if (record.status === "in_service") return 0;
    var ahead = peopleAhead(record);
    if (!ahead) return 0;
    return Math.max(5, Math.round((ahead * averageServiceMinutes(record)) / 5) * 5);
  }

  function track(record) {
    var serving = nowServing(record);
    var ahead = peopleAhead(record);
    var minutes = estimateMinutes(record);
    return {
      record: record,
      status: statusInfo(record.status),
      waitingNumber: record.waitingNumber,
      lane: record.queue.lane,
      nowServing: serving ? serving.waitingNumber : "",
      nowServingIsYou: !!serving && serving.id === record.id,
      peopleAhead: ahead,
      estimateMinutes: minutes,
      positionInLane: laneQueue(record).map(function (item) { return item.id; }).indexOf(record.id) + 1,
      queueLength: laneQueue(record).length
    };
  }

  function statusLabel(status) {
    return (STATUS[status] || {}).label || status;
  }

  function statusInfo(status) {
    return STATUS[status] || { label: status, icon: "info", note: "", live: false };
  }

  async function add(input) {
    var result = await Halaq.supabase.rpc.createBooking({
      customerName: input.customer.name,
      customerMobile: input.customer.phone,
      customerEmail: input.customer.email || "",
      serviceId: input.serviceId,
      barberId: input.barberId === "any" ? null : input.barberId,
      bookingDate: input.date,
      startTime: input.time
    });

    if (result.error || !result.data?.success) {
      throw new Error(result.error?.message || result.data?.error || "فشل في إنشاء الحجز");
    }

    await refreshFromSupabase();
    return getFromCache(result.data.booking.bookingNumber);
  }

  async function setStatus(bookingNumber, status) {
    var record = getFromCache(bookingNumber);
    if (!record) return null;

    var { error } = await Halaq.supabase.db.bookings.updateStatus(record.id, status);
    if (!error) {
      await refreshFromSupabase();
      return getFromCache(bookingNumber);
    }
    return null;
  }

  async function setPaid(bookingNumber, paid) {
    var record = getFromCache(bookingNumber);
    if (!record) return null;

    if (paid && record.payment.paid) return record;
    if (!paid && !record.payment.paid) return record;

    var result = await Halaq.supabase.rpc.markPaymentPaid(record.id);
    if (result.error || !result.data?.success) {
      return null;
    }

    await refreshFromSupabase();
    return getFromCache(bookingNumber);
  }

  function isPaid(recordOrNumber) {
    var record = typeof recordOrNumber === "string" ? getFromCache(recordOrNumber) : recordOrNumber;
    if (!record || !record.payment) return false;
    return !!record.payment.paid;
  }

  function verify(bookingNumber, phone) {
    var wantedNumber = fmt.digits(bookingNumber).toUpperCase();
    var wantedPhone = fmt.digits(phone);

    if (!wantedNumber || !wantedPhone) {
      return { ok: false, reason: "incomplete", record: null };
    }

    var record = getFromCache(wantedNumber);
    if (!record) return { ok: false, reason: "mismatch", record: null };
    if (fmt.digits(record.customer.phone) !== wantedPhone) {
      return { ok: false, reason: "mismatch", record: null };
    }

    return { ok: true, reason: "", record: record };
  }

  function onChange(handler) {
    listeners.push(handler);
    return function () {
      listeners = listeners.filter(function (fn) { return fn !== handler; });
    };
  }

  async function seedDemoIfEmpty() {
    var { data } = await Halaq.supabase.db.bookings.getAll();
    if (data && data.length > 0) return records;
    return refreshFromSupabase();
  }

  /* =====================================================================
     The day

     Three functions, and they are here rather than spread across the admin
     because four screens ask the same two questions — "which day is today" and
     "what was the day before that" — and four separate answers would be four
     chances for the queue, the dashboard, the reports period picker and the
     customers list to disagree about which day they are looking at.

     The salon is shut on Saturdays, so daysAgo() steps over that day rather
     than landing on it. "The last 7 days" has to mean the last 7 days it
     actually traded: a range that starts on a morning nobody worked would
     compare a full week against one missing a trading day, and that difference
     stays invisible until somebody believes the report.
     ===================================================================== */

  var CLOSED_WEEKDAY = 6;

  /* Whether the first load has come back, either way.

     Exposed because a subscriber can easily register too late. The initial load
     starts at the bottom of this file, and a cached or instant answer can land
     before another module has finished booting — a listener attached after the
     signal has already gone would then wait for one that never arrives, and a
     screen that draws itself on the signal would sit on its loading state for
     good. */
  var settled = false;

  /* Why the last load came back empty-handed, or "" when it did not.

     Tracked rather than inferred from an empty store, because an empty store is
     a legitimate state — a shop with nothing booked — and a failed load is not.
     Conflating them means a network fault is shown to the user as "no
     bookings today", which is the one thing an empty figure must never imply. */
  var loadError = "";

  /**
   * A local "YYYY-MM-DD" key.
   *
   * Assembled from the local parts rather than through toISOString(), because
   * toISOString() converts to UTC first: in any timezone behind Greenwich that
   * turns a late-evening booking into the *next* day, and every "today" figure
   * in the admin would then be a day out — with the queue, the reports and the
   * booking list all confidently agreeing on the wrong day.
   *
   * @param {Date} date
   * @returns {string}
   */
  function dayKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  /**
   * The day the salon is operating.
   *
   * The name is historical — this used to return a fixed day from the demo
   * file. It now returns the real current day, and the call sites are left
   * alone so the contract every module already depends on is unchanged.
   *
   * @returns {string} "YYYY-MM-DD"
   */
  function demoDate() {
    return dayKey(new Date());
  }

  /**
   * The key `steps` trading days before today.
   *
   * @param {number} [steps]
   * @returns {string} "YYYY-MM-DD"
   */
  function daysAgo(steps) {
    var total = Math.max(0, Math.floor(Number(steps) || 0));
    if (!total) return demoDate();

    /* Midday, so a daylight-saving shift part-way through the walk cannot move
       the result onto the wrong calendar day. */
    var probe = new Date();
    probe.setHours(12, 0, 0, 0);
    probe.setDate(probe.getDate() - total);

    /* Bounded rather than unguarded: a fortnight of closed Saturdays is plenty
       of headroom, and a loop that cannot run away is worth more than one that
       handles a pathological clock. */
    for (var guard = 0; probe.getDay() === CLOSED_WEEKDAY && guard < 31; guard += 1) {
      probe.setDate(probe.getDate() - 1);
    }

    return dayKey(probe);
  }

  function setPaymentNote(note) {
    var trimmed = String(note == null ? "" : note).replace(/\s+/g, " ").trim();
    if (trimmed) PAYMENT_NOTE = trimmed;
    return PAYMENT_NOTE;
  }

  Halaq.bookings = {
    add: add,
    setStatus: setStatus,
    setPaid: setPaid,
    isPaid: isPaid,
    setPaymentNote: setPaymentNote,
    all: function () { return records.slice().sort(sortNewestFirst); },
    get: getFromCache,
    on: function (dateKey) {
      return records
        .filter(function (item) { return !dateKey || item.date === dateKey; })
        .sort(function (a, b) { return a.time.localeCompare(b.time) || a.id - b.id; });
    },
    findByPhone: function (phone) {
      var wanted = fmt.digits(phone);
      return records.filter(function (item) { return fmt.digits(item.customer.phone) === wanted; });
    },
    counts: function () {
      return records.reduce(function (tally, item) {
        tally[item.status] = (tally[item.status] || 0) + 1;
        return tally;
      }, {});
    },
    verify: verify,
    track: track,
    laneRecords: laneQueue,
    nowServing: nowServing,
    peopleAhead: peopleAhead,
    estimateMinutes: estimateMinutes,
    averageServiceMinutes: averageServiceMinutes,
    statusLabel: statusLabel,
    statusInfo: statusInfo,
    demoDate: demoDate,
    daysAgo: daysAgo,
    seedDemoIfEmpty: seedDemoIfEmpty,
    refresh: refreshFromSupabase,
    onChange: onChange,
    isSettled: function () {
      return settled;
    },
    loadError: function () {
      return loadError;
    },
    STATUS: STATUS,
    PAYMENT_NOTE: PAYMENT_NOTE,
    CLOSED_WEEKDAY: CLOSED_WEEKDAY
  };

  // Initial load
  refreshFromSupabase();
})(window.Halaq = window.Halaq || {});