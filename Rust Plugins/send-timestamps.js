// @description Times in backticks (`21:30`) become timestamps in everyone's time zone
// @version 1.1.0
// @author Ven · Rust by BG_0o
"use strict";
(() => {
  // _lib/src/commands.ts
  var SPLIT = /\r?\n|,/;
  var STORE = (key) => `cmd:${key}`;
  var short = (s, n = 60) => s.length > n ? `${s.slice(0, n - 1)}\u2026` : s;
  function commands(settings2, prefix, fields, onSet) {
    const overrides = /* @__PURE__ */ new Map();
    for (const f of Object.values(fields)) {
      const saved = phoenix.storage.get(STORE(f.key));
      if (saved !== void 0 && saved !== null) overrides.set(f.key, saved);
    }
    const view = new Proxy(settings2, {
      get(target, key, receiver) {
        if (typeof key === "string" && overrides.has(key)) return overrides.get(key);
        return Reflect.get(target, key, receiver);
      }
    });
    const read = (key) => view[key];
    const items = (key) => String(read(key) ?? "").split(SPLIT).map((s) => s.trim()).filter(Boolean);
    const save = (key, value) => {
      overrides.set(key, value);
      phoenix.storage.set(STORE(key), value);
      onSet?.(key);
    };
    const reset = (key) => {
      overrides.delete(key);
      phoenix.storage.delete(STORE(key));
      onSet?.(key);
    };
    const names = Object.keys(fields);
    const firstList = names.find((n) => fields[n].kind === "list");
    const cmd = `!${prefix}`;
    const summary = () => names.map((n) => {
      const f = fields[n];
      const v = f.kind === "list" ? items(f.key).join(", ") : String(read(f.key) ?? "");
      return `${n}: ${v === "" ? "\u2014" : short(v)}`;
    }).join(" \xB7 ");
    const help = () => `${cmd} ${names.map((n) => fields[n].kind === "list" ? `${n} add|remove|set|clear` : `${n} <value>|clear`).join(" \xB7 ")}`;
    phoenix.messages.onSend((text) => {
      const trimmed = text.trim();
      if (trimmed.toLowerCase() !== cmd && !trimmed.toLowerCase().startsWith(`${cmd} `)) return;
      const rest = trimmed.slice(cmd.length).trim();
      if (!rest) {
        phoenix.ui.toast(summary());
        return false;
      }
      if (rest === "help") {
        phoenix.ui.toast(help());
        return false;
      }
      let [first, ...tail] = rest.split(/\s+/);
      let name = names.find((n) => n.toLowerCase() === first.toLowerCase());
      if (!name) {
        if (firstList && ["add", "remove", "set", "clear"].includes(first.toLowerCase())) {
          name = firstList;
          tail = [first, ...tail];
        } else {
          phoenix.ui.toast(`Unknown field "${first}". ${help()}`);
          return false;
        }
      }
      const field = fields[name];
      const value = rest.slice(rest.toLowerCase().indexOf(first.toLowerCase()) + first.length).trim();
      if (field.kind === "list") {
        const op = (tail[0] ?? "").toLowerCase();
        const arg = name === firstList && !names.some((n) => n.toLowerCase() === first.toLowerCase()) ? rest.slice(op.length).trim() : value.slice(op.length).trim();
        const current = items(field.key);
        if (op === "clear") {
          save(field.key, "");
          phoenix.ui.toast(`${name}: cleared`);
        } else if (op === "add" && arg) {
          const add = arg.split(SPLIT).map((s) => s.trim()).filter(Boolean);
          const next = [...current];
          for (const a of add) if (!next.some((c) => c.toLowerCase() === a.toLowerCase())) next.push(a);
          save(field.key, next.join("\n"));
          phoenix.ui.toast(`${name}: ${short(next.join(", "), 150)}`);
        } else if (op === "remove" && arg) {
          const drop = arg.split(SPLIT).map((s) => s.trim().toLowerCase()).filter(Boolean);
          const next = current.filter((c) => !drop.includes(c.toLowerCase()));
          save(field.key, next.join("\n"));
          phoenix.ui.toast(`${name}: ${next.length ? short(next.join(", "), 150) : "\u2014"}`);
        } else if (op === "set") {
          const next = arg.split(SPLIT).map((s) => s.trim()).filter(Boolean);
          save(field.key, next.join("\n"));
          phoenix.ui.toast(`${name}: ${next.length ? short(next.join(", "), 150) : "\u2014"}`);
        } else if (op === "reset") {
          reset(field.key);
          phoenix.ui.toast(`${name}: back to the settings page`);
        } else {
          phoenix.ui.toast(`${cmd} ${name} add|remove|set|clear|reset <items>`);
        }
        return false;
      }
      if (!value) {
        phoenix.ui.toast(`${name}: ${String(read(field.key) ?? "") || "\u2014"}`);
        return false;
      }
      if (value.toLowerCase() === "clear") {
        reset(field.key);
        phoenix.ui.toast(`${name}: back to the settings page`);
        return false;
      }
      if (field.kind === "number") {
        const n = Number(value.replace(",", "."));
        if (!Number.isFinite(n)) {
          phoenix.ui.toast(`${name} needs a number`);
          return false;
        }
        save(field.key, n);
        phoenix.ui.toast(`${name}: ${n}`);
        return false;
      }
      save(field.key, value);
      phoenix.ui.toast(`${name}: ${short(value, 150)}`);
      return false;
    });
    return view;
  }

  // send-timestamps/src/index.ts
  var detected = -(/* @__PURE__ */ new Date()).getTimezoneOffset() / 60;
  var settings = commands(
    phoenix.settings.define({
      offset: {
        type: "number",
        title: "Your UTC offset",
        description: "Hours, e.g. -3 for Bras\xEDlia \xB7 !ts offset <value>",
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
    }),
    "ts",
    { offset: { key: "offset", kind: "number" } }
  );
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
