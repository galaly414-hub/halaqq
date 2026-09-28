/* ==========================================================================
   Halaq — Page content
   ---------------------------------------------------------------------------
   DEMO CONTENT. All marketing copy for the home page lives here so the
   markup stays structural and the wording can be changed in one place.
   Exposed as window.Halaq.data.hero, .howItWorks, .stats, .features, .gallery

   Shape
   -----
   hero.eyebrow      string
   hero.title        string     first line
   hero.titleAccent  string     highlighted phrase
   hero.description  string
   hero.highlights[] { label, icon }
   hero.slots[]      { time, status }   status: "available" | "soon" | "full"

   howItWorks[]      { id, icon, title, description }

   stats[]           { id, label, value, suffix, icon }

   features[]        { id, icon, title, description }

   gallery[]         { id, title, icon, caption }
   ========================================================================== */
(function (Halaq) {
  "use strict";

  Halaq.data = Halaq.data || {};

  /* ---------------------------------------------------------------------
     Hero
     --------------------------------------------------------------------- */
  Halaq.data.hero = {
    eyebrow: "صالون حلاقة في حي العليا — الرياض",

    title: "قصّة على مقاسك",
    titleAccent: "وميعاد تحفظه لك",

    description:
      "حلاقة شعر ولحية وتصبغات، بسعر معلن قبل الحجز. اختر الخدمة والحلاق والوقت، واحجز في أقل من دقيقة.",

    highlights: [
      { label: "شفرة جديدة لكل عميل", icon: "shield" },
      { label: "الأسعار واضحة قبل الحجز", icon: "tag" },
      { label: "دوام 10 صباحاً حتى 10 مساءً", icon: "clock" },
      { label: "ثلاثة حلاقين، كل واحد في تخصصه", icon: "user-check" }
    ],

    /* Illustrative availability shown in the hero card. Demo only. */
    slots: [
      { time: "10:30", status: "available" },
      { time: "12:00", status: "available" },
      { time: "14:30", status: "soon" },
      { time: "17:00", status: "full" }
    ]
  };

  /* ---------------------------------------------------------------------
     How it works — the three-step booking journey
     --------------------------------------------------------------------- */
  Halaq.data.howItWorks = [
    {
      id: "choose-service",
      icon: "scissors",
      title: "اختر خدمتك",
      description:
        "تصفّح الخدمات وأسعارها ومدة كل واحدة، ثم اختر القصّة أو اللحية أو الصبغة التي تناسبك."
    },
    {
      id: "pick-time",
      icon: "calendar-check",
      title: "حدّد الحلاق والموعد",
      description:
        "اختر الحلاق الذي يناسبك ثم اليوم والفتحة المتاحة له. الموعد محسوب على مدة خدمتك، لا على تقدير."
    },
    {
      id: "confirm",
      icon: "check-circle",
      title: "استلم تأكيدك",
      description:
        "يظهر لك رقم الحجز ورقم دورك في قائمة الانتظار مع ملخص كامل للخدمة والسعر، وتقدر تحفظه أو تطبعه."
    }
  ];

  /* ---------------------------------------------------------------------
     Headline numbers
     --------------------------------------------------------------------- */
  Halaq.data.stats = [
    { id: "years", label: "سنة في الخدمة", value: 12, suffix: "+", icon: "award" },
    { id: "clients", label: "عميل حجز معنا", value: 1300, suffix: "+", icon: "users" },
    { id: "barbers", label: "حلاقون في الفريق", value: 3, suffix: "", icon: "scissors" },
    { id: "rating", label: "متوسط التقييم", value: 4.8, suffix: " من 5", icon: "star" }
  ];

  /* ---------------------------------------------------------------------
     Why choose us
     --------------------------------------------------------------------- */
  Halaq.data.features = [
    {
      id: "sterile",
      icon: "shield",
      title: "تعقيم بعد كل عميل",
      description:
        "المقصّات والشفرة تُغسل وتُعقم وتُستبدل قبل العميل التالي. لا نقامر ببشرتك."
    },
    {
      id: "trained",
      icon: "award",
      title: "كل حلاق في تخصصه",
      description:
        "فهد في القصّات والتدرّج، نواف في اللحية والحلاقة بالشفرة، وسعد في الصبغات."
    },
    {
      id: "priced",
      icon: "tag",
      title: "سعر معلن قبل الحجز",
      description:
        "سعر كل خدمة ومدة كل خدمة مكتوبان بوضوح قبل ما تحجز، وتظهر في تذكرة التأكيد."
    },
    {
      id: "hours",
      icon: "clock",
      title: "دوام واضح طوال الأسبوع",
      description:
        "من الأحد إلى الخميس من 10 صباحاً حتى 10 مساءً، والجمعة من 2 ظهراً حتى 10 مساءً. مغلق السبت."
    }
  ];

  /* ---------------------------------------------------------------------
     Gallery placeholders
     --------------------------------------------------------------------- */
  Halaq.data.gallery = [
    { id: "g1", title: "قصّة شعر", icon: "scissors", caption: "على مقاسك" },
    { id: "g2", title: "تحديد الجوانب", icon: "layers", caption: "تدرّج ناعم" },
    { id: "g3", title: "تهذيب اللحية", icon: "palette", caption: "حواف مضبوطة" },
    { id: "g4", title: "غسيل وتصفيف", icon: "droplet", caption: "لمسة أخيرة" },
    { id: "g5", title: "حلاقة بالموس", icon: "razor", caption: "خط ذقن نظيف" },
    { id: "g6", title: "أجواء الصالون", icon: "crown", caption: "مكان هادئ" }
  ];
})(window.Halaq = window.Halaq || {});
