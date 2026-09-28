/* ==========================================================================
   Halaq — Admin Authentication (Supabase Auth)
   ---------------------------------------------------------------------------
   Uses Supabase Auth for admin authentication.
   Admin profiles are stored in admin_profiles table linked to auth.users.
   Exposed as window.Halaq.admin.auth
   ========================================================================== */
(function (Halaq) {
  "use strict";

  Halaq.admin = Halaq.admin || {};

  var STORAGE_KEY = "halaq.admin.session";
  var authListener = null;

  var PERMISSIONS = {
    manager: ["*"],
    receptionist: ["dashboard", "bookings", "queue", "barbers", "services", "customers"]
  };

  /* The staff accounts the sign-in screen offers as one-tap pre-fills.
     Signing in goes through Supabase Auth, so these are not a credential
     store: they are the accounts whoever installs the demo has to create
     there, and the page says as much. A manager and a receptionist, matching
     the two roles PERMISSIONS knows about. */
  var USERS = [
    {
      name: "أحمد الغامدي",
      title: "مدير الصالون",
      username: "ahmad@halaq.example",
      password: "Halaq@2026"
    },
    {
      name: "منال الحازمي",
      title: "استقبال",
      username: "manal@halaq.example",
      password: "Halaq@2026"
    }
  ];

  var listeners = [];

  function read() {
    try {
      var raw = window.sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function write(value) {
    try {
      if (value) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      else window.sessionStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function getAdminProfile(user) {
    if (!user) return null;

    var { data, error } = await Halaq.supabase.db.query(
      "admin_profiles",
      "select",
      { user_id: user.id }
    );

    if (error || !data || data.length === 0) return null;

    var profile = data[0];
    return {
      username: profile.name,
      name: profile.name,
      role: profile.role,
      title: profile.role === "manager" ? "مدير الصالون" : "موظفة استقبال",
      initials: profile.name.split(" ").map(function (n) { return n[0]; }).join(""),
      since: new Date().toISOString()
    };
  }

  function session() {
    var stored = read();
    if (!stored || !stored.username) return null;
    return stored;
  }

  function usernameError(value) {
    var trimmed = String(value || "").trim();
    if (!trimmed) return "اكتب البريد الإلكتروني.";
    return "";
  }

  function passwordError(value) {
    var raw = String(value || "");
    if (!raw) return "اكتب كلمة المرور.";
    if (raw.length < 6) return "كلمة المرور قصيرة جداً.";
    return "";
  }

  async function login(input) {
    var email = String((input && input.username) || "").trim();
    var password = String((input && input.password) || "");

    if (usernameError(email) || passwordError(password)) {
      return { ok: false, reason: "incomplete", user: null };
    }

    var { data, error } = await Halaq.supabase.auth.signIn(email, password);
    if (error) {
      return { ok: false, reason: "mismatch", user: null };
    }

    if (!data?.user) {
      return { ok: false, reason: "mismatch", user: null };
    }

    var profile = await getAdminProfile(data.user);
    if (!profile) {
      await Halaq.supabase.auth.signOut();
      return { ok: false, reason: "no_profile", user: null };
    }

    var user = {
      username: profile.username,
      name: profile.name,
      role: profile.role,
      title: profile.title,
      initials: profile.initials,
      since: new Date().toISOString()
    };

    write(user);
    notify();

    return { ok: true, reason: "", user: session() };
  }

  function logout(redirect) {
    write(null);
    notify();
    Halaq.supabase.auth.signOut();
    if (redirect !== false) {
      window.location.href = "login.html";
    }
  }

  function isAuthenticated() {
    return session() !== null;
  }

  function can(sectionId, user) {
    var current = user || session();
    if (!current) return false;

    var allowed = PERMISSIONS[current.role] || [];
    return allowed.indexOf("*") !== -1 || allowed.indexOf(sectionId) !== -1;
  }

  function require() {
    var user = session();
    if (!user) {
      var back = window.location.pathname.split("/").pop() +
        window.location.search + window.location.hash;
      window.location.replace("login.html?next=" + encodeURIComponent(back || "index.html"));
      return null;
    }
    return user;
  }

  function onChange(handler) {
    listeners.push(handler);
    return function () {
      listeners = listeners.filter(function (fn) { return fn !== handler; });
    };
  }

  function notify() {
    listeners.forEach(function (handler) { handler(session()); });
  }

  // Initialize auth state listener
  function initAuthListener() {
    if (authListener) return;
    authListener = Halaq.supabase.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_OUT") {
        logout(false);
      }
    });
  }

  // Initialize on load
  initAuthListener();

  Halaq.admin.auth = {
    PERMISSIONS: PERMISSIONS,
    USERS: USERS,
    login: login,
    logout: logout,
    session: session,
    isAuthenticated: isAuthenticated,
    can: can,
    require: require,
    usernameError: usernameError,
    passwordError: passwordError,
    onChange: onChange
  };
})(window.Halaq = window.Halaq || {});