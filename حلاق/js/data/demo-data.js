/* ==========================================================================
   Halaq — Demo data assembly (Supabase-backed)
   ---------------------------------------------------------------------------
   Fetches all data from Supabase for the customer-facing site.
   Exposed as window.Halaq.demoData
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var data = Halaq.data || {};

  async function loadFromSupabase() {
    try {
      // Load all data in parallel
      var [
        shopSettings,
        services,
        barbers,
        barberServices,
        availability
      ] = await Promise.all([
        Halaq.supabase.db.shopSettings.get(),
        Halaq.supabase.db.services.getAll(true),
        Halaq.supabase.db.barbers.getAll(true),
        Halaq.supabase.db.barberServices.getAll(),
        Halaq.supabase.client.from("shop_settings").select("*").single()
      ]);

      // Build brand object from shop settings
      var brand = data.brand || {};
      if (shopSettings.data) {
        var s = shopSettings.data;
        brand.name = s.shop_name;
        brand.latinName = "Halaq";
        brand.tagline = s.shop_tagline;
        brand.establishedYear = 2014;
        brand.description = "صالون حلاقة في حي العليا بالرياض.";
        brand.phone = s.phone;
        brand.phoneHref = "tel:" + s.phone.replace(/\s+/g, "");
        brand.whatsapp = s.whatsapp;
        brand.whatsappHref = "https://wa.me/" + s.whatsapp.replace(/\s+/g, "");
        brand.email = s.email;
        brand.city = s.city;
        brand.district = s.district;
        brand.address = s.address;
        brand.mapUrl = s.map_url;
        brand.hours = [
          { days: "الأحد – الخميس", time: s.opening_time + " – " + s.closing_time },
          { days: "الجمعة", time: s.friday_opening_time + " – " + s.friday_closing_time },
          { days: "السبت", time: "مغلق" }
        ];
        brand.social = [
          { name: "إنستغرام", href: "https://instagram.com", icon: "instagram" },
          { name: "فيسبوك", href: "https://facebook.com", icon: "facebook" },
          { name: "واتساب", href: brand.whatsappHref, icon: "whatsapp" },
          { name: "إكس", href: "https://x.com", icon: "x" }
        ];
      }

      // Build services array
      var servicesData = services.data || [];
      var mappedServices = servicesData.map(function (s) {
        return {
          id: s.id,
          name: s.name_ar,
          description: s.description_ar,
          category: s.category,
          price: s.price,
          duration: s.duration_minutes,
          icon: s.icon || "scissors",
          featured: s.display_order < 3,
          badge: s.badge_label ? { label: s.badge_label, tone: s.badge_tone } : null,
          includes: s.includes || []
        };
      });

      // Build service categories.
      //
      // services.category is free text in the database, so the row arrives as a
      // slug like "cut" or "beard". That slug is what the filter and the admin
      // catalogue match on, and it has to stay in English; what the customer
      // reads is the label. A slug with no entry here falls through to itself
      // rather than rendering blank, so a category added in the database later
      // still shows something.
      var CATEGORY_LABELS = {
        cut: "قصّ شعر",
        beard: "لحية",
        color: "صبغة",
        care: "خدمات إضافية",
        packages: "باقات"
      };

      var categoriesMap = {};
      mappedServices.forEach(function (s) {
        if (!categoriesMap[s.category]) {
          categoriesMap[s.category] = {
            id: s.category,
            label: CATEGORY_LABELS[s.category] || s.category
          };
        }
      });

      // The fallback file fixes an order; the slugs arrive in whatever order the
      // rows come back in. Sorting by the same list keeps the two paths showing
      // the filters in the same sequence.
      var CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
      var discovered = Object.values(categoriesMap);
      discovered.sort(function (a, b) {
        var ai = CATEGORY_ORDER.indexOf(a.id);
        var bi = CATEGORY_ORDER.indexOf(b.id);
        if (ai === -1) return bi === -1 ? a.id.localeCompare(b.id) : 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      var serviceCategories = [{ id: "all", label: "كل الخدمات" }].concat(discovered);

      // Build barbers array with serviceIds
      //
      // Grouped from the one getAll() response above rather than asking once
      // per barber. Asking per barber is one round trip each and, because the
      // service list is what the barbers are looked up from, they have to be
      // sequential — a waterfall to assemble a handful of rows.
      var barbersData = barbers.data || [];
      var barberServiceMap = {};
      (barberServices.data || []).forEach(function (row) {
        if (!row || !row.barber_id || !row.service_id) return;
        if (!barberServiceMap[row.barber_id]) barberServiceMap[row.barber_id] = [];
        barberServiceMap[row.barber_id].push(row.service_id);
      });

      var mappedBarbers = barbersData.map(function (b) {
        var statusMap = {
          "متاح": "online",
          "مشغول": "busy",
          "غير متاح": "offline",
          "خارج الدوام": "offline"
        };
        return {
          id: b.id,
          name: b.name,
          title: b.title,
          initials: b.name.charAt(0),
          yearsOfExperience: b.years_experience,
          rating: b.rating,
          reviewsCount: b.reviews_count,
          status: statusMap[b.status] || "offline",
          specialties: [],
          serviceIds: barberServiceMap[b.id] || [],
          featured: b.display_order === 1
        };
      });

      // Build availability object
      var availabilityData = availability.data || {};
      var mappedAvailability = {
        week: [
          { open: availabilityData.opening_time || "10:00", close: availabilityData.closing_time || "22:00", closed: false },
          { open: availabilityData.opening_time || "10:00", close: availabilityData.closing_time || "22:00", closed: false },
          { open: availabilityData.opening_time || "10:00", close: availabilityData.closing_time || "22:00", closed: false },
          { open: availabilityData.opening_time || "10:00", close: availabilityData.closing_time || "22:00", closed: false },
          { open: availabilityData.opening_time || "10:00", close: availabilityData.closing_time || "22:00", closed: false },
          { open: availabilityData.friday_opening_time || "14:00", close: availabilityData.friday_closing_time || "22:00", closed: false },
          { closed: true }
        ],
        slotMinutes: availabilityData.slot_minutes || 30,
        windowDays: availabilityData.booking_window_days || 30,
        leadMinutes: availabilityData.lead_minutes || 60,
        bookedPercent: 38
      };

      // Hero data
      var hero = data.hero || {};
      hero.eyebrow = "صالون حلاقة في حي العليا — الرياض";
      hero.title = "قصّة على مقاسك";
      hero.titleAccent = "وميعاد تحفظه لك";
      hero.description = "حلاقة شعر ولحية وتصبغات، بسعر معلن قبل الحجز. اختر الخدمة والحلاق والوقت، واحجز في أقل من دقيقة.";

      // How it works
      var howItWorks = [
        { step: 1, title: "اختر خدمتك", description: "تصفّح الخدمات وأسعارها ومدة كل واحدة، ثم اختر القصّة أو اللحية أو الصبغة.", icon: "scissors" },
        { step: 2, title: "حدّد الحلاق والموعد", description: "اختر الحلاق ثم اليوم والفتحة المتاحة له. الموعد محسوب على مدة خدمتك.", icon: "calendar-check" },
        { step: 3, title: "استلم تأكيدك", description: "يظهر لك رقم الحجز ورقم دورك مع ملخص الخدمة والسعر، وتقدر تحفظه أو تطبعه.", icon: "check-circle" }
      ];

      // Stats
      var stats = [
        { label: "عميل حجز معنا", value: "1,300+", icon: "users" },
        { label: "سنة في الخدمة", value: "12+", icon: "award" },
        { label: "حلاقون في الفريق", value: "3", icon: "scissors" },
        { label: "متوسط التقييم", value: "4.8/5", icon: "star" }
      ];

      // Features
      var features = [
        { icon: "shield", title: "تعقيم بعد كل عميل", description: "المقصّات والشفرة تُغسل وتُعقم وتُستبدل قبل العميل التالي." },
        { icon: "award", title: "كل حلاق في تخصصه", description: "فهد في القصّات والتدرّج، نواف في اللحية، وسعد في الصبغات." },
        { icon: "tag", title: "سعر معلن قبل الحجز", description: "سعر كل خدمة ومدتها مكتوبان بوضوح قبل ما تحجز." },
        { icon: "clock", title: "دوام واضح طوال الأسبوع", description: "الأحد - الخميس 10ص حتى 10م، والجمعة 2م حتى 10م، ومغلق السبت." }
      ];

      // Reviews (demo)
      var reviews = data.reviews || [];

      // Gallery
      //
      // The tiles are drawn as icon plates, not photographs, so there is
      // nothing to fetch here: the content file already carries the titles and
      // captions the gallery is made of, and a second list of stock photo
      // URLs would only be a second thing to keep in step with it.
      var gallery = data.gallery || [];

      // Navigation
      var nav = brand.nav || [];

      // Assign to Halaq.demoData
      Halaq.demoData = {
        brand: brand,
        nav: nav,
        hero: hero,
        howItWorks: howItWorks,
        stats: stats,
        serviceCategories: serviceCategories,
        services: mappedServices,
        features: features,
        barbers: mappedBarbers,
        reviews: reviews,
        gallery: gallery
      };

      // Also update Halaq.data for compatibility
      Halaq.data.brand = brand;
      Halaq.data.services = mappedServices;
      Halaq.data.serviceCategories = serviceCategories;
      Halaq.data.barbers = mappedBarbers;
      Halaq.data.availability = mappedAvailability;
      Halaq.data.hero = hero;

      return Halaq.demoData;
    } catch (error) {
      console.warn("Failed to load from Supabase, using fallback data:", error);
      // Fallback to existing demo data
      Halaq.demoData = {
        brand: data.brand,
        nav: data.brand?.nav || [],
        hero: data.hero,
        howItWorks: data.howItWorks || [],
        stats: data.stats || [],
        serviceCategories: data.serviceCategories || [],
        services: data.services || [],
        features: data.features || [],
        barbers: data.barbers || [],
        reviews: data.reviews || [],
        gallery: data.gallery || []
      };
      return Halaq.demoData;
    }
  }

  /* =====================================================================
     Readiness

     The first load runs as soon as this file is evaluated, which is before
     anything that reads demoData has had a chance to run. Halaq.demoData is
     assigned inside the async loader, so until that resolves it is undefined
     — a consumer that captured it at load time would be holding undefined for
     the rest of the page's life.

     So the first load is parked on Halaq.demoDataReady, and every consumer
     waits on that before touching Halaq.demoData. Nothing has to guess.
     ===================================================================== */
  Halaq.demoDataReady = loadFromSupabase().catch(function (error) {
    /* loadFromSupabase already falls back internally, so reaching here means
       the fallback itself failed. Report it and resolve to whatever exists,
       rather than leaving every consumer waiting on a promise that will never
       settle. */
    console.error("تعذّر تجهيز البيانات، وستعمل الواجهة على البيانات الاحتياطية:", error);
    return Halaq.demoData || null;
  });

  // Export for manual refresh
  Halaq.loadDemoData = function () {
    Halaq.demoDataReady = loadFromSupabase().catch(function (error) {
      console.error("تعذّر تحديث البيانات:", error);
      return Halaq.demoData || null;
    });
    return Halaq.demoDataReady;
  };
})(window.Halaq = window.Halaq || {});
