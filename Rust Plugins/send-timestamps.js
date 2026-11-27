// @description Times in backticks (`21:30`) become timestamps in everyone's time zone
// @version 1.0.0
// @author Ven · Rust by BG_0o
"use strict";
(() => {
  // send-timestamps/src/index.ts
  var detected = -(/* @__PURE__ */ new Date()).getTimezoneOffset() / 60;
  var settings = phoenix.settings.define({
    offset: {
      type: "number",
      title: "Your UTC offset",
      description: "Hours, e.g. -3 for Bras\xEDlia",
      default: Number.isFinite(detected) && detected !== 0 ? detected : -3
    },
    style: {
      type: "select",
      title: "Format",
      options: [
        { value: "t", label: "21:30" },
        { value: "R", label: "in 2 hours" },
        { value: "f", label: "December 25, 2026 21:30" }
      ],
      default: "t"
    }
  });
  var PATTERN = /`(?:(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?`/gi;
  function toUnix(day, month, year, hour, minute, ampm) {
    let h = Number(hour);
    const m = Number(minute);
    if (ampm) {
      if (h < 1 || h > 12) return null;
      h = h % 12 + (ampm.toLowerCase() === "pm" ? 12 : 0);
    }
    if (h > 23 || m > 59) return null;
    const offsetMs = settings.offset * 36e5;
    const local = new Date(Date.now() + offsetMs);
    let y = local.getUTCFullYear();
    let mo = local.getUTCMonth();
    let d = local.getUTCDate();
    if (day && month) {
      d = Number(day);
      mo = Number(month) - 1;
      if (year) y = year.length === 2 ? 2e3 + Number(year) : Number(year);
      if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
    }
    const ms = Date.UTC(y, mo, d, h, m) - offsetMs;
    return Math.floor(ms / 1e3);
  }
  phoenix.messages.onSend((text) => {
    if (!text.includes("`")) return;
    let changed = false;
    const out = text.replace(PATTERN, (whole, day, month, year, hour, minute, ampm) => {
      const unix = toUnix(day, month, year, hour, minute, ampm);
      if (unix === null) return whole;
      changed = true;
      const style = day && settings.style === "t" ? "f" : settings.style;
      return `<t:${unix}:${style}>`;
    });
    return changed ? out : void 0;
  });
  phoenix.log.info("send-timestamps loaded");
})();
