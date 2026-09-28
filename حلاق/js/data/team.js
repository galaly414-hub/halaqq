/* ==========================================================================
   Halaq — Team and customer reviews
   ---------------------------------------------------------------------------
   DEMO CONTENT. Replace with API responses; keep the field names.
   Exposed as window.Halaq.data.barbers and .reviews

   Barber shape
   ------------
   id, name, title, initials, yearsOfExperience, rating, reviewsCount,
   status ("online" | "busy" | "offline"), specialties[], serviceIds[],
   featured

   serviceIds[] holds ids from ./services.js and drives which barbers the
   booking flow offers for a given service. specialties[] is free display
   text and is never used for matching.

   Review shape
   ------------
   id, author, initials, rating, date, service, barber, text
   ========================================================================== */
(function (Halaq) {
  "use strict";

  Halaq.data = Halaq.data || {};

  Halaq.data.barbers = [
    {
      id: "ahmad",
      name: "أحمد الغامدي",
      title: "حلاق أول — متخصص في التدرّج",
      initials: "ا",
      yearsOfExperience: 12,
      rating: 4.9,
      reviewsCount: 512,
      status: "online",
      specialties: ["تدرّج", "قصّ شعر", "تصفيف"],
      serviceIds: [
        "hair-cut",
        "cut-and-beard",
        "side-taper",
        "kids-cut",
        "blow-dry",
        "father-son"
      ],
      featured: true
    },
    {
      id: "khalid",
      name: "خالد الشمري",
      title: "حلاق أول — خبير اللحية",
      initials: "خ",
      yearsOfExperience: 9,
      rating: 4.8,
      reviewsCount: 386,
      status: "online",
      specialties: ["لحية", "حلاقة بالشفرة", "صبغة لحية"],
      serviceIds: [
        "beard-trim",
        "straight-razor",
        "cut-and-beard",
        "beard-dye",
        "father-son"
      ]
    },
    {
      id: "abdullah",
      name: "عبدالله القحطاني",
      title: "حلاق أول — صبغات وتصفيف",
      initials: "ع",
      yearsOfExperience: 7,
      rating: 4.7,
      reviewsCount: 241,
      status: "busy",
      specialties: ["صبغة", "تمويه", "غسل وتصفيف"],
      serviceIds: [
        "hair-cut",
        "cut-and-beard",
        "hair-wash",
        "blow-dry",
        "hair-dye",
        "beard-dye",
        "grey-blend"
      ]
    }
  ];

  Halaq.data.reviews = [
    {
      id: "r1",
      author: "ماجد الحربي",
      initials: "م",
      rating: 5,
      date: "2026-09-14",
      service: "حلاقة شعر ولحية",
      barber: "أحمد الغامدي",
      text: "أفضل قصّة جربتها في الرياض. التدرّج متقن والموعد ما تأخر دقيقة، والمكان نظيف وريح. راح أكرر الحجز مع أحمد كل شهر."
    },
    {
      id: "r2",
      author: "سلطان الدوسري",
      initials: "س",
      rating: 5,
      date: "2026-09-02",
      service: "حلاقة بالموس",
      barber: "خالد الشمري",
      text: "الفرق واضح من أول زيارة. الشفرة وفوم الدفء خلّوا الحلاقة أسهل من كل مرة جربتها، والبشرة مرّتاحة بعدها."
    },
    {
      id: "r3",
      author: "فهد الزهراني",
      initials: "ف",
      rating: 4,
      date: "2026-08-21",
      service: "تمويه الشعر الرمادي",
      barber: "عبدالله القحطاني",
      text: "تمويه ممتاز واللون طلع طبيعي على الشعر. الموعد كان بعد المغرب وأتمنى أجد وقتاً أقرب، بس الخدمة نفسها تستاهل."
    }
  ];
})(window.Halaq = window.Halaq || {});
