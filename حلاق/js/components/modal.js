/* ==========================================================================
   Halaq — Modal controller
   Wraps the native <dialog> element so focus handling, scroll locking,
   Esc-to-close and return-focus behaviour are consistent everywhere.

   Close triggers are bound per-dialog inside open(), never through a global
   delegated listener — a global listener plus a per-dialog one would make
   close() re-dispatch the click and recurse.
   Exposed as window.Halaq.modal
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var openStack = [];

  /**
   * Find the stack entry for a dialog.
   * @param {HTMLDialogElement} dialog
   * @returns {Object|null}
   */
  function findEntry(dialog) {
    var match = null;
    openStack.forEach(function (item) {
      if (item.dialog === dialog) match = item;
    });
    return match;
  }

  /**
   * Open a <dialog> by element or id.
   * @param {HTMLDialogElement|string} target
   * @param {Object} [options]
   * @param {string} [options.title]
   * @param {string} [options.description]
   * @returns {HTMLDialogElement|null}
   */
  function open(target, options) {
    var dialog = typeof target === "string" ? dom.$(target) : target;
    options = options || {};

    if (!dialog) return null;
    if (dialog.open) return dialog;

    if (options.title) {
      var titleNode = dom.$("[data-modal-title]", dialog);
      if (titleNode) titleNode.textContent = options.title;
    }

    if (options.description) {
      var descNode = dom.$("[data-modal-description]", dialog);
      if (descNode) descNode.textContent = options.description;
    }

    var restoreFocusTo = document.activeElement;
    var releaseFocus = dom.trapFocus(dialog);
    var unsubscribers = [];
    var closed = false;

    function close() {
      if (closed) return;
      closed = true;

      unsubscribers.forEach(function (off) {
        off();
      });
      releaseFocus();

      if (dialog.open) dialog.close();

      openStack = openStack.filter(function (item) {
        return item.dialog !== dialog;
      });
      if (!openStack.length) dom.lockScroll(false);

      if (restoreFocusTo && document.contains(restoreFocusTo) && restoreFocusTo.focus) {
        restoreFocusTo.focus();
      }
    }

    var entry = { dialog: dialog, close: close };
    openStack.push(entry);

    // Explicit close buttons inside the dialog
    dom.$$("[data-modal-close]", dialog).forEach(function (button) {
      unsubscribers.push(dom.on(button, "click", close));
    });

    // Escape key
    unsubscribers.push(
      dom.on(dialog, "cancel", function (event) {
        event.preventDefault();
        close();
      })
    );

    // Backdrop click (the backdrop reports the <dialog> as its target)
    unsubscribers.push(
      dom.on(dialog, "click", function (event) {
        if (event.target === dialog) close();
      })
    );

    dialog.showModal();
    dom.lockScroll(true);

    // Focus the first meaningful control rather than the close button.
    window.requestAnimationFrame(function () {
      var initial =
        dom.$("[data-modal-initial-focus]", dialog) ||
        dom.$(".modal__body", dialog) ||
        dom.$("[data-modal-close]", dialog);

      if (!initial) return;

      if (initial.classList.contains("modal__body") && !initial.hasAttribute("tabindex")) {
        initial.setAttribute("tabindex", "-1");
      }
      initial.focus();
    });

    return dialog;
  }

  /**
   * Close a dialog. Omit the target to close the top-most dialog.
   * @param {HTMLDialogElement|string} [target]
   */
  function close(target) {
    if (!target) {
      var top = openStack[openStack.length - 1];
      if (top) top.close();
      return;
    }

    var dialog = typeof target === "string" ? dom.$(target) : target;
    if (!dialog || !dialog.open) return;

    var entry = findEntry(dialog);
    if (entry) entry.close();
    else if (dialog.close) dialog.close();
  }

  /**
   * Toggle a dialog.
   * @param {HTMLDialogElement|string} target
   */
  function toggle(target) {
    var dialog = typeof target === "string" ? dom.$(target) : target;
    if (!dialog) return;
    if (dialog.open) close(dialog);
    else open(dialog);
  }

  /**
   * Wire declarative open triggers:
   *   <button data-modal-open="#service-modal" data-modal-payload="id">
   * Optional: the "halaq:modal-open" event carries the payload id.
   */
  function init() {
    dom.delegate(document, "click", "[data-modal-open]", function (event, trigger) {
      var dialog = open(trigger.getAttribute("data-modal-open"));
      var payload = trigger.getAttribute("data-modal-payload");

      if (dialog && payload) {
        dialog.dispatchEvent(
          new CustomEvent("halaq:modal-open", { detail: { id: payload } })
        );
      }
    });
  }

  Halaq.modal = {
    init: init,
    open: open,
    close: close,
    toggle: toggle
  };
})(window.Halaq = window.Halaq || {});
