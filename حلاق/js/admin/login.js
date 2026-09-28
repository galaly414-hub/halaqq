/* ==========================================================================
   Halaq — Admin sign-in screen
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.login

   The page behind Halaq.admin.auth. Its only jobs are the form, the password
   reveal, the demo account buttons, and sending the visitor on.

   Two details worth stating:
     - The form never navigates on its own. It validates, then hands off to
       auth.login(), and only navigates when that returns ok. That way a failed
       attempt leaves what was typed alone so it can be corrected.
     - "next" comes from the URL and is only ever used as a path on this site.
       Anything absolute or protocol-relative is dropped, so the parameter
       cannot be turned into a redirect off-site.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var admin = Halaq.admin = Halaq.admin || {};

  var auth = admin.auth;

  var MISMATCH =
    "اسم المستخدم أو كلمة المرور غير صحيحة. تحقّق من البيانات ثم حاول مرة أخرى.";

  /**
   * Where to go after signing in. Hashes are allowed (they are the section
   * router); anything that could leave the site is not.
   *
   * @returns {string} a relative path
   */
  function destination() {
    var raw = "";
    try {
      raw = new URLSearchParams(window.location.search).get("next") || "";
    } catch (e) {
      raw = "";
    }

    /* Reject absolute URLs, protocol-relative ones, and backslashes, which
       some browsers still treat as separators. */
    if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.indexOf("//") === 0 ||
        raw.indexOf("\\") !== -1) {
      return "index.html";
    }

    return raw.charAt(0) === "/" ? raw.slice(1) : raw;
  }

  /**
   * @param {ParentNode} [root]
   * @returns {Object|null}
   */
  function init(root) {
    var mount = (root || document).querySelector("[data-login]");

    if (!mount) return null;

    /* Already signed in? There is nothing to do here, so go through. */
    if (auth.isAuthenticated()) {
      window.location.replace(destination());
      return null;
    }

    var form = mount.querySelector("[data-login-form]");
    var username = mount.querySelector("#login-username");
    var password = mount.querySelector("#login-password");
    var errorBox = mount.querySelector("[data-login-error]");
    var errorText = mount.querySelector("[data-login-error-text]");
    var submit = mount.querySelector("[data-login-submit]");
    var reveal = mount.querySelector("[data-action=reveal-password]");

    function setError(id, message) {
      var node = mount.querySelector("#" + id + "-error");

      if (!node) return;

      node.textContent = message || "";
      node.hidden = !message;
    }

    function setFormError(message) {
      if (!errorBox) return;

      errorText.textContent = message || "";
      errorBox.hidden = !message;
    }

    function clearErrors() {
      setFormError("");
      setError("login-username", "");
      setError("login-password", "");
    }

    function markInvalid(input, isInvalid) {
      input.setAttribute("aria-invalid", isInvalid ? "true" : "false");
      input.classList.toggle("is-invalid", isInvalid);
    }

    function attempt() {
      clearErrors();

      var usernameMessage = auth.usernameError(username.value);
      var passwordMessage = auth.passwordError(password.value);

      setError("login-username", usernameMessage);
      setError("login-password", passwordMessage);
      markInvalid(username, !!usernameMessage);
      markInvalid(password, !!passwordMessage);

      if (usernameMessage || passwordMessage) {
        /* Put the cursor on the first thing that needs fixing, rather than
           leaving it wherever the click happened to land. */
        (usernameMessage ? username : password).focus();
        return false;
      }

      var result = auth.login({
        username: username.value,
        password: password.value
      });

      if (!result.ok) {
        setFormError(MISMATCH);
        markInvalid(username, true);
        markInvalid(password, true);
        password.focus();
        password.select();
        return false;
      }

      /* The button says what is happening, because a real sign-in will take
         a moment once a server is behind it. */
      submit.setAttribute("data-loading", "true");
      submit.disabled = true;

      window.location.href = destination();
      return true;
    }

    dom.on(form, "submit", function (event) {
      event.preventDefault();
      attempt();
    });

    /* The password reveal keeps focus on the button and reports its state, so
       it is a toggle button and not a mystery icon. */
    dom.on(reveal, "click", function () {
      var shown = password.type === "text";

      password.type = shown ? "password" : "text";
      reveal.setAttribute("aria-pressed", String(!shown));
      reveal.setAttribute("aria-label",
        shown ? "إظهار كلمة المرور" : "إخفاء كلمة المرور");

      var icon = reveal.querySelector("use");
      if (icon) {
        icon.setAttribute("href", shown ? "#icon-eye" : "#icon-eye-off");
      }
    });

    /* ---- the demo accounts ---- */

    var list = mount.querySelector("[data-login-accounts]");

    if (list) {
      dom.render(list, auth.USERS.map(function (user) {
        return dom.el("li", {}, [
          dom.el("button", {
            type: "button",
            class: "login__demo-account",
            "data-fill-username": user.username,
            "data-fill-password": user.password
          }, [
            dom.el("span", { class: "login__demo-creds" }, [
              dom.el("span", { text: user.name }),
              dom.el("code", { text: user.username }),
              dom.el("code", { text: user.password })
            ]),
            dom.el("span", { class: "login__demo-role", text: user.title })
          ])
        ]);
      }));

      /* Filling is not signing in: the person still presses the button, so
         the form they actually use is the form they were shown. */
      dom.delegate(list, "click", "[data-fill-username]", function (event, trigger) {
        event.preventDefault();

        username.value = trigger.getAttribute("data-fill-username");
        password.value = trigger.getAttribute("data-fill-password");

        markInvalid(username, false);
        markInvalid(password, false);
        setError("login-username", "");
        setError("login-password", "");
        setFormError("");

        submit.focus();
      });
    }

    /* "/" is not a shortcut here — the password field is the first stop. */
    username.focus();

    return { attempt: attempt, destination: destination };
  }

  admin.login = { init: init, destination: destination };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init();
    });
  } else {
    init();
  }
})(window.Halaq = window.Halaq || {});
