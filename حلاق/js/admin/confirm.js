/* ==========================================================================
   Halaq — Admin confirmation dialog
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.confirm

   One dialog for every destructive action on the admin side: skipping a
   customer, cancelling a booking, stopping a barber, deleting a service,
   undoing a payment.

   Why one and not five
   --------------------
   A confirmation is not a small thing to get right. It has to trap focus,
   close on Escape and on a backdrop click, restore focus to the control that
   opened it, and not fire its action when it was dismissed. That is a page of
   behaviour, and it is identical every time. Written once, every destructive
   button in the admin gets the same correctness; written five times, four of
   them get it subtly wrong.

   It lives here rather than in any screen because it is not any screen's.

   Built once, reused
   ------------------
   The dialog node is created on first use and kept. A fresh node per action
   would mean the modal controller had nothing to restore focus to, so the
   button that opened it would lose the keyboard on every close.

   The pending action is held in one variable, read by a handler bound once, and
   cleared both when the action runs and when the dialog closes for any other
   reason — so a confirmation dismissed with Escape cannot fire later.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var admin = Halaq.admin = Halaq.admin || {};

  var ui = admin.ui;

  var node = null;
  var button = null;
  var labelNode = null;
  var pending = null;

  /**
   * The dialog, built on first use.
   * @returns {HTMLDialogElement}
   */
  function box() {
    if (node) return node;

    button = ui.button({
      label: "تأكيد",
      icon: "check",
      variant: "danger",
      size: "sm"
    });

    labelNode = dom.$("span:last-child", button);

    button.addEventListener("click", function () {
      /* Taken before the close, because closing is what clears it. */
      var run = pending;
      pending = null;

      Halaq.modal.close(node);

      if (run) run();
    });

    node = dom.el("dialog", {
      class: "modal modal--sm",
      "aria-labelledby": "admin-confirm-title"
    }, [
      dom.el("div", { class: "modal__panel" }, [
        dom.el("div", { class: "modal__head" }, [
          dom.el("div", {}, [
            dom.el("h2", {
              class: "modal__title",
              id: "admin-confirm-title",
              "data-modal-title": "",
              text: "تأكيد"
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

        dom.el("div", { class: "modal__body" }, [
          dom.el("div", { class: "confirm__subject", "data-confirm-subject": "" })
        ]),

        dom.el("div", { class: "modal__footer" }, [
          dom.el("button", {
            class: "btn btn--ghost",
            type: "button",
            "data-modal-close": ""
          }, [dom.el("span", { text: "رجوع" })]),

          button
        ])
      ])
    ]);

    node.addEventListener("close", function () {
      pending = null;
    });

    document.body.appendChild(node);
    return node;
  }

  /**
   * Ask before doing something that cannot be undone by clicking again.
   *
   *   title        what is about to happen, as a heading
   *   description  what it will mean — the sentence a person actually needs
   *   subject      the specific thing: the customer, the service, the amount
   *   confirmLabel the verb on the confirming button
   *   onConfirm    run only if the answer was yes
   *
   * There is no onCancel, on purpose. Dismissing is "do nothing", and the
   * default already is nothing — a callback would only be a second place for a
   * screen to undo something it should never have touched.
   *
   * @param {Object} opts
   */
  function ask(opts) {
    opts = opts || {};

    var dialog = box();
    var subject = dom.$("[data-confirm-subject]", dialog);

    if (subject) subject.textContent = opts.subject || "";
    if (labelNode) labelNode.textContent = opts.confirmLabel || "تأكيد";

    pending = function () {
      if (opts.onConfirm) opts.onConfirm();
    };

    Halaq.modal.open(dialog, {
      title: opts.title || "تأكيد",
      description: opts.description || ""
    });
  }

  /**
   * True while a question is open. Screens that leave a dialog behind use this
   * rather than reaching for the node.
   * @returns {boolean}
   */
  function isOpen() {
    return !!(node && node.open);
  }

  admin.confirm = {
    ask: ask,
    isOpen: isOpen
  };
})(window.Halaq = window.Halaq || {});
