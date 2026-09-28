/* ==========================================================================
   Halaq — Admin settings
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.settings

   One form over the salon's own configuration, and no string of it in this
   file.

   What "no hardcoded text" means here
   -----------------------------------
   The screen draws labels, so it necessarily contains Arabic words. What it
   must not contain is the *salon's* words: its name, its address, its opening
   hours, its booking rules. Every one of those is read from
   `Halaq.admin.config` and written back to it, and the store is the same
   object the sidebar, the booking calendar and the public site read. Change the
   name here and the name moves in the header in the same tick — which is the
   only way to tell a settings screen that works from one that merely looks
   like it does.

   The one form, five groups
   -------------------------
   All five groups are on the page at once behind an anchor list, rather than
   behind tabs. A tabbed settings screen hides three quarters of the
   configuration behind a click, and on a phone it means five horizontal
   scrolls to find the field somebody came to change. One form also means one
   save, one validation pass, and one answer about whether anything is unsaved.

   What saving does, in order
   --------------------------
   validate → store in localStorage → patch the running objects → announce it
   on the document. Nothing is stored when validation fails, because a config
   with an unopenable Saturday is worse than no change: it is a change that
   looks applied and is not.

   And what saving cannot do
   -------------------------
   It cannot reach a server, so a real deployment writes these through an
   authenticated API and re-validates the hours and the rules there. A client
   that is told "closed" must be told it by the server too. Same warning as
   auth.js, and it belongs on the screen as well as in this comment, so whoever
   signs in sees it rather than assuming the demo is the mechanism.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var admin = Halaq.admin = Halaq.admin || {};

  var ui = admin.ui;
  var config = admin.config;

  var LIMITS = config.LIMITS;
  var DAY_NAMES = config.DAY_NAMES;

  /* The groups, in the order they appear. Also the anchor list, so the nav and
     the page cannot disagree about what sections exist. */
  var GROUPS = [
    { id: "identity", label: "هوية الصالون", icon: "crown" },
    { id: "logo", label: "الشعار", icon: "sparkles" },
    { id: "contact", label: "التواصل والموقع", icon: "map-pin" },
    { id: "hours", label: "ساعات العمل", icon: "clock" },
    { id: "rules", label: "قواعد الحجز", icon: "ticket" },
    { id: "public", label: "ما يراه العميل", icon: "eye" }
  ];

  /* The pristine values the form was built from. Compared against on every
     change, which is how the save button knows whether there is anything to
     save and the banner knows whether to warn. */
  var baseline = null;

  /* =====================================================================
     Reading and writing the form
     ===================================================================== */

  function numberInput(id, name, value, limit, suffix) {
    return ui.field({
      id: id,
      label: suffix ? name + " (" + suffix + ")" : name,
      control: dom.el("input", {
        class: "input num",
        id: id,
        name: name,
        type: "number",
        inputmode: "numeric",
        min: limit.min,
        max: limit.max,
        step: 1,
        value: value
      }),
      hint: "من " + fmt.number(limit.min) + " إلى " + fmt.number(limit.max) + "."
    });
  }

  function textField(opts) {
    return ui.field({
      id: opts.id,
      label: opts.label,
      required: opts.required,
      wide: opts.wide,
      hint: opts.hint,
      control: dom.el(opts.multiline ? "textarea" : "input", {
        class: opts.multiline ? "textarea" : "input",
        id: opts.id,
        name: opts.name,
        type: opts.multiline ? null : (opts.type || "text"),
        rows: opts.multiline ? 3 : null,
        maxlength: opts.maxlength || LIMITS.copy.max,
        value: opts.value,
        dir: opts.dir || null,
        inputmode: opts.inputmode || null,
        autocomplete: opts.autocomplete || null,
        placeholder: opts.placeholder || null
      })
    });
  }

  /**
   * The form's contents, as a settings object.
   *
   * Read from the DOM on demand rather than mirrored as the user types, so
   * there is no second copy to fall out of step with the fields.
   *
   * @param {HTMLElement} form
   * @returns {Object}
   */
  function readForm(form) {
    var data = dom.formData(form);

    var hours = [];
    for (var day = 0; day < 7; day += 1) {
      hours.push({
        open: data["hours." + day + ".open"] || "",
        close: data["hours." + day + ".close"] || "",
        closed: data["hours." + day + ".closed"] === "on"
      });
    }

    return {
      shop: {
        name: String(data.name || "").trim(),
        latinName: String(data.latinName || "").trim(),
        tagline: String(data.tagline || "").trim(),
        establishedYear: data.establishedYear
      },
      logo: {
        glyph: data.glyph || "",
        initials: String(data.initials || "").trim()
      },
      contact: {
        phone: String(data.phone || "").trim(),
        whatsapp: String(data.whatsapp || "").trim(),
        email: String(data.email || "").trim(),
        city: String(data.city || "").trim(),
        district: String(data.district || "").trim(),
        address: String(data.address || "").trim(),
        mapUrl: String(data.mapUrl || "").trim()
      },
      hours: hours,
      rules: {
        slotMinutes: data.slotMinutes,
        windowDays: data.windowDays,
        leadMinutes: data.leadMinutes,
        cancellationHours: data.cancellationHours,
        requirePhone: data.requirePhone === "on",
        allowAnyBarber: data.allowAnyBarber === "on"
      },
      public: {
        eyebrow: String(data.eyebrow || "").trim(),
        title: String(data.title || "").trim(),
        titleAccent: String(data.titleAccent || "").trim(),
        description: String(data.description || "").trim(),
        about: String(data.about || "").trim(),
        paymentNote: String(data.paymentNote || "").trim()
      }
    };
  }

  /**
   * Has anything actually changed?
   *
   * Compared as JSON, which is enough for a flat settings object and avoids a
   * deep-equality helper that would be wrong about a missing key in a way that
   * is hard to see.
   *
   * @param {Object} next
   * @returns {boolean}
   */
  function isDirty(next) {
    return JSON.stringify(next) !== JSON.stringify(baseline);
  }

  function clearErrors() {
    dom.$$("[data-settings-error]").forEach(function (node) {
      node.textContent = "";
      node.hidden = true;
      var field = dom.$("[data-settings-field=" + node.getAttribute("for") + "]");
      if (field) field.removeAttribute("aria-invalid");
    });
  }

  /**
   * Put each problem on its own field, and take the first one to focus.
   *
   * @param {Object} errors keyed by form field name
   * @param {HTMLElement} form
   */
  function showErrors(errors, form) {
    clearErrors();

    var first = null;

    Object.keys(errors).forEach(function (name) {
      var control = dom.$('[name="' + name + '"]', form);
      var slot = control
        ? dom.$("[data-settings-error][for=" + CSS.escape(name) + "]", form)
        : null;

      if (control) control.setAttribute("aria-invalid", "true");

      if (slot) {
        slot.textContent = errors[name];
        slot.hidden = false;
      }

      if (control && !first) first = control;
    });

    if (first) {
      first.focus();

      /* A field scrolled out of sight in a long form is a field the user will
         not find, even having been focused. */
      if (first.scrollIntoView) {
        first.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }

  /* =====================================================================
     The preview
     ===================================================================== */

  /**
   * What the customer will see, rebuilt as the form is filled in.
   *
   * A settings screen that only says "it saved" leaves the operator to imagine
   * the result. This draws the header and the contact block from the values in
   * the form, so a wrong phone number is visible before it is stored.
   *
   * @param {Object} next
   * @returns {HTMLElement}
   */
  function preview(next) {
    var mark = dom.el("span", { class: "preview__mark", "aria-hidden": "true" },
      next.logo.initials
        ? [dom.el("span", { class: "preview__initials", text: next.logo.initials })]
        : [dom.icon(next.logo.glyph || "scissors", "icon--lg")]
    );

    return dom.el("div", { class: "preview", "data-preview": "" }, [
      dom.el("div", { class: "preview__head" }, [
        mark,
        dom.el("div", { class: "preview__titles" }, [
          dom.el("p", { class: "preview__name", text: next.shop.name || "اسم الصالون" }),
          dom.el("p", {
            class: "preview__tagline",
            text: next.shop.tagline || "الوصف المختصر يظهر تحت الاسم."
          })
        ])
      ]),

      dom.el("p", { class: "preview__hero" }, [
        dom.el("span", { class: "preview__eyebrow", text: next.public.eyebrow }),
        dom.el("strong", { class: "preview__title", text: next.public.title }),
        dom.el("span", { class: "preview__accent", text: next.public.titleAccent })
      ]),

      dom.el("dl", { class: "preview__facts" }, [
        previewFact("الجوال", next.contact.phone, true),
        previewFact("البريد", next.contact.email, true),
        previewFact("العنوان", joinAddress(next.contact), false),
        previewFact("ساعات العمل", config.hoursDisplay(next.hours)
          .map(function (line) { return line.days + ": " + line.time; })
          .join(" · "), false)
      ]),

      next.public.paymentNote
        ? dom.el("p", { class: "preview__note" }, [
            dom.icon("info", "icon--sm"),
            dom.el("span", { text: next.public.paymentNote })
          ])
        : null
    ]);
  }

  function joinAddress(contact) {
    return [contact.address, contact.district, contact.city]
      .filter(Boolean)
      .join("، ") || "العنوان غير محدد.";
  }

  function previewFact(label, value, isNum) {
    return dom.el("div", { class: "preview__fact" }, [
      dom.el("dt", { text: label }),
      dom.el("dd", {
        class: isNum ? "num" : "",
        text: value || "غير محدد"
      })
    ]);
  }

  /* =====================================================================
     Groups
     ===================================================================== */

  function identityGroup(settings) {
    return dom.el("div", { class: "settings-group", id: "settings-identity" }, [
      dom.el("h3", { class: "settings-group__title" }, [
        dom.icon("crown", "icon--sm"),
        dom.el("span", { text: "هوية الصالون" })
      ]),
      dom.el("p", {
        class: "settings-group__note",
        text: "الاسم الذي يظهر في رأس الموقع وفي لوحة الإدارة."
      }),

      dom.el("div", { class: "form__grid form__grid--2" }, [
        textField({
          id: "settings-name",
          name: "name",
          label: "اسم الصالون",
          value: settings.shop.name,
          required: true,
          maxlength: LIMITS.name.max,
          hint: "يظهر في الشريط الجانبي وفي رأس صفحة الحجز."
        }),
        textField({
          id: "settings-latin-name",
          name: "latinName",
          label: "الاسم بالإنجليزية",
          value: settings.shop.latinName,
          dir: "ltr",
          maxlength: LIMITS.name.max,
          hint: "للبيانات الوصفية فقط، ولا يظهر للزوار."
        }),
        textField({
          id: "settings-tagline",
          name: "tagline",
          label: "الوصف المختصر",
          value: settings.shop.tagline,
          maxlength: LIMITS.tagline.max,
          hint: "سطر واحد تحت الاسم."
        }),
        numberInput("settings-year", "سنة الافتتاح",
          settings.shop.establishedYear, LIMITS.year, "سنة")
      ])
    ]);
  }

  function logoGroup(settings) {
    var options = config.GLYPHS.map(function (glyph) {
      return { value: glyph.id, label: glyph.label };
    });

    return dom.el("div", { class: "settings-group", id: "settings-logo" }, [
      dom.el("h3", { class: "settings-group__title" }, [
        dom.icon("sparkles", "icon--sm"),
        dom.el("span", { text: "الشعار" })
      ]),
      dom.el("p", {
        class: "settings-group__note",
        text: "مكان الشعار فقط. لا يوجد رفع ملفات في هذه النسخة، " +
          "فاختر رمزاً أو اكتب حروفاً، ويحفظ واحدٌ منهما."
      }),

      dom.el("div", { class: "form__grid form__grid--2" }, [
        ui.field({
          id: "settings-glyph",
          label: "الرمز",
          control: dom.el("select", {
            class: "select",
            id: "settings-glyph",
            name: "glyph"
          }, options.map(function (option) {
            return dom.el("option", {
              value: option.value,
              text: option.label,
              selected: option.value === settings.logo.glyph
            });
          })),
          hint: "من رموز الموقع، فيظهر في الموضع نفسه الذي سيظهر فيه الشعار."
        }),
        textField({
          id: "settings-initials",
          name: "initials",
          label: "أو حروف الاسم",
          value: settings.logo.initials,
          maxlength: LIMITS.initials.max,
          hint: "حرفان أو ثلاثة. إن وُجدت غلبت على الرمز."
        })
      ])
    ]);
  }

  function contactGroup(settings) {
    return dom.el("div", { class: "settings-group", id: "settings-contact" }, [
      dom.el("h3", { class: "settings-group__title" }, [
        dom.icon("map-pin", "icon--sm"),
        dom.el("span", { text: "التواصل والموقع" })
      ]),
      dom.el("p", {
        class: "settings-group__note",
        text: "تظهر في تذييل الموقع، وتُبنى منها روابط الاتصال والواتساب."
      }),

      dom.el("div", { class: "form__grid form__grid--2" }, [
        textField({
          id: "settings-phone",
          name: "phone",
          label: "رقم الجوال",
          value: settings.contact.phone,
          type: "tel",
          dir: "ltr",
          inputmode: "tel",
          required: settings.rules.requirePhone,
          autocomplete: "tel",
          hint: "بين 9 و15 رقماً. يُبنى منه رابط الاتصال تلقائياً."
        }),
        textField({
          id: "settings-whatsapp",
          name: "whatsapp",
          label: "رقم الواتساب",
          value: settings.contact.whatsapp,
          type: "tel",
          dir: "ltr",
          inputmode: "tel",
          hint: "اتركه فارغاً ليستخدم رقم الجوال."
        }),
        textField({
          id: "settings-email",
          name: "email",
          label: "البريد الإلكتروني",
          value: settings.contact.email,
          type: "email",
          dir: "ltr",
          inputmode: "email",
          hint: "اختياري، ويُتحقق من شكله إن كُتب."
        }),
        textField({
          id: "settings-city",
          name: "city",
          label: "المدينة",
          value: settings.contact.city,
          maxlength: 60
        }),
        textField({
          id: "settings-district",
          name: "district",
          label: "الحي",
          value: settings.contact.district,
          maxlength: 60
        }),
        textField({
          id: "settings-map",
          name: "mapUrl",
          label: "رابط الموقع على الخريطة",
          value: settings.contact.mapUrl,
          type: "url",
          dir: "ltr",
          maxlength: 300
        })
      ]),

      textField({
        id: "settings-address",
        name: "address",
        label: "العنوان",
        value: settings.contact.address,
        wide: true,
        maxlength: 160,
        required: true
      })
    ]);
  }

  function hoursGroup(settings) {
    return dom.el("div", { class: "settings-group", id: "settings-hours" }, [
      dom.el("h3", { class: "settings-group__title" }, [
        dom.icon("clock", "icon--sm"),
        dom.el("span", { text: "ساعات العمل" })
      ]),
      dom.el("p", {
        class: "settings-group__note",
        text: "هذه هي الساعات التي يعرضها التقويم فعلياً عند الحجز، " +
          "وليست نصاً وصفاً. اليوم المغلق لا يعرض أي موعد."
      }),

      dom.el("div", { class: "hours", "data-hours": "" }, settings.hours
        .map(function (row, day) {
          return hourRow(row, day);
        }))
    ]);
  }

  /**
   * One day: a name, a closed switch, and the two times.
   *
   * The switch is a real switch with the state written on both sides of the
   * track, and switching a day off greys its time fields rather than merely
   * hiding them — a field that disappears takes with it the answer to "what
   * time is it on Saturdays", which is the question the row is there for.
   */
  function hourRow(row, day) {
    var openId = "hours-" + day + "-open";
    var closeId = "hours-" + day + "-close";
    var closedId = "hours-" + day + "-closed";

    var openField = dom.el("input", {
      class: "input num",
      id: openId,
      name: "hours." + day + ".open",
      type: "time",
      value: row.open || "10:00",
      disabled: !!row.closed,
      "aria-describedby": openId + "-label"
    });

    var closeField = dom.el("input", {
      class: "input num",
      id: closeId,
      name: "hours." + day + ".close",
      type: "time",
      value: row.close || "22:00",
      disabled: !!row.closed,
      "aria-describedby": closeId + "-label"
    });

    var row$ = dom.el("div", {
      class: "hours__row" + (row.closed ? " is-closed" : ""),
      "data-hours-row": day
    }, [
      dom.el("span", { class: "hours__day", text: DAY_NAMES[day] }),

      dom.el("span", { class: "hours__range" }, [
        openField,
        dom.el("span", { class: "hours__dash", "aria-hidden": "true", text: "–" }),
        closeField
      ]),

      ui.switchField({
        id: closedId,
        label: "مغلق",
        onLabel: "مفتوح",
        offLabel: "مغلق",
        checked: !!row.closed,
        onchange: function (event) {
          var closed = event.target.checked;
          row$.classList.toggle("is-closed", closed);
          openField.disabled = closed;
          closeField.disabled = closed;
        }
      })
    ]);

    /* Two visually hidden labels, so each time input is named even though the
       row puts one day name across both of them. */
    [openField, closeField].forEach(function (field) {
      var id = field.getAttribute("aria-describedby");
      row$.appendChild(dom.el("span", {
        class: "sr-only",
        id: id,
        text: (field === openField ? "يفتح " : "يغلق ") + DAY_NAMES[day]
      }));
    });

    return row$;
  }

  function rulesGroup(settings) {
    return dom.el("div", { class: "settings-group", id: "settings-rules" }, [
      dom.el("h3", { class: "settings-group__title" }, [
        dom.icon("ticket", "icon--sm"),
        dom.el("span", { text: "قواعد الحجز" })
      ]),
      dom.el("p", {
        class: "settings-group__note",
        text: "تتحكم في ما يعرضه التقويم للعميل عند الحجز."
      }),

      dom.el("div", { class: "form__grid form__grid--3" }, [
        numberInput("settings-slot", "مدة الموعد",
          settings.rules.slotMinutes, LIMITS.slotMinutes, "دقيقة"),
        numberInput("settings-window", "أفق الحجز",
          settings.rules.windowDays, LIMITS.windowDays, "يوماً"),
        numberInput("settings-lead", "أقل مدة إشعار",
          settings.rules.leadMinutes, LIMITS.leadMinutes, "دقيقة"),
        numberInput("settings-cancel", "مهلة الإلغاء",
          settings.rules.cancellationHours, LIMITS.cancellationHours, "ساعة")
      ]),

      dom.el("div", { class: "checkgroup", "data-checkgroup": "rules" }, [
        dom.el("legend", { class: "checkgroup__legend" }, [
          dom.el("span", { text: "شروط إضافية" })
        ]),

        dom.el("div", { class: "checkgroup__grid" }, [
          dom.el("label", { class: "choice", for: "settings-require-phone" }, [
            dom.el("input", {
              type: "checkbox",
              id: "settings-require-phone",
              name: "requirePhone",
              checked: !!settings.rules.requirePhone,
              onchange: function () { markDirty(); }
            }),
            dom.el("span", { class: "choice__body" }, [
              dom.el("span", { class: "choice__label", text: "جوال العميل إلزامي" }),
              dom.el("span", {
                class: "choice__note",
                text: "يُستخدم للتحقق من الحجز في صفحة التتبّع."
              })
            ])
          ]),

          dom.el("label", { class: "choice", for: "settings-allow-any" }, [
            dom.el("input", {
              type: "checkbox",
              id: "settings-allow-any",
              name: "allowAnyBarber",
              checked: !!settings.rules.allowAnyBarber,
              onchange: function () { markDirty(); }
            }),
            dom.el("span", { class: "choice__body" }, [
              dom.el("span", { class: "choice__label", text: "السماح بـ«أي حلاق»" }),
              dom.el("span", {
                class: "choice__note",
                text: "يعرض الصالون موعداً دون حلاق محدَّد."
              })
            ])
          ])
        ])
      ])
    ]);
  }

  function publicGroup(settings) {
    return dom.el("div", { class: "settings-group", id: "settings-public" }, [
      dom.el("h3", { class: "settings-group__title" }, [
        dom.icon("eye", "icon--sm"),
        dom.el("span", { text: "ما يراه العميل" })
      ]),
      dom.el("p", {
        class: "settings-group__note",
        text: "النصوص التي تقرأها الصفحة الرئيسية وتذكرة الحجز. " +
          "تغيير ملاحظة الدفع يسري على الحجوزات الجديدة فقط، " +
          "فالتذكرة القديمة تحتفظ بما كان مكتوباً عند الحجز."
      }),

      textField({
        id: "settings-eyebrow",
        name: "eyebrow",
        label: "السطر العلوي",
        value: settings.public.eyebrow,
        maxlength: 120
      }),

      dom.el("div", { class: "form__grid form__grid--2" }, [
        textField({
          id: "settings-title",
          name: "title",
          label: "العنوان الرئيسي",
          value: settings.public.title,
          required: true,
          maxlength: 80
        }),
        textField({
          id: "settings-accent",
          name: "titleAccent",
          label: "الجزء المميّز",
          value: settings.public.titleAccent,
          maxlength: 80,
          hint: "يظهر بلون مختلف داخل العنوان."
        })
      ]),

      textField({
        id: "settings-description",
        name: "description",
        label: "وصف الصفحة الرئيسية",
        value: settings.public.description,
        multiline: true,
        wide: true
      }),

      textField({
        id: "settings-about",
        name: "about",
        label: "نبذة عن الصالون",
        value: settings.public.about,
        multiline: true,
        wide: true,
        hint: "تظهر في بيانات الصفحة وفي ذيل الموقع."
      }),

      textField({
        id: "settings-payment-note",
        name: "paymentNote",
        label: "ملاحظة الدفع",
        value: settings.public.paymentNote,
        multiline: true,
        wide: true,
        required: true,
        hint: "تظهر على تذكرة الحجز. لا تُترك فارغة."
      })
    ]);
  }

  /* =====================================================================
     Save and reset
     ===================================================================== */

  /**
   * Give one field somewhere to report a problem.
   *
   * The slot is appended to the nearest .field or .hours__row above the
   * control, which is where a reader is already looking, and is keyed by the
   * control's `name` so showErrors can find it without a second lookup table.
   *
   * @param {HTMLElement} form
   * @param {string} name the control's name attribute
   */
  function attachErrorSlot(form, name) {
    var control = dom.$('[name="' + name + '"]', form);
    if (!control) return;

    var host = control.closest(".field") || control.closest(".hours__row");
    if (!host) return;

    if (dom.$("[data-settings-error][for=" + CSS.escape(name) + "]", host)) return;

    host.appendChild(dom.el("p", {
      class: "field__error",
      "data-settings-error": "",
      for: name,
      role: "alert",
      hidden: true
    }));
  }

  function formNode() {
    return dom.$("[data-settings-form]");
  }

  function dirtyNode() {
    return dom.$("[data-settings-dirty]");
  }

  function saveButton() {
    return dom.$("[data-submit-settings]");
  }

  function revertButton() {
    return dom.$("[data-revert-settings]");
  }

  /**
   * Both buttons are enabled by the same question — has anything changed — so
   * "تراجع" can never be pressed on a pristine form and "حفظ" can never be
   * pressed on one that has already been saved.
   */
  function markDirty() {
    var form = formNode();
    if (!form) return;

    var dirty = isDirty(readForm(form));
    var banner = dirtyNode();

    if (banner) banner.hidden = !dirty;

    [saveButton(), revertButton()].forEach(function (button) {
      if (!button) return;
      button.disabled = !dirty;
      button.setAttribute("aria-disabled", String(!dirty));
    });
  }

  function repaintPreview() {
    var form = formNode();
    var host = dom.$("[data-preview]");
    if (!form || !host) return;

    dom.render(host.parentNode, [preview(readForm(form))]);
    markDirty();
  }

  function submit() {
    var form = formNode();
    if (!form) return;

    var next = readForm(form);
    var result = config.save(next);

    if (!result.ok) {
      showErrors(result.errors, form);
      Halaq.toast.error("لم يُحفظ شيء", "راجع الحقول المعلَّمة بالأحمر.");
      return;
    }

    clearErrors();
    baseline = JSON.parse(JSON.stringify(next));
    markDirty();
    repaintPreview();

    Halaq.toast.success(
      "حُفظت الإعدادات",
      result.persisted ? "تُطبَّق على هذه الجلسة وتُحفظ في المتصفح."
        : "تُطبَّق على هذه الجلسة فقط؛ تعذّر الحفظ في المتصفح."
    );
  }

  function askReset() {
    admin.confirm.ask({
      title: "استعادة الإعدادات الافتراضية",
      description: "يعود كل ما عدّلته إلى ما كان عليه قبل فتح هذه الشاشة. " +
        "لا رجعة في ذلك، والحجوزات والخدمات لا تتأثر.",
      subject: Object.keys(baseline || {}).map(function (group) {
        return groupLabel(group);
      }).join("، "),
      confirmLabel: "استعادة",
      onConfirm: function () {
        var restored = config.reset();
        admin.app.paint(admin.nav.resolve("settings"));
        Halaq.toast.success("استُعيدت الإعدادات الافتراضية", restored.shop.name);
      }
    });
  }

  function groupLabel(id) {
    var found = GROUPS.filter(function (group) {
      return group.id === id;
    })[0];

    return found ? found.label : id;
  }

  /* =====================================================================
     The screen
     ===================================================================== */

  /**
   * @param {Object} section from Halaq.admin.nav
   * @returns {HTMLElement}
   */
  function render(section) {
    var settings = config.get();
    baseline = JSON.parse(JSON.stringify(settings));

    var form = dom.el("form", {
      class: "settings-form",
      "data-settings-form": "",
      novalidate: true,
      onsubmit: function (event) {
        event.preventDefault();
        submit();
      },
      oninput: repaintPreview,
      onchange: repaintPreview
    }, [
      identityGroup(settings),
      logoGroup(settings),
      contactGroup(settings),
      hoursGroup(settings),
      rulesGroup(settings),
      publicGroup(settings)
    ]);

    /* The problem message for each field sits inside its own .field, so it is
       found by walking up from the control rather than by counting siblings —
       and without :has(), which is newer than the rest of this project needs to
       support. */
    var FIELD_NAMES = [
      "name", "latinName", "tagline", "establishedYear", "glyph", "initials",
      "phone", "whatsapp", "email", "city", "district", "mapUrl", "address",
      "slotMinutes", "windowDays", "leadMinutes", "cancellationHours",
      "eyebrow", "title", "titleAccent", "description", "about", "paymentNote"
    ];

    FIELD_NAMES.forEach(function (name) {
      attachErrorSlot(form, name);
    });

    [0, 1, 2, 3, 4, 5, 6].forEach(function (day) {
      ["open", "close"].forEach(function (part) {
        attachErrorSlot(form, "hours." + day + "." + part);
      });
    });

    var anchor = dom.el("nav", {
      class: "settings-anchors",
      "aria-label": "أقسام الإعدادات"
    }, GROUPS.map(function (group) {
      return dom.el("a", {
        class: "settings-anchor",
        href: "#" + group.id,
        text: group.label
      });
    }));

    return dom.el("div", { class: "stack", "data-settings": "" }, [
      ui.pageHeader(section, {
        actions: [
          ui.button({
            label: "استعادة الافتراضي",
            icon: "refresh",
            variant: "ghost",
            size: "sm",
            data: { resetSettings: "" },
            onClick: askReset
          })
        ]
      }),

      dom.el("p", { class: "settings-warning" }, [
        dom.icon("alert-triangle", "icon--sm"),
        dom.el("span", {
          text: "تُحفظ إعدادات الصالون في هذا المتصفح فقط، ولا تصل إلى أي جهاز " +
            "آخر. في التشغيل الحقيقي يقرر الخادم هذه القيم ويتحقق منها، " +
            "ولا يكفي أن يقولها المتصفح."
        })
      ]),

      dom.el("div", { class: "settings-layout" }, [
        dom.el("div", { class: "settings-main" }, [
          anchor,
          form,

          dom.el("div", { class: "settings-actions" }, [
            dom.el("p", {
              class: "settings-dirty",
              "data-settings-dirty": "",
              role: "status",
              hidden: true
            }, [
              dom.icon("alert-triangle", "icon--sm"),
              dom.el("span", { text: "فيه تغييرات لم تُحفظ بعد." })
            ]),

            dom.el("div", { class: "settings-actions__buttons" }, [
              dom.el("button", {
                class: "btn btn--ghost",
                type: "button",
                disabled: true,
                "aria-disabled": "true",
                "data-revert-settings": "",
                onclick: function () {
                  /* Repainted from the stored config, so this genuinely
                     discards the edits rather than only closing a banner. */
                  admin.app.paint(admin.nav.resolve("settings"));
                  Halaq.toast.info("أُلغيَت التعديلات", "عاد النموذج إلى ما كان محفوظاً.");
                }
              }, [dom.el("span", { text: "تراجع عن التعديلات" })]),

              dom.el("button", {
                class: "btn btn--primary",
                type: "button",
                disabled: true,
                "aria-disabled": "true",
                "data-submit-settings": "",
                onclick: submit
              }, [dom.icon("check", "icon--sm"), dom.el("span", { text: "حفظ الإعدادات" })])
            ])
          ])
        ]),

        dom.el("aside", { class: "settings-side" }, [
          dom.el("div", { class: "card" }, [
            dom.el("header", { class: "card__head" }, [
              dom.el("div", {}, [
                dom.el("h2", { class: "card__title", text: "معاينة" }),
                dom.el("p", {
                  class: "card__desc",
                  text: "كما سيراها العميل، تُبنى من الحقول أعلاه قبل الحفظ."
                })
              ])
            ]),
            dom.el("div", { class: "card__body" }, [preview(settings)])
          ])
        ])
      ])
    ]);
  }

  admin.settings = {
    render: render,
    readForm: readForm,
    isDirty: isDirty,
    preview: preview,
    GROUPS: GROUPS
  };
})(window.Halaq = window.Halaq || {});
