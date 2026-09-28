/* ==========================================================================
   Halaq — Admin navigation model
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.nav

   One list of the nine sections, and every part of the shell reads it: the
   desktop sidebar, the tablet rail, the mobile drawer, the topbar title, and
   the router. Adding a section is one entry here, not nine edits.

   Order matters and is the order of work at the front desk: what is happening
   now first, what happened today next, and administration last.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  Halaq.admin = Halaq.admin || {};

  /* group: sidebar headings, so a nine-item list stays scannable */
  var SECTIONS = [
    {
      group: "اليوم",
      items: [
        {
          id: "dashboard",
          label: "لوحة التحكم",
          icon: "layout-dashboard",
          description: "نظرة عامة على اليوم: الحجوزات، الطابور، والإيرادات."
        },
        {
          id: "bookings",
          label: "الحجوزات",
          icon: "calendar-check",
          description: "كل الحجوزات، مع البحث والتصفية وتغيير الحالة."
        },
        {
          id: "queue",
          label: "الطابور",
          icon: "list",
          description: "من في الطابور الآن، ومن بعده، على كل مسار."
        }
      ]
    },

    {
      group: "الإدارة",
      items: [
        {
          id: "barbers",
          label: "الحلاقون",
          icon: "users",
          description: "الفريق، أوقات الدوام، ونسب كل حلاق."
        },
        {
          id: "services",
          label: "الخدمات",
          icon: "scissors",
          description: "قائمة الخدمات وأسعارها ومددها."
        },
        {
          id: "customers",
          label: "العملاء",
          icon: "contact",
          description: "سجل العملاء وزياراتهم السابقة وملاحظاتهم."
        },
        {
          id: "payments",
          label: "المدفوعات",
          icon: "banknote",
          description: "الفواتير والتحصيلات، كلها داخل الصالون."
        },
        {
          id: "reports",
          label: "التقارير",
          icon: "bar-chart",
          description: "الإيرادات وأداء الفريق عبر فترات."
        }
      ]
    },

    {
      group: "النظام",
      items: [
        {
          id: "settings",
          label: "الإعدادات",
          icon: "settings",
          description: "ساعات العمل، بيانات الصالون، الإشعارات، والصلاحيات."
        }
      ]
    }
  ];

  /* Flattened once, for the router and the keyboard command list. */
  var ALL = SECTIONS.reduce(function (list, group) {
    return list.concat(group.items);
  }, []);

  var BY_ID = ALL.reduce(function (index, item) {
    index[item.id] = item;
    return index;
  }, {});

  /* Shown in the topbar as the current place, and in the mobile drawer. */
  var DEFAULT_SECTION = "dashboard";

  /**
   * @param {string} id
   * @returns {Object|null}
   */
  function section(id) {
    return BY_ID[id] || null;
  }

  /**
   * Normalise anything that might identify a section — a hash, a query value,
   * a stale bookmark — down to one the router will accept.
   * @param {string} id
   * @returns {Object} always a real section, falling back to the dashboard
   */
  function resolve(id) {
    var key = String(id || "").replace(/^#/, "").trim();

    return BY_ID[key] || BY_ID[DEFAULT_SECTION];
  }

  /**
   * The href for a section. A hash, so the shell is a single page today and
   * real routes can replace it later without touching the markup.
   *
   * @param {string} id
   * @returns {string}
   */
  function href(id) {
    return "#" + (section(id) || BY_ID[DEFAULT_SECTION]).id;
  }

  Halaq.admin.nav = {
    SECTIONS: SECTIONS,
    ALL: ALL,
    DEFAULT: DEFAULT_SECTION,
    section: section,
    resolve: resolve,
    href: href
  };
})(window.Halaq = window.Halaq || {});
