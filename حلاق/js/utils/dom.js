/* ==========================================================================
   Halaq — DOM utilities
   Small, dependency-free helpers shared by every component module.
   Exposed as window.Halaq.dom
   ========================================================================== */
(function (Halaq) {
  "use strict";

  /**
   * Query a single element.
   * @param {string} selector
   * @param {ParentNode} [scope=document]
   * @returns {Element|null}
   */
  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  /**
   * Query all elements as a real array.
   * @param {string} selector
   * @param {ParentNode} [scope=document]
   * @returns {Element[]}
   */
  function $$(selector, scope) {
    return Array.prototype.slice.call(
      (scope || document).querySelectorAll(selector)
    );
  }

  /**
   * Create an element from a tag name, attributes map and children.
   * Attribute keys prefixed with "on" are bound as listeners.
   * @param {string} tag
   * @param {Object} [attrs]
   * @param {Array|string|Node} [children]
   * @returns {HTMLElement}
   */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    var key;

    attrs = attrs || {};

    for (key in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;

      var value = attrs[key];

      if (value === null || value === undefined || value === false) continue;

      if (key.indexOf("on") === 0 && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === "class") {
        node.className = value;
      } else if (key === "html") {
        node.innerHTML = value;
      } else if (key === "text") {
        node.textContent = value;
      } else if (key === "dataset") {
        Object.assign(node.dataset, value);
      } else {
        node.setAttribute(key, value === true ? "" : value);
      }
    }

    appendChildren(node, children);
    return node;
  }

  /**
   * Append one or many children, flattening arrays and skipping nullish.
   * @param {Node} parent
   * @param {Array|string|Node|null} children
   */
  function appendChildren(parent, children) {
    if (children === null || children === undefined || children === false) return;

    if (Array.isArray(children)) {
      children.forEach(function (child) {
        appendChildren(parent, child);
      });
      return;
    }

    parent.appendChild(
      children instanceof Node ? children : document.createTextNode(String(children))
    );
  }

  /**
   * Build an <svg><use> pair from the sprite in index.html.
   * @param {string} name - sprite id, with or without the "icon-" prefix
   * @param {string} [className]
   * @returns {SVGElement}
   */
  function icon(name, className) {
    var id = name.indexOf("icon-") === 0 ? name : "icon-" + name;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");

    svg.setAttribute("class", "icon " + (className || ""));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);

    return svg;
  }

  /**
   * Add an event listener and return its remover.
   * @param {EventTarget} target
   * @param {string} type
   * @param {Function} handler
   * @param {Object|boolean} [options]
   * @returns {Function}
   */
  function on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    return function off() {
      target.removeEventListener(type, handler, options);
    };
  }

  /**
   * Delegated listener: fires when the event target is inside `selector`.
   * @param {EventTarget} root
   * @param {string} type
   * @param {string} selector
   * @param {Function} handler
   */
  function delegate(root, type, selector, handler) {
    return on(root, type, function (event) {
      var match = event.target.closest(selector);
      if (match && root.contains(match)) handler(event, match);
    });
  }

  /**
   * Replace a container's contents with new nodes.
   * @param {Element} container
   * @param {Array<Node|string>} nodes
   */
  function render(container, nodes) {
    if (!container) return;
    container.textContent = "";
    appendChildren(container, nodes);
  }

  /**
   * Serialise a form into a plain object. Repeated names become arrays.
   * @param {HTMLFormElement} form
   * @returns {Object}
   */
  function formData(form) {
    var output = {};

    new FormData(form).forEach(function (value, key) {
      if (key in output) {
        output[key] = [].concat(output[key], value);
      } else {
        output[key] = value;
      }
    });

    return output;
  }

  /**
   * Focus trap for dialogs that need one beyond the native <dialog> default.
   * @param {HTMLElement} container
   * @returns {Function} release
   */
  function trapFocus(container) {
    var FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function onKeydown(event) {
      if (event.key !== "Tab") return;

      var items = $$(FOCUSABLE, container).filter(function (item) {
        return item.offsetParent !== null;
      });

      if (!items.length) return;

      var first = items[0];
      var last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    container.addEventListener("keydown", onKeydown);

    return function release() {
      container.removeEventListener("keydown", onKeydown);
    };
  }

  /**
   * Prevent background scrolling while a dialog is open.
   * @param {boolean} lock
   */
  function lockScroll(lock) {
    document.documentElement.classList.toggle("no-scroll", lock);
  }

  Halaq.dom = {
    $: $,
    $$: $$,
    el: el,
    icon: icon,
    on: on,
    delegate: delegate,
    render: render,
    appendChildren: appendChildren,
    formData: formData,
    trapFocus: trapFocus,
    lockScroll: lockScroll
  };
})(window.Halaq = window.Halaq || {});
