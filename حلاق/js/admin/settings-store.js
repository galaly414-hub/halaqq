/* ==========================================================================
   Halaq — Admin settings store
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.config

   The salon's own configuration, as data.

   Why a store and not a form
   --------------------------
   The brief for the settings screen was that nothing on it may be hardcoded
   text. A form with strings typed into the markup is hardcoded text wearing a
   form's clothes: change the file and you have changed the salon, and there is
   nowhere to record that a value was ever deliberately set. So the values live
   here, the screen only edits them, and everything that displays them reads
   from the same data objects.

   Who sees a saved change
   -----------------------
   In the admin, immediately: the shell lockup, the settings preview and the
   booking calendar all read Halaq.data, and applyToRuntime writes there.

   On the public site, not. Those pages render the same objects, but they do not
   load this file, and nothing here reaches a server, so a saved change lives in
   one browser's localStorage. Adding this store to the public pages would not
   fix that — it would make the settings of whoever happened to open the site
   last look like the salon's official hours to every customer, which is a worse
   lie than the demo data being unchanged. Real propagation needs an API.

   Defaults are *seeded from* the data files rather than retyped
   -----------------------------------------------------------
   Halaq.data.brand and Halaq.data.availability are demo content written by
   hand. Copying their values into a DEFAULTS literal here would give two
   sources of truth and guarantee they drift. So DEFAULTS is assembled by
   reading them, and the demo files stay the single description of "what this
   salon looks like before anybody changes anything".

   Applying
   --------
   save() writes to localStorage *and* patches the running objects, so a change
   to the shop name moves the sidebar in the same tick. A settings screen whose
   save button only updates its own preview is a settings screen that lies.

   localStorage rather than sessionStorage, unlike the sign-in session: an
   operator setting their working hours expects them to still be set tomorrow.
   Both the read and the write are wrapped, because Safari's private mode throws
   on setItem and a settings screen that crashes the admin shell is worse than
   one that forgets a change.

   What this cannot do
   -------------------
   None of it reaches a server, so none of it is enforced anywhere except this
   browser. A real deployment writes these through an authenticated API and the
   calendar, the booking rules and the closing days are validated again on the
   server. See the same warning at the top of auth.js.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var fmt = Halaq.format;
  var admin = Halaq.admin = Halaq.admin || {};

  var STORAGE_KEY = "halaq.admin.settings";

  /* Matches the weekday order used by Halaq.data.availability.week, where 0 is
     Sunday, and by the demo store's own day arithmetic. */
  var DAY_NAMES = [
    "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"
  ];

  /* Every bound is written next to the field it guards, because a number typed
     into a settings screen is a number somebody will eventually type wrong. */
  var LIMITS = {
    name: { min: 2, max: 60 },
    tagline: { min: 0, max: 90 },
    year: { min: 1900, max: new Date().getFullYear() },
    initials: { max: 4 },
    phone: { min: 9, max: 15 },
    slotMinutes: { min: 5, max: 240 },
    windowDays: { min: 1, max: 365 },
    leadMinutes: { min: 0, max: 1440 },
    cancellationHours: { min: 0, max: 168 },
    copy: { max: 400 }
  };

  /* The glyphs offered for the logo placeholder. A short, deliberate list from
     the existing sprite rather than all 78: a picker of 78 identical-looking
     boxes is not a picker, and every icon here is already on the page. */
  var GLYPHS = [
    { id: "scissors", label: "مقصّات" },
    { id: "crown", label: "تاج" },
    { id: "razor", label: "شفرة" },
    { id: "comb", label: "مشط" },
    { id: "layers", label: "طبقات" },
    { id: "star", label: "نجمة" },
    { id: "award", label: "وسام" },
    { id: "heart", label: "قلب" },
    { id: "gift", label: "هدية" },
    { id: "sparkles", label: "بريق" },
    { id: "droplet", label: "قطرة" },
    { id: "home", label: "بيت" },
    { id: "users", label: "فريق" },
    { id: "banknote", label: "نقود" }
  ];

  /* =====================================================================
     Defaults, read out of the demo data
     ===================================================================== */

  /**
   * A structural copy.
   *
   * Settings are plain objects and arrays of strings, numbers and booleans, so
   * a hand-written walk is both exact and cheap. The point is that the caller
   * gets something it may edit freely without the original moving underneath
   * it — which is what keeps the SEED snapshot below trustworthy.
   *
   * @param {*} value
   * @returns {*}
   */
  function clone(value) {
    if (Array.isArray(value)) {
      return value.map(clone);
    }

    if (value && typeof value === "object") {
      var out = {};
      Object.keys(value).forEach(function (key) {
        out[key] = clone(value[key]);
      });
      return out;
    }

    return value;
  }

  /**
   * The salon as it is before anybody opens the settings screen.
   *
   * Only ever called once, at load, to take the snapshot below. Reading the
   * demo data on every call would be circular: applyToRuntime writes the applied
   * settings back into exactly these objects, so a later call would hand back
   * whatever the last save produced and "back to the demo values" would restore
   * the operator's own edits instead of the demo's.
   *
   * @returns {Object}
   */
  function seed() {
    var brand = Halaq.data.brand || {};
    var availability = Halaq.data.availability || {};
    var hero = Halaq.data.hero || {};

    return {
      shop: {
        name: brand.name || "",
        latinName: brand.latinName || "",
        tagline: brand.tagline || "",
        establishedYear: brand.establishedYear || LIMITS.year.min
      },

      /* A placeholder, not an upload: there is no file handling in this demo
         and no server to receive one. A glyph plus a short text mark is the
         whole of it, and the screen says so rather than showing a button that
         would do nothing. */
      logo: {
        glyph: "scissors",
        initials: ""
      },

      contact: {
        phone: brand.phone || "",
        whatsapp: brand.whatsapp || "",
        email: brand.email || "",
        city: brand.city || "",
        district: brand.district || "",
        address: brand.address || "",
        mapUrl: brand.mapUrl || ""
      },

      hours: normaliseWeek(
        availability.week || [],
        brand.hours || []
      ),

      rules: {
        slotMinutes: availability.slotMinutes || 30,
        windowDays: availability.windowDays || 30,
        leadMinutes: availability.leadMinutes || 60,
        cancellationHours: 0,
        requirePhone: true,
        allowAnyBarber: true
      },

      public: {
        eyebrow: hero.eyebrow || "",
        title: hero.title || "",
        titleAccent: hero.titleAccent || "",
        description: hero.description || "",
        about: brand.description || "",
        paymentNote: Halaq.bookings.PAYMENT_NOTE || ""
      }
    };
  }

  /* Taken before anything applies, because applyToRuntime() writes the applied
     settings back into Halaq.data.brand and Halaq.data.availability — the very
     objects seed() reads. Snapshotting here, once, is what keeps "back to the
     demo values" meaning the demo values rather than the last saved edit. */
  var SEED = seed();

  /**
   * @returns {Object} a fresh copy of the demo configuration
   */
  function defaults() {
    return clone(SEED);
  }

  /**
   * The machine-readable week, filled out to seven days.
   *
   * The demo file lists one entry per day already, but a settings screen that
   * assumes that will crash on a config with three rows, so the shape is
   * forced here rather than trusted.
   *
   * @param {Array} week
   * @param {Array} display  brand.hours, used only to recover open/close for a
   *                         day the machine-readable list did not cover
   * @returns {Array<{open: string, close: string, closed: boolean}>}
   */
  function normaliseWeek(week, display) {
    var rows = week || [];
    var fallback = expandDisplay(display);
    var out = [];

    for (var day = 0; day < 7; day += 1) {
      var row = rows[day] || {};
      var line = fallback[day] || null;

      out.push({
        open: row.open || (line && line.open) || "10:00",
        close: row.close || (line && line.close) || "22:00",
        closed: !!(row.closed || (line && line.closed))
      });
    }

    /* A day listed as closed has no hours that mean anything, and leaving a
       stale pair in place is how "closed, 10:00 to 22:00" ends up on the
       public site. */
    out.forEach(function (row) {
      if (row.closed) {
        row.open = "";
        row.close = "";
      }
    });

    return out;
  }

  /**
   * brand.hours, expanded from its grouped lines to one entry per weekday.
   *
   * It is three lines — "الأحد – الخميس", "الجمعة", "السبت" — not seven, and
   * treating it as seven is the bug this function exists to prevent. Reading
   * `display[2]` for Tuesday picks up Saturday's "مغلق" and quietly closes the
   * middle of the salon's week, which is the kind of mistake that only shows up
   * as a customer saying the calendar was wrong.
   *
   * @param {Array<{days: string, time: string}>} display
   * @returns {Array<Object|null>} indexed by weekday
   */
  function expandDisplay(display) {
    var out = [];

    (display || []).forEach(function (line) {
      var span = expandDays(line.days);
      if (!span.length) return;

      var closed = line.time === "مغلق";
      var range = closed ? [null, null] : parseRange(line.time);

      span.forEach(function (day) {
        if (out[day]) return;

        out[day] = {
          closed: closed,
          open: range[0] || "",
          close: range[1] || ""
        };
      });
    });

    return out;
  }

  /**
   * "الأحد – الخميس" -> [0, 1, 2, 3, 4]. Wraps at the end of the week, so a
   * range written the other way round still resolves.
   *
   * @param {string} label
   * @returns {number[]}
   */
  function expandDays(label) {
    var parts = String(label || "").split(/[–—-]/).map(function (part) {
      return part.trim();
    });

    var first = DAY_NAMES.indexOf(parts[0]);
    if (first === -1) return [];

    if (parts.length === 1) return [first];

    var last = DAY_NAMES.indexOf(parts[1]);
    if (last === -1) return [];

    var out = [];
    for (var day = first; ; day = (day + 1) % 7) {
      out.push(day);
      if (day === last) break;
    }

    return out;
  }

  /**
   * "10:00 – 22:00" -> ["10:00", "22:00"]. A one-off for recovering hours from
   * the display copy; returns nulls rather than throwing on a shape it does
   * not recognise.
   * @param {string} value
   * @returns {Array<string>}
   */
  function parseRange(value) {
    var parts = String(value || "").split(/[–—\-]/);
    var a = (parts[0] || "").trim();
    var b = (parts[1] || "").trim();

    return [isTime(a) ? a : null, isTime(b) ? b : null];
  }

  /* =====================================================================
     Validation
     ===================================================================== */

  /**
   * @param {string} value
   * @returns {boolean}
   */
  function isTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
  }

  /**
   * "0501234567" -> "966501234567", the shape a tel: and a wa.me link need.
   *
   * A stored Saudi local number keeps its 0; a number that already carries a
   * country code is left alone, because prefixing 966 to one would make the
   * link dial a country that does not exist.
   *
   * @param {string} value
   * @returns {string} digits only, possibly with a leading +
   */
  function international(value) {
    var digits = fmt.digits(value);
    if (!digits) return "";

    if (digits.indexOf("00") === 0) return "+" + digits.slice(2);
    if (digits.indexOf("+") === 0) return "+" + digits.slice(1);
    if (digits.indexOf("966") === 0) return "+" + digits;
    if (digits.indexOf("0") === 0) return "+966" + digits.slice(1);

    return "+966" + digits;
  }

  function text(value, max) {
    return String(value == null ? "" : value)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  /**
   * Check a whole settings object.
   *
   * Returns a map of field name to message, keyed by the form field's `name`
   * so a screen can put each message on its own field rather than in one lump
   * at the bottom. An empty object means it is good.
   *
   * @param {Object} settings
   * @returns {Object<string, string>}
   */
  function validate(settings) {
    var bad = {};

    var name = text(settings.shop && settings.shop.name, LIMITS.name.max);
    if (name.length < LIMITS.name.min) {
      bad["shop.name"] = "اسم الصالون مطلوب، " + LIMITS.name.min + " أحرف على الأقل.";
    }

    if (settings.shop && Number(settings.shop.establishedYear) > LIMITS.year.max) {
      bad["shop.establishedYear"] = "السنة يجب أن تكون " + LIMITS.year.max + " أو أقل.";
    }

    if (settings.contact) {
      var phone = fmt.digits(settings.contact.phone);

      if (phone && (phone.length < LIMITS.phone.min || phone.length > LIMITS.phone.max)) {
        bad["contact.phone"] = "رقم الجوال بين " + LIMITS.phone.min + " و" +
          LIMITS.phone.max + " رقماً.";
      }

      if (settings.contact.requirePhoneNotEmpty && !phone) {
        bad["contact.phone"] = "رقم الجوال مطلوب، والعميل يتواصل به.";
      }

      var email = text(settings.contact.email, 120);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        bad["contact.email"] = "البريد الإلكتروني غير صحيح.";
      }
    }

    /* An open day whose hours run backwards produces a calendar with no slots
       at all and no error anywhere, which is the failure mode most likely to
       be discovered by a customer. */
    (settings.hours || []).forEach(function (row, day) {
      if (row.closed) return;

      if (!isTime(row.open)) bad["hours." + day + ".open"] = "وقت فتح غير صحيح.";
      if (!isTime(row.close)) bad["hours." + day + ".close"] = "وقت إغلاق غير صحيح.";

      if (isTime(row.open) && isTime(row.close) && row.open >= row.close) {
        bad["hours." + day + ".close"] =
          "الإغلاق بعد الفتح، وإلا لن يعرض التقويم أي موعد في " + DAY_NAMES[day] + ".";
      }
    });

    var rules = settings.rules || {};

    if (Number(rules.slotMinutes) < LIMITS.slotMinutes.min ||
        Number(rules.slotMinutes) > LIMITS.slotMinutes.max) {
      bad["rules.slotMinutes"] = "مدة الموعد بين " + LIMITS.slotMinutes.min +
        " و" + LIMITS.slotMinutes.max + " دقيقة.";
    }

    if (Number(rules.windowDays) < LIMITS.windowDays.min ||
        Number(rules.windowDays) > LIMITS.windowDays.max) {
      bad["rules.windowDays"] = "أفق الحجز بين " + LIMITS.windowDays.min +
        " و" + LIMITS.windowDays.max + " يوماً.";
    }

    if (Number(rules.leadMinutes) < LIMITS.leadMinutes.min ||
        Number(rules.leadMinutes) > LIMITS.leadMinutes.max) {
      bad["rules.leadMinutes"] = "مدة الإشعار بين " + LIMITS.leadMinutes.min +
        " و" + LIMITS.leadMinutes.max + " دقيقة.";
    }

    if (Number(rules.cancellationHours) < LIMITS.cancellationHours.min ||
        Number(rules.cancellationHours) > LIMITS.cancellationHours.max) {
      bad["rules.cancellationHours"] = "مهلة الإلغاء بين " +
        LIMITS.cancellationHours.min + " و" + LIMITS.cancellationHours.max + " ساعة.";
    }

    if (settings.public && !text(settings.public.title, LIMITS.copy.max)) {
      bad["public.title"] = "العنوان الرئيسي مطلوب، فهو أول ما يراه العميل.";
    }

    if (settings.logo) {
      var initials = text(settings.logo.initials, LIMITS.initials.max);
      if (initials && initials.length > LIMITS.initials.max) {
        bad["logo.initials"] = "حرفان أو ثلاثة على الأكثر.";
      }
    }

    return bad;
  }

  /* =====================================================================
     Storage
     ===================================================================== */

  function read() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function write(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * The live settings.
   *
   * Defaults merged under whatever was stored, one level deep per group, so a
   * setting added to DEFAULTS in a later version appears for an operator who
   * saved before it existed rather than coming back as undefined.
   *
   * @returns {Object}
   */
  function get() {
    var base = defaults();
    var stored = read();

    if (!stored) return base;

    var out = { shop: {}, logo: {}, contact: {}, hours: [], rules: {}, public: {} };

    Object.keys(base).forEach(function (group) {
      var fallback = base[group];
      var saved = stored[group];

      if (Array.isArray(fallback)) {
        out[group] = (Array.isArray(saved) && saved.length === 7) ? saved : fallback;
        return;
      }

      out[group] = {};
      Object.keys(fallback).forEach(function (key) {
        out[group][key] = (saved && saved[key] !== undefined) ? saved[key] : fallback[key];
      });
    });

    return out;
  }

  /**
   * The settings as they stand, with nothing saved. Exposed so the screen can
   * offer "back to the demo values" and so the tests have a known state.
   * @returns {Object}
   */
  function factoryDefaults() {
    return defaults();
  }

  /* =====================================================================
     Applying — the reason this is a store and not a form
     ===================================================================== */

  /**
   * The display copy for brand.hours, rebuilt from the machine-readable week.
   *
   * Consecutive days that share the same hours are folded into one line, so a
   * salon open the same time six days a week shows one line rather than six.
   * This is the pairing availability.js's own comment asks a human to keep in
   * step by hand; here it cannot fall out of step.
   *
   * @param {Array} week
   * @returns {Array<{days: string, time: string}>}
   */
  function hoursDisplay(week) {
    var rows = week || [];
    var out = [];

    for (var day = 0; day < 7; day += 1) {
      var row = rows[day] || { closed: true };
      var time = row.closed ? "مغلق" : row.open + " – " + row.close;
      var last = out[out.length - 1];

      if (last && last.time === time) {
        last.to = day;
        continue;
      }

      out.push({ from: day, to: day, time: time });
    }

    /* Closed days are not merged across a gap. Saturday shut and Tuesday shut
       are two separate facts, and joining them would print "الثلاثاء – السبت =
       مغلق" on the public site — claiming Wednesday to Friday are shut directly
       beneath two lines that say they are open. Consecutive closed days have
       already folded in the loop above; anything reaching here is a genuine
       gap and is reported as the separate runs it is. */
    return out.map(function (line) {
      var days = line.from === line.to
        ? DAY_NAMES[line.from]
        : DAY_NAMES[line.from] + " – " + DAY_NAMES[line.to];

      return { days: days, time: line.time };
    });
  }

  /**
   * Push the settings into the objects the rest of the app already reads.
   *
   * @param {Object} settings
   * @returns {Object} the same settings, for chaining
   */
  function applyToRuntime(settings) {
    var value = settings || get();

    var brand = Halaq.data.brand;
    var demo = Halaq.demoData;

    if (brand) {
      brand.name = value.shop.name;
      brand.latinName = value.shop.latinName || value.shop.name;
      brand.tagline = value.shop.tagline;
      brand.establishedYear = Number(value.shop.establishedYear);
      brand.description = value.public.about;

      brand.phone = value.contact.phone;
      brand.phoneHref = "tel:" + international(value.contact.phone);
      brand.whatsapp = value.contact.whatsapp || value.contact.phone;
      brand.whatsappHref = "https://wa.me/" +
        international(value.contact.whatsapp || value.contact.phone).replace("+", "");
      brand.email = value.contact.email;
      brand.city = value.contact.city;
      brand.district = value.contact.district;
      brand.address = value.contact.address;
      brand.mapUrl = value.contact.mapUrl;

      /* The social link to WhatsApp has to follow the number, or the settings
         screen would change the number and leave a link dialling the old one. */
      (brand.social || []).forEach(function (item) {
        if (item.icon === "whatsapp") item.href = brand.whatsappHref;
      });

      brand.hours = hoursDisplay(value.hours);
    }

    if (demo && demo.brand && demo.brand !== brand) demo.brand = brand;

    var availability = Halaq.data.availability;
    if (availability) {
      /* A closed day is written as `{ closed: true }` with no hours, the shape
         Halaq.data.availability and booking-schedule.js both use. Filling in
         "10:00 to 22:00" for a day the salon is shut leaves a pair of times
         that contradict the closed flag sitting right beside them. */
      availability.week = value.hours.map(function (row) {
        if (row.closed) return { closed: true };

        return {
          open: row.open || "10:00",
          close: row.close || "22:00",
          closed: false
        };
      });
      availability.slotMinutes = Number(value.rules.slotMinutes);
      availability.windowDays = Number(value.rules.windowDays);
      availability.leadMinutes = Number(value.rules.leadMinutes);
    }

    if (demo && demo.hero) {
      demo.hero.eyebrow = value.public.eyebrow;
      demo.hero.title = value.public.title;
      demo.hero.titleAccent = value.public.titleAccent;
      demo.hero.description = value.public.description;
    }

    /* The note is copied onto a booking when it is made, so this only reaches
       new bookings. The screen says so; pretending otherwise would be a lie
       a customer would catch. */
    if (Halaq.bookings.setPaymentNote) {
      Halaq.bookings.setPaymentNote(value.public.paymentNote);
    }

    return value;
  }

  /* =====================================================================
     Writing
     ===================================================================== */

  /**
   * Validate, then store, then apply.
   *
   * Nothing is written when validation fails, which is the whole point of
   * checking first: a half-saved config with an unopenable Saturday is worse
   * than no change at all.
   *
   * @param {Object} next
   * @returns {{ok: boolean, settings: (Object|null), errors: Object}}
   */
  function save(next) {
    var errors = validate(next);

    if (Object.keys(errors).length) {
      return { ok: false, settings: null, errors: errors };
    }

    var stored = write(next);
    applyToRuntime(next);

    /* Announced on the document rather than through a callback list, so the
       shell can redraw the brand lockup without this file knowing the shell
       exists. */
    try {
      document.dispatchEvent(new CustomEvent("halaq:settings", { detail: next }));
    } catch (e) {
      /* An environment without CustomEvent still gets the applied settings;
         only the live redraw is missed. */
    }

    if (!stored) {
      return {
        ok: true,
        settings: next,
        errors: {},
        persisted: false
      };
    }

    return { ok: true, settings: next, errors: {}, persisted: true };
  }

  /**
   * Throw the stored config away and go back to the demo values.
   * @returns {Object} the restored settings
   */
  function reset() {
    var base = defaults();

    write(base);
    applyToRuntime(base);

    try {
      document.dispatchEvent(new CustomEvent("halaq:settings", { detail: base }));
    } catch (e) {}

    return base;
  }

  /* Applied on load, before anything reads a brand name, so the admin shell
     opens showing the configured salon rather than the demo one. */
  applyToRuntime(get());

  admin.config = {
    get: get,
    save: save,
    reset: reset,
    validate: validate,
    defaults: factoryDefaults,
    applyToRuntime: applyToRuntime,
    hoursDisplay: hoursDisplay,
    international: international,
    isTime: isTime,

    STORAGE_KEY: STORAGE_KEY,
    DAY_NAMES: DAY_NAMES,
    LIMITS: LIMITS,
    GLYPHS: GLYPHS
  };
})(window.Halaq = window.Halaq || {});
