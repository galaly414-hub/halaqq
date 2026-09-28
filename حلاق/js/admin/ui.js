/* ==========================================================================
   Halaq — Admin UI kit
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.ui

   The building blocks every admin section will be made of. Nothing here knows
   about a particular section, and nothing here holds state: each function
   returns DOM, so a section can compose them and a test can assert on them.

   The rules every component here follows, because the whole point of the admin
   side is that a receptionist can read it at a glance in a busy room:
     - A state is never colour alone. Every badge has a word and a glyph.
     - Numbers are Latin, in an RTL page, so they carry .num.
     - Anything that can be empty has a real empty state, not a blank box.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var ui = Halaq.admin = Halaq.admin || {};

  /* =====================================================================
     Page furniture
     ===================================================================== */

  /**
   * The heading block at the top of every section: a breadcrumb, the title,
   * and a one-line description of what the screen is for.
   *
   * @param {Object} section  from Halaq.admin.nav
   * @param {Object} [opts]
   * @param {Array}  [opts.actions]  buttons rendered at the end of the row
   * @returns {HTMLElement}
   */
  function pageHeader(section, opts) {
    opts = opts || {};

    return dom.el("div", { class: "page-head" }, [
      dom.el("nav", { class: "page-head__crumb", "aria-label": "مسار التصفح" }, [
        dom.el("span", { class: "page-head__crumb-item", text: "لوحة الإدارة" }),
        dom.el("span", { class: "page-head__crumb-sep", "aria-hidden": "true", text: "/" }),
        dom.el("span", {
          class: "page-head__crumb-item is-current",
          "aria-current": "page",
          text: section.label
        })
      ]),

      dom.el("div", { class: "page-head__row" }, [
        dom.el("div", { class: "page-head__title-wrap" }, [
          dom.el("h1", { class: "page-head__title" }, [
            dom.icon(section.icon, "icon--lg"),
            dom.el("span", { text: section.label })
          ]),
          section.description
            ? dom.el("p", { class: "page-head__desc", text: section.description })
            : null
        ]),

        opts.actions && opts.actions.length
          ? dom.el("div", { class: "page-head__actions" }, opts.actions)
          : null
      ])
    ]);
  }

  /**
   * A toolbar: search on one side, filters and actions on the other. Stacks
   * rather than squeezes on a narrow screen.
   *
   * @param {{search?: Object, filters?: Array, actions?: Array}} parts
   * @returns {HTMLElement}
   */
  function toolbar(parts) {
    parts = parts || {};

    return dom.el("div", { class: "toolbar", role: "search" }, [
      parts.search ? searchField(parts.search) : null,

      dom.el("div", { class: "toolbar__end" }, [
        parts.filters ? dom.el("div", { class: "toolbar__filters" }, parts.filters) : null,
        parts.actions ? dom.el("div", { class: "toolbar__actions" }, parts.actions) : null
      ])
    ]);
  }

  /**
   * A labelled search box with an icon. `label` is visually hidden rather than
   * absent, so the field is never unlabelled.
   *
   * @param {{label?: string, placeholder?: string, value?: string, oninput?: Function}} opts
   * @returns {HTMLElement}
   */
  function searchField(opts) {
    opts = opts || {};

    var id = opts.id || "admin-search";

    var input = dom.el("input", {
      class: "input input--search",
      id: id,
      type: "search",
      value: opts.value || "",
      placeholder: opts.placeholder || "ابحث…",
      oninput: opts.oninput || null
    });

    return dom.el("div", { class: "toolbar__search" }, [
      dom.el("span", { class: "input-group" }, [
        dom.el("span", { class: "input-group__icon" }, [dom.icon("search", "icon--sm")]),
        input,
        dom.el("label", { class: "sr-only", for: id, text: opts.label || "بحث" })
      ])
    ]);
  }

  /**
   * A compact select for filtering. Native, because a native select brings the
   * platform's own keyboard and mobile behaviour for free.
   *
   * @param {{id?: string, label: string, options: Array, value?: string, onchange?: Function}} opts
   * @returns {HTMLElement}
   */
  function filterSelect(opts) {
    opts = opts || {};
    var id = opts.id || "admin-filter-" + (opts.label || "").replace(/\s+/g, "-");

    var select = dom.el("select", {
      class: "select select--compact",
      id: id,
      onchange: opts.onchange || null
    }, (opts.options || []).map(function (option) {
      return dom.el("option", {
        value: option.value,
        text: option.label,
        selected: option.value === opts.value
      });
    }));

    return dom.el("div", { class: "toolbar__filter" }, [
      dom.el("label", { class: "toolbar__filter-label", for: id, text: opts.label }),
      select
    ]);
  }

  /* =====================================================================
     Data display
     ===================================================================== */

  /**
   * One number, with its label and an optional trend.
   *
   * @param {{label: string, value: (string|number), num?: boolean, icon?: string,
   *          tone?: string, hint?: string, delta?: {value: string, up?: boolean}}} opts
   * @returns {HTMLElement}
   */
  function statCard(opts) {
    var tone = opts.tone || "neutral";

    return dom.el("div", { class: "stat is-" + tone, "data-stat": tone }, [
      dom.el("div", { class: "stat__top" }, [
        dom.el("span", { class: "stat__label", text: opts.label }),
        opts.icon ? dom.icon(opts.icon, "icon--sm stat__icon") : null
      ]),

      dom.el("p", { class: "stat__value" + (opts.num ? " num" : "") , text: String(opts.value) }),

      dom.el("div", { class: "stat__foot" }, [
        opts.delta
          ? dom.el("span", {
              class: "stat__delta" + (opts.delta.up ? " is-up" : " is-down")
            }, [
              dom.icon(opts.delta.up ? "trending-up" : "trending-down", "icon--xs"),
              dom.el("span", { class: "num", text: opts.delta.value })
            ])
          : null,
        opts.hint ? dom.el("span", { class: "stat__hint", text: opts.hint }) : null
      ])
    ]);
  }

  /**
   * A row of stat cards. Takes the same descriptors statCard does, so a
   * section can hand over plain data and let this build the markup.
   *
   * @param {Array} cards
   * @returns {HTMLElement}
   */
  function statRow(cards) {
    return dom.el("div", { class: "stat-row" }, cards.map(statCard));
  }

  /**
   * A state badge. The label always carries the meaning; the colour only makes
   * it faster to find.
   *
   * @param {{label: string, icon?: string, tone?: string, dot?: boolean}} opts
   * @returns {HTMLElement}
   */
  function badge(opts) {
    var tone = opts.tone || "neutral";

    return dom.el("span", { class: "badge badge--" + tone + " badge--solid" }, [
      opts.icon ? dom.icon(opts.icon, "icon--xs") : null,
      opts.dot ? dom.el("span", { class: "badge__dot", "aria-hidden": "true" }) : null,
      dom.el("span", { text: opts.label })
    ]);
  }

  /**
   * A data table.
   *
   * columns: [{ key, label, num?, width?, align?, render? }]
   * `render` returning null leaves the cell empty, so an optional column does
   * not leave a stray dash behind.
   *
   * `stacked` makes the table turn into a list of records on a phone. It is not
   * a second table and not a second set of markup: the same cells are shown,
   * and each one carries its own column name in `data-label` for the stacked
   * layout to show. The header row stays in the accessibility tree either way,
   * so a screen reader still gets the column it is on.
   *
   * @param {{columns: Array, rows: Array, empty?: Object, caption?: string,
   *          stacked?: boolean}} opts
   * @returns {HTMLElement}
   */
  function table(opts) {
    opts = opts || {};

    if (!opts.rows || !opts.rows.length) {
      return emptyState(opts.empty || {});
    }

    var stacked = !!opts.stacked;

    var head = dom.el("tr", {}, opts.columns.map(function (column) {
      return dom.el("th", {
        class: "table__th" + (column.num ? " num" : "") +
          (column.align ? " is-" + column.align : ""),
        scope: "col",
        style: column.width ? "width:" + column.width : null
      }, column.label);
    }));

    var body = opts.rows.map(function (row, index) {
      return dom.el("tr", { class: "table__tr" }, opts.columns.map(function (column) {
        var content = column.render
          ? column.render(row, index)
          : row[column.key];

        return dom.el("td", {
          class: "table__td" + (column.num ? " num" : "") +
            (column.align ? " is-" + column.align : ""),
          "data-label": stacked ? column.label : null
        }, content);
      }));
    });

    return dom.el("div", { class: "table-wrap" }, [
      dom.el("table", {
        class: "table" + (stacked ? " table--stacked" : "")
      }, [
        opts.caption
          ? dom.el("caption", { class: "sr-only", text: opts.caption })
          : null,
        dom.el("thead", {}, [head]),
        dom.el("tbody", {}, body)
      ])
    ]);
  }

  /**
   * What a screen shows when it has nothing to show. An icon, a heading, a
   * sentence saying why, and an optional way out.
   *
   * @param {{icon?: string, title: string, message?: string, action?: Object}} opts
   * @returns {HTMLElement}
   */
  function emptyState(opts) {
    opts = opts || {};

    return dom.el("div", { class: "empty", "data-empty": "" }, [
      dom.el("span", { class: "empty__icon" }, [
        dom.icon(opts.icon || "inbox", "icon--lg")
      ]),
      dom.el("p", { class: "empty__title", text: opts.title }),
      opts.message
        ? dom.el("p", { class: "empty__message", text: opts.message })
        : null,
      opts.action ? dom.el("div", { class: "empty__action" }, [opts.action]) : null
    ]);
  }

  /**
   * A card: the bordered surface every block on the admin side sits in.
   *
   * `bodyClass` is there for the screens that stack more than one thing in a
   * body — the body's own padding is a block, not a stack, so the rhythm
   * between its children has to be asked for rather than assumed.
   *
   * @param {{title?: string, description?: string, actions?: Array, flush?: boolean,
   *          bodyClass?: string}} opts
   * @param {Array|Node} children
   * @returns {HTMLElement}
   */
  function card(opts, children) {
    opts = opts || {};

    return dom.el("section", { class: "card" + (opts.flush ? " card--flush" : "") }, [
      opts.title
        ? dom.el("header", { class: "card__head" }, [
            dom.el("div", {}, [
              dom.el("h2", { class: "card__title", text: opts.title }),
              opts.description
                ? dom.el("p", { class: "card__desc", text: opts.description })
                : null
            ]),
            opts.actions && opts.actions.length
              ? dom.el("div", { class: "card__actions" }, opts.actions)
              : null
          ])
        : null,

      dom.el("div", {
        class: "card__body" + (opts.bodyClass ? " " + opts.bodyClass : "")
      }, children)
    ]);
  }

  /**
   * A button, with the variants the admin side uses.
   *
   * @param {{label: string, icon?: string, variant?: string, size?: string,
   *          type?: string, href?: string, onClick?: Function, disabled?: boolean,
   *          data?: Object}} opts
   * @returns {HTMLElement}
   */
  function button(opts) {
    var tag = opts.href ? "a" : "button";
    var attrs = {
      class: "btn btn--" + (opts.variant || "secondary") +
        (opts.size ? " btn--" + opts.size : ""),
      type: opts.href ? null : (opts.type || "button")
    };

    if (opts.href) attrs.href = opts.href;
    if (opts.disabled) {
      attrs["aria-disabled"] = "true";
      attrs.tabindex = "-1";
    }
    if (opts.onClick) attrs.onclick = opts.onClick;
    if (opts.data) attrs.dataset = opts.data;

    return dom.el(tag, attrs, [
      opts.icon ? dom.icon(opts.icon, "icon--sm") : null,
      dom.el("span", { text: opts.label })
    ]);
  }

  /**
   * A small labelled pair, for a header detail like the date or the user's role.
   * @param {string} label
   * @param {string} value
   * @param {{num?: boolean}} [opts]
   * @returns {HTMLElement}
   */
  function meta(label, value, opts) {
    opts = opts || {};

    return dom.el("div", { class: "meta" }, [
      dom.el("span", { class: "meta__label", text: label }),
      dom.el("span", { class: "meta__value" + (opts.num ? " num" : ""), text: value })
    ]);
  }

  /**
   * A removable token, for a filter that is currently narrowing the list. The
   * word stays visible and the remove control is named, so nobody has to guess
   * which way round a bare "x" works.
   *
   * @param {{label: string, onRemove?: Function}} opts
   * @returns {HTMLElement}
   */
  function chip(opts) {
    return dom.el("span", { class: "chip" }, [
      dom.el("span", { class: "chip__label", text: opts.label }),
      opts.onRemove
        ? dom.el("button", {
            class: "chip__remove",
            type: "button",
            "aria-label": "إزالة تصفية " + opts.label,
            title: "إزالة",
            onclick: opts.onRemove
          }, [dom.icon("close", "icon--xs")])
        : null
    ]);
  }

  /**
   * A cell holding a person's name with their initial beside it, so a list of
   * customers can be scanned by shape as well as read.
   *
   * @param {{name: string, initials?: string, muted?: string}} opts
   * @returns {HTMLElement}
   */
  function person(opts) {
    return dom.el("span", { class: "person" }, [
      dom.el("span", {
        class: "person__avatar",
        "aria-hidden": "true",
        text: opts.initials || (opts.name || "").slice(0, 1)
      }),
      dom.el("span", { class: "person__body" }, [
        dom.el("span", { class: "person__name", text: opts.name }),
        opts.muted ? dom.el("span", { class: "person__muted", text: opts.muted }) : null
      ])
    ]);
  }

  /**
   * A labelled control. The label is always a real <label for>, so the field
   * is never unlabelled, and `hint` is wired through `aria-describedby` so a
   * screen reader is told the same thing a sighted one is.
   *
   * @param {{id: string, label: string, control: Node, hint?: string,
   *          required?: boolean, wide?: boolean}} opts
   * @returns {HTMLElement}
   */
  function field(opts) {
    var hintId = opts.hint ? opts.id + "-hint" : null;

    if (hintId) opts.control.setAttribute("aria-describedby", hintId);

    return dom.el("div", {
      class: "field" + (opts.wide ? " field--wide" : "")
    }, [
      dom.el("label", {
        class: "field__label",
        for: opts.id
      }, [
        dom.el("span", { text: opts.label }),
        opts.required
          ? dom.el("span", {
              class: "field__required",
              "aria-hidden": "true",
              text: "*"
            })
          : dom.el("span", { class: "field__optional", text: "اختياري" })
      ]),

      opts.control,

      hintId
        ? dom.el("p", { class: "field__hint", id: hintId, text: opts.hint })
        : null
    ]);
  }

  /**
   * A set of checkboxes under one heading, for picking several out of many —
   * the services a barber can take. A fieldset rather than a div, so the group
   * is announced as one question and the legend is its name.
   *
   * options: [{ value, label, note? }]
   *
   * @param {{name: string, legend: string, hint?: string,
   *          options: Array, selected?: Array, columns?: number}} opts
   * @returns {HTMLElement}
   */
  function checkGroup(opts) {
    var selected = opts.selected || [];

    return dom.el("fieldset", {
      class: "checkgroup",
      "data-checkgroup": opts.name
    }, [
      dom.el("legend", { class: "checkgroup__legend" }, [
        dom.el("span", { text: opts.legend }),
        dom.el("span", {
          class: "checkgroup__count",
          "data-checkgroup-count": opts.name,
          text: selected.length + " من " + opts.options.length
        })
      ]),

      dom.el("div", { class: "checkgroup__grid" }, opts.options.map(function (option) {
        var id = opts.name + "-" + option.value;

        return dom.el("label", { class: "choice", for: id }, [
          dom.el("input", {
            type: "checkbox",
            id: id,
            name: opts.name,
            value: option.value,
            checked: selected.indexOf(option.value) !== -1,
            onchange: opts.onchange || null
          }),
          dom.el("span", { class: "choice__body" }, [
            dom.el("span", { class: "choice__label", text: option.label }),
            option.note ? dom.el("span", { class: "choice__note", text: option.note }) : null
          ])
        ]);
      }))
    ]);
  }

  /**
   * A labelled on/off switch, with the state written out either side of the
   * track so the position is never the only thing carrying the meaning.
   *
   * @param {{id: string, label: string, note?: string, checked?: boolean,
   *          onLabel?: string, offLabel?: string, onchange?: Function}} opts
   * @returns {HTMLElement}
   */
  function switchField(opts) {
    return dom.el("div", { class: "switch-row" }, [
      dom.el("span", { class: "switch-row__text" }, [
        dom.el("span", { class: "switch-row__label", text: opts.label }),
        opts.note
          ? dom.el("span", { class: "switch-row__note", text: opts.note })
          : null
      ]),

      dom.el("label", { class: "switch", for: opts.id }, [
        dom.el("input", {
          type: "checkbox",
          id: opts.id,
          role: "switch",
          checked: !!opts.checked,
          onchange: opts.onchange || null
        }),
        dom.el("span", { class: "switch__track", "aria-hidden": "true" }, [
          dom.el("span", { class: "switch__thumb" })
        ]),
        dom.el("span", { class: "switch__label" }, [
          dom.el("span", { class: "switch__state switch__state--on", text: opts.onLabel || "مفعّل" }),
          dom.el("span", { class: "switch__state switch__state--off", text: opts.offLabel || "معطّل" })
        ])
      ])
    ]);
  }

  /**
   * A placeholder block: the shape of the thing it stands in for, so nothing
   * jumps when the real content lands on top of it.
   *
   * One slow sweep, no pulse and no rotation, and the same sweep the tracking
   * page uses — a receptionist waiting on the dashboard and a customer waiting
   * on a lookup are looking at one product.
   *
   * The widths are deliberately ragged rather than uniform. A stack of
   * identical bars reads as a broken bar chart, which is a worse thing to put on
   * screen than an honest blank.
   *
   * @param {{rows?: number, class?: string, bar?: string}} opts
   *        `bar` cycles through the width modifiers: "full" | "mid" | "short"
   * @returns {HTMLElement}
   */
  function skeleton(opts) {
    opts = opts || {};

    var count = opts.rows == null ? 3 : opts.rows;
    var widths = ["full", "mid", "short"];
    var bars = [];

    for (var i = 0; i < count; i += 1) {
      bars.push(dom.el("span", {
        class: "skel__bar is-" + (opts.bar || widths[i % widths.length])
      }));
    }

    return dom.el("div", {
      class: "skel" + (opts.class ? " " + opts.class : ""),
      "aria-hidden": "true"
    }, count ? bars : null);
  }

  Halaq.admin.ui = {
    pageHeader: pageHeader,
    toolbar: toolbar,
    searchField: searchField,
    filterSelect: filterSelect,
    statCard: statCard,
    statRow: statRow,
    badge: badge,
    table: table,
    emptyState: emptyState,
    card: card,
    button: button,
    meta: meta,
    chip: chip,
    person: person,
    field: field,
    checkGroup: checkGroup,
    switchField: switchField,
    skeleton: skeleton
  };
})(window.Halaq = window.Halaq || {});
