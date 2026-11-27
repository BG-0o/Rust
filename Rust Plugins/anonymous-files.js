// @description Renames the files you upload
// @version 1.2.1
// @author fawn · Rust by BG_0o
// @permissions discord messages
// @discord POST /channels/*/messages
// @messages
"use strict";
(() => {
  // plugins/_lib/src/say.ts
  function say(text, _channelId, _author = "Sunbird") {
    phoenix.ui.toast(text);
  }

  // plugins/_lib/src/once.ts
  var WINDOW_MS = 2e4;
  var seen = /* @__PURE__ */ new Map();
  function firstTime(text, channelId) {
    const now = Date.now();
    for (const [key2, at] of seen) if (now - at > WINDOW_MS) seen.delete(key2);
    const key = `${channelId ?? ""}\0${text.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.set(key, now);
    return true;
  }

  // plugins/_lib/src/commands.ts
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
    const names2 = Object.keys(fields);
    const firstList = names2.find((n) => fields[n].kind === "list");
    const cmd = `!${prefix}`;
    const summary = () => names2.map((n) => {
      const f = fields[n];
      const v = f.kind === "list" ? items(f.key).join(", ") : String(read(f.key) ?? "");
      return `${n}: ${v === "" ? "\u2014" : short(v)}`;
    }).join(" \xB7 ");
    const help = () => `${cmd} ${names2.map((n) => fields[n].kind === "list" ? `${n} add|remove|set|clear` : `${n} <value>|clear`).join(" \xB7 ")}`;
    phoenix.messages.onSend((text, ctx) => {
      const reply = (m) => say(m, ctx?.channelId, cmd);
      const trimmed = text.trim();
      if (trimmed.toLowerCase() !== cmd && !trimmed.toLowerCase().startsWith(`${cmd} `)) return;
      if (!firstTime(trimmed, ctx?.channelId)) return false;
      const rest = trimmed.slice(cmd.length).trim();
      if (!rest) {
        reply(summary());
        return false;
      }
      if (rest === "help") {
        reply(help());
        return false;
      }
      let [first, ...tail] = rest.split(/\s+/);
      let name = names2.find((n) => n.toLowerCase() === first.toLowerCase());
      if (!name) {
        if (firstList && ["add", "remove", "set", "clear"].includes(first.toLowerCase())) {
          name = firstList;
          tail = [first, ...tail];
        } else {
          reply(`Unknown field "${first}". ${help()}`);
          return false;
        }
      }
      const field = fields[name];
      const value = rest.slice(rest.toLowerCase().indexOf(first.toLowerCase()) + first.length).trim();
      if (field.kind === "list") {
        const op = (tail[0] ?? "").toLowerCase();
        const arg = name === firstList && !names2.some((n) => n.toLowerCase() === first.toLowerCase()) ? rest.slice(op.length).trim() : value.slice(op.length).trim();
        const current = items(field.key);
        if (op === "clear") {
          save(field.key, "");
          reply(`${name}: cleared`);
        } else if (op === "add" && arg) {
          const add = arg.split(SPLIT).map((s) => s.trim()).filter(Boolean);
          const next = [...current];
          for (const a of add) if (!next.some((c) => c.toLowerCase() === a.toLowerCase())) next.push(a);
          save(field.key, next.join("\n"));
          reply(`${name}: ${short(next.join(", "), 150)}`);
        } else if (op === "remove" && arg) {
          const drop = arg.split(SPLIT).map((s) => s.trim().toLowerCase()).filter(Boolean);
          const next = current.filter((c) => !drop.includes(c.toLowerCase()));
          save(field.key, next.join("\n"));
          reply(`${name}: ${next.length ? short(next.join(", "), 150) : "\u2014"}`);
        } else if (op === "set") {
          const next = arg.split(SPLIT).map((s) => s.trim()).filter(Boolean);
          save(field.key, next.join("\n"));
          reply(`${name}: ${next.length ? short(next.join(", "), 150) : "\u2014"}`);
        } else if (op === "reset") {
          reset(field.key);
          reply(`${name}: back to the settings page`);
        } else {
          reply(`${cmd} ${name} add|remove|set|clear|reset <items>`);
        }
        return false;
      }
      if (!value) {
        reply(`${name}: ${String(read(field.key) ?? "") || "\u2014"}`);
        return false;
      }
      if (value.toLowerCase() === "clear") {
        reset(field.key);
        reply(`${name}: back to the settings page`);
        return false;
      }
      if (field.kind === "number") {
        const n = Number(value.replace(",", "."));
        if (!Number.isFinite(n)) {
          reply(`${name} needs a number`);
          return false;
        }
        save(field.key, n);
        reply(`${name}: ${n}`);
        return false;
      }
      save(field.key, value);
      reply(`${name}: ${short(value, 150)}`);
      return false;
    });
    return view;
  }

  // plugins/anonymous-files/src/index.ts
  var settings = commands(
    phoenix.settings.define({
      enabled: { type: "switch", title: "Enabled", default: true },
      method: {
        type: "select",
        title: "New name",
        options: [
          { value: "random", label: "Random characters" },
          { value: "consistent", label: "Always the same name" },
          { value: "timestamp", label: "Time sent" }
        ],
        default: "random"
      },
      length: { type: "number", title: "Random name length", description: "!anon length <value>", default: 7 },
      consistent: { type: "text", title: "Fixed name", description: 'For "Always the same name" \xB7 !anon name <value>', default: "image" },
      keepExtension: { type: "switch", title: "Keep extension", description: ".png, .mp4\u2026", default: true }
    }),
    "anon",
    { name: { key: "consistent", kind: "text" }, length: { key: "length", kind: "number" } }
  );
  var CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  function newName(original) {
    const spoiler = original.startsWith("SPOILER_");
    const bare = spoiler ? original.slice(8) : original;
    const dot = bare.lastIndexOf(".");
    const ext = settings.keepExtension && dot > 0 ? bare.slice(dot) : "";
    let base;
    if (settings.method === "consistent") base = settings.consistent.trim() || "image";
    else if (settings.method === "timestamp") base = String(Date.now());
    else {
      const len = Math.min(Math.max(Math.floor(settings.length) || 7, 1), 64);
      base = Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
    }
    return (spoiler ? "SPOILER_" : "") + base + ext;
  }
  var names = /* @__PURE__ */ new Map();
  phoenix.discord.onRequest({ method: "POST", pathPrefix: "/channels/", pathSuffix: "/messages" }, (req) => {
    if (!settings.enabled) return;
    const payload = req.json();
    if (!payload || !Array.isArray(payload.attachments) || payload.attachments.length === 0) return;
    let changed = false;
    for (const a of payload.attachments) {
      if (typeof a.filename !== "string" || !a.filename) continue;
      const key = `${a.id ?? ""}:${a.filename}`;
      const name = names.get(key) ?? newName(a.filename);
      names.set(key, name);
      a.filename = name;
      changed = true;
    }
    if (names.size > 200) names.clear();
    return changed ? { body: payload } : void 0;
  });
  phoenix.log.info("anonymous-files loaded");
})();
