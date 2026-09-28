/* ==========================================================================
   Halaq — Admin · services
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.services

   The price list, as a manager runs a salon: what is on offer, what it costs,
   how long it takes, and who can do it.

   The form owns the service; the cards own the assignment
   -------------------------------------------------------
   Two separate jobs, so two separate places. A barber can be assigned to a
   service straight from the service's own card, which is where a manager is
   actually standing when they ask "who does the beard work?" — and the same
   assignment is editable from the barber's form, because that is where it is
   when you are standing in front of the team instead. Both write through
   `catalogue.setBarbers()`, which writes through the roster, so the relation
   has exactly one home and the two views cannot drift.

   Deleting is a last resort, and the screen says so before it happens
   -----------------------------------------------------------------
   A booking keeps a copy of its service's name and price, but it still points
   at the service id — and that pointer is the only thing that can answer
   "what did we take, and for what". So `remove()` refuses while a service has
   bookings, and the card says how many rather than showing a dead button. For
   everything else, disabling is the answer: the service leaves the menu and
   every record of it stays readable.

   What a price change does and does not touch
   --------------------------------------------
   Nothing already booked. A booking copied its price the moment it was issued
   precisely so that raising a price today cannot rewrite yesterday's bill.
   The card therefore shows what the service costs *now*, and never claims to
   be what past bookings paid.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var admin = Halaq.admin = Halaq.admin || {};

  var ui = admin.ui;
  var metrics = admin.metrics;
  var catalogue = admin.catalogue;
  var roster = admin.roster;

  /* =====================================================================
     The form dialog
     ===================================================================== */

  var formNode = null;
  var formBody = null;
  var formId = null;
  var formRepaint = null;

  /**
   * @returns {HTMLDialogElement}
   */
  function formBox() {
    if (formNode) return formNode;

    var limits = catalogue.LIMITS;

    formId = dom.el("input", { type: "hidden", name: "serviceId" });

    formBody = dom.el("form", {
      class: "service-form",
      novalidate: true,
      onsubmit: function (event) {
        event.preventDefault();
        submitForm();
      }
    });

    formBody.appendChild(formId);

    formBody.appendChild(dom.el("div", { class: "form__grid form__grid--2" }, [
      ui.field({
        id: "sf-name",
        label: "اسم الخدمة",
        required: true,
        hint: "الاسم الذي يظهر في صفحة الحجز.",
        control: dom.el("input", {
          class: "input",
          id: "sf-name",
          name: "name",
          type: "text",
          maxlength: 80,
          autocomplete: "off"
        })
      }),

      ui.field({
        id: "sf-category",
        label: "الفئة",
        control: dom.el("select", {
          class: "select",
          id: "sf-category",
          name: "category"
        }, catalogue.categories().map(function (category) {
          return dom.el("option", {
            value: category.id,
            text: category.label
          });
        })),
        hint: "تظهر تحت هذه الفئة في قائمة الخدمات."
      }),

      ui.field({
        id: "sf-price",
        label: "السعر",
        required: true,
        hint: "بالريال. " + limits.price.min + " إلى " +
          fmt.number(limits.price.max) + "، ويظهر للعميل في صفحة الحجز.",
        control: moneyInput("sf-price", "price", limits.price)
      }),

      ui.field({
        id: "sf-duration",
        label: "المدة",
        required: true,
        hint: "بالدقائق. تُستخدم في تقدير وقت الانتظار، فمدتها الخاطئة تُفسد " +
          "تقدير الطابور كله.",
        control: moneyInput("sf-duration", "duration", limits.duration)
      })
    ]));

    formBody.appendChild(ui.field({
      id: "sf-description",
      label: "الوصف",
      hint: "سطران على الأكثر، يظهران في بطاقة الخدمة.",
      control: dom.el("textarea", {
        class: "textarea",
        id: "sf-description",
        name: "description",
        maxlength: 240,
        rows: 3
      })
    }));

    formNode = dom.el("dialog", {
      class: "modal modal--md",
      "aria-labelledby": "service-form-title"
    }, [
      dom.el("div", { class: "modal__panel" }, [
        dom.el("div", { class: "modal__head" }, [
          dom.el("div", {}, [
            dom.el("h2", {
              class: "modal__title",
              id: "service-form-title",
              "data-modal-title": "",
              text: "إضافة خدمة"
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
              dataset: { submitService: "" },
              /* type=button on purpose: the button lives in the dialog footer,
                 outside the <form>. A `type=submit` plus a form attribute would
                 fire the submit handler *and* this one, and the service would
                 be written twice. */
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
   * A numeric field, with the unit stated in the label rather than baked into
   * the value, so the stored number stays a number.
   *
   * @param {string} id
   * @param {string} name
   * @param {{min: number, max: number}} limit
   * @returns {HTMLElement}
   */
  function moneyInput(id, name, limit) {
    return dom.el("input", {
      class: "input num",
      id: id,
      name: name,
      type: "number",
      inputmode: "numeric",
      min: limit.min,
      max: limit.max,
      step: 1
    });
  }

  function formError(message) {
    var node = dom.$("[data-form-error]", formNode);
    if (node) node.textContent = message || "";
  }

  /**
   * @returns {Object} the form's contents, in the catalogue's field names
   */
  function readForm() {
    var data = dom.formData(formBody);

    return {
      name: (data.name || "").trim(),
      category: data.category || "cut",
      price: data.price === "" ? "" : Number(data.price),
      duration: data.duration === "" ? "" : Number(data.duration),
      description: (data.description || "").trim()
    };
  }

  /**
   * @param {Object} data
   * @returns {string} an error message, or "" when the form is good
   */
  function validate(data) {
    var limits = catalogue.LIMITS;

    if (!data.name) return "اسم الخدمة مطلوب.";

    if (data.price === "" || !isFinite(data.price)) return "السعر مطلوب.";

    if (data.price < limits.price.min || data.price > limits.price.max) {
      return "السعر بين " + fmt.number(limits.price.min) + " و" +
        fmt.number(limits.price.max) + " ريال.";
    }

    if (data.duration === "" || !isFinite(data.duration)) return "المدة مطلوبة.";

    if (data.duration < limits.duration.min || data.duration > limits.duration.max) {
      return "المدة بين " + fmt.number(limits.duration.min) + " و" +
        fmt.number(limits.duration.max) + " دقيقة.";
    }

    return "";
  }

  function submitForm() {
    var data = readForm();
    var problem = validate(data);

    if (problem) {
      formError(problem);
      if (!data.name) {
        var name = dom.$("#sf-name", formBody);
        if (name) name.focus();
      }
      return;
    }

    formError("");

    var existing = formId.value;
    var saved = existing
      ? catalogue.update(existing, data)
      : catalogue.add(data);

    if (!saved) {
      formError("تعذّر الحفظ. تأكد من الاسم والسعر ثم أعد المحاولة.");
      return;
    }

    Halaq.modal.close(formNode);
    if (formRepaint) formRepaint();

    Halaq.toast.success(
      existing ? "حُفظت خدمة " + saved.name : "أُضيفت خدمة " + saved.name,
      fmt.money(saved.price) + " · " + saved.duration + " د"
    );
  }

  /**
   * @param {string|null} id  a service to edit, or null to add
   * @param {Function} repaint
   */
  function openForm(id, repaint) {
    var box = formBox();
    var editing = id ? catalogue.get(id) : null;

    if (id && !editing) {
      Halaq.toast.error("الخدمة غير موجودة", "ربما أُعيد تحميل البيانات.");
      return;
    }

    formRepaint = repaint;
    formError("");
    formId.value = editing ? editing.id : "";

    dom.$("#sf-name", formBody).value = editing ? editing.name : "";
    dom.$("#sf-category", formBody).value = editing ? editing.category : "cut";
    dom.$("#sf-price", formBody).value = editing ? editing.price : "";
    dom.$("#sf-duration", formBody).value = editing ? editing.duration : "";
    dom.$("#sf-description", formBody).value = editing ? editing.description : "";

    Halaq.modal.open(box, {
      title: editing ? "تعديل " + editing.name : "إضافة خدمة",
      description: editing
        ? "السعر والمدة الجديدان يسريان على الحجوزات الجديدة فقط. " +
          "الحجوزات القائمة تحمل سعرها وقت الحجز ولا تتغيّر."
        : "تظهر في صفحة الحجز فور حفظها، ويمكن بعدها إسنادها للحلاقين."
    });
  }

  /* =====================================================================
     Assigning barbers, from the service's own card
     ===================================================================== */

  /**
   * @param {Object} service
   * @param {Function} repaint
   * @returns {Node}
   */
  function assignmentBlock(service, repaint) {
    var team = roster ? roster.active() : [];
    var assigned = catalogue.barbersFor(service.id);

    if (!team.length) {
      return dom.el("p", {
        class: "service-card__none",
        text: "لا يوجد حلاقون في الفريق. أضفهم من شاشة الحلاقين."
      });
    }

    return dom.el("div", { class: "assign" }, team.map(function (barber) {
      var has = assigned.indexOf(barber) !== -1;

      return dom.el("label", {
        class: "choice assign__choice",
        for: "assign-" + service.id + "-" + barber.id
      }, [
        dom.el("input", {
          type: "checkbox",
          id: "assign-" + service.id + "-" + barber.id,
          checked: has,
          onchange: function (event) {
            toggleBarber(service, barber, event.target.checked, repaint);
          }
        }),

        dom.el("span", { class: "choice__body" }, [
          dom.el("span", { class: "choice__label", text: barber.name }),
          dom.el("span", { class: "choice__note", text: barber.title || "" })
        ])
      ]);
    }));
  }

  /**
   * One checkbox, one write. The list is rebuilt from the store afterwards, so
   * a tick that the store refused simply does not stick.
   *
   * @param {Object} service
   * @param {Object} barber
   * @param {boolean} on
   * @param {Function} repaint
   */
  function toggleBarber(service, barber, on, repaint) {
    var current = catalogue.barbersFor(service.id).map(function (person) {
      return person.id;
    });

    var wanted = current.filter(function (id) {
      return id !== barber.id;
    });

    if (on) wanted.push(barber.id);

    catalogue.setBarbers(service.id, wanted);
    repaint();

    Halaq.toast.success(
      barber.name + (on ? " يقدّم " : " لا يقدّم ") + service.name,
      on
        ? "تظهر في خيارات الحجز له"
        : "أُزيلت من خياراته. حجوزاته السابقة لا تتأثر."
    );
  }

  /* =====================================================================
     Cards
     ===================================================================== */

  /**
   * @param {Object} service
   * @param {Function} repaint
   * @returns {HTMLElement}
   */
  function serviceCard(service, repaint) {
    var used = catalogue.bookingCount(service.id);
    var assigned = catalogue.barbersFor(service.id);

    return dom.el("article", {
      class: "service-card" + (service.enabled ? "" : " is-off"),
      "data-service": service.id
    }, [
      dom.el("header", { class: "service-card__head" }, [
        dom.el("div", { class: "service-card__id" }, [
          dom.el("span", { class: "service-card__icon" }, [
            dom.icon(service.icon || catalogue.FALLBACK_ICON, "icon--lg")
          ]),

          dom.el("div", { class: "service-card__titles" }, [
            dom.el("h3", { class: "service-card__name", text: service.name }),
            dom.el("p", {
              class: "service-card__category",
              text: catalogue.categoryLabel(service.category)
            })
          ])
        ]),

        dom.el("div", { class: "service-card__badges" }, [
          service.enabled
            ? null
            : ui.badge({ label: "معطّلة", icon: "ban", tone: "danger" }),

          !service.enabled || assigned.length
            ? null
            : ui.badge({
                label: "بلا حلاق",
                icon: "users",
                tone: "warning"
              })
        ])
      ]),

      service.description
        ? dom.el("p", { class: "service-card__desc", text: service.description })
        : null,

      dom.el("dl", { class: "service-card__facts" }, [
        dom.el("div", { class: "service-card__fact" }, [
          dom.el("dt", { text: "السعر" }),
          dom.el("dd", { class: "num", text: fmt.money(service.price) })
        ]),
        dom.el("div", { class: "service-card__fact" }, [
          dom.el("dt", { text: "المدة" }),
          dom.el("dd", { class: "num", text: service.duration + " دقيقة" })
        ]),
        dom.el("div", { class: "service-card__fact" }, [
          dom.el("dt", { text: "حجوزات" }),
          dom.el("dd", { class: "num", text: fmt.number(used) })
        ])
      ]),

      dom.el("div", { class: "service-card__assign" }, [
        dom.el("h4", { class: "service-card__sub" }, [
          dom.el("span", { text: "الحلاقون" }),
          dom.el("span", {
            class: "service-card__count num",
            text: assigned.length + " من " + (roster ? roster.active().length : 0)
          })
        ]),

        assignmentBlock(service, repaint),

        dom.el("p", { class: "service-card__foot" }, [
          dom.icon("info", "icon--xs"),
          dom.el("span", {
            text: "الحجوزات القائمة تحمل سعرها وقت الحجز، فتغيير السعر لا يغيّرها."
          })
        ])
      ]),

      dom.el("div", { class: "service-card__actions" }, [
        ui.button({
          label: "تعديل",
          icon: "settings",
          variant: "secondary",
          size: "sm",
          data: { editService: service.id },
          onClick: function () {
            openForm(service.id, repaint);
          }
        }),

        service.enabled
          ? ui.button({
              label: "تعطيل",
              icon: "ban",
              variant: "ghost",
              size: "sm",
              data: { toggleService: service.id, enabled: "false" },
              onClick: function () {
                changeEnabled(service, false, repaint);
              }
            })
          : ui.button({
              label: "تفعيل",
              icon: "check",
              variant: "secondary",
              size: "sm",
              data: { toggleService: service.id, enabled: "true" },
              onClick: function () {
                changeEnabled(service, true, repaint);
              }
            }),

        /* Delete is offered only where it is actually safe. Where the service
           has bookings the button is not shown at all, and the reason is on
           the card above — a dead button with a tooltip is a worse answer
           than a sentence. */
        used
          ? null
          : ui.button({
              label: "حذف",
              icon: "close",
              variant: "ghost",
              size: "sm",
              data: { deleteService: service.id },
              onClick: function () {
                askDelete(service, repaint);
              }
            })
      ])
    ]);
  }

  /* =====================================================================
     Writing
     ===================================================================== */

  function changeEnabled(service, enabled, repaint) {
    if (enabled) {
      var back = catalogue.setEnabled(service.id, true);
      repaint();
      Halaq.toast.success(back.name + " عادت إلى القائمة", fmt.money(back.price));
      return;
    }

    admin.confirm.ask({
      title: "تعطيل " + service.name,
      description: "تختفي من صفحة الحجز ولن يُسكنها أحد. " +
        "سجلّها كله — الحجوزات والأسعار والدفع — يبقى كما هو.",
      subject: service.name + " · " + fmt.money(service.price) +
        " · " + service.duration + " د",
      confirmLabel: "تعطيل",
      onConfirm: function () {
        var saved = catalogue.setEnabled(service.id, false);
        repaint();
        Halaq.toast.info(saved.name + " معطّلة", "الحجوزات القائمة لا تتأثر.");
      }
    });
  }

  function askDelete(service, repaint) {
    var used = catalogue.bookingCount(service.id);

    /* Asked again here rather than trusted from the card, because the card and
       the click can be a long way apart, and a booking made in between is
       exactly the case where deleting would orphan a record. */
    if (used) {
      Halaq.toast.error(
        "لا يمكن حذف " + service.name,
        used + " حجزاً يشير إليها. عطّلها بدل حذفها."
      );
      repaint();
      return;
    }

    admin.confirm.ask({
      title: "حذف " + service.name,
      description: "تُحذف الخدمة نهائياً ولا رجعة في ذلك. " +
        "لا حجوزات تشير إليها الآن، ولهذا الحذف ممكن أصلاً.",
      subject: service.name + " · " + fmt.money(service.price),
      confirmLabel: "حذف نهائي",
      onConfirm: function () {
        var result = catalogue.remove(service.id);

        if (!result.ok) {
          Halaq.toast.error(
            "تعذّر الحذف",
            result.reason === "booked"
              ? "أُضيفت حجوزات تشير إلى " + service.name + " منذ عرض البطاقة."
              : "الخدمة غير موجودة."
          );
          repaint();
          return;
        }

        repaint();
        Halaq.toast.success("حُذفت " + service.name, "لم يكن لها حجوزات.");
      }
    });
  }

  /* =====================================================================
     The screen
     ===================================================================== */

  /* Module state, not closure state, so walking away to another section and
     coming back finds the same search and the same filters. The same reason
     the bookings screen keeps its filters in the module. */
  var SERVICE_FILTERS = { q: "", category: "", status: "" };

  function categoryOptions() {
    return [{ value: "", label: "كل الفئات" }].concat(
      catalogue.categories().map(function (category) {
        return { value: category.id, label: category.label };
      })
    );
  }

  function statusOptions() {
    return [
      { value: "", label: "كل الحالات" },
      { value: "on", label: "مفعّلة فقط" },
      { value: "off", label: "معطّلة فقط" }
    ];
  }

  /**
   * The services the current filters leave, in catalogue order.
   * @returns {Object[]}
   */
  function visible() {
    var state = SERVICE_FILTERS;
    var query = state.q.trim();

    return catalogue.all().filter(function (service) {
      if (state.category && service.category !== state.category) return false;
      if (state.status === "on" && !service.enabled) return false;
      if (state.status === "off" && service.enabled) return false;

      if (!query) return true;

      /* Price and duration are searchable, because the two things a manager
         is looking for when they open this screen are "the cheap one" and
         "the quick one" — and neither can be found by typing a name. */
      var haystack = [
        service.name,
        service.description,
        service.category,
        String(service.price),
        String(service.duration)
      ].join(" ").toLowerCase();

      return haystack.indexOf(query.toLowerCase()) !== -1;
    });
  }

  /**
   * @param {Object} bar the toolbar ui.toolbar() was given
   */
  /* Both of these go through `bar.repaint()` rather than a bare `repaint()`.
     The repaint closure is created inside render() and lives on the handle, so
     a module-level call to a bare `repaint` is a ReferenceError — which is
     what a chip's remove button and this clear button used to do. */
  function clearOne(key, bar) {
    SERVICE_FILTERS[key] = "";

    if (key === "q" && bar.searchInput) bar.searchInput.value = "";
    if (key !== "q" && bar.controls[key]) bar.controls[key].value = "";

    bar.repaint();
  }

  function clearAll(bar) {
    Object.keys(SERVICE_FILTERS).forEach(function (key) {
      SERVICE_FILTERS[key] = "";
    });

    if (bar.searchInput) bar.searchInput.value = "";
    Object.keys(bar.controls).forEach(function (key) {
      if (bar.controls[key]) bar.controls[key].value = "";
    });

    bar.repaint();
  }

  function chips(bar) {
    var state = SERVICE_FILTERS;
    var out = [];

    if (state.q) {
      out.push({
        key: "q",
        label: "بحث: " + state.q,
        remove: function () {
          clearOne("q", bar);
        }
      });
    }

    if (state.category) {
      out.push({
        key: "category",
        label: "الفئة: " + catalogue.categoryLabel(state.category),
        remove: function () {
          clearOne("category", bar);
        }
      });
    }

    if (state.status) {
      out.push({
        key: "status",
        label: "الحالة: " + (state.status === "on" ? "مفعّلة" : "معطّلة"),
        remove: function () {
          clearOne("status", bar);
        }
      });
    }

    return out;
  }

  /**
   * The four numbers, the chips, and the cards.
   * @param {Object} bar
   */
  function resultsView(bar) {
    var all = catalogue.all();
    var active = all.filter(function (service) {
      return service.enabled;
    });
    var unassigned = active.filter(function (service) {
      return !catalogue.barbersFor(service.id).length;
    });

    var list = visible();
    var activeChips = chips(bar);

    return [
      ui.statRow([
        {
          label: "الخدمات المعروضة",
          value: active.length,
          num: true,
          icon: "scissors",
          tone: "brand",
          hint: "تظهر في صفحة الحجز"
        },
        {
          label: "معطّلة",
          value: all.length - active.length,
          num: true,
          icon: "ban",
          tone: (all.length - active.length) ? "warning" : "neutral",
          hint: "سجلّها محفوظ"
        },
        {
          label: "متوسط السعر",
          value: active.length
            ? fmt.money(Math.round(active.reduce(function (sum, service) {
                return sum + service.price;
              }, 0) / active.length))
            : "—",
          icon: "banknote",
          tone: "neutral",
          hint: "للخدمات المفعّلة"
        },
        {
          label: "بلا حلاق",
          value: unassigned.length,
          num: true,
          icon: "users",
          tone: unassigned.length ? "danger" : "success",
          hint: unassigned.length
            ? "لا يستطيع أحد تقديمها"
            : "كل خدمة مسنودة إلى حلاق"
        }
      ]),

      activeChips.length
        ? dom.el("div", { class: "chips" }, [
            dom.el("div", { class: "chips__set" }, activeChips.map(function (chip) {
              return ui.chip({ label: chip.label, onRemove: chip.remove });
            })),

            ui.button({
              label: "مسح التصفية",
              icon: "close",
              variant: "ghost",
              size: "sm",
              data: { clearServiceFilters: "" },
              onClick: function () {
                clearAll(bar);
              }
            })
          ])
        : null,

      list.length
        ? dom.el("div", { class: "service-grid" }, list.map(function (item) {
            return serviceCard(item, bar.repaint);
          }))
        : ui.emptyState({
            icon: "scissors",
            title: all.length ? "لا خدمة تطابق" : "لا توجد خدمات",
            message: all.length
              ? "التصفية أضيق من النتائج. «مسح التصفية» يعيدها كلها."
              : "أضف أول خدمة إلى القائمة.",
            action: all.length
              ? null
              : ui.button({
                  label: "إضافة خدمة",
                  icon: "plus",
                  variant: "primary",
                  size: "sm",
                  onClick: function () {
                    openForm(null, bar.repaint);
                  }
                })
          })
    ];
  }

  /**
   * @param {Object} section from Halaq.admin.nav
   * @returns {HTMLElement}
   */
  function render(section) {
    var state = SERVICE_FILTERS;
    var host = dom.el("div", { "data-service-results": "" });
    var bar = { controls: {}, searchInput: null, repaint: function () {} };

    function repaint() {
      dom.render(host, resultsView(bar));
    }

    bar.repaint = repaint;

    var control = function (key, id, label, options) {
      var node = ui.filterSelect({
        id: id,
        label: label,
        value: state[key],
        options: options,
        onchange: function (event) {
          state[key] = event.target.value;
          repaint();
        }
      });

      bar.controls[key] = node.querySelector("select");
      return node;
    };

    var barNode = ui.toolbar({
      search: {
        id: "admin-services-search",
        label: "ابحث باسم الخدمة أو سعرها أو مدتها",
        placeholder: "اسم الخدمة، السعر، أو المدة…",
        value: state.q,
        oninput: function (event) {
          state.q = event.target.value;
          repaint();
        }
      },
      filters: [
        control("category", "admin-services-category", "الفئة", categoryOptions()),
        control("status", "admin-services-status", "الحالة", statusOptions())
      ]
    });

    bar.searchInput = dom.$("#admin-services-search", barNode);

    repaint();

    return dom.el("div", { class: "stack", "data-services": "" }, [
      ui.pageHeader(section, {
        actions: [
          ui.button({
            label: "تحديث",
            icon: "refresh",
            variant: "ghost",
            size: "sm",
            data: { refreshServices: "" },
            onClick: function () {
              repaint();
            }
          }),

          ui.button({
            label: "إضافة خدمة",
            icon: "plus",
            variant: "primary",
            size: "sm",
            data: { addService: "" },
            onClick: function () {
              openForm(null, repaint);
            }
          })
        ]
      }),

      barNode,
      host
    ]);
  }

  admin.services = {
    render: render,
    openForm: openForm
  };
})(window.Halaq = window.Halaq || {});
