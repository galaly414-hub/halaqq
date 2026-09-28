/* ==========================================================================
   Halaq — Booking schedule (step 3)
   ---------------------------------------------------------------------------
   Renders the Arabic month calendar and the time-slot grid for a chosen
   service and barber.

   Availability is derived, not stored: a stable hash of
   (date + time + service + barber) decides whether a slot is taken, so the
   same slot always shows the same state no matter how often the grid is
   re-rendered. Real availability replaces hashFor() with an API lookup; every
   other function here stays as it is.

   Exposed as window.Halaq.bookingSchedule
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;

  // Cache for shop settings
  var shopSettingsCache = null;

  async function loadShopSettings() {
    if (shopSettingsCache) return shopSettingsCache;
    var { data, error } = await Halaq.supabase.db.shopSettings.get();
    if (!error && data) {
      shopSettingsCache = data;
    }
    return shopSettingsCache;
  }

  var rules = async function () {
    var settings = await loadShopSettings();
    if (settings) {
      return {
        week: [
          { open: settings.opening_time, close: settings.closing_time, closed: false },
          { open: settings.opening_time, close: settings.closing_time, closed: false },
          { open: settings.opening_time, close: settings.closing_time, closed: false },
          { open: settings.opening_time, close: settings.closing_time, closed: false },
          { open: settings.opening_time, close: settings.closing_time, closed: false },
          { open: settings.friday_opening_time, close: settings.friday_closing_time, closed: false },
          { closed: settings.saturday_closed }
        ],
        slotMinutes: settings.slot_minutes,
        windowDays: settings.booking_window_days,
        leadMinutes: settings.lead_minutes,
        bookedPercent: 38
      };
    }
    // Fallback to demo data
    return Halaq.data.availability || {};
  };

  /* Reference Sunday used to derive the Arabic weekday names. */
  var REFERENCE_SUNDAY = new Date(2026, 8, 27);

  /* =====================================================================
     Dates
     ===================================================================== */

  /**
   * Local-date key, "YYYY-MM-DD". toISOString() is deliberately avoided: it
   * converts to UTC first, which shifts the day for GMT+3 and later.
   * @param {Date} date
   * @returns {string}
   */
  function dateKey(date) {
    var month = String(date.getMonth() + 1);
    var day = String(date.getDate());

    return (
      date.getFullYear() +
      "-" + (month.length < 2 ? "0" + month : month) +
      "-" + (day.length < 2 ? "0" + day : day)
    );
  }

  /**
   * Midnight, local time, for a date key.
   * @param {string} key
   * @returns {Date}
   */
  function parseKey(key) {
    var parts = String(key).split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  /**
   * Start of today at midnight.
   * @returns {Date}
   */
  function today() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  /**
   * Arabic short weekday names, indexed by JS getDay() (0 = Sunday).
   * Derived from Intl so the order and spelling match the locale.
   * @returns {string[]}
   */
  var WEEKDAYS = (function () {
    var out = [];
    for (var i = 0; i < 7; i += 1) {
      out.push(
        new Intl.DateTimeFormat(fmt.LOCALE, { weekday: "short" }).format(
          new Date(
            REFERENCE_SUNDAY.getFullYear(),
            REFERENCE_SUNDAY.getMonth(),
            REFERENCE_SUNDAY.getDate() + i
          )
        )
      );
    }
    return out;
  })();

  /**
   * First weekday of the week for the active locale. 1 = Monday … 7 = Sunday
   * in the CLDR data, converted to the 0 = Sunday convention used by getDay().
   * @returns {number}
   */
  function firstDayOfWeek() {
    try {
      var locale = new Intl.Locale(fmt.LOCALE);
      var info = locale.getWeekInfo ? locale.getWeekInfo() : locale.weekInfo;
      if (info && info.firstDay) return info.firstDay % 7;
    } catch (error) {
      /* Older engines: fall through to the ar-EG default. */
    }
    return 6; /* السبت */
  }

  /**
   * "سبتمبر 2026" for a month.
   * @param {Date} date
   * @returns {string}
   */
  function monthLabel(date) {
    return new Intl.DateTimeFormat(fmt.LOCALE, {
      month: "long",
      year: "numeric"
    }).format(date);
  }

  /**
   * "الأحد 27 سبتمبر 2026" for a date key.
   * @param {string} key
   * @returns {string}
   */
  function fullLabel(key) {
    return fmt.dateLong(parseKey(key));
  }

  /* =====================================================================
     Opening hours
     ===================================================================== */

  /**
   * Minutes since midnight for an "HH:MM" string.
   * @param {string} value
   * @returns {number}
   */
  function toMinutes(value) {
    var parts = String(value || "0:0").split(":");
    return Number(parts[0]) * 60 + Number(parts[1] || 0);
  }

  /**
   * "HH:MM" from minutes since midnight.
   * @param {number} minutes
   * @returns {string}
   */
  function toClock(minutes) {
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    return (
      (hours < 10 ? "0" + hours : String(hours)) +
      ":" +
      (rest < 10 ? "0" + rest : String(rest))
    );
  }

  /**
   * The schedule for a weekday.
   * @param {number} weekday 0 = Sunday
   * @returns {Promise<Object>}
   */
  async function daySchedule(weekday) {
    var config = await rules();
    var week = (config.week || [])[weekday];
    return week || { closed: true };
  }

  /* =====================================================================
     Availability
     ===================================================================== */

  /**
   * Stable 32-bit hash. The demo stand-in for a real availability API.
   * @param {string} value
   * @returns {number}
   */
  function hashFor(value) {
    var hash = 2166136261;
    for (var i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash >>> 0;
  }

  /**
   * Is this date inside the booking horizon?
   * @param {Date} date
   * @returns {Promise<boolean>}
   */
  async function withinWindow(date) {
    var config = await rules();
    var start = today();
    var end = new Date(start);
    end.setDate(end.getDate() + (config.windowDays || 30));

    return date >= start && date <= end;
  }

  /**
   * Build the slot list for a date, service and barber.
   *
   * A slot is offered when the appointment fits inside opening hours; it is
   * then either free or already taken. Returns every slot with a `taken`
   * flag so the grid can show both, and `selectable` for the same reason.
   *
   * @param {string} key
   * @param {Object} service
   * @param {string} barberId
   * @returns {Promise<Object[]>}
   */
  async function slotsFor(key, service, barberId) {
    var date = parseKey(key);
    var schedule = await daySchedule(date.getDay());
    var out = [];

    if (schedule.closed || !(await withinWindow(date))) return out;

    var config = await rules();
    var step = config.slotMinutes || 30;
    var duration = (service && service.duration) || 30;
    var open = toMinutes(schedule.open);
    var close = toMinutes(schedule.close);
    var bookedPercent = config.bookedPercent == null ? 40 : config.bookedPercent;

    /* Slots starting before the lead time are in the past or too soon. */
    var earliest =
      Date.now() + (config.leadMinutes || 0) * 60000;
    var sameDay = key === dateKey(today());

    for (var minute = open; minute + duration <= close; minute += step) {
      var clock = toClock(minute);
      var startsAt = new Date(date);
      startsAt.setHours(0, minute, 0, 0);

      var tooSoon = sameDay && startsAt.getTime() < earliest;

      var taken =
        tooSoon ||
        hashFor(key + "|" + clock + "|" + (service ? service.id : "") + "|" + (barberId || "")) % 100 <
          bookedPercent;

      out.push({
        time: clock,
        taken: taken,
        selectable: !taken
      });
    }

    return out;
  }

  /**
   * A day reduced to what the calendar needs to draw it.
   * @param {Date} date
   * @param {Object} service
   * @param {string} barberId
   * @returns {Promise<Object>}
   */
  async function dayInfo(date, service, barberId) {
    var key = dateKey(date);
    var schedule = await daySchedule(date.getDay());
    var selectable = (await withinWindow(date)) && !schedule.closed;

    var slots = selectable ? await slotsFor(key, service, barberId) : [];
    var free = slots.filter(function (slot) {
      return slot.selectable;
    }).length;

    return {
      key: key,
      date: date,
      day: date.getDate(),
      isToday: key === dateKey(today()),
      closed: !!schedule.closed,
      outOfWindow: !(await withinWindow(date)),
      selectable: selectable && free > 0,
      free: free,
      total: slots.length
    };
  }

  /* =====================================================================
     Rendering
     ===================================================================== */

  /**
   * Screen-reader text for a day button, so the state is never conveyed by
   * colour or position alone.
   * @param {Object} info
   * @returns {string}
   */
  function dayLabel(info) {
    var label = fullLabel(info.key);

    if (info.closed) return label + " — مغلق";
    if (info.outOfWindow) return label;
    if (info.free === 0) return label + " — مكتمل";
    return label + " — " + fmt.number(info.free) + " موعد متاح";
  }

  /**
   * One day button.
   * @param {Object} info
   * @param {string} selectedKey
   * @returns {HTMLElement}
   */
  function dayButton(info, selectedKey) {
    var isSelected = info.key === selectedKey;

    var classes = ["calendar__day"];
    if (info.isToday) classes.push("is-today");
    if (isSelected) classes.push("is-selected");
    if (info.closed) classes.push("is-closed");
    if (info.outOfWindow) classes.push("is-outside");
    if (!info.closed && !info.outOfWindow && info.free === 0) classes.push("is-full");
    if (!info.selectable) classes.push("is-locked");

    var button = dom.el("button", {
      type: "button",
      class: classes.join(" "),
      "data-day": info.key,
      "aria-label": dayLabel(info),
      "aria-pressed": isSelected ? "true" : "false",
      "aria-current": info.isToday ? "date" : null,
      disabled: !info.selectable
    }, [
      dom.el("span", { class: "calendar__day-number num", text: fmt.number(info.day) }),
      info.isToday
        ? dom.el("span", { class: "calendar__day-today", text: "اليوم" })
        : null
    ]);

    /* Availability dot: a second, non-colour cue beside the number. */
    if (info.selectable) {
      button.appendChild(
        dom.el("span", {
          class: "calendar__day-dot",
          "aria-hidden": "true"
        })
      );
    }

    return button;
  }

  /**
   * Build the six-week grid for a month, padded with the neighbouring months'
   * days so the row height never changes.
   * @param {Date} month any date inside the month
   * @param {Object} service
   * @param {string} barberId
   * @param {string} selectedKey
   * @returns {Promise<HTMLElement>}
   */
  async function monthGrid(month, service, barberId, selectedKey) {
    var first = new Date(month.getFullYear(), month.getMonth(), 1);
    var startOffset = (first.getDay() - firstDayOfWeek() + 7) % 7;
    var start = new Date(first);
    start.setDate(start.getDate() - startOffset);

    var cells = [];
    for (var i = 0; i < 42; i += 1) {
      var date = new Date(start);
      date.setDate(start.getDate() + i);
      cells.push(await dayInfo(date, service, barberId));
    }

    return dom.el("div", { class: "calendar__grid", role: "grid" },
      cells.map(function (info) {
        return dom.el("div", { class: "calendar__cell", role: "gridcell" }, [
          dayButton(info, selectedKey)
        ]);
      })
    );
  }

  /**
   * Weekday header, ordered by the locale's first day of week.
   * @returns {HTMLElement}
   */
  function weekdayHeader() {
    var first = firstDayOfWeek();
    var labels = [];

    for (var i = 0; i < 7; i += 1) {
      labels.push(WEEKDAYS[(first + i) % 7]);
    }

    return dom.el("div", { class: "calendar__weekdays", "aria-hidden": "true" },
      labels.map(function (label) {
        return dom.el("span", { class: "calendar__weekday", text: label });
      })
    );
  }

  /**
   * Time-slot grid for a date. Unavailable slots stay visible but disabled.
   * @param {string} key
   * @param {Object} service
   * @param {string} barberId
   * @param {string} selectedTime
   * @returns {Promise<HTMLElement>}
   */
  async function slotGrid(key, service, barberId, selectedTime) {
    var slots = await slotsFor(key, service, barberId);

    if (!slots.length) {
      return dom.el("p", { class: "slots__empty" }, [
        dom.icon("info"),
        dom.el("span", { text: "لا توجد مواعيد في هذا اليوم. اختر يوماً آخر." })
      ]);
    }

    return dom.el(
      "div",
      { class: "slots__grid", role: "radiogroup", "aria-label": "اختر موعداً" },
      slots.map(function (slot) {
        var isSelected = slot.time === selectedTime;

        return dom.el("button", {
          type: "button",
          class:
            "slot" +
            (slot.selectable ? "" : " is-taken") +
            (isSelected ? " is-selected" : ""),
          "data-slot": slot.time,
          "aria-label": fmt.time(slot.time) +
            (slot.selectable ? " — متاح" : " — محجوز"),
          "aria-pressed": isSelected ? "true" : "false",
          disabled: !slot.selectable
        }, [dom.el("span", { class: "num", text: fmt.time(slot.time) })]);
      })
    );
  }

  /**
   * Availability legend, so the two slot states are named in words.
   * @returns {HTMLElement}
   */
  function slotLegend() {
    return dom.el("ul", { class: "slots__legend", role: "list" }, [
      dom.el("li", { class: "slots__legend-item" }, [
        dom.el("span", { class: "slot slot--sample is-free", "aria-hidden": "true" }, [
          dom.el("span", { class: "num", text: "10:00" })
        ]),
        dom.el("span", { text: "متاح" })
      ]),
      dom.el("li", { class: "slots__legend-item" }, [
        dom.el("span", { class: "slot slot--sample is-taken", "aria-hidden": "true" }, [
          dom.el("span", { class: "num", text: "10:30" })
        ]),
        dom.el("span", { text: "محجوز" })
      ])
    ]);
  }

  Halaq.bookingSchedule = {
    dateKey: dateKey,
    parseKey: parseKey,
    today: today,
    monthLabel: monthLabel,
    fullLabel: fullLabel,
    weekdayHeader: weekdayHeader,
    monthGrid: monthGrid,
    slotGrid: slotGrid,
    slotLegend: slotLegend,
    slotsFor: slotsFor,
    dayInfo: dayInfo,
    withinWindow: withinWindow,
    firstDayOfWeek: firstDayOfWeek,
    weekdayNames: WEEKDAYS
  };
})(window.Halaq = window.Halaq || {});
