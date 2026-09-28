/* ==========================================================================
   Halaq — Brand, contact and navigation
   ---------------------------------------------------------------------------
   DEMO CONTENT. Replace the values below with your CMS / API response.
   Exposed as window.Halaq.data.brand

   Shape
   -----
   name            string    Short brand name shown in the header
   latinName       string    Latin brand name (metadata only, never rendered)
   tagline         string    One-line descriptor under the brand name
   establishedYear number    Year the salon opened
   description     string    Full description for meta tags and the footer
   phone           string    Display format
   phoneHref       string    tel: URI
   whatsappHref    string    wa.me link
   email           string    Contact address
   city            string    City
   district        string    District
   address         string    Full street address
   mapUrl          string    Maps link
   hours[]         { days, time }
   social[]        { name, href, icon }   icon = sprite id
   nav[]           { label, href, icon }   href is a page or a page#hash
   ========================================================================== */
(function (Halaq) {
  "use strict";

  Halaq.data = Halaq.data || {};

  Halaq.data.brand = {
    name: "حلاق",
    latinName: "Halaq",
    tagline: "صالون الحلاق الراقي",
    establishedYear: 2014,

    description:
      "صالون حلاقة في حي العليا بالرياض، نعمل منذ عام 2014. قصّات شعر ولحية وتصبغات بأسعار معلنة، وأدوات تُستبدل بعد كل عميل، وحجوزات تحفظ وقتك.",

    phone: "055 123 4567",
    phoneHref: "tel:+966551234567",
    whatsapp: "055 123 4567",
    whatsappHref: "https://wa.me/966551234567",
    email: "info@halaq.example",

    city: "الرياض",
    district: "حي العليا",
    address: "طريق الملك فهد، حي العليا، الرياض",
    mapUrl: "https://maps.google.com/?q=Olaya+Riyadh",

    hours: [
      { days: "الأحد – الخميس", time: "10:00 – 22:00" },
      { days: "الجمعة", time: "14:00 – 22:00" },
      { days: "السبت", time: "مغلق" }
    ],

    social: [
      { name: "إنستغرام", href: "https://instagram.com", icon: "instagram" },
      { name: "فيسبوك", href: "https://facebook.com", icon: "facebook" },
      { name: "واتساب", href: "https://wa.me/966551234567", icon: "whatsapp" },
      { name: "إكس", href: "https://x.com", icon: "x" }
    ],

    /* Hash targets point at home-page sections. Keeping them as page#hash
       means the same list works unchanged on every page of the site. */
    nav: [
      { id: "home", label: "الرئيسية", href: "index.html#home", icon: "home" },
      { id: "services", label: "الخدمات", href: "index.html#services", icon: "scissors" },
      { id: "how", label: "كيف نحجز", href: "index.html#how-it-works", icon: "calendar-check" },
      { id: "barbers", label: "الحلاقون", href: "index.html#barbers", icon: "users" },
      { id: "gallery", label: "المعرض", href: "index.html#gallery", icon: "grid" },
      { id: "reviews", label: "آراء العملاء", href: "index.html#reviews", icon: "star" },
      { id: "contact", label: "تواصل معنا", href: "index.html#contact", icon: "map-pin" }
    ]
  };
})(window.Halaq = window.Halaq || {});
