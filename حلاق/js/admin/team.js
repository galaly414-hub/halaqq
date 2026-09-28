/* ==========================================================================
   Halaq — Admin · barber management
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.team

   The roster screen. A card per barber, and a dialog for adding one or
   changing one.

   Enabled and status are two controls, on purpose
   ----------------------------------------------
   The card shows both, and the dialog edits both, because they answer two
   different questions and a front desk needs both:

     enabled  — is this person on the team?  Turning it off keeps the record
                and every booking they ever served, and stops new bookings
                being assigned to them. It is the setting button.
     status   — are they taking customers right now?  A barber can be on the
                team and still be on a break. Changing this does not touch
                `enabled`, and the two are never written together.

   Nothing on this screen is a guess
   ---------------------------------
   Every figure — the number who can take a customer, the hours line, the
   service list, the rating — is read back from the roster after the write, not
   from what the form was sent. If a write is refused, the card changes to
   match the store rather than to match the click.

   Rating is never invented. A barber added here has no reviews yet, so they
   show "جديد" rather than a zero dressed up as a score.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var admin = Halaq.admin = Halaq.admin || {};

  var ui = admin.ui;
  var metrics = admin.metrics;
  var roster = admin.roster;

  /* =====================================================================
     The form dialog

     Built once, then filled. A row-based hours editor means the dialog has
     mutable children, so it cannot be a plain template: the hours list is
     re-rendered in place whenever a row is added or removed.
     ===================================================================== */

  var formNode = null;
  var formBody = null;
  var hoursHost = null;
  var formId = null;
  var formRepaint = null;

  var WEEKDAYS = [
    "الأحد", "الاثنين", "الثلاثاء", "الأربعاء",
    "الخميس", "الجمعة", "السبت"
  ];

  var SPECIALTY_HINT =
    "افصل بينها بفاصلة: تدرّج، صبغة، عناية بالبشرة، حلاقة أطفال";

  /**
   * @returns {HTMLDialogElement}
   */
  function formBox() {
    if (formNode) return formNode;

    formBody = dom.el("form", {
      class: "barber-form",
      novalidate: true,
      onsubmit: function (event) {
        event.preventDefault();
        submitForm();
      }
    });

    formId = dom.el("input", { type: "hidden", name: "barberId" });

    hoursHost = dom.el("div", { class: "hours-list", "data-hours-list": "" });

    formBody.appendChild(formId);
    formBody.appendChild(dom.el("div", { class: "form__grid form__grid--2" }, [
      textField({
        id: "bf-name",
        name: "name",
        label: "الاسم",
        required: true,
        hint: "الاسم الذي يظهر للعميل في صفحة الحجز."
      }),
      textField({
        id: "bf-role",
        name: "role",
        label: "الصفة",
        hint: "مثال: حلاق أول — متخصص في التدرّج."
      }),
      textField({
        id: "bf-initials",
        name: "initials",
        label: "الأحرف الأولى",
        maxlength: 2,
        hint: "حرف أو حرفان للأفاتار. يُؤخذ من الاسم إن تُرك فارغاً."
      }),
      numberField({
        id: "bf-experience",
        name: "experience",
        label: "سنوات الخبرة",
        min: 0,
        max: 60
      })
    ]));

    formBody.appendChild(ui.field({
      id: "bf-status",
      label: "الحالة الآن",
      control: dom.el("select", {
        class: "select",
        id: "bf-status",
        name: "status"
      }, roster.STATUS_ORDER.map(function (key) {
        var info = roster.statusInfo(key);

        return dom.el("option", { value: key, text: info.label });
      })),
      hint: "متاح الآن يعني يقبل عملاء جدداً. تغيير الحالة لا يغيّر وجوده في الفريق."
    }));

    formBody.appendChild(ui.checkGroup({
      name: "services",
      legend: "الخدمات التي يقدّمها",
      options: roster.serviceCatalogue().map(function (service) {
        return { value: service.id, label: service.name, note: service.category };
      }),
      onchange: updateServiceCount
    }));

    formBody.appendChild(ui.field({
      id: "bf-specialties",
      label: "التخصصات",
      control: dom.el("input", {
        class: "input",
        id: "bf-specialties",
        name: "specialties",
        type: "text",
        placeholder: "تدرّج، صبغة"
      }),
      hint: SPECIALTY_HINT
    }));

    /* ---- hours ---- */

    formBody.appendChild(dom.el("fieldset", { class: "hours" }, [
      dom.el("legend", { class: "hours__legend" }, [
        dom.el("span", { text: "أوقات الدوام" }),
        dom.el("span", { class: "hours__legend-hint", text: "صفّ واحد لكل مجموعة أيام" })
      ]),

      hoursHost,

      dom.el("div", { class: "hours__foot" }, [
        dom.el("button", {
          class: "btn btn--ghost btn--sm",
          type: "button",
          onclick: addHoursRow
        }, [dom.icon("plus", "icon--sm"), dom.el("span", { text: "إضافة صف" })])
      ])
    ]));

    formNode = dom.el("dialog", {
      class: "modal modal--md",
      "aria-labelledby": "barber-form-title"
    }, [
      dom.el("div", { class: "modal__panel" }, [
        dom.el("div", { class: "modal__head" }, [
          dom.el("div", {}, [
            dom.el("h2", {
              class: "modal__title",
              id: "barber-form-title",
              "data-modal-title": "",
              text: "إضافة حلاق"
            }),
            dom.el("p", {
              class: "modal__description",
              "data-modal-description": ""
            })
          ]),

          dom.el("button", {
            class: "modal__close",
            type: "button",
            "data-modal-close": "",
            "aria-label": "إغلاق"
          }, [dom.icon("close", "icon--sm")])
        ]),

        dom.el("div", { class: "modal__body" }, [formBody]),

        dom.el("div", { class: "modal__footer" }, [
          dom.el("p", { class: "form-error", "data-form-error": "", role: "alert" }),

          dom.el("div", { class: "modal__footer-actions" }, [
            dom.el("button", {
              class: "btn btn--ghost",
              type: "button",
              "data-modal-close": ""
            }, [dom.el("span", { text: "إلغاء" })]),

            dom.el("button", {
              class: "btn btn--primary",
              type: "button",
              /* `dataset`, not `data`: dom.el only special-cases the former.
                 A `data` key here would land as a literal data="[object Object]"
                 attribute and the button would quietly stop being findable. */
              dataset: { submitBarber: "" },
              /* type=button on purpose. The button lives in the dialog footer,
                 outside the <form>, so `type=submit` plus a form attribute
                 would fire the form's submit handler *and* this handler, and
                 the record would be written twice. */
              onclick: function () {
                if (formBody.requestSubmit) formBody.requestSubmit();
                else submitForm();
              }
            }, [dom.icon("check", "icon--sm"), dom.el("span", { text: "حفظ" })])
          ])
        ])
      ])
    ]);

    document.body.appendChild(formNode);
    return formNode;
  }

  /**
   * @param {{id: string, name: string, label: string, hint?: string,
   *          required?: boolean, placeholder?: string, maxlength?: number}} opts
   * @returns {Node}
   */
  function textField(opts) {
    return ui.field({
      id: opts.id,
      label: opts.label,
      required: opts.required,
      hint: opts.hint,
      control: dom.el("input", {
        class: "input",
        id: opts.id,
        name: opts.name,
        type: "text",
        maxlength: opts.maxlength || 80,
        placeholder: opts.placeholder || "",
        autocomplete: "off"
      })
    });
  }

  /**
   * @param {{id: string, name: string, label: string, hint?: string,
   *          min?: number, max?: number}} opts
   * @returns {Node}
   */
  function numberField(opts) {
    return ui.field({
      id: opts.id,
      label: opts.label,
      hint: opts.hint,
      control: dom.el("input", {
        class: "input num",
        id: opts.id,
        name: opts.name,
        type: "number",
        inputmode: "numeric",
        min: opts.min,
        max: opts.max
      })
    });
  }

  /* =====================================================================
     Hours rows
     ===================================================================== */

  /**
   * @param {{days?: string, from?: string, to?: string, off?: boolean}} row
   * @returns {HTMLElement}
   */
  function hoursRow(row) {
    row = row || {};

    return dom.el("div", { class: "hours-row", "data-hours-row": "" }, [
      dom.el("div", { class: "hours-row__cell hours-row__cell--days" }, [
        dom.el("label", { class: "hours-row__label", text: "الأيام" }),
        dom.el("input", {
          class: "input",
          "data-hours-days": "",
          type: "text",
          value: row.days || "",
          placeholder: WEEKDAYS.slice(0, 5).join(" – "),
          autocomplete: "off",
          "aria-label": "الأيام"
        })
      ]),

      dom.el("div", { class: "hours-row__cell" }, [
        dom.el("label", { class: "hours-row__label", text: "من" }),
        dom.el("input", {
          class: "input num",
          "data-hours-from": "",
          type: "time",
          value: row.from || "10:00",
          "aria-label": "وقت البدء"
        })
      ]),

      dom.el("div", { class: "hours-row__cell" }, [
        dom.el("label", { class: "hours-row__label", text: "إلى" }),
        dom.el("input", {
          class: "input num",
          "data-hours-to": "",
          type: "time",
          value: row.to || "22:00",
          "aria-label": "وقت الانتهاء"
        })
      ]),

      dom.el("div", { class: "hours-row__cell hours-row__cell--off" }, [
        dom.el("span", { class: "hours-row__label", text: "مغلق" }),
        dom.el("label", { class: "switch switch--bare" }, [
          dom.el("input", {
            type: "checkbox",
            "data-hours-off": "",
            checked: !!row.off,
            "aria-label": "هذه الأيام مغلقة",
            /* Re-apply on every change, not just when a row is added: the
               greyed-out times are the visible half of this control, so they
               have to follow it both ways. */
            onchange: function () {
              syncHoursDisabled();
            }
          }),
          dom.el("span", { class: "switch__track", "aria-hidden": "true" }, [
            dom.el("span", { class: "switch__thumb" })
          ])
        ])
      ]),

      dom.el("button", {
        class: "icon-btn icon-btn--danger",
        type: "button",
        "aria-label": "حذف صف الدوام",
        title: "حذف الصف",
        onclick: function (event) {
          var row = event.currentTarget.closest("[data-hours-row]");

          /* One row is never a schedule. A barber with no hours is off all
             week, which is a different thing from a barber with an empty
             form, so the last row stays. */
          if (dom.$$("[data-hours-row]", hoursHost).length <= 1) {
            Halaq.toast.info("لا يمكن حذف آخر صف", "الحدّ الأدنى صفّ واحد.");
            return;
          }

          if (row) row.remove();
        }
      }, [dom.icon("close", "icon--sm")])
    ]);
  }

  function addHoursRow() {
    hoursHost.appendChild(hoursRow({}));
    syncHoursDisabled();
  }

  /**
   * Grey out the times on a closed row, and keep them out of the read-back.
   * The value is kept in the DOM so toggling back does not lose it.
   */
  function syncHoursDisabled() {
    dom.$$("[data-hours-row]", hoursHost).forEach(function (row) {
      var off = dom.$("[data-hours-off]", row).checked;

      ["[data-hours-from]", "[data-hours-to]"].forEach(function (sel) {
        dom.$(sel, row).readOnly = off;
      });
    });
  }

  /**
   * Draw the rows from a schedule. A barber with none is shown the salon's
   * standard week, so the common case is an edit rather than nine blanks — and
   * so the form is never submitted with times but no days to attach them to.
   *
   * @param {Array} list
   */
  function writeHours(list) {
    dom.render(hoursHost, (list && list.length ? list : roster.hours()).map(hoursRow));
    syncHoursDisabled();
  }

  /**
   * Read the rows back exactly as they are on screen, including any that are
   * incomplete. Validation has to see the incomplete ones — filtering them
   * out first is how a half-filled row turns into a barber with no hours.
   *
   * @returns {Array}
   */
  function readHours() {
    return dom.$$("[data-hours-row]", hoursHost).map(function (row) {
      return {
        days: dom.$("[data-hours-days]", row).value.trim(),
        from: dom.$("[data-hours-from]", row).value,
        to: dom.$("[data-hours-to]", row).value,
        off: dom.$("[data-hours-off]", row).checked
      };
    });
  }

  /**
   * The schedule to store.
   *
   * A row with days is a statement about the week and is kept whether it is
   * open or closed — a barber closed all week is a real schedule, and
   * `hoursSummary` has to be able to say so.
   *
   * If that leaves nothing, one explicitly closed row is written instead. An
   * empty list would reach `roster.hours()`, which substitutes the salon's
   * default week — so a barber with no hours would quietly inherit a schedule
   * nobody gave them. A closed row says what was meant, and `hoursSummary`
   * reports "بلا دوام محدد".
   *
   * @param {Array} rows  as read back
   * @returns {Array}
   */
  function cleanHours(rows) {
    var kept = rows.filter(function (row) {
      return !!row.days;
    });

    return kept.length ? kept : [{ days: "الأيام", from: "", to: "", off: true }];
  }

  /* =====================================================================
     Validation
     ===================================================================== */

  var TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

  /**
   * @param {Object} data
   * @returns {string} an error message, or "" when the form is good
   */
  function validate(data) {
    if (!data.name) return "الاسم مطلوب.";

    /* A row needs its days: a start and an end with nothing to attach them to
       is a typo waiting to be stored, and it would drop out of the summary. */
    var nameless = data.hours.filter(function (entry) {
      return !entry.days;
    });

    if (nameless.length) return "كل صف دوام يحتاج أياماً.";

    var row = data.hours.filter(function (entry) {
      return !entry.off;
    })[0];

    if (row) {
      if (!TIME.test(row.from)) return "وقت البدء غير صالح. استخدم hh:MM، مثل 10:00.";
      if (!TIME.test(row.to)) return "وقت الانتهاء غير صالح. استخدم hh:MM، مثل 22:00.";

      /* A shift that ends before it starts is a shift nobody works. */
      if (row.from >= row.to) {
        return "وقت الانتهاء يجب أن يكون بعد وقت البدء، أو يتجاوز منتصف الليل.";
      }
    }

    return "";
  }

  /**
   * @param {string} message
   */
  function formError(message) {
    var node = dom.$("[data-form-error]", formNode);

    if (node) node.textContent = message || "";
  }

  /**
   * Turn the current form contents into a roster record. The keys are the
   * roster's own field names, not the form's, so nothing is renamed on the way
   * in and `add`/`update` can be handed this directly.
   *
   * @returns {Object}
   */
  function readForm() {
    var data = dom.formData(formBody);

    return {
      name: (data.name || "").trim(),
      title: (data.role || "").trim(),
      initials: (data.initials || "").trim(),
      yearsOfExperience: data.experience === "" ? 0 : Number(data.experience) || 0,
      status: data.status || roster.STATUS.available,
      serviceIds: [].concat(data.services || []),
      specialties: (data.specialties || "")
        .split(/[،,]/)
        .map(function (part) {
          return part.trim();
        })
        .filter(Boolean),
      hours: cleanHours(readHours())
    };
  }

  function updateServiceCount() {
    var counter = dom.$("[data-checkgroup-count]", formBody);
    if (!counter) return;

    var picked = dom.$$("[data-checkgroup='services'] input:checked", formBody).length;
    var total = dom.$$("[data-checkgroup='services'] input", formBody).length;

    counter.textContent = picked + " من " + total;
  }

  function submitForm() {
    var data = readForm();
    var problem = validate(data);

    if (problem) {
      formError(problem);

      /* Focus the first field that is actually wrong, so the message is
         attached to something the keyboard can reach. */
      if (!data.name) {
        var name = dom.$("#bf-name", formBody);
        if (name) name.focus();
      }
      return;
    }

    formError("");

    var existing = formId.value;
    var saved = existing
      ? roster.update(existing, data)
      : roster.add(data);

    if (!saved) {
      formError("تعذّر الحفظ. تأكد من الاسم ثم أعد المحاولة.");
      return;
    }

    Halaq.modal.close(formNode);

    if (formRepaint) formRepaint();

    Halaq.toast.success(
      existing ? "تم تحديث " + saved.name : "أُضيف " + saved.name + " إلى الفريق",
      existing
        ? "الخدمات " + saved.serviceIds.length + " · " + roster.hoursSummary(saved)
        : "يمكن إسناد الحجوزات له الآن"
    );
  }

  /* =====================================================================
     Opening the dialog
     ===================================================================== */

  /**
   * @param {string|null} id  a barber to edit, or null to add
   * @param {Function} repaint
   * @param {Object} [opts]
   * @param {boolean} [opts.confirmLeave]  an existing barber, so closing
   *   without saving has to ask
   */
  function openForm(id, repaint, opts) {
    opts = opts || {};

    var box = formBox();
    var editing = id ? roster.get(id) : null;

    if (id && !editing) {
      Halaq.toast.error("الحلاق غير موجود", "ربما أُعيد تحميل البيانات.");
      return;
    }

    formRepaint = repaint;
    formError("");

    formId.value = editing ? editing.id : "";

    dom.$("#bf-name", formBody).value = editing ? editing.name : "";
    dom.$("#bf-role", formBody).value = editing ? editing.title : "";
    dom.$("#bf-initials", formBody).value = editing ? editing.initials : "";
    dom.$("#bf-experience", formBody).value = editing ? editing.yearsOfExperience : "";
    dom.$("#bf-status", formBody).value = editing ? editing.status : roster.STATUS.available;
    dom.$("#bf-specialties", formBody).value = editing
      ? (editing.specialties || []).join("، ")
      : "";

    var owned = (editing && editing.serviceIds) || [];

    dom.$$("[data-checkgroup='services'] input", formBody).forEach(function (input) {
      input.checked = owned.indexOf(input.value) !== -1;
    });

    updateServiceCount();
    writeHours(editing ? roster.hours(editing.hours) : []);

    Halaq.modal.open(box, {
      title: editing ? "تعديل " + editing.name : "إضافة حلاق",
      description: editing
        ? "الخدمات والدوام والحالة. إيقافه عن الفريق يبقي سجلّه وحجوزاته."
        : "الخدمات والدوام والحالة. يظهر في صفحة الحجز فور حفظه."
    });

    if (editing && opts.confirmLeave) formNode.dataset.leaving = "1";
    else delete formNode.dataset.leaving;
  }

  /* =====================================================================
     Cards
     ===================================================================== */

  /**
   * The rating, or an honest blank. A new barber has no reviews, and showing
   * them a zero-star barber next to a five-star one would be a claim the
   * salon has not made yet.
   *
   * @param {Object} barber
   * @returns {Node}
   */
  function ratingLine(barber) {
    if (!barber.reviewsCount) {
      return dom.el("span", { class: "barber-card__new", text: "جديد" });
    }

    return dom.el("span", { class: "barber-card__rating" }, [
      dom.icon("star", "icon--xs"),
      dom.el("span", { class: "num", text: Number(barber.rating || 0).toFixed(1) }),
      dom.el("span", { class: "barber-card__reviews num", text: "(" + barber.reviewsCount + ")" })
    ]);
  }

  /**
   * @param {Object} barber
   * @param {Function} repaint
   * @returns {HTMLElement}
   */
  function barberCard(barber, repaint) {
    var status = roster.statusInfo(barber.status);
    var serviceNames = roster.serviceCatalogue()
      .filter(function (service) {
        return (barber.serviceIds || []).indexOf(service.id) !== -1;
      });

    return dom.el("article", {
      class: "barber-card" + (barber.enabled ? "" : " is-off"),
      "data-barber": barber.id
    }, [
      dom.el("header", { class: "barber-card__head" }, [
        ui.person({
          name: barber.name,
          initials: barber.initials,
          muted: barber.title || null
        }),

        dom.el("div", { class: "barber-card__badges" }, [
          status.label
            ? ui.badge({ label: status.label, icon: status.icon, tone: status.tone })
            : null,
          barber.enabled
            ? null
            : ui.badge({ label: "خارج الفريق", icon: "ban", tone: "danger" })
        ])
      ]),

      dom.el("dl", { class: "barber-card__facts" }, [
        dom.el("div", { class: "barber-card__fact" }, [
          dom.el("dt", { text: "الخبرة" }),
          dom.el("dd", { class: "num", text: barber.yearsOfExperience + " سنة" })
        ]),
        dom.el("div", { class: "barber-card__fact" }, [
          dom.el("dt", { text: "التقييم" }),
          dom.el("dd", {}, [ratingLine(barber)])
        ]),
        dom.el("div", { class: "barber-card__fact barber-card__fact--wide" }, [
          dom.el("dt", { text: "الدوام" }),
          dom.el("dd", { text: roster.hoursSummary(barber) })
        ])
      ]),

      (barber.specialties && barber.specialties.length)
        ? dom.el("ul", { class: "barber-card__tags" }, barber.specialties.map(function (item) {
            return dom.el("li", { class: "tag", text: item });
          }))
        : null,

      dom.el("div", { class: "barber-card__services" }, [
        dom.el("h3", { class: "barber-card__sub" }, [
          dom.el("span", { text: "الخدمات" }),
          dom.el("span", {
            class: "barber-card__count num",
            text: serviceNames.length
          })
        ]),

        serviceNames.length
          ? dom.el("ul", { class: "barber-card__chips" }, serviceNames.map(function (service) {
              return dom.el("li", { class: "tag tag--service", text: service.name });
            }))
          : dom.el("p", {
              class: "barber-card__none",
              text: "لم تُسند إليه خدمة بعد. لن تظهر خياراته في الحجز."
            })
      ]),

      dom.el("div", { class: "barber-card__status" }, [
        dom.el("label", { class: "barber-card__status-label", for: "status-" + barber.id }, [
          dom.el("span", { text: "الحالة الآن" })
        ]),

        dom.el("select", {
          class: "select select--compact",
          id: "status-" + barber.id,
          disabled: !barber.enabled,
          onchange: function (event) {
            changeStatus(barber.id, event.target.value, repaint);
          }
        }, roster.STATUS_ORDER.map(function (key) {
          return dom.el("option", {
            value: key,
            text: roster.statusInfo(key).label,
            selected: key === barber.status
          });
        })),

        !barber.enabled
          ? dom.el("p", { class: "barber-card__status-note", text: "خارج الفريق — فعّله لتغيير الحالة." })
          : null
      ]),

      dom.el("div", { class: "barber-card__actions" }, [
        ui.button({
          label: "تعديل",
          icon: "settings",
          variant: "secondary",
          size: "sm",
          data: { editBarber: barber.id },
          onClick: function () {
            openForm(barber.id, repaint, { confirmLeave: true });
          }
        }),

        barber.enabled
          ? ui.button({
              label: "إيقاف",
              icon: "ban",
              variant: "ghost",
              size: "sm",
              data: { toggleBarber: barber.id, enabled: "false" },
              onClick: function () {
                changeEnabled(barber, false, repaint);
              }
            })
          : ui.button({
              label: "تفعيل",
              icon: "check",
              variant: "secondary",
              size: "sm",
              data: { toggleBarber: barber.id, enabled: "true" },
              onClick: function () {
                changeEnabled(barber, true, repaint);
              }
            })
      ])
    ]);
  }

  /* =====================================================================
     Writing
     ===================================================================== */

  function changeEnabled(barber, enabled, repaint) {
    if (enabled) {
      var back = roster.setEnabled(barber.id, true);

      repaint();
      Halaq.toast.success(back.name + " عاد إلى الفريق", roster.hoursSummary(back));
      return;
    }

    /* Stopping someone takes them off the public booking page, which is not
       something a mis-click should do. The admin's one confirmation dialog
       owns that, so the queue, this screen and the services screen all ask the
       same way. */
    admin.confirm.ask({
      title: "إيقاف " + barber.name,
      description: "لن يُسند إليه حجوزات جديدة، ويختفي من صفحة الحجز. " +
        "حجوزاته السابقة وتقييمه يبقى في التقارير.",
      subject: barber.name + " · " + (barber.serviceIds || []).length + " خدمة",
      confirmLabel: "إيقاف",
      onConfirm: function () {
        var saved = roster.setEnabled(barber.id, false);

        repaint();

        Halaq.toast.info(
          saved.name + " أُوقف عن الفريق",
          "حجوزاته السابقة محفوظة، ولن تُسند إليه حجوزات جديدة."
        );
      }
    });
  }

  /**
   * @param {string} id
   * @param {string} status
   * @param {Function} repaint
   */
  function changeStatus(id, status, repaint) {
    var saved = roster.setStatus(id, status);

    if (!saved) return;

    repaint();

    Halaq.toast.success(
      saved.name + " · " + roster.statusInfo(saved.status).label,
      roster.statusInfo(saved.status).note || ""
    );
  }

  /* =====================================================================
     The screen
     ===================================================================== */

  /**
   * @param {Object} section from Halaq.admin.nav
   * @returns {HTMLElement}
   */
  function render(section) {
    var statsHost = dom.el("div", { "data-team-stats": "" });
    var gridHost = dom.el("div", {
      class: "barber-grid",
      "data-barber-grid": ""
    });

    function repaint() {
      var team = metrics.barbers();
      var offShift = team.enabled.filter(function (barber) {
        return !roster.isAvailable(barber);
      });

      dom.render(statsHost, ui.statRow([
        {
          label: "في الفريق",
          value: team.enabled.length,
          num: true,
          icon: "users",
          tone: "neutral",
          hint: "من " + team.team.length + " مسجّلين"
        },
        {
          label: "متاحون الآن",
          value: team.available.length,
          num: true,
          icon: "check",
          tone: "success",
          hint: "يقبلون حجوزات جديدة"
        },
        {
          label: "خارج الدوام",
          value: offShift.length,
          num: true,
          icon: "clock",
          tone: "warning",
          hint: offShift.length ? "لا يقبلون حجوزات الآن" : "الجميع على رأس العمل"
        },
        {
          label: "موقوفون",
          value: team.team.length - team.enabled.length,
          num: true,
          icon: "ban",
          tone: "danger",
          hint: "خارج الفريق"
        }
      ]));

      dom.render(gridHost, team.team.length
        ? team.team.map(function (barber) {
            return barberCard(barber, repaint);
          })
        : [ui.emptyState({
            icon: "users",
            title: "لا يوجد حلاقون",
            message: "أضف أول حلاق إلى الفريق.",
            action: ui.button({
              label: "إضافة حلاق",
              icon: "plus",
              variant: "primary",
              size: "sm",
              onClick: function () {
                openForm(null, repaint);
              }
            })
          })]);
    }

    repaint();

    return dom.el("div", { class: "stack", "data-team": "" }, [
      ui.pageHeader(section, {
        actions: [
          ui.button({
            label: "تحديث",
            icon: "refresh",
            variant: "ghost",
            size: "sm",
            data: { refreshTeam: "" },
            onClick: function () {
              repaint();
            }
          }),

          ui.button({
            label: "إضافة حلاق",
            icon: "plus",
            variant: "primary",
            size: "sm",
            data: { addBarber: "" },
            onClick: function () {
              openForm(null, repaint);
            }
          })
        ]
      }),

      statsHost,

      ui.card({
        title: "فريق الحلاقين",
        description: "الخدمات والدوام والحالة. الوقف يبقي سجلّ الحجز ولا يمنع قراءة التقارير."
      }, [gridHost])
    ]);
  }

  admin.team = {
    render: render,
    openForm: openForm,
    formBox: formBox
  };
})(window.Halaq = window.Halaq || {});
