// @description Notifies you when someone writes a word you chose
// @version 1.3.0
// @author Equicord · Rust by BG_0o
// @gateway ready guildCreate messageCreate
// @discord GET /users/@me
// @messages
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
      let name = names.find((n) => n.toLowerCase() === first.toLowerCase());
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
        const arg = name === firstList && !names.some((n) => n.toLowerCase() === first.toLowerCase()) ? rest.slice(op.length).trim() : value.slice(op.length).trim();
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

  // keyword-notify/src/index.ts
  var settings = commands(
    phoenix.settings.define({
      keywords: {
        type: "text",
        title: "Keywords",
        description: "One per line, e.g. your name, a game \xB7 !kw words add <x>",
        default: "",
        multiline: true
      },
      wholeWord: {
        type: "switch",
        title: "Whole words only",
        description: `"bg" won't match "bgs"`,
        default: true
      },
      regex: {
        type: "switch",
        title: "Use regex",
        description: "Each line is a regular expression",
        default: false
      },
      ignoreBots: { type: "switch", title: "Ignore bots", default: true },
      ignoredChannels: {
        type: "text",
        title: "Ignored channels",
        description: "Channel or server IDs, comma separated \xB7 !kw channels add <x>",
        default: ""
      },
      markInChat: {
        type: "switch",
        title: "Mark in chat",
        description: "Adds a note only you see under the message (pop-ups don't show on some builds)",
        default: true
      }
    }),
    "kw",
    { words: { key: "keywords", kind: "list" }, channels: { key: "ignoredChannels", kind: "list" } }
  );
  var me = null;
  phoenix.discord.me().then((u) => {
    if (u?.id) me = u.id;
  }).catch(() => {
  });
  var escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var cacheKey = "";
  var patterns = [];
  function compile() {
    const key = `${settings.keywords}|${settings.wholeWord}|${settings.regex}`;
    if (key === cacheKey) return patterns;
    cacheKey = key;
    patterns = [];
    for (const line of settings.keywords.split(/\r?\n/)) {
      const word = line.trim();
      if (!word) continue;
      try {
        const body = settings.regex ? word : escape(word);
        patterns.push(new RegExp(settings.wholeWord && !settings.regex ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body, "iu"));
      } catch {
        phoenix.log.warn(`keyword-notify: skipped invalid regex: ${word}`);
      }
    }
    return patterns;
  }
  var guildNames = /* @__PURE__ */ new Map();
  var rememberGuild = (g) => {
    const guild = g;
    const name = guild?.name ?? guild?.properties?.name;
    if (guild?.id && name) guildNames.set(guild.id, name);
  };
  var { gateway } = phoenix;
  if (gateway.ready) phoenix.on(gateway.ready, (r) => (r.guilds ?? []).forEach(rememberGuild));
  if (gateway.guildCreate) phoenix.on(gateway.guildCreate, rememberGuild);
  var shorten = (s, n = 120) => s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
  if (gateway.messageCreate)
    phoenix.on(gateway.messageCreate, (m) => {
      const content = m?.content;
      if (!content || !m.author?.id || m.author.id === me) return;
      if (settings.ignoreBots && m.author.bot) return;
      const ignored = new Set(settings.ignoredChannels.split(/[\s,]+/).filter(Boolean));
      const guildId = m.guild_id;
      if (ignored.has(m.channel_id) || guildId && ignored.has(guildId)) return;
      const hit = compile().find((re) => re.test(content));
      if (!hit) return;
      const who = m.author.global_name || m.author.username || "Someone";
      const where = guildId ? guildNames.get(guildId) ?? "a server" : "DM";
      phoenix.ui.notify({ title: `${who} in ${where}`, body: shorten(content) });
      if (settings.markInChat)
        phoenix.messages.addLocal(m.channel_id, `\u{1F514} Keyword in the message above from **${who}**`, { author: "Keywords" });
    });
  phoenix.log.info("keyword-notify loaded");
})();
