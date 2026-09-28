/* ==========================================================================
   Halaq — Availability rules
   ---------------------------------------------------------------------------
   DEMO CONTENT. Replace with API responses; keep the field names.
   Exposed as window.Halaq.data.availability

   This file owns *when the salon takes appointments*, which is different
   from brand.hours: that one is display copy ("10:00 – 22:00"), this one is
   machine-readable. Both describe the same schedule, so change them together.

   Shape
   -----
   week          { [weekday]: { open, close, closed } }   weekday 0 = الأحد
                 A closed day is a normal result, not a fallback: the calendar
                 marks it and offers no slots.
   slotMinutes   length of one appointment slot
   windowDays    how far ahead a date may be booked
   leadMinutes   minimum notice; anything sooner cannot be booked
   bookedPercent share of slots already taken in the demo data (0–100)
   ========================================================================== */
(function (Halaq) {
  "use strict";

  Halaq.data = Halaq.data || {};

  Halaq.data.availability = {
    /* Sunday – Thursday 10:00–22:00, Friday 14:00–22:00, Saturday closed.
       Matches brand.hours. */
    week: [
      { open: "10:00", close: "22:00", closed: false }, /* الأحد  */
      { open: "10:00", close: "22:00", closed: false }, /* الاثنين */
      { open: "10:00", close: "22:00", closed: false }, /* الثلاثاء */
      { open: "10:00", close: "22:00", closed: false }, /* الأربعاء */
      { open: "10:00", close: "22:00", closed: false }, /* الخميس  */
      { open: "14:00", close: "22:00", closed: false }, /* الجمعة  */
      { closed: true } /* السبت */
    ],

    slotMinutes: 30,

    /* Booking horizon, counted from today. */
    windowDays: 30,

    /* A customer needs at least this much notice. */
    leadMinutes: 60,

    /* Demo only: how full the book is. The real value comes from the
       backend once it exists. */
    bookedPercent: 38
  };
})(window.Halaq = window.Halaq || {});
