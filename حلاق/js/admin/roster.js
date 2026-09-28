/* ==========================================================================
   Halaq — Admin roster
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.roster

   The salon's team, as the admin side is allowed to change it.

   Halaq.data.barbers is demo content and is deliberately not mutated: the
   public booking flow reads it, and a barber disabled on a Monday must not
   quietly vanish from the public site as a side effect of an admin click. So
   this is a separate, editable copy seeded from that file on first read, and
   everything inside the admin reads this one instead.

   Like the booking store it is in memory only: a reload goes back to the demo
   team. Swapping it for a client is one function, the same seam the rest of
   the project already has.

   Disabled is not the same as unavailable
   ---------------------------------------
   The two are separate on purpose, because a front desk needs both and
   confusing them makes a real roster untrustworthy:

     enabled  — is this person on the team at all? A disabled barber is kept
                for their history but cannot be assigned or appear in a queue.
     status   — right now, are they taking customers? A barber can be enabled
                and still be outside their shift.

   `status` therefore never implies `enabled`, and a disabled barber's status
   is left untouched.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var admin = Halaq.admin = Halaq.admin || {};

  /* =====================================================================
     The four states, as the front desk names them
     ===================================================================== */

  /* Every one has a word and a glyph, so the state is never colour alone. */
  var STATUS = {
    available: {
      label: "متاح",
      tone: "success",
      icon: "check-circle",
      short: "يستقبل عملاء"
    },
    busy: {
      label: "مشغول",
      tone: "warning",
      icon: "clock",
      short: "مع عميل الآن"
    },
    unavailable: {
      label: "غير متاح",
      tone: "danger",
      icon: "ban",
      short: "لا يستقبل في هذا الوقت"
    },
    off_shift: {
      label: "خارج الدوام",
      tone: "neutral",
      icon: "moon",
      short: "دوامه انتهى اليوم"
    }
  };

  var STATUS_ORDER = ["available", "busy", "unavailable", "off_shift"];

  /* The demo file's own three values, so seeding is a rename and not a
     guess. Anything unknown becomes "unavailable", never "available": saying
     a barber is free when the data does not say so is the wrong way to fail. */
  var SEED_STATUS = {
    online: "available",
    busy: "busy",
    offline: "unavailable"
  };

  /* =====================================================================
     The copy the admin edits
     ===================================================================== */

  var roster = null;
  var nextId = 1;

  /**
   * A barber's working hours, in the same shape the salon already publishes
   * its own: a list of day groups, so "الأحد – الخميس" is one row rather than
   * five identical ones.
   *
   * @param {Array} [source]
   * @returns {Array<{days: string, from: string, to: string, off: boolean}>}
   */
  function hours(source) {
    var list = source && source.length ? source : [
      { days: "الأحد – الخميس", from: "10:00", to: "20:00", off: false },
      { days: "الجمعة", from: "14:00", to: "20:00", off: false },
      { days: "السبت", from: "", to: "", off: true }
    ];

    return list.map(function (row) {
      return {
        days: String((row && row.days) || ""),
        from: String((row && row.from) || ""),
        to: String((row && row.to) || ""),
        off: !!(row && row.off)
      };
    });
  }

  /**
   * One line describing a schedule, so a card does not have to list rows.
   * @param {Object} barber
   * @returns {string}
   */
  function hoursSummary(barber) {
    var open = hours(barber.hours).filter(function (row) {
      return !row.off;
    });

    if (!open.length) return "بلا دوام محدد";

    return open.map(function (row) {
      return (row.days || "أيام") + ": " + row.from + " – " + row.to;
    }).join(" · ");
  }

  /**
   * Copy the demo team into the editable roster. Called on first read, and
   * again by reset().
   * @returns {Object[]}
   */
  function seed() {
    var team = Halaq.demoData.barbers || [];

    roster = team.map(function (barber) {
      var id = String(barber.id);

      nextId = Math.max(nextId, (Number(id.replace(/\D/g, "")) || 0) + 1);

      return {
        id: id,
        name: barber.name || "",
        title: barber.title || "",
        initials: barber.initials || (barber.name || "").slice(0, 1),
        yearsOfExperience: Number(barber.yearsOfExperience) || 0,
        rating: Number(barber.rating) || 0,
        reviewsCount: Number(barber.reviewsCount) || 0,
        status: SEED_STATUS[barber.status] || "unavailable",
        enabled: true,
        specialties: (barber.specialties || []).slice(),
        serviceIds: (barber.serviceIds || []).slice(),
        hours: hours(barber.hours)
      };
    });

    return roster;
  }

  function ensure() {
    if (!roster) seed();
    return roster;
  }

  /* =====================================================================
     Reading
     ===================================================================== */

  /**
   * Everyone, including the disabled. Order: enabled first, then by name.
   * @returns {Object[]}
   */
  function all() {
    return ensure().slice().sort(function (a, b) {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.name.localeCompare(b.name, "ar");
    });
  }

  /**
   * Only the people who can actually be given a customer.
   * @returns {Object[]}
   */
  function active() {
    return all().filter(function (barber) {
      return barber.enabled;
    });
  }

  /**
   * @param {string} id
   * @returns {Object|null}
   */
  function get(id) {
    var wanted = String(id || "");
    return ensure().filter(function (barber) {
      return barber.id === wanted;
    })[0] || null;
  }

  /**
   * The status descriptor, for a badge.
   * @param {string} status
   * @returns {{key: string, label: string, tone: string, icon: string, short: string}}
   */
  function statusInfo(status) {
    var known = STATUS[status];

    return known
      ? { key: status, label: known.label, tone: known.tone, icon: known.icon, short: known.short }
      : {
          key: status, label: "غير محدد", tone: "neutral",
          icon: "info", short: "حالة غير معروفة"
        };
  }

  /**
   * @param {string} id
   * @returns {Object} statusInfo for that barber, or the unknown descriptor
   */
  function statusOf(id) {
    var barber = get(id);
    return statusInfo(barber ? barber.status : "");
  }

  /**
   * Is this barber taking customers right now? Both conditions have to hold:
   * on the team, and not out of shift.
   *
   * @param {Object|string} barberOrId
   * @returns {boolean}
   */
  function isAvailable(barberOrId) {
    var barber = typeof barberOrId === "string" ? get(barberOrId) : barberOrId;
    if (!barber || !barber.enabled) return false;
    return barber.status === "available";
  }

  /**
   * Can this barber be given this service? The booking flow matches on
   * serviceIds, so the admin screen has to agree or the two would send a
   * customer somewhere the public site would not.
   *
   * @param {Object|string} barberOrId
   * @param {string} serviceId
   * @returns {boolean}
   */
  function canTake(barberOrId, serviceId) {
    var barber = typeof barberOrId === "string" ? get(barberOrId) : barberOrId;
    if (!barber) return false;
    return barber.serviceIds.indexOf(serviceId) !== -1;
  }

  /* =====================================================================
     Writing
     ===================================================================== */

  /**
   * An id no existing barber holds. The demo ids are words, so a counter would
   * collide with them; this prefixes to stay clear of both.
   * @returns {string}
   */
  function makeId() {
    var candidate;
    do {
      candidate = "barber-" + nextId;
      nextId += 1;
    } while (get(candidate));
    return candidate;
  }

  /**
   * Keep only known status values. A form that posts something unexpected must
   * not be able to invent a fifth state.
   *
   * @param {string} value
   * @param {string} fallback
   * @returns {string}
   */
  function safeStatus(value, fallback) {
    return STATUS[value] ? value : fallback;
  }

  /**
   * Add someone to the team.
   *
   * @param {Object} data
   * @returns {Object|null} the new record, or null if the name is empty
   */
  function add(data) {
    ensure();

    var name = String((data && data.name) || "").trim();
    if (!name) return null;

    var record = {
      id: makeId(),
      name: name,
      title: String((data && data.title) || "").trim(),
      initials: String((data && data.initials) || "").trim() || name.slice(0, 1),
      yearsOfExperience: Number(data && data.yearsOfExperience) || 0,
      /* A new barber has no reviews yet. Inventing a rating for someone who
         has never been reviewed would be the easiest lie on this screen. */
      rating: 0,
      reviewsCount: 0,
      status: safeStatus(data && data.status, "available"),
      enabled: true,
      specialties: ((data && data.specialties) || []).filter(Boolean),
      serviceIds: ((data && data.serviceIds) || []).filter(Boolean),
      hours: hours(data && data.hours)
    };

    roster.push(record);
    return record;
  }

  /**
   * Change an existing barber. Only the fields the form owns are written, and
   * the id is never taken from the input.
   *
   * @param {string} id
   * @param {Object} data
   * @returns {Object|null} the updated record, or null if unknown
   */
  function update(id, data) {
    var barber = get(id);
    if (!barber) return null;

    data = data || {};

    if (data.name !== undefined) {
      var name = String(data.name).trim();
      if (!name) return null;
      barber.name = name;
    }

    if (data.title !== undefined) barber.title = String(data.title).trim();
    if (data.yearsOfExperience !== undefined) {
      barber.yearsOfExperience = Number(data.yearsOfExperience) || 0;
    }
    if (data.initials !== undefined) {
      var initials = String(data.initials).trim();
      barber.initials = initials || barber.name.slice(0, 1);
    }
    if (data.status !== undefined) barber.status = safeStatus(data.status, barber.status);
    if (data.enabled !== undefined) barber.enabled = !!data.enabled;
    if (data.serviceIds !== undefined) {
      barber.serviceIds = (data.serviceIds || []).filter(Boolean);
    }
    if (data.specialties !== undefined) {
      barber.specialties = (data.specialties || []).filter(Boolean);
    }
    if (data.hours !== undefined) barber.hours = hours(data.hours);

    return barber;
  }

  /**
   * Replace this barber's set of services outright.
   *
   * Its own function rather than a call to update() because the services
   * screen edits one service at a time across several barbers, and a write
   * that could be refused for a missing name would be the wrong tool for it.
   * Here the only way to fail is an unknown barber.
   *
   * @param {string} id
   * @param {string[]} serviceIds
   * @returns {Object|null}
   */
  function setServices(id, serviceIds) {
    var barber = get(id);
    if (!barber) return null;

    barber.serviceIds = (serviceIds || []).filter(Boolean);
    return barber;
  }

  /**
   * Take someone off the team without losing their history. Their bookings are
   * left exactly as they are: a barber removed from the roster still served
   * the people who came in for them.
   *
   * @param {string} id
   * @param {boolean} enabled
   * @returns {Object|null}
   */
  function setEnabled(id, enabled) {
    var barber = get(id);
    if (!barber) return null;
    barber.enabled = !!enabled;
    return barber;
  }

  /**
   * @param {string} id
   * @param {string} status
   * @returns {Object|null}
   */
  function setStatus(id, status) {
    var barber = get(id);
    if (!barber) return null;
    barber.status = safeStatus(status, barber.status);
    return barber;
  }

  /**
   * Services this barber can take, for the checkbox list.
   *
   * Read from the admin catalogue when there is one, because a service added on
   * the services screen has to appear here or there would be a service the
   * salon offers that no barber can be assigned. The public file is only the
   * fallback, so this still works before the catalogue script has loaded.
   *
   * Only the entries that exist, in catalogue order, so the list does not jump
   * around as services are added elsewhere.
   *
   * @returns {Array<{id: string, name: string, category: string}>}
   */
  function serviceCatalogue() {
    var catalogue = admin.catalogue;
    var source = (catalogue && catalogue.all)
      ? catalogue.all()
      : (Halaq.demoData.services || []);

    return source.map(function (service) {
      return {
        id: service.id,
        name: service.name,
        category: service.category || ""
      };
    });
  }

  /**
   * Back to the demo team.
   */
  function reset() {
    roster = null;
    nextId = 1;
    ensure();
  }

  admin.roster = {
    all: all,
    active: active,
    get: get,
    add: add,
    update: update,
    setEnabled: setEnabled,
    setStatus: setStatus,
    setServices: setServices,
    isAvailable: isAvailable,
    canTake: canTake,
    statusInfo: statusInfo,
    statusOf: statusOf,
    serviceCatalogue: serviceCatalogue,
    hoursSummary: hoursSummary,
    hours: hours,
    reset: reset,

    STATUS: STATUS,
    STATUS_ORDER: STATUS_ORDER
  };
})(window.Halaq = window.Halaq || {});
