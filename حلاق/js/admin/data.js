/* ==========================================================================
   Halaq — Admin Data Module (Supabase-backed)
   ---------------------------------------------------------------------------
   Fetches all admin data from Supabase.
   Exposed as window.Halaq.admin.data
   ========================================================================== */
(function (Halaq) {
  "use strict";

  Halaq.admin = Halaq.admin || {};

  var supabase = Halaq.supabase.client;

  var data = {
    // Barbers
    barbers: {
      getAll: async function (activeOnly) {
        var q = supabase.from("barbers").select("*").order("display_order");
        if (activeOnly) q = q.eq("is_active", true);
        var { data, error } = await q;
        return { data: data || [], error };
      },

      getById: async function (id) {
        var { data, error } = await supabase
          .from("barbers")
          .select("*")
          .eq("id", id)
          .single();
        return { data, error };
      },

      create: async function (barber) {
        var { data, error } = await supabase
          .from("barbers")
          .insert(barber)
          .select()
          .single();
        return { data, error };
      },

      update: async function (id, updates) {
        var { data, error } = await supabase
          .from("barbers")
          .update(updates)
          .eq("id", id)
          .select()
          .single();
        return { data, error };
      },

      delete: async function (id) {
        var { error } = await supabase
          .from("barbers")
          .delete()
          .eq("id", id);
        return { error };
      }
    },

    // Services
    services: {
      getAll: async function (activeOnly) {
        var q = supabase.from("services").select("*").order("display_order");
        if (activeOnly) q = q.eq("is_active", true);
        var { data, error } = await q;
        return { data: data || [], error };
      },

      getById: async function (id) {
        var { data, error } = await supabase
          .from("services")
          .select("*")
          .eq("id", id)
          .single();
        return { data, error };
      },

      create: async function (service) {
        var { data, error } = await supabase
          .from("services")
          .insert(service)
          .select()
          .single();
        return { data, error };
      },

      update: async function (id, updates) {
        var { data, error } = await supabase
          .from("services")
          .update(updates)
          .eq("id", id)
          .select()
          .single();
        return { data, error };
      },

      delete: async function (id) {
        var { error } = await supabase
          .from("services")
          .delete()
          .eq("id", id);
        return { error };
      }
    },

    // Barber Services
    barberServices: {
      getForBarber: async function (barberId) {
        var { data, error } = await supabase
          .from("barber_services")
          .select("service_id, services(*)")
          .eq("barber_id", barberId);
        return { data: data || [], error };
      },

      getForService: async function (serviceId) {
        var { data, error } = await supabase
          .from("barber_services")
          .select("barber_id, barbers(*)")
          .eq("service_id", serviceId);
        return { data: data || [], error };
      },

      assign: async function (barberId, serviceId) {
        var { data, error } = await supabase
          .from("barber_services")
          .insert({ barber_id: barberId, service_id: serviceId })
          .select()
          .single();
        return { data, error };
      },

      unassign: async function (barberId, serviceId) {
        var { error } = await supabase
          .from("barber_services")
          .delete()
          .eq("barber_id", barberId)
          .eq("service_id", serviceId);
        return { error };
      }
    },

    // Customers
    customers: {
      getAll: async function (filters) {
        var q = supabase.from("customers").select("*").order("created_at", { ascending: false });
        if (filters && filters.search) {
          q = q.or("full_name.ilike.%"+filters.search+"%,mobile.ilike.%"+filters.search+"%");
        }
        var { data, error } = await q;
        return { data: data || [], error };
      },

      getById: async function (id) {
        var { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("id", id)
          .single();
        return { data, error };
      },

      getByPhone: async function (phone) {
        var { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("mobile", phone)
          .single();
        return { data, error };
      }
    },

    // Bookings
    bookings: {
      getAll: async function (filters) {
        var q = supabase
          .from("bookings")
          .select("*, customers(*), services(*), barbers(*)")
          .order("created_at", { ascending: false });

        if (filters) {
          if (filters.date) q = q.eq("booking_date", filters.date);
          if (filters.status) q = q.eq("booking_status", filters.status);
          if (filters.barberId) q = q.eq("barber_id", filters.barberId);
          if (filters.paymentStatus) q = q.eq("payment_status", filters.paymentStatus);
        }

        var { data, error } = await q;
        return { data: data || [], error };
      },

      getById: async function (id) {
        var { data, error } = await supabase
          .from("bookings")
          .select("*, customers(*), services(*), barbers(*)")
          .eq("id", id)
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

    // Queue
    queue: {
      getByDate: async function (date) {
        var { data, error } = await supabase
          .from("queue_entries")
          .select("*, bookings(*, customers(*), services(*), barbers(*))")
          .eq("queue_date", date)
          .order("position");
        return { data: data || [], error };
      },

      getAll: async function (date) {
        var q = supabase
          .from("queue_entries")
          .select("*, bookings(*, customers(*), services(*), barbers(*))")
          .order("queue_date", { ascending: false })
          .order("lane")
          .order("position");

        if (date) q = q.eq("queue_date", date);

        var { data, error } = await q;
        return { data: data || [], error };
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
      getAll: async function (filters) {
        var q = supabase
          .from("payments")
          .select("*, bookings(*, customers(*))")
          .order("paid_at", { ascending: false });

        if (filters && filters.date) {
          q = q.gte("paid_at", filters.date + "T00:00:00")
            .lte("paid_at", filters.date + "T23:59:59");
        }

        var { data, error } = await q;
        return { data: data || [], error };
      },

      getByBooking: async function (bookingId) {
        var { data, error } = await supabase
          .from("payments")
          .select("*")
          .eq("booking_id", bookingId)
          .order("paid_at", { ascending: false });
        return { data: data || [], error };
      }
    },

    // Shop Settings
    shopSettings: {
      get: async function () {
        var { data, error } = await supabase
          .from("shop_settings")
          .select("*")
          .single();
        return { data, error };
      }
    },

    // Dashboard Stats
    dashboard: {
      getStats: async function () {
        var { data, error } = await Halaq.supabase.rpc.getDashboardStats();
        return { data: data?.data?.stats || {}, error };
      }
    }
  };

  Halaq.admin.data = data;
})(window.Halaq = window.Halaq || {});