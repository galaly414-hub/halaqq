/* ==========================================================================
   Halaq — Admin charts
   ---------------------------------------------------------------------------
   Exposed as window.Halaq.admin.charts

   Three shapes, built out of divs. No charting library, for the same reason
   the rest of the admin has no framework: this is a static page that opens
   over file://, and a library would be the only thing on it that cannot be
   read.

   The rule every chart here follows
   ---------------------------------
   A chart is a picture of numbers, so it must never be the *only* place a
   number appears. Three things travel together in every function below:

     1. the marks — bars, coloured
     2. the values — printed next to them, in words and figures
     3. a table — visually hidden, with the same numbers, for a screen reader

   Colour is the fastest of the three and the least precise, so it is never
   asked to carry meaning alone. That is also why there is no hover-only
   tooltip: a figure that exists only on hover does not exist for a keyboard
   user, a touch screen, or a printed page.

   Direction
   ---------
   No chart sets `direction`. The page is RTL and the charts are flex and block
   layouts, so the bars, their labels and the reading order all follow the
   page. A chart that fought the page's direction would read backwards to an
   Arabic reader while looking correct in a screenshot.

   What is not here
   ----------------
   Axis ticks, gridlines, animations and a legend that is only coloured
   swatches. They add reading cost and carry no information here: the series
   are small enough that the printed values do the work an axis would.
   ========================================================================== */
