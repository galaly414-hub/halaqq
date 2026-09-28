/* ==========================================================================
   Halaq — Admin shell
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.shell

   Builds the frame every admin screen sits in: the sidebar, the topbar, and
   the mobile drawer, then routes between the nine sections.

   One set of markup serves all three sizes. The difference is CSS alone:
     >= 64rem   the sidebar is a fixed column on the right (RTL start edge)
     <  64rem   it collapses to a 64px icon rail, labels on hover
     <  48rem   it becomes a drawer that slides in from the right, and the
                sidebar markup is moved into a <dialog> so the browser traps
                focus and Escape closes it for free

   Moving the node rather than duplicating it is the whole trick: a section's
   link is one element, so "is this the current page?" is answered once, by the
   router, and never by two lists drifting apart.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var admin = Halaq.admin;

  var nav = admin.nav;
  var auth = admin.auth;
  var ui = admin.ui;

  /* Below this the sidebar is a rail; below MOBILE_BREAKPOINT it is a drawer.
     Both values are mirrored as custom properties on :root by the stylesheet,
     so JS and CSS cannot disagree about where the change happens. */
  var MOBILE_FALLBACK = 48 * 16;

  var state = {
    section: null,
    drawerOpen: false,
    railPinned: true,
    onRoute: null
  };

  /* =====================================================================
     Sidebar
     ===================================================================== */

  /**
   * The brand lockup and the nine sections, grouped.
   *
   * @param {Object} user
   * @returns {HTMLElement}
   */
  function sidebar(user) {
    /* The lockup names the configured salon, not the demo one. Read through the
       settings store so an operator who renamed the shop sees their name in
       the shell, and so the string appears in exactly one place in the project
       instead of once per screen that happens to draw a brand. */
    var brand = admin.config.get();

    return dom.el("div", { class: "sidebar__inner" }, [
      dom.el("a", { class: "sidebar__brand", href: "index.html" }, [
        dom.el("span", { class: "sidebar__brand-mark", "aria-hidden": "true" }, [
          dom.icon(brand.logo.glyph || "scissors")
        ]),
        dom.el("span", { class: "sidebar__brand-text" }, [
          dom.el("span", {
            class: "sidebar__brand-name",
            "data-brand-name": "",
            text: brand.shop.name || "الصالون"
          }),
          dom.el("span", { class: "sidebar__brand-sub", text: "لوحة الإدارة" })
        ])
      ]),

      dom.el("nav", {
        class: "sidebar__nav",
        "aria-label": "أقسام لوحة الإدارة"
      }, nav.SECTIONS.map(function (group) {
        return dom.el("div", { class: "sidebar__group" }, [
          dom.el("h2", { class: "sidebar__group-title", text: group.group }),

          dom.el("ul", { class: "sidebar__list" }, group.items
            /* A link the user may not open is not drawn. It is still only a
               courtesy — the API behind these screens must refuse it too. */
            .filter(function (item) {
              return auth.can(item.id, user);
            })
            .map(function (item) {
              return dom.el("li", { class: "sidebar__item" }, [
                dom.el("a", {
                  class: "sidebar__link",
                  href: nav.href(item.id),
                  /* The visible label is clipped away in the rail, and the
                     hover chip is drawn from this. The rail is the only
                     place a bare icon is shown, so the title has to be
                     there. */
                  title: item.label,
                  "data-section": item.id
                }, [
                  dom.el("span", { class: "sidebar__icon" }, [dom.icon(item.icon)]),
                  dom.el("span", { class: "sidebar__label", text: item.label }),
                  dom.el("span", { class: "sidebar__badge", "data-count-for": item.id })
                ])
              ]);
            }))
        ]);
      })),

      dom.el("div", { class: "sidebar__foot" }, [
        dom.el("a", { class: "sidebar__site-link", href: "../index.html" }, [
          dom.icon("home", "icon--sm"),
          dom.el("span", { text: "عرض الموقع" })
        ])
      ])
    ]);
  }

  /* =====================================================================
     Topbar
     ===================================================================== */

  /**
   * @param {Object} user
   * @returns {HTMLElement}
   */
  function topbar(user) {
    return dom.el("div", { class: "topbar__inner" }, [
      /* The one control that changes the sidebar. On a desktop it pins and
         unpins the rail; on a mobile it opens the drawer. Same button, both
         jobs, because a person should not have to learn two of them. */
      dom.el("button", {
        type: "button",
        class: "topbar__toggle",
        "data-action": "toggle-sidebar",
        "aria-label": "طيّ القائمة الجانبية",
        "aria-expanded": "true",
        "aria-controls": "admin-sidebar"
      }, [dom.icon("menu", "icon--lg")]),

      dom.el("div", { class: "topbar__context" }, [
        dom.el("h1", {
          class: "topbar__title",
          "data-current-section": "",
          text: nav.resolve(nav.DEFAULT).label
        }),
        dom.el("p", {
          class: "topbar__date num",
          text: fmt.dateLong(new Date())
        })
      ]),

      dom.el("div", { class: "topbar__actions" }, [
        dom.el("div", { class: "topbar__search" }, [
          dom.el("span", { class: "input-group" }, [
            dom.el("span", { class: "input-group__icon" }, [dom.icon("search", "icon--sm")]),
            dom.el("label", { class: "sr-only", for: "admin-global-search", text: "بحث سريع" }),
            dom.el("input", {
              class: "input input--search",
              id: "admin-global-search",
              type: "search",
              placeholder: "بحث سريع…"
            }),
            dom.el("kbd", { class: "topbar__kbd", "aria-hidden": "true", text: "/" })
          ])
        ]),

        dom.el("button", {
          type: "button",
          class: "topbar__icon-btn",
          "data-action": "notifications",
          "aria-label": "الإشعارات"
        }, [
          dom.icon("bell", "icon--lg"),
          dom.el("span", { class: "topbar__dot", "aria-hidden": "true" })
        ]),

        userMenu(user)
      ])
    ]);
  }

  /**
   * The account menu. A <details> rather than a scripted dropdown, so it opens,
   * closes and reports its own expanded state without any of that being
   * reimplemented here.
   *
   * @param {Object} user
   * @returns {HTMLElement}
   */
  function userMenu(user) {
    return dom.el("details", { class: "usermenu", "data-usermenu": "" }, [
      dom.el("summary", { class: "usermenu__trigger" }, [
        dom.el("span", { class: "usermenu__avatar", "aria-hidden": "true", text: user.initials }),
        dom.el("span", { class: "usermenu__name" }, [
          dom.el("span", { class: "usermenu__name-main", text: user.name }),
          dom.el("span", { class: "usermenu__name-role", text: user.title })
        ]),
        dom.icon("chevron-down", "icon--sm usermenu__chevron")
      ]),

      dom.el("div", { class: "usermenu__panel" }, [
        dom.el("div", { class: "usermenu__head" }, [
          dom.el("p", { class: "usermenu__head-name", text: user.name }),
          dom.el("p", { class: "usermenu__head-meta" }, [
            dom.el("span", { text: "@" }),
            dom.el("span", { class: "num", text: user.username })
          ]),
          ui.badge({
            label: user.title,
            icon: auth.can("settings", user) ? "shield-check" : "user",
            tone: auth.can("settings", user) ? "brand" : "info"
          })
        ]),

        dom.el("ul", { class: "usermenu__list" }, [
          /* The same permission filter the sidebar uses. Listing a link that
             would bounce is worse than leaving it out. */
          nav.ALL.filter(function (item) {
            return item.id === "settings" && auth.can(item.id, user);
          }).map(function (item) {
            return dom.el("li", {}, [
              dom.el("a", {
                class: "usermenu__item",
                href: nav.href(item.id),
                "data-section": item.id
              }, [
                dom.icon(item.icon, "icon--sm"),
                dom.el("span", { text: item.label })
              ])
            ]);
          }),

          dom.el("li", {}, [
            dom.el("a", { class: "usermenu__item", href: "../index.html" }, [
              dom.icon("home", "icon--sm"),
              dom.el("span", { text: "عرض الموقع" })
            ])
          ]),

          dom.el("li", {}, [
            dom.el("button", {
              type: "button",
              class: "usermenu__item usermenu__item--danger",
              "data-action": "logout"
            }, [
              dom.icon("log-out", "icon--sm"),
              dom.el("span", { text: "تسجيل الخروج" })
            ])
          ])
        ])
      ])
    ]);
  }

  /* =====================================================================
     Mobile drawer

     The sidebar node is moved into this <dialog> on small screens and back on
     large ones, rather than a second copy being kept in sync.
     ===================================================================== */

  function drawer() {
    return dom.el("dialog", {
      class: "drawer",
      id: "admin-drawer",
      "data-admin-drawer": "",
      "aria-label": "قائمة التنقل"
    }, [
      dom.el("div", { class: "drawer__panel" }, [
        dom.el("div", { class: "drawer__head" }, [
          dom.el("p", { class: "drawer__title", text: "الأقسام" }),
          dom.el("button", {
            type: "button",
            class: "topbar__icon-btn",
            "data-action": "close-drawer",
            "aria-label": "إغلاق القائمة"
          }, [dom.icon("close", "icon--lg")])
        ]),

        /* The sidebar lands here, and only on small screens. */
        dom.el("div", { class: "drawer__body", "data-drawer-body": "" })
      ])
    ]);
  }

  /* =====================================================================
     Routing
     ===================================================================== */

  /**
   * Mark one section current, everywhere it appears. There are up to three
   * links per section — sidebar, drawer copy, topbar — and they must never
   * disagree about which is active.
   *
   * @param {string} sectionId
   */
  function markCurrent(sectionId) {
    var current = nav.section(sectionId) || nav.resolve(nav.DEFAULT);

    state.section = current.id;

    dom.$$("[data-section]").forEach(function (link) {
      var isCurrent = link.getAttribute("data-section") === current.id;

      link.classList.toggle("is-current", isCurrent);

      if (isCurrent) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    var heading = dom.$("[data-current-section]");
    if (heading) heading.textContent = current.label;

    var title = current.label + " | لوحة " +
      (admin.config.get().shop.name || "الإدارة");

    if (document.title !== title) document.title = title;
  }

  /**
   * Redraw the shop's name wherever the shell shows it.
   *
   * The settings screen announces a save on the document rather than calling
   * into here, so this file does not have to know the settings screen exists.
   * The sidebar is not re-rendered — it is one node moved between the desktop
   * and the drawer, and rebuilding it would drop focus and fight the
   * drawer's open state — so only the text is written.
   */
  function onSettingsChanged() {
    var name = admin.config.get().shop.name || "الصالون";

    dom.$$("[data-brand-name]").forEach(function (node) {
      node.textContent = name;
    });

    markCurrent(state.section || nav.DEFAULT);
  }

  /**
   * @param {string} hash  a location hash, or a section id
   * @returns {Object} the section that was routed to
   */
  function route(hash) {
    var wanted = String(hash || "").replace(/^#/, "");
    var target = nav.resolve(wanted);

    /* A section the signed-in role may not open falls back to the dashboard
       rather than rendering an empty screen with a forbidden title. */
    if (!auth.can(target.id) && target.id !== nav.DEFAULT) target = nav.resolve(nav.DEFAULT);

    markCurrent(target.id);
    closeDrawer();

    if (state.onRoute) state.onRoute(target);

    return target;
  }

  function currentHash() {
    return window.location.hash.replace(/^#/, "");
  }

  /* =====================================================================
     Sidebar size behaviour
     ===================================================================== */

  var isMobile = function () {
    /* The breakpoint is declared once, in the stylesheet, and read from there
       so the two cannot drift. The fallback only covers the moments before
       the stylesheet has loaded. */
    var declared = getComputedStyle(document.documentElement)
      .getPropertyValue("--admin-mobile-breakpoint");

    var width = parseInt(declared, 10) || MOBILE_FALLBACK;

    return window.matchMedia("(max-width: " + (width - 1) + "px)").matches;
  };

  /**
   * Move the sidebar between the page column and the drawer, and keep the
   * toggle's label honest about what it will do next.
   */
  function placeSidebar() {
    var node = dom.$("[data-sidebar]");
    var body = dom.$("[data-drawer-body]");
    if (!node || !body) return;

    var mobile = isMobile();

    if (mobile) {
      if (node.parentNode !== body) body.appendChild(node);
      node.classList.add("sidebar--in-drawer");
    } else {
      var column = dom.$("[data-sidebar-column]");
      if (column && node.parentNode !== column) column.appendChild(node);
      node.classList.remove("sidebar--in-drawer");
    }

    var toggle = dom.$("[data-action=toggle-sidebar]");
    if (!toggle) return;

    /* The same button means two different things, and aria-expanded has to
       answer for whichever one is live: on a phone the drawer is only really
       "expanded" while it is open, and on a desktop the rail is expanded
       unless it has been pinned shut. */
    toggle.setAttribute("aria-expanded",
      String(mobile ? state.drawerOpen : state.railPinned));

    toggle.setAttribute("aria-label", mobile
      ? (state.drawerOpen ? "إغلاق قائمة التنقل" : "فتح قائمة التنقل")
      : (state.railPinned ? "طيّ القائمة الجانبية" : "توسيع القائمة الجانبية"));
  }

  function toggleSidebar() {
    if (isMobile()) {
      state.drawerOpen ? closeDrawer() : openDrawer();
      return;
    }

    state.railPinned = !state.railPinned;
    document.documentElement.classList.toggle("is-sidebar-collapsed", !state.railPinned);
    placeSidebar();
  }

  /* ---- drawer ---- */

  function openDrawer() {
    var node = dom.$("[data-admin-drawer]");
    if (!node || state.drawerOpen) return;

    state.drawerOpen = true;

    if (typeof node.showModal === "function") node.showModal();
    else node.setAttribute("open", "");

    dom.lockScroll(true);
    placeSidebar();

    var heading = dom.$("[data-drawer-body] .sidebar__title")
      || dom.$("[data-drawer-body]");

    if (heading) {
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus();
    }
  }

  /**
   * @param {boolean} [restoreFocus] put focus back on the toggle. True when a
   *   person dismissed the drawer (Escape, the close button, the backdrop);
   *   false when a section was chosen, because the router then moves focus to
   *   the content on purpose and two things must not fight over it.
   */
  function closeDrawer(restoreFocus) {
    var node = dom.$("[data-admin-drawer]");
    if (!node || !state.drawerOpen) return;

    state.drawerOpen = false;

    if (typeof node.close === "function") node.close();
    else node.removeAttribute("open");

    dom.lockScroll(false);
    placeSidebar();

    if (restoreFocus !== false) {
      var toggle = dom.$("[data-action=toggle-sidebar]");
      if (toggle) toggle.focus();
    }
  }

  /* =====================================================================
     Boot
     ===================================================================== */

  /**
   * Build the shell around the page and mount it.
   *
   * @param {Object} [opts]
   * @param {Object} [opts.content]  the section body; defaults to the
   *                                 [data-admin-content] placeholder
   * @param {Object} [opts.user]     defaults to the signed-in user
   * @param {Function} [opts.onRoute] called with each routed section, so the
   *                                 owner of the content area is the one that
   *                                 repaints it
   * @returns {Object|null} null when nobody is signed in
   */
  function init(opts) {
    opts = opts || {};

    /* The one guard. Everything after this point assumes a user exists. */
    var user = opts.user || auth.require();
    if (!user) return null;

    var mount = dom.$("[data-admin-shell]");
    if (!mount) return null;

    var sidebarNode = sidebar(user);
    sidebarNode.id = "admin-sidebar";
    sidebarNode.classList.add("sidebar");
    sidebarNode.setAttribute("data-sidebar", "");

    var layout = dom.el("div", { class: "shell" }, [
      /* In RTL the sidebar belongs at the start, which is the right edge. */
      dom.el("aside", {
        class: "shell__aside",
        "data-sidebar-column": "",
        "aria-label": "التنقل الرئيسي"
      }, [sidebarNode]),

      dom.el("div", { class: "shell__body" }, [
        dom.el("header", { class: "topbar" }, [topbar(user)]),

        dom.el("main", {
          class: "shell__main",
          id: "main",
          tabindex: "-1"
        }, [
          dom.el("div", { class: "shell__inner", "data-admin-content": "" })
        ])
      ])
    ]);

    var placeholder = dom.$("[data-admin-content]", mount);
    var existing = opts.content || placeholder;

    mount.parentNode.replaceChild(layout, mount);

    var content = dom.$("[data-admin-content]");
    if (existing && existing !== content) {
      content.appendChild(existing);
    }

    /* The drawer is appended to <body> so it is not inside the flex column
       that lays the shell out. */
    document.body.appendChild(drawer());

    wire(user);
    placeSidebar();

    /* The shell marks the section; whoever owns the content area paints it.
       Keeping the two separate is what lets a section be swapped out without
       touching the navigation. */
    state.onRoute = opts.onRoute || null;

    route(currentHash() || nav.DEFAULT);

    window.addEventListener("hashchange", function () {
      route(currentHash());
    });

    window.addEventListener("resize", function () {
      if (!isMobile()) closeDrawer();
      placeSidebar();
    });

    return { user: user, route: route, state: state };
  }

  function wire(user) {
    dom.delegate(document, "click", "[data-action=toggle-sidebar]", function (event) {
      event.preventDefault();
      toggleSidebar();
    });

    dom.delegate(document, "click", "[data-action=close-drawer]", function (event) {
      event.preventDefault();
      closeDrawer();
    });

    dom.delegate(document, "click", "[data-action=logout]", function (event) {
      event.preventDefault();
      auth.logout();
    });

    dom.delegate(document, "click", "[data-section]", function (event, link) {
      var id = link.getAttribute("data-section");

      /* A link the role may not open is simply not followed, rather than
         followed and then bounced — the destination should never look broken. */
      if (!auth.can(id, user)) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      if (currentHash() === id) markCurrent(id);
      else window.location.hash = nav.href(id);

      closeDrawer();
    });

    dom.on(document, "halaq:settings", onSettingsChanged);

    /* Clicking the backdrop of a modal dialog does not close it by default;
       a full-height sidebar reads as a page, so it needs a real close. */
    dom.delegate(document, "click", "[data-admin-drawer]", function (event, node) {
      if (event.target === node) closeDrawer();
    });

    /* Escape closes a <dialog> natively, but "close" does not bubble, so this
       has to sit on the dialog itself rather than on document — and the page
       scroll it locked has to be released either way. */
    var drawerNode = dom.$("[data-admin-drawer]");

    if (drawerNode) {
      dom.on(drawerNode, "close", function () {
        closeDrawer();
      });
    }

    /* "/" focuses the quick search, the way it does on the public site. */
    dom.on(document, "keydown", function (event) {
      var tag = (event.target.tagName || "").toLowerCase();

      if (event.key === "/" && !/^(input|textarea|select)$/.test(tag)) {
        event.preventDefault();
        var box = dom.$("#admin-global-search");
        if (box) box.focus();
      }
    });
  }

  Halaq.admin.shell = {
    init: init,
    route: route,
    sidebar: sidebar,
    topbar: topbar,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    state: state
  };
})(window.Halaq = window.Halaq || {});
