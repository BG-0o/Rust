// @description Switches to Do Not Disturb while you're playing · Desktop
// @version 1.1.0
// @author thororen · Rust by BG_0o
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

  // auto-dnd/src/index.ts
  var settings = commands(
    phoenix.settings.define({
      status: {
        type: "select",
        title: "Status while playing",
        options: [
          { value: "dnd", label: "Do Not Disturb" },
          { value: "idle", label: "Idle" },
          { value: "invisible", label: "Invisible" }
        ],
        default: "dnd"
      },
      exclude: {
        type: "text",
        title: "Ignored games",
        description: "One per line; these won't change your status \xB7 !dnd ignore add <x>",
        default: "",
        multiline: true
      }
    }),
    "dnd",
    { ignore: { key: "exclude", kind: "list" } }
  );
  phoenix.gateway.onSend(3, (payload) => {
    if (!payload || payload.status !== "online" || !Array.isArray(payload.activities)) return;
    const skip = settings.exclude.split(/\r?\n|,/).map((n) => n.trim().toLowerCase()).filter(Boolean);
    const playing = payload.activities.some(
      (a) => a?.type === 0 && !skip.includes((a.name ?? "").toLowerCase())
    );
    if (!playing) return;
    payload.status = settings.status;
    return payload;
  });
  phoenix.log.info("auto-dnd loaded");
})();
