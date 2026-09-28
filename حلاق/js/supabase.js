/* =============================================================================
   Halaq — Supabase Client Configuration
   =============================================================================
   Centralized Supabase client setup. Uses the publishable key only.
   ============================================================================= */

(function (Halaq) {
  "use strict";

  // Supabase configuration - uses publishable key only
  var SUPABASE_URL = "https://mrhdqlrbzbnnvzysmztn.supabase.co";
  var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_7pNGQf1BfC91iirBNRQ9Ag_JF15ng8O";

  // Initialize Supabase client
  var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  // Helper: Check if user is admin
  async function isAdmin() {
    var session = supabase.auth.getSession();
    if (!session.data.session) return false;

    var userId = session.data.session.user.id;
    var { data, error } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("user_id", userId)
      .single();

    return !error && !!data;
  }

  // Helper: Get current user
  async function getCurrentUser() {
    var { data: { user } } = await supabase.auth.getUser();
    return user;
  }

  // Helper: Get admin profile
  async function getAdminProfile() {
    var user = await getCurrentUser();
    if (!user) return null;

    var { data, error } = await supabase
      .from("admin_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error) return null;
    return data;
  }

  // Auth helpers
  var auth = {
    // Sign in with email/password
    signIn: async function (email, password) {
      var { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });
      return { data, error };
    },

    // Sign out
    signOut: async function () {
      var { error } = await supabase.auth.signOut();
      return { error };
    },

    // Get session
    getSession: async function () {
      var { data: { session } } = await supabase.auth.getSession();
      return session;
    },

    // Listen to auth changes
    onAuthStateChange: function (callback) {
      return supabase.auth.onAuthStateChange(callback);
    }
  };

  // Database RPC wrappers
  var rpc = {
    // Create booking (customer-facing)
    createBooking: async function (params) {
      var { data, error } = await supabase.rpc("create_booking", {
        p_customer_name: params.customerName,
        p_customer_mobile: params.customerMobile,
        p_customer_email: params.customerEmail || "",
        p_service_id: params.serviceId,
        p_barber_id: params.barberId || null,
        p_booking_date: params.bookingDate,
        p_start_time: params.startTime
      });
      return { data, error };
    },

    // Track booking (customer-facing)
    trackBooking: async function (bookingNumber, mobile) {
      var { data, error } = await supabase.rpc("track_booking", {
        p_booking_number: bookingNumber,
        p_mobile: mobile
      });
      return { data, error };
    },

    // Update queue status (admin)
    updateQueueStatus: async function (queueId, newStatus) {
      var { data, error } = await supabase.rpc("update_queue_status", {
        p_queue_id: queueId,
        p_new_status: newStatus
      });
      return { data, error };
    },

    // Mark payment as paid (admin)
    markPaymentPaid: async function (bookingId) {
      var { data, error } = await supabase.rpc("mark_payment_paid", {
        p_booking_id: bookingId
      });
      return { data, error };
    },

    // Get dashboard stats (admin)
    getDashboardStats: async function () {
      var { data, error } = await supabase.rpc("get_dashboard_stats");
      return { data, error };
    }
  };

  // Table query helpers
  var db = {
    // Shop settings
    shopSettings: {
      get: async function () {
        var { data, error } = await supabase
          .from("shop_settings")
          .select("*")
          .single();
        return { data, error };
      }
    },

    // Barbers
    barbers: {
      getAll: async function (activeOnly) {
        var query = supabase.from("barbers").select("*").order("display_order");
        if (activeOnly) query = query.eq("is_active", true);
        var { data, error } = await query;
        return { data, error };
      },

      getById: async function (id) {
        var { data, error } = await supabase
          .from("barbers")
          .select("*")
          .eq("id", id)
          .single();
        return { data, error };
      },

      /**
       * Barbers with the services each one can take.
       *
       * The embed has to go *through* barber_services. barbers and services
       * have no foreign key to each other — the link is many-to-many through a
       * junction table — so asking PostgREST for a flat `services(*)` on the
       * barbers row asks for a relationship the schema cache does not have,
       * and the server answers 400 rather than quietly returning nothing.
       */
      getWithServices: async function (activeOnly) {
        var query = supabase
          .from("barbers")
          .select("*, barber_services(service_id, services(*))")
          .order("display_order");
        if (activeOnly) query = query.eq("is_active", true);
        var { data, error } = await query;
        return { data, error };
      }
    },

    // Services
    services: {
      getAll: async function (activeOnly) {
        var query = supabase.from("services").select("*").order("display_order");
        if (activeOnly) query = query.eq("is_active", true);
        var { data, error } = await query;
        return { data, error };
      },

      getById: async function (id) {
        var { data, error } = await supabase
          .from("services")
          .select("*")
          .eq("id", id)
          .single();
        return { data, error };
      },

      getByCategory: async function (category) {
        var query = supabase
          .from("services")
          .select("*")
          .eq("category", category)
          .eq("is_active", true)
          .order("display_order");
        var { data, error } = await query;
        return { data, error };
      }
    },

    // Barber Services
    barberServices: {
      /**
       * Every assignment in one request.
       *
       * The catalogue is small and the site needs all of it at once to work out
       * which barbers can take which services, so this is the shape the page
       * actually wants. Fetching it per barber instead costs one round trip per
       * barber, and those have to be sequential because the second one is
       * derived from the first — which is a waterfall for data the database
       * can return in a single response.
       */
      getAll: async function () {
        var { data, error } = await supabase
          .from("barber_services")
          .select("barber_id, service_id")
          .order("barber_id")
          .order("service_id");
        return { data, error };
      },

      /**
       * Assignments for one barber.
       *
       * A null id is refused here rather than sent. PostgREST has no
       * `eq.null` — filtering on null is spelled `is.null` — so passing one
       * through builds a query the server answers with 400, and the caller gets
       * an error object it cannot tell apart from a real failure. Use getAll()
       * when the id is not known.
       */
      getForBarber: async function (barberId) {
        if (barberId === null || barberId === undefined || barberId === "") {
          return {
            data: [],
            error: {
              message: "getForBarber requires a barber id — use getAll() instead."
            }
          };
        }
        var { data, error } = await supabase
          .from("barber_services")
          .select("service_id")
          .eq("barber_id", barberId);
        return { data, error };
      },

      getForService: async function (serviceId) {
        if (serviceId === null || serviceId === undefined || serviceId === "") {
          return {
            data: [],
            error: {
              message: "getForService requires a service id — use getAll() instead."
            }
          };
        }
        var { data, error } = await supabase
          .from("barber_services")
          .select("barber_id, barbers(*)")
          .eq("service_id", serviceId);
        return { data, error };
      }
    },

    // Customers
    customers: {
      getByPhone: async function (phone) {
        var { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("mobile", phone)
          .single();
        return { data, error };
      },

      getById: async function (id) {
        var { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("id", id)
          .single();
        return { data, error };
      }
    },

    // Bookings
    bookings: {
      getAll: async function (filters) {
        var query = supabase
          .from("bookings")
          .select("*, customers(*), services(*), barbers(*)")
          .order("created_at", { ascending: false });

        if (filters) {
          if (filters.date) query = query.eq("booking_date", filters.date);
          if (filters.status) query = query.eq("booking_status", filters.status);
          if (filters.barberId) query = query.eq("barber_id", filters.barberId);
          if (filters.paymentStatus) query = query.eq("payment_status", filters.paymentStatus);
        }

        var { data, error } = await query;
        return { data, error };
      },

      getById: async function (id) {
        var { data, error } = await supabase
          .from("bookings")
          .select("*, customers(*), services(*), barbers(*)")
          .eq("id", id)
          .single();
        return { data, error };
      },

      getByNumber: async function (bookingNumber) {
        var { data, error } = await supabase
          .from("bookings")
          .select("*, customers(*), services(*), barbers(*)")
          .eq("booking_number", bookingNumber)
          .single();
        return { data, error };
      },

      updateStatus: async function (id, status) {
        var { data, error } = await supabase
          .from("bookings")
          .update({ booking_status: status, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();
        return { data, error };
      }
    },

    // Queue Entries
    queue: {
      getByDate: async function (date) {
        var { data, error } = await supabase
          .from("queue_entries")
          .select("*, bookings(*, customers(*), services(*), barbers(*))")
          .eq("queue_date", date)
          .order("position");
        return { data, error };
      },

      getByLane: async function (lane, date) {
        var { data, error } = await supabase
          .from("queue_entries")
          .select("*, bookings(*, customers(*), services(*), barbers(*))")
          .eq("lane", lane)
          .eq("queue_date", date)
          .order("position");
        return { data, error };
      },

      getAll: async function (date) {
        var query = supabase
          .from("queue_entries")
          .select("*, bookings(*, customers(*), services(*), barbers(*))")
          .order("queue_date", { ascending: false })
          .order("lane")
          .order("position");

        if (date) query = query.eq("queue_date", date);

        var { data, error } = await query;
        return { data, error };
      },

      updateStatus: async function (id, status) {
        var { data, error } = await supabase
          .from("queue_entries")
          .update({
            queue_status: status,
            updated_at: new Date().toISOString(),
            called_at: status === "حضر" ? new Date().toISOString() : null,
            started_at: status === "جاري الخدمة" ? new Date().toISOString() : null,
            completed_at: status === "مكتمل" ? new Date().toISOString() : null
          })
          .eq("id", id)
          .select()
          .single();
        return { data, error };
      }
    },

    // Payments
    payments: {
      getByBooking: async function (bookingId) {
        var { data, error } = await supabase
          .from("payments")
          .select("*")
          .eq("booking_id", bookingId)
          .order("paid_at", { ascending: false });
        return { data, error };
      },

      getAll: async function (filters) {
        var query = supabase
          .from("payments")
          .select("*, bookings(*, customers(*))")
          .order("paid_at", { ascending: false });

        if (filters && filters.date) {
          query = query.gte("paid_at", filters.date + "T00:00:00")
            .lte("paid_at", filters.date + "T23:59:59");
        }

        var { data, error } = await query;
        return { data, error };
      }
    }
  };

  // Real-time subscriptions
  var realtime = {
    // Subscribe to bookings changes
    onBookingsChange: function (callback) {
      return supabase
        .channel("bookings-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings" },
          callback
        )
        .subscribe();
    },

    // Subscribe to queue changes
    onQueueChange: function (callback) {
      return supabase
        .channel("queue-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "queue_entries" },
          callback
        )
        .subscribe();
    },

    // Subscribe to all admin-relevant changes
    onAdminChanges: function (callbacks) {
      var channels = [];

      if (callbacks.bookings) {
        channels.push(
          supabase
            .channel("admin-bookings")
            .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, callbacks.bookings)
            .subscribe()
        );
      }

      if (callbacks.queue) {
        channels.push(
          supabase
            .channel("admin-queue")
            .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, callbacks.queue)
            .subscribe()
        );
      }

      if (callbacks.barbers) {
        channels.push(
          supabase
            .channel("admin-barbers")
            .on("postgres_changes", { event: "*", schema: "public", table: "barbers" }, callbacks.barbers)
            .subscribe()
        );
      }

      if (callbacks.services) {
        channels.push(
          supabase
            .channel("admin-services")
            .on("postgres_changes", { event: "*", schema: "public", table: "services" }, callbacks.services)
            .subscribe()
        );
      }

      return {
        unsubscribe: function () {
          channels.forEach(function (ch) { ch.unsubscribe(); });
        }
      };
    }
  };

  // Expose to window
  Halaq.supabase = {
    client: supabase,
    auth: auth,
    rpc: rpc,
    db: db,
    realtime: realtime,
    isAdmin: isAdmin,
    getCurrentUser: getCurrentUser,
    getAdminProfile: getAdminProfile,
    // Generic query helper for admin
    query: async function (table, operation, options) {
      var q = supabase.from(table);
      if (operation === "select") {
        q = q.select(options.columns || "*");
        if (options.filters) {
          Object.keys(options.filters).forEach(function (key) {
            q = q.eq(key, options.filters[key]);
          });
        }
        if (options.order) {
          q = q.order(options.order.column, { ascending: options.order.ascending !== false });
        }
        if (options.limit) {
          q = q.limit(options.limit);
        }
        if (options.single) {
          q = q.single();
        }
        var { data, error } = await q;
        return { data, error };
      } else if (operation === "insert") {
        var { data, error } = await q.insert(options.data).select();
        return { data, error };
      } else if (operation === "update") {
        var { data, error } = await q.update(options.data).eq("id", options.id).select();
        return { data, error };
      } else if (operation === "delete") {
        var { error } = await q.delete().eq("id", options.id);
        return { error };
      }
      return { error: new Error("Invalid operation") };
    }
  };
})(window.Halaq = window.Halaq || {});