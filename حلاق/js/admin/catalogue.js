/* ==========================================================================
   Halaq — Admin service catalogue
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.catalogue

   The salon's price list, as the admin side is allowed to change it.

   A copy, not the demo file
   -------------------------
   Halaq.data.services is read by the public site — the menu, the booking
   flow's step 1, and the price a customer is quoted. So it is not mutated
   here, for the same reason and with the same seam as the roster: raising a
   price on the admin screen must not silently reprice the public menu before
   anyone has decided the menu should change. This is the editable copy; the
   public site keeps reading the original.

   Disabling is not deleting
   -------------------------
   A booking copies its service's price and name onto itself the moment it is
   issued, so old records survive an edit. But a booking still *points* at its
   service id, and that pointer is the only way to answer "how much did we
   take for this, and was it the thing we offered then". So:

     setEnabled  — take it off the menu. History intact. The right answer for
                   almost everything, and the only one available for a service
                   that has ever been booked.
     remove      — delete the record entirely. Only offered for a service with
                   no bookings against it, where there is nothing to orphan.

   Which barbers can take it
   -------------------------
   The relation lives on the barber, not here: each roster entry keeps its own
   `serviceIds[]`, because the booking flow already matches on it
   (`roster.canTake`) and two copies of one relation would drift. This screen
   writes through the roster rather than keeping a parallel list, so "which
   barbers do this service" and "which services can this barber do" cannot
   disagree.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var admin = Halaq.admin = Halaq.admin || {};

  var catalogue = null;
  var nextId = 1;

  /* The public site's icons are theirs to choose; a service added here has no
     icon of its own, and borrowing one from the sprite is better than
     inventing a symbol that would not resolve. */
  var FALLBACK_ICON = "scissors";

  /* Anything outside these bounds is a typo, not a price. A negative price
     would make the revenue tiles wrong in a way nobody would notice, and an
     absurd duration would quietly wreck every wait estimate on the queue. */
  var LIMITS = {
    price: { min: 0, max: 100000 },
    duration: { min: 5, max: 480 }
  };

  /**
   * Keep a number inside its range, and refuse nonsense outright.
   * @param {*} value
   * @param {{min: number, max: number}} limit
   * @param {number} fallback
   * @returns {number}
   */
  function clamp(value, limit, fallback) {
    var number = Number(value);

    if (!isFinite(number)) return fallback;

    return Math.min(limit.max, Math.max(limit.min, Math.round(number)));
  }

  /**
   * Copy the public catalogue into the editable one.
   * @returns {Object[]}
   */
  function seed() {
    var source = Halaq.demoData.services || [];

    catalogue = source.map(function (service) {
      /* The demo ids are words, so they contribute no number to the counter —
         a new service gets "service-1" and cannot collide with "hair-cut". */
      nextId = Math.max(nextId, (Number(String(service.id).replace(/\D/g, "")) || 0) + 1);

      return {
        id: service.id,
        name: service.name || "",
        description: service.description || "",
        category: service.category || "cut",
        price: clamp(service.price, LIMITS.price, 0),
        duration: clamp(service.duration, LIMITS.duration, 30),
        icon: service.icon || FALLBACK_ICON,
        enabled: true
      };
    });

    return catalogue;
  }

  function ensure() {
    if (!catalogue) seed();
    return catalogue;
  }

  /**
   * Every service, disabled ones last. Within that, by category in the
   * catalogue's own order, then by name — so a list reordered by a price edit
   * does not also reshuffle under the reader.
   * @returns {Object[]}
   */
  function all() {
    var order = categoryOrder();

    return ensure().slice().sort(function (a, b) {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;

      var ai = order.indexOf(a.category);
      var bi = order.indexOf(b.category);

      if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);

      return a.name.localeCompare(b.name, "ar");
    });
  }

  /**
   * Only the services the salon currently offers.
   * @returns {Object[]}
   */
  function active() {
    return all().filter(function (service) {
      return service.enabled;
    });
  }

  /**
   * @param {string} id
   * @returns {Object|null}
   */
  function get(id) {
    var wanted = String(id || "");

    return ensure().filter(function (service) {
      return service.id === wanted;
    })[0] || null;
  }

  /**
   * The categories, in the order the public menu uses them.
   *
   * Taken from the demo file rather than rebuilt, and with the "all" entry
   * dropped: it is a filter control on the public site, not somewhere a
   * service can be filed.
   *
   * @returns {Array<{id: string, label: string}>}
   */
  function categories() {
    return ((Halaq.demoData && Halaq.demoData.serviceCategories) || [])
      .filter(function (category) {
        return category.id !== "all";
      });
  }

  function categoryOrder() {
    return categories().map(function (category) {
      return category.id;
    });
  }

  /**
   * The name of a category, for a badge.
   * @param {string} id
   * @returns {string}
   */
  function categoryLabel(id) {
    var found = categories().filter(function (category) {
      return category.id === id;
    })[0];

    return found ? found.label : id || "—";
  }

  /**
   * Add a service to the list.
   *
   * No rating, no reviews, no usage count: those are things the salon earns,
   * and a new service has none of them yet.
   *
   * @param {Object} data
   * @returns {Object|null} the new service, or null if the name is empty
   */
  function add(data) {
    ensure();

    var name = String((data && data.name) || "").trim();
    if (!name) return null;

    var service = {
      id: "service-" + nextId,
      name: name,
      description: String((data && data.description) || "").trim(),
      category: (data && data.category) || "cut",
      price: clamp(data && data.price, LIMITS.price, 0),
      duration: clamp(data && data.duration, LIMITS.duration, 30),
      icon: FALLBACK_ICON,
      enabled: true
    };

    nextId += 1;
    catalogue.push(service);

    return service;
  }

  /**
   * Change an existing service. Only the fields the form owns are written, and
   * the id is never taken from the input.
   *
   * @param {string} id
   * @param {Object} data
   * @returns {Object|null} the updated service, or null if unknown
   */
  function update(id, data) {
    var service = get(id);
    if (!service) return null;

    var name = String((data && data.name) || "").trim();
    if (!name) return null;

    service.name = name;
    service.description = String((data && data.description) || "").trim();
    service.category = (data && data.category) || service.category;
    service.price = clamp(data && data.price, LIMITS.price, service.price);
    service.duration = clamp(data && data.duration, LIMITS.duration, service.duration);

    return service;
  }

  /**
   * Take a service off the menu, or put it back. Its history is untouched.
   *
   * @param {string} id
   * @param {boolean} enabled
   * @returns {Object|null}
   */
  function setEnabled(id, enabled) {
    var service = get(id);
    if (!service) return null;

    service.enabled = !!enabled;
    return service;
  }

  /**
   * How many bookings point at this service.
   *
   * A count rather than a boolean, because the screen shows it: "٣ حجوزات" is
   * the reason a service cannot be deleted, and hiding the reason makes a
   * disabled button look broken rather than explained.
   *
   * @param {string} id
   * @returns {number}
   */
  function bookingCount(id) {
    var wanted = String(id || "");

    return (Halaq.bookings.all() || []).filter(function (record) {
      return record.service && record.service.id === wanted;
    }).length;
  }

  /**
   * Delete a service outright.
   *
   * Refused while any booking refers to it, whatever the caller believes.
   * Deleting would leave those bookings pointing at nothing, and the payments
   * and customers screens both read the service name off the record.
   *
   * @param {string} id
   * @returns {{ok: boolean, service: (Object|null), reason: string}}
   */
  function remove(id) {
    var service = get(id);
    if (!service) return { ok: false, service: null, reason: "unknown" };

    var used = bookingCount(service.id);

    if (used) {
      return {
        ok: false,
        service: service,
        reason: "booked",
        count: used
      };
    }

    catalogue = ensure().filter(function (item) {
      return item.id !== service.id;
    });

    return { ok: true, service: service, reason: "" };
  }

  /**
   * The barbers who can take this service.
   *
   * Read from the roster, never from a list kept here.
   *
   * @param {string} serviceId
   * @returns {Object[]}
   */
  function barbersFor(serviceId) {
    var roster = admin.roster;
    if (!roster || !roster.active) return [];

    return roster.active().filter(function (barber) {
      return (barber.serviceIds || []).indexOf(serviceId) !== -1;
    });
  }

  /**
   * Set exactly which barbers take this service.
   *
   * Written through the roster, one barber at a time, so the relation has one
   * home. The enabled barbers are the ones that exist to be assigned; a
   * stopped barber keeps whatever they already had, because "not on the team"
   * is not the same question as "does not offer this service", and quietly
   * clearing a stopped barber's skills would lose information for when they
   * come back.
   *
   * @param {string} serviceId
   * @param {string[]} barberIds
   * @returns {Object[]} the barbers now assigned
   */
  function setBarbers(serviceId, barberIds) {
    var roster = admin.roster;
    if (!roster || !roster.active) return [];

    var wanted = (barberIds || []).map(String);
    var assigned = [];

    roster.active().forEach(function (barber) {
      var has = (barber.serviceIds || []).indexOf(serviceId) !== -1;
      var should = wanted.indexOf(barber.id) !== -1;

      if (has === should) {
        if (should) assigned.push(barber);
        return;
      }

      if (!roster.setServices) return;

      var ids = (barber.serviceIds || []).filter(function (id) {
        return id !== serviceId;
      });

      if (should) ids.push(serviceId);

      var saved = roster.setServices(barber.id, ids);
      if (saved && should) assigned.push(saved);
    });

    return assigned;
  }

  /**
   * Put the catalogue back to the public one. Demo-only, and used by the
   * audits to get a known state.
   * @returns {Object[]}
   */
  function reset() {
    nextId = 1;
    return seed();
  }

  admin.catalogue = {
    all: all,
    active: active,
    get: get,
    add: add,
    update: update,
    setEnabled: setEnabled,
    remove: remove,
    bookingCount: bookingCount,

    categories: categories,
    categoryLabel: categoryLabel,

    barbersFor: barbersFor,
    setBarbers: setBarbers,

    reset: reset,

    LIMITS: LIMITS,
    FALLBACK_ICON: FALLBACK_ICON
  };
})(window.Halaq = window.Halaq || {});
