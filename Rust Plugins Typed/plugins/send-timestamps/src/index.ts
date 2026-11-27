import { commands } from "../../_lib/src/commands";

const detected = -new Date().getTimezoneOffset() / 60;

const settings = commands(
  phoenix.settings.define({
  offset: {
    type: "number",
    title: "Your UTC offset",
    description: "Hours, e.g. -3 for Brasília · !ts offset <value>",
    default: Number.isFinite(detected) && detected !== 0 ? detected : -3,
  },
  style: {
    type: "select",
    title: "Format",
    options: [
      { value: "t", label: "21:30" },
      { value: "R", label: "in 2 hours" },
      { value: "f", label: "December 25, 2026 21:30" },
    ],
    default: "t",
  },
  }),
  "ts",
  { offset: { key: "offset", kind: "number" } }
);

const PATTERN = /`(?:(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?`/gi;

function toUnix(
  day: string | undefined,
  month: string | undefined,
  year: string | undefined,
  hour: string,
  minute: string,
  ampm: string | undefined,
): number | null {
  let h = Number(hour);
  const m = Number(minute);
  if (ampm) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ampm.toLowerCase() === "pm" ? 12 : 0);
  }
  if (h > 23 || m > 59) return null;
  const offsetMs = settings.offset * 3600_000;
  const local = new Date(Date.now() + offsetMs); // "now" on your clock, read with UTC getters
  let y = local.getUTCFullYear();
  let mo = local.getUTCMonth();
  let d = local.getUTCDate();
  if (day && month) {
    d = Number(day);
    mo = Number(month) - 1;
    if (year) y = year.length === 2 ? 2000 + Number(year) : Number(year);
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  }
  const ms = Date.UTC(y, mo, d, h, m) - offsetMs;
  return Math.floor(ms / 1000);
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
  return changed ? out : undefined;
});

phoenix.log.info("send-timestamps loaded");
