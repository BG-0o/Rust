// @description Hides images and videos in NSFW channels behind a spoiler
// @version 1.1.0
// @author Vendicated · Rust by BG_0o
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

  // blur-nsfw/src/index.ts
  var IS_SPOILER = 1 << 3;
  var settings = commands(
    phoenix.settings.define({
      allChannels: {
        type: "switch",
        title: "Hide in all channels",
        description: "Not just NSFW ones",
        default: false
      },
      embeds: {
        type: "switch",
        title: "Hide link images too",
        description: "GIFs and link previews",
        default: true
      },
      ignored: {
        type: "text",
        title: "Ignored channels",
        description: "Channel or category IDs, comma separated \xB7 !nsfw ignore add <x>",
        default: "",
        multiline: true
      }
    }),
    "nsfw",
    { ignore: { key: "ignored", kind: "list" } }
  );
  var channels = /* @__PURE__ */ new Map();
  var fetching = /* @__PURE__ */ new Set();
  var remember = (c) => {
    if (!c?.id) return;
    channels.set(c.id, { nsfw: c.nsfw === true, parent: c.parent_id ?? null });
  };
  var ignoredIds = () => new Set(settings.ignored.split(/[\s,]+/).filter(Boolean));
  var isNsfw = (id) => {
    const c = channels.get(id);
    if (!c) return void 0;
    if (c.nsfw) return true;
    if (c.parent) return channels.get(c.parent)?.nsfw === true;
    return false;
  };
  var shouldHide = (channelId) => {
    const ignored = ignoredIds();
    if (ignored.has(channelId)) return false;
    const parent = channels.get(channelId)?.parent;
    if (parent && ignored.has(parent)) return false;
    if (settings.allChannels) return true;
    return isNsfw(channelId);
  };
  var lookup = async (channelId) => {
    if (channels.has(channelId) || fetching.has(channelId)) return;
    fetching.add(channelId);
    try {
      const res = await phoenix.discord.get(`/channels/${channelId}`);
      if (res.ok) {
        const c = res.json();
        remember(c);
        if (c.parent_id && !channels.has(c.parent_id)) await lookup(c.parent_id);
      }
    } catch {
    } finally {
      fetching.delete(channelId);
    }
  };
  var spoilerMessage = (m) => {
    if (!m) return false;
    let changed = false;
    for (const a of m.attachments ?? []) {
      if (a.is_spoiler && a.filename?.startsWith("SPOILER_")) continue;
      a.is_spoiler = true;
      a.flags = (a.flags ?? 0) | IS_SPOILER;
      if (a.filename && !a.filename.startsWith("SPOILER_")) a.filename = `SPOILER_${a.filename}`;
      changed = true;
    }
    if (settings.embeds) {
      for (const e of m.embeds ?? []) {
        for (const media of [e.image, e.thumbnail, e.video]) {
          if (media) {
            media.flags = (media.flags ?? 0) | IS_SPOILER;
            changed = true;
          }
        }
      }
    }
    for (const c of m.components ?? []) {
      if (c.type === 12) for (const item of c.items) {
        item.spoiler = true;
        changed = true;
      }
      if (c.type === 11) {
        c.spoiler = true;
        changed = true;
      }
    }
    if (m.referenced_message) changed = spoilerMessage(m.referenced_message) || changed;
    return changed;
  };
  var { gateway } = phoenix;
  var fromGuild = (g) => {
    const guild = g;
    for (const c of guild?.channels ?? []) remember(c);
    for (const c of guild?.threads ?? []) remember(c);
  };
  if (gateway.ready) phoenix.on(gateway.ready, (r) => (r.guilds ?? []).forEach(fromGuild));
  if (gateway.guildCreate) phoenix.on(gateway.guildCreate, fromGuild);
  if (gateway.initialGuild) phoenix.on(gateway.initialGuild, fromGuild);
  for (const name of ["channelCreate", "channelUpdate", "threadCreate", "threadUpdate"]) {
    const sig = gateway[name];
    if (sig) phoenix.on(sig, (c) => remember(c));
  }
  phoenix.stores.sql("SELECT CAST(v AS TEXT) AS v FROM guilds").then((rows) => {
    for (const { v } of rows) {
      try {
        fromGuild(JSON.parse(v));
      } catch {
      }
    }
  }).catch(() => {
  });
  if (gateway.messageCreate) {
    phoenix.hook(gateway.messageCreate, {
      before(m) {
        const hide = shouldHide(m.channel_id);
        if (hide === void 0) {
          void lookup(m.channel_id);
          return;
        }
        if (hide && spoilerMessage(m)) return m;
      }
    });
  }
  if (gateway.messageUpdate) {
    phoenix.hook(gateway.messageUpdate, {
      before(m) {
        if (shouldHide(m.channel_id) && spoilerMessage(m)) return m;
      }
    });
  }
  phoenix.discord.onResponse({ method: "GET", pathPrefix: "/channels/", pathSuffix: "/messages" }, async (res) => {
    if (res.status < 200 || res.status >= 300) return;
    const channelId = res.path.match(/^\/channels\/(\d+)\/messages/)?.[1];
    if (!channelId) return;
    if (shouldHide(channelId) === void 0) await lookup(channelId);
    phoenix.log.info(`history ${channelId}: hide=${shouldHide(channelId)}`);
    if (!shouldHide(channelId)) return;
    const list = res.json();
    if (!Array.isArray(list)) return;
    let changed = false;
    for (const m of list) changed = spoilerMessage(m) || changed;
    return changed ? { body: list } : void 0;
  });
  phoenix.log.info("blur-nsfw loaded");
})();
