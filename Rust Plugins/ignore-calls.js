// @description Calls from people you choose don't ring
// @version 1.2.0
// @author TheArmagan, thororen · Rust by BG_0o
"use strict";
(() => {
  // _lib/src/say.ts
  function say(text, channelId, author = "Sunbird") {
    phoenix.ui.toast(text);
    if (!channelId) return;
    try {
      phoenix.messages.addLocal(channelId, text, { author });
    } catch (err) {
      phoenix.log.warn(`couldn't add a local message: ${String(err)}`);
    }
  }

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
    const save2 = (key, value) => {
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
          save2(field.key, "");
          reply(`${name}: cleared`);
        } else if (op === "add" && arg) {
          const add = arg.split(SPLIT).map((s) => s.trim()).filter(Boolean);
          const next = [...current];
          for (const a of add) if (!next.some((c) => c.toLowerCase() === a.toLowerCase())) next.push(a);
          save2(field.key, next.join("\n"));
          reply(`${name}: ${short(next.join(", "), 150)}`);
        } else if (op === "remove" && arg) {
          const drop = arg.split(SPLIT).map((s) => s.trim().toLowerCase()).filter(Boolean);
          const next = current.filter((c) => !drop.includes(c.toLowerCase()));
          save2(field.key, next.join("\n"));
          reply(`${name}: ${next.length ? short(next.join(", "), 150) : "\u2014"}`);
        } else if (op === "set") {
          const next = arg.split(SPLIT).map((s) => s.trim()).filter(Boolean);
          save2(field.key, next.join("\n"));
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
        save2(field.key, n);
        reply(`${name}: ${n}`);
        return false;
      }
      save2(field.key, value);
      reply(`${name}: ${short(value, 150)}`);
      return false;
    });
    return view;
  }

  // ignore-calls/src/index.ts
  var settings = commands(
    phoenix.settings.define({
      users: {
        type: "text",
        title: "Ignored people",
        description: 'User IDs, comma separated. Or right-click > "Ignore calls" \xB7 !calls users add <x>',
        default: "",
        multiline: true
      },
      notify: { type: "switch", title: "Pop-up when a call is ignored", default: true }
    }),
    "calls",
    { users: { key: "users", kind: "list" } }
  );
  var parse = () => new Set(
    settings.users.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^\d{17,20}$/.test(s))
  );
  var KEY = "extra";
  var extra = new Set(phoenix.storage.get(KEY) ?? []);
  var save = () => phoenix.storage.set(KEY, [...extra]);
  var ignored = () => {
    const all = parse();
    for (const id of extra) all.add(id);
    return all;
  };
  var me = null;
  phoenix.discord.me().then((u) => {
    if (u?.id) me = u.id;
  }).catch(() => {
  });
  var names = /* @__PURE__ */ new Map();
  var told = /* @__PURE__ */ new Set();
  function filter(call) {
    if (!call || !me || !Array.isArray(call.ringing) || !call.ringing.includes(me)) return;
    const list = ignored();
    const caller = (call.voice_states ?? []).find((s) => s.user_id && s.user_id !== me && list.has(s.user_id));
    if (!caller?.user_id) return;
    call.ringing = call.ringing.filter((id) => id !== me);
    const key = `${call.channel_id}:${caller.user_id}`;
    if (settings.notify && !told.has(key)) {
      told.add(key);
      if (told.size > 100) told.clear();
      say(`\u{1F4F5} Ignored a call from ${names.get(caller.user_id) ?? "someone you ignore"}`, call.channel_id, "ignore-calls");
    }
    return call;
  }
  var { gateway } = phoenix;
  for (const name of ["callCreate", "callUpdate"]) {
    const sig = gateway[name];
    if (!sig) {
      phoenix.log.warn(`ignore-calls: this Discord build has no ${name} event`);
      continue;
    }
    phoenix.hook(sig, { before: (p) => filter(p) });
  }
  if (gateway.messageCreate)
    phoenix.on(gateway.messageCreate, (m) => {
      const a = m?.author;
      if (a?.id) names.set(a.id, a.global_name || a.username || a.id);
    });
  phoenix.ui.addMessageAction({
    label: "Ignore calls",
    visible: (ctx) => {
      const id = ctx.message?.author?.id;
      return !!id && id !== ctx.currentUserId && !ignored().has(id);
    },
    onPress: (ctx) => {
      const a = ctx.message?.author;
      if (!a?.id) return;
      extra.add(a.id);
      save();
      names.set(a.id, a.global_name || a.username || a.id);
      say(`\u{1F4F5} Calls from ${names.get(a.id)} are ignored`, ctx.channelId ?? ctx.message?.channel_id, "ignore-calls");
    }
  });
  phoenix.ui.addMessageAction({
    label: "Stop ignoring calls",
    visible: (ctx) => {
      const id = ctx.message?.author?.id;
      return !!id && extra.has(id);
    },
    onPress: (ctx) => {
      const id = ctx.message?.author?.id;
      if (!id) return;
      extra.delete(id);
      save();
      say("\u{1F4DE} Their calls ring again", ctx.channelId ?? ctx.message?.channel_id, "ignore-calls");
    }
  });
  phoenix.log.info("ignore-calls loaded");
})();
