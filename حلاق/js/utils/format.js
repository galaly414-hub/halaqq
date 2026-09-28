/* ==========================================================================
   Halaq — Formatting utilities
   Arabic-first: Arabic month and day names, Latin digits (used across the
   Gulf and most of the Arab world), and Arabic-Indic digits on request.
   Exposed as window.Halaq.format
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var LOCALE = "ar-EG-u-nu-latn";
  var CURRENCY = "ر.س";

  /**
   * Format a number using Arabic locale rules with Latin digits.
   * @param {number} value
   * @param {Object} [options]
   * @returns {string}
   */
  function number(value, options) {
    return new Intl.NumberFormat(LOCALE, options).format(value);
  }

  /**
   * Format a price with the currency suffix, e.g. "٧٥ ر.س".
   * @param {number} value
   * @returns {string}
   */
  function money(value) {
    return number(value) + " " + CURRENCY;
  }

  /**
   * Format a Date as a long Arabic date, e.g. "الأحد ١٢ يناير ٢٠٢٦".
   * @param {Date|string|number} value
   * @returns {string}
   */
  function dateLong(value) {
    return new Intl.DateTimeFormat(LOCALE, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(toDate(value));
  }

  /**
   * Format a Date as a short Arabic date, e.g. "١٢ يناير ٢٠٢٦".
   * @param {Date|string|number} value
   * @returns {string}
   */
  function dateShort(value) {
    return new Intl.DateTimeFormat(LOCALE, {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(toDate(value));
  }

  /**
   * Format a 24-hour time range, e.g. "٠٤:٣٠ م".
   * @param {string} time - "HH:MM"
   * @returns {string}
   */
  function time(time) {
    var parts = String(time).split(":");
    var date = new Date(2000, 0, 1, Number(parts[0]), Number(parts[1] || 0));

    return new Intl.DateTimeFormat(LOCALE, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(date);
  }

  /**
   * Human-readable relative time, e.g. "قبل ٣ أيام".
   * @param {Date|string|number} value
   * @returns {string}
   */
  function relative(value) {
    var date = toDate(value);
    var diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
    var units = [
      { unit: "year", ms: 31536000 },
      { unit: "month", ms: 2592000 },
      { unit: "day", ms: 86400 },
      { unit: "hour", ms: 3600 },
      { unit: "minute", ms: 60 }
    ];

    var formatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

    for (var i = 0; i < units.length; i += 1) {
      if (Math.abs(diffSeconds) >= units[i].ms) {
        return formatter.format(
          Math.round(diffSeconds / units[i].ms),
          units[i].unit
        );
      }
    }

    return formatter.format(diffSeconds, "second");
  }

  /**
   * Coerce a value into a Date.
   *
   * A bare "YYYY-MM-DD" is read as local midnight rather than handed to the
   * Date constructor, which reads it as UTC. That difference is invisible at
   * UTC+0 and a whole day out behind it: every date key in this project is a
   * calendar day, so in any timezone west of Greenwich the queue would show
   * yesterday, the reports would name the wrong peak day, and the booking
   * confirmation would disagree with the calendar the customer read. Full
   * timestamps and anything else still go through the constructor unchanged.
   *
   * @param {Date|string|number} value
   * @returns {Date}
   */
  function toDate(value) {
    if (value instanceof Date) return value;

    var key = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value == null ? "" : value).trim());

    if (key) {
      return new Date(Number(key[1]), Number(key[2]) - 1, Number(key[3]));
    }

    return new Date(value);
  }

  /**
   * Join truthy parts with an Arabic comma.
   * @param {...string} parts
   * @returns {string}
   */
  function join() {
    return Array.prototype.slice
      .call(arguments)
      .filter(Boolean)
      .join("، ");
  }

  /* Arabic-Indic and Eastern Arabic digits are common on Saudi and Gulf
     keyboards, so any number a customer types has to be folded before it can
     be compared with a stored one. */
  var DIGIT_MAP = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9"
  };

  /**
   * Fold Arabic-Indic digits to Latin and drop the spacing people type around
   * numbers, so one comparison covers every way a number can be written:
   * "050 123 4567", "+966 50 123 4567" and "٠٥٠١٢٣٤٥٦٧" all reduce alike.
   *
   * @param {string|number} value
   * @returns {string} Latin digits only
   */
  function digits(value) {
    return String(value == null ? "" : value)
      .replace(/[٠-٩۰-۹]/g, function (digit) {
        return DIGIT_MAP[digit] || digit;
      })
      .replace(/[\s\-().]/g, "");
  }

  Halaq.format = {
    LOCALE: LOCALE,
    CURRENCY: CURRENCY,
    number: number,
    money: money,
    dateLong: dateLong,
    dateShort: dateShort,
    time: time,
    relative: relative,
    toDate: toDate,
    join: join,
    digits: digits
  };
})(window.Halaq = window.Halaq || {});
