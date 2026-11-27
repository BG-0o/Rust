// @description Custom "Playing…" activity on your status · Desktop
// @version 1.1.0
// @author Vencord · Rust by BG_0o
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

  // custom-rpc/src/index.ts
  var TYPES = { playing: 0, streaming: 1, listening: 2, watching: 3, competing: 5 };
  var startedAt = Date.now();
  var settings = commands(
    phoenix.settings.define({
      enabled: {
        type: "switch",
        title: "Enabled",
        description: "Applies on your next status change (switch status once to apply now)",
        default: true
      },
      type: {
        type: "select",
        title: "Type",
        options: [
          { value: "playing", label: "Playing" },
          { value: "listening", label: "Listening to" },
          { value: "watching", label: "Watching" },
          { value: "competing", label: "Competing in" },
          { value: "streaming", label: "Streaming" }
        ],
        default: "playing"
      },
      name: { type: "text", title: "Name", description: "Required, e.g. a game name \xB7 !rpc name <value>", default: "" },
      details: { type: "text", title: "Line 1", description: "Optional \xB7 !rpc line1 <value>", default: "" },
      state: { type: "text", title: "Line 2", description: "Optional \xB7 !rpc line2 <value>", default: "" },
      streamUrl: {
        type: "text",
        title: "Stream URL",
        description: "Streaming only (twitch.tv or youtube.com) \xB7 !rpc url <value>",
        default: ""
      },
      applicationId: {
        type: "text",
        title: "Application ID",
        description: "Optional, from the Developer Portal, for an icon \xB7 !rpc app <value>",
        default: ""
      },
      showTime: { type: "switch", title: "Show elapsed time", default: true },
      replaceGames: {
        type: "switch",
        title: "Replace detected games",
        description: "Hides real games while this one shows",
        default: false
      }
    }),
    "rpc",
    { name: { key: "name", kind: "text" }, line1: { key: "details", kind: "text" }, line2: { key: "state", kind: "text" }, url: { key: "streamUrl", kind: "text" }, app: { key: "applicationId", kind: "text" } }
  );
  function build() {
    const name = settings.name.trim();
    if (!settings.enabled || !name) return null;
    const type = TYPES[settings.type] ?? 0;
    const activity = { type, name };
    if (settings.details.trim()) activity.details = settings.details.trim();
    if (settings.state.trim()) activity.state = settings.state.trim();
    if (type === 1 && settings.streamUrl.trim()) activity.url = settings.streamUrl.trim();
    if (/^\d{17,20}$/.test(settings.applicationId.trim())) activity.application_id = settings.applicationId.trim();
    if (settings.showTime) activity.timestamps = { start: startedAt };
    return activity;
  }
  phoenix.gateway.onSend(3, (payload) => {
    const custom = build();
    if (!custom || !payload) return;
    let list = Array.isArray(payload.activities) ? payload.activities : [];
    list = list.filter((a) => a?.type === 4 || !settings.replaceGames);
    payload.activities = [custom, ...list];
    return payload;
  });
  phoenix.log.info("custom-rpc loaded");
})();
