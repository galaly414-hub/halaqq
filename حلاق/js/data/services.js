/* ==========================================================================
   Halaq — Service catalogue
   ---------------------------------------------------------------------------
   DEMO CONTENT. Swap this file for an API client when the backend is ready;
   keep the field names and the renderers need no changes.
   Exposed as window.Halaq.data.services and .serviceCategories

   Service shape
   -------------
   id          string    Stable identifier, used by the details dialog
   name        string    Arabic service name
   description string    One or two sentences
   category    string    Category id from serviceCategories below
   price       number    Price in SAR
   duration    number    Length in minutes
   icon        string    Sprite icon id
   includes[]  string    Bullet list shown in the details dialog
   badge       ?{ label, tone }   tone: brand | success | warning | info
   featured    ?boolean  Surfaces the service first
   ========================================================================== */
(function (Halaq) {
  "use strict";

  Halaq.data = Halaq.data || {};

  /* ---------------------------------------------------------------------
     Categories — the first entry is the default "all" filter.
     Ids are ASCII slugs so they stay safe in URLs and code.
     --------------------------------------------------------------------- */
  Halaq.data.serviceCategories = [
    { id: "all", label: "كل الخدمات" },
    { id: "cut", label: "قصّ شعر" },
    { id: "beard", label: "لحية" },
    { id: "color", label: "صبغة" },
    { id: "care", label: "خدمات إضافية" },
    { id: "packages", label: "باقات" }
  ];

  /* ---------------------------------------------------------------------
     Catalogue

     A mid-market Riyadh men's barber. Prices and durations here are the same
     ones the Supabase seed carries, so the two do not disagree when the network
     is unavailable and this file is what the customer is shown instead.
     --------------------------------------------------------------------- */
  Halaq.data.services = [
    {
      id: "hair-cut",
      name: "حلاقة شعر",
      description: "قصّة على مقاسك، مع تحديد الجوانب وتصفيف قبل ما تطلع.",
      category: "cut",
      price: 55,
      duration: 40,
      icon: "scissors",
      featured: true,
      badge: { label: "الأكثر طلباً", tone: "brand" },
      includes: [
        "معاينة القصّة واختيار الطول",
        "غسيل الشعر قبل البدء",
        "القصّة والتحديد بالماكينة",
        "تصفيف خفيف قبل الخروج"
      ]
    },
    {
      id: "cut-and-beard",
      name: "حلاقة شعر ولحية",
      description: "قصّة شعر كاملة مع تهذيب اللحية وضبط خط الرقبة.",
      category: "cut",
      price: 80,
      duration: 55,
      icon: "razor",
      featured: true,
      badge: { label: "الأكثر حجزاً", tone: "success" },
      includes: [
        "قصّة شعر كاملة",
        "تهذيب اللحية",
        "ضبط خط الرقبة",
        "تصفيف الشعر"
      ]
    },
    {
      id: "side-taper",
      name: "تحديد الجوانب",
      description: "تدرّج ناعم في الجوانب مع حدود نظيفة قرب الأذن.",
      category: "cut",
      price: 30,
      duration: 20,
      icon: "layers",
      includes: [
        "تدرّج حسب رغبتك",
        "حدود دقيقة قرب الأذن",
        "أدوات معقّمة لكل عميل"
      ]
    },
    {
      id: "kids-cut",
      name: "حلاقة أطفال",
      description: "قصّة شعر للأطفال، جلسة قصيرة ومقعد مخصّص.",
      category: "cut",
      price: 40,
      duration: 30,
      icon: "heart",
      includes: [
        "مقعد مخصّص للأطفال",
        "جلسة قصيرة",
        "تصفيف بسيط"
      ]
    },
    {
      id: "beard-trim",
      name: "تهذيب لحية",
      description: "تقصير اللحية وتصحيح حوافها بالشفرة.",
      category: "beard",
      price: 40,
      duration: 25,
      icon: "palette",
      includes: [
        "ضبط الطول والشكل",
        "تصحيح الحواف بالشفرة",
        "غسيل اللحية",
        "مرطب خفيف"
      ]
    },
    {
      id: "straight-razor",
      name: "حلاقة بالموس",
      description: "حلاقة بالشفرة مع فوم دافئ، نظافة أعلى لخط الذقن.",
      category: "beard",
      price: 65,
      duration: 40,
      icon: "razor",
      badge: { label: "مميز", tone: "brand" },
      includes: [
        "شفرة جديدة لكل عميل",
        "فوم دافئ قبل الحلاقة",
        "خط الذقن والعنق",
        "مرطب بعد الحلاقة"
      ]
    },
    {
      id: "face-cleanup",
      name: "تنظيف وجه",
      description: "تنظيف الوجه من الشعر الزائد مع ضبط عارفة الأذن والأنف.",
      category: "beard",
      price: 35,
      duration: 20,
      icon: "razor",
      includes: [
        "تنظيف ما بالأنف والعارفة",
        "ضبط خط الأذن",
        "مسح وتهدئة البشرة"
      ]
    },
    {
      id: "beard-dye",
      name: "صبغة لحية",
      description: "صبغة اللحية بلون طبيعي مع تهذيب الحواف.",
      category: "color",
      price: 80,
      duration: 45,
      icon: "droplet",
      includes: [
        "اختيار درجة اللون",
        "صبغة خفيفة",
        "تهذيب الحواف",
        "تجفيف"
      ]
    },
    {
      id: "hair-dye",
      name: "صبغة شعر",
      description: "صبغة كاملة بلون تختاره بعد معاينته على خصلة.",
      category: "color",
      price: 130,
      duration: 70,
      icon: "palette",
      badge: { label: "بحجز مسبق", tone: "warning" },
      includes: [
        "معاينة اللون على خصلة",
        "معالجة إن لزم",
        "صبغة كاملة",
        "غسيل وتصفيف"
      ]
    },
    {
      id: "grey-coverage",
      name: "تغطية الشيب",
      description: "تغطية الشيب بلون قريب من لون شعرك الأصلي.",
      category: "color",
      price: 110,
      duration: 45,
      icon: "layers",
      includes: [
        "معاينة اللون على خصلة",
        "تغطية متدرجة",
        "تجفيف",
        "تصفيف خفيف"
      ]
    },
    {
      id: "hair-wash",
      name: "غسيل شعر",
      description: "غسيل الشعر بشامبو مناسب له وتجفيف خفيف.",
      category: "care",
      price: 20,
      duration: 10,
      icon: "droplet",
      includes: [
        "شامبو مناسب لنوع شعرك",
        "ماء دافئ",
        "تجفيف خفيف"
      ]
    },
    {
      id: "blow-dry",
      name: "سشوار وتصفيف",
      description: "تصفيف الشعر بالسشوار بالاتجاه اللي تختاره.",
      category: "care",
      price: 30,
      duration: 20,
      icon: "sparkles",
      includes: [
        "تصفيف بالاتجاه المطلوب",
        "منتجات ثابتة خفيفة",
        "لمسة نهائية"
      ]
    },
    {
      id: "cut-beard-package",
      name: "حلاقة ولحية",
      description: "قصّة شعر مع تهذيب اللحية في نفس الجلسة.",
      category: "packages",
      price: 85,
      duration: 60,
      icon: "scissors",
      badge: { label: "توفير 10 ر.س", tone: "success" },
      includes: [
        "قصّة شعر كاملة",
        "تهذيب اللحية",
        "ضبط خط الرقبة",
        "تصفيف"
      ]
    },
    {
      id: "royal-cut",
      name: "حلاقة ملكية",
      description: "جلسة كاملة: قصّة، تهذيب لحية بالشفرة، وفوم وتصفيف.",
      category: "packages",
      price: 150,
      duration: 90,
      icon: "crown",
      badge: { label: "الأكمل", tone: "brand" },
      includes: [
        "معاينة كاملة قبل البدء",
        "قصّة شعر مع تدرّج",
        "حلاقة بالشفرة للذقن",
        "فوم دافئ وتصفيف"
      ]
    },
    {
      id: "father-son",
      name: "باقة الأب والابن",
      description: "قصّتان في نفس الموعد، الأب والابن.",
      category: "packages",
      price: 90,
      duration: 70,
      icon: "gift",
      badge: { label: "توفير 20 ر.س", tone: "success" },
      includes: [
        "قصّة كاملة للأب",
        "قصّة كاملة للابن",
        "الاثنين في نفس الموعد"
      ]
    }
  ];
})(window.Halaq = window.Halaq || {});