(function (Halaq) {
  "use strict";

  var dom = Halaq.dom;
  var fmt = Halaq.format;
  var admin = Halaq.admin = Halaq.admin || {};

  /* A bar with a real value is at least this tall, so a 10-riyal day beside a
     900-riyal day is a visible sliver rather than nothing at all. 2% of the
     chart is small enough not to misread the scale and large enough to see. */
  var MIN_BAR = 2;

  /**
   * A visually hidden table of the same figures the marks carry.
   *
   * Built from the data rather than re-typed, so it cannot drift from the bars
   * the way a hand-written caption does.
   *
   * @param {string} caption
   * @param {Array<{label: string, value: string}>} rows
   * @param {string} [valueHeading]
   * @returns {HTMLElement}
   */
  function dataTable(caption, rows, valueHeading) {
    return dom.el("table", { class: "sr-only", "data-chart-table": "" }, [
      dom.el("caption", { text: caption }),
      dom.el("thead", {}, [
        dom.el("tr", {}, [
          dom.el("th", { scope: "col", text: "البند" }),
          dom.el("th", { scope: "col", text: valueHeading || "القيمة" })
        ])
      ]),
      dom.el("tbody", {}, rows.map(function (row) {
        return dom.el("tr", {}, [
          dom.el("th", { scope: "row", text: row.label }),
          dom.el("td", { class: "num", text: row.value })
        ]);
      }))
    ]);
  }

  /**
   * A short, spoken summary for the aria-label. Numbers are left as figures:
   * a screen reader reads "350 ر.س" better than it reads a spelled-out total.
   *
   * @param {Object} opts
   * @returns {string}
   */
  function summary(opts) {
    return opts.title + "، " + opts.count + " عنصر، أعلى قيمة " +
      (opts.maxLabel || "") + " " + opts.maxValue + "، الإجمالي " + opts.total + ".";
  }

  /* =====================================================================
     Vertical bars, for a series over time
     ===================================================================== */

  /**
   * Revenue (or anything else) per day across a range.
   *
   * @param {Object} opts
   * @param {string} opts.title      what the chart is
   * @param {string} opts.unit       shown beside each value, e.g. "ر.س"
   * @param {Array<{key: string, label: string, value: number, hint?: string}>} opts.series
   * @param {string} [opts.valueName] the column heading in the hidden table
   * @param {Function} [opts.peak] (topRow, shownCount) => string, for a series
   *                                 whose key is not a date — the summary line
   *                                 above the plot, in words
   * @param {number} [opts.limit]    how many bars to show before it is
   *                                 summarised; a 90-day range is a smear
   * @returns {HTMLElement}
   */
  function barChart(opts) {
    var series = (opts.series || []).filter(function (row) {
      return row;
    });

    if (!series.length) return dom.el("div", { class: "chart-empty" });

    var peak = series.reduce(function (best, row) {
      return Math.max(best, row.value || 0);
    }, 0);

    var total = series.reduce(function (sum, row) {
      return sum + (row.value || 0);
    }, 0);

    var shown = series;
    var trimmed = 0;

    /* A long range is summarised rather than drawn: past a few dozen bars the
       marks stop being readable and start being a texture, and the figure that
       matters is still in the totals above. */
    if (opts.limit && series.length > opts.limit) {
      trimmed = series.length - opts.limit;
      shown = series.slice(trimmed);
    }

    var maxShown = shown.reduce(function (best, row) {
      return Math.max(best, row.value || 0);
    }, 0);

    var top = shown.reduce(function (best, row) {
      return (!best || (row.value || 0) > (best.value || 0)) ? row : best;
    }, null);

    var bars = dom.el("div", { class: "chart-bars", "data-chart-bars": "" },
      shown.map(function (row) {
        var value = row.value || 0;
        var height = maxShown > 0 ? Math.max(value > 0 ? MIN_BAR : 0, (value / maxShown) * 100) : 0;

        return dom.el("div", {
          class: "chart-bar" + (value > 0 ? "" : " is-empty"),
          "data-chart-bar": row.key,
          /* the whole bar is one focus stop and says what it is, so the chart
             can be read with the keyboard rather than only seen */
          tabindex: "0",
          role: "img",
          "aria-label": row.label + ": " + fmt.number(value) + " " + opts.unit +
            (row.hint ? "، " + row.hint : ""),
          title: row.label + " — " + fmt.number(value) + " " + opts.unit
        }, [
          dom.el("span", { class: "chart-bar__value num", text: fmt.number(value) }),
          dom.el("span", {
            class: "chart-bar__fill",
            style: "height:" + height + "%"
          })
        ]);
      }));

    var labels = dom.el("div", { class: "chart-labels", "aria-hidden": "true" },
      shown.map(function (row) {
        return dom.el("span", { class: "chart-label", text: row.label });
      }));

    return dom.el("div", { class: "chart", "data-chart": "bars" }, [
      dom.el("div", { class: "chart__head" }, [
        dom.el("p", { class: "chart__caption", text: opts.title }),

        /* The default sentence is written for a money series over days, which is
           what the reports ask for. A caller whose series is keyed by something
           else — an hour, a barber — supplies the sentence instead, because the
           function cannot know that "أعلى يوم" would be false here. */
        dom.el("p", { class: "chart__scale num", text: opts.peak
          ? opts.peak(top, shown.length)
          : (top && top.value
              ? "أعلى يوم " + fmt.money(top.value) + " · " + fmt.dateShort(top.key)
              : "لا أرقام في هذه الفترة")
        })
      ]),

      dom.el("div", {
        class: "chart__plot",
        role: "group",
        "aria-label": summary({
          title: opts.title,
          count: shown.length,
          /* The row's own label, not its key: a key may be a clock time or an
             id, and this string is read aloud. */
          maxLabel: top ? top.label : "",
          maxValue: top ? fmt.number(top.value || 0) + " " + opts.unit : "0",
          total: opts.unit === "ر.س" ? fmt.money(total) : fmt.number(total)
        })
      }, [bars, labels]),

      trimmed
        ? dom.el("p", {
            class: "chart__foot",
            text: "يعرض آخر " + fmt.number(opts.limit) + " يوماً من " +
              fmt.number(series.length) + ". الأقدم تحت " +
              fmt.number(trimmed) + " يوماً، ومجموعه " +
              (opts.unit === "ر.س" ? fmt.money(total) : fmt.number(total)) + "."
          })
        : null,

      dataTable(opts.title, shown.map(function (row) {
        return { label: row.label, value: fmt.number(row.value || 0) + " " + opts.unit };
      }), opts.valueName)
    ]);
  }

  /* =====================================================================
     Ranked horizontal bars, for "most requested"
     ===================================================================== */

  /**
   * A top-N list, longest bar first, each labelled with its name, its count and
   * its share of the list.
   *
   * The share is the useful part: a list of counts alone does not say whether
   * the top item is half the salon's week or one booking above the next.
   *
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} opts.unit        what is being counted, e.g. "حجزاً"
   * @param {Array<{key: string, label: string, value: number, hint?: string}>} opts.rows
   * @param {number} [opts.limit]
   * @returns {HTMLElement}
   */
  function rankedBars(opts) {
    var rows = (opts.rows || []).filter(function (row) {
      return row;
    });

    if (!rows.length) return null;

    var limit = opts.limit || 6;
    var shown = rows.slice(0, limit);
    var rest = rows.slice(limit);

    var sum = rows.reduce(function (total, row) {
      return total + (row.value || 0);
    }, 0);

    var max = shown.reduce(function (best, row) {
      return Math.max(best, row.value || 0);
    }, 0);

    return dom.el("div", { class: "chart", "data-chart": "ranked" }, [
      dom.el("p", { class: "chart__caption", text: opts.title }),

      dom.el("ol", { class: "rank", "data-rank": "" }, shown.map(function (row, index) {
        var value = row.value || 0;
        var share = sum > 0 ? Math.round((value / sum) * 100) : 0;
        var width = max > 0 ? (value / max) * 100 : 0;

        return dom.el("li", {
          class: "rank__row",
          "data-rank-row": row.key,
          style: "--rank:" + index + 1
        }, [
          dom.el("div", { class: "rank__head" }, [
            dom.el("span", { class: "rank__name", text: row.label }),
            dom.el("span", { class: "rank__value num", text: fmt.number(value) + " " + opts.unit })
          ]),

          dom.el("div", {
            class: "rank__track",
            role: "img",
            "aria-label": row.label + ": " + fmt.number(value) + " " + opts.unit +
              "، " + share + "٪ من " + opts.title
          }, [
            dom.el("span", { class: "rank__fill", style: "width:" + width + "%" })
          ]),

          dom.el("p", { class: "rank__note" }, [
            dom.el("span", { class: "rank__share num", text: share + "٪" }),
            row.hint ? dom.el("span", { class: "rank__hint", text: row.hint }) : null
          ])
        ]);
      })),

      rest.length
        ? dom.el("p", {
            class: "chart__foot",
            text: "و" + fmt.number(rest.length) + " أخرى أقل طلباً، مجموعها " +
              fmt.number(rest.reduce(function (total, row) {
                return total + (row.value || 0);
              }, 0)) + " " + opts.unit + "."
          })
        : null,

      dataTable(opts.title, rows.map(function (row) {
        return { label: row.label, value: fmt.number(row.value || 0) + " " + opts.unit };
      }))
    ]);
  }

  /* =====================================================================
     One bar split into parts, for a mix of statuses
     ===================================================================== */

  /**
   * A single horizontal bar showing how a set splits up, with a legend that
   * carries every count.
   *
   * A donut would look better and answer less: with seven statuses the slices
   * get too thin to read and the arc angles have to be compared, while a
   * stacked bar plus a printed list is answerable at a glance and from the
   * text alone.
   *
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} opts.unit
   * @param {Array<{key: string, label: string, value: number, tone: string}>} opts.parts
   * @returns {HTMLElement}
   */
  function stackedBar(opts) {
    var parts = (opts.parts || []).filter(function (part) {
      return part && part.value > 0;
    });

    var total = (opts.parts || []).reduce(function (sum, part) {
      return sum + (part.value || 0);
    }, 0);

    if (!total) return null;

    var rest = (opts.parts || []).reduce(function (sum, part) {
      return sum + (part.value || 0);
    }, 0);

    return dom.el("div", { class: "chart", "data-chart": "stacked" }, [
      dom.el("p", { class: "chart__caption", text: opts.title }),

      dom.el("div", {
        class: "stack-bar",
        role: "img",
        "aria-label": opts.title + ": " + fmt.number(rest) + " " + opts.unit
      }, parts.map(function (part) {
        return dom.el("span", {
          class: "stack-bar__part is-" + part.tone,
          style: "flex-grow:" + part.value,
          title: part.label + " — " + fmt.number(part.value) + " " + opts.unit
        });
      })),

      dom.el("ul", { class: "legend", "data-legend": "" }, (opts.parts || [])
        .map(function (part) {
          return dom.el("li", { class: "legend__item", "data-legend-key": part.key }, [
            dom.el("span", {
              class: "legend__swatch is-" + part.tone,
              "aria-hidden": "true"
            }),
            dom.el("span", { class: "legend__label", text: part.label }),
            dom.el("span", { class: "legend__value num" }, [
              dom.el("span", { text: fmt.number(part.value || 0) }),
              dom.el("span", {
                class: "legend__share",
                text: total > 0 ? Math.round(((part.value || 0) / total) * 100) + "٪" : "—"
              })
            ])
          ]);
        })),

      dataTable(opts.title, (opts.parts || []).map(function (part) {
        return { label: part.label, value: fmt.number(part.value || 0) + " " + opts.unit };
      }))
    ]);
  }

  admin.charts = {
    barChart: barChart,
    rankedBars: rankedBars,
    stackedBar: stackedBar,
    dataTable: dataTable,

    MIN_BAR: MIN_BAR
  };
})(window.Halaq = window.Halaq || {});
