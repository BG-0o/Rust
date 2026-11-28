// @description Custom "Playing…" activity on your status · Desktop
// @version 1.3.0
// @author Vencord · Rust by BG_0o
// @permissions hooks
// @gateway-send 3
// @discord POST /applications/*/external-assets
// @discord GET /oauth2/applications/*/assets
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

  // plugins/custom-rpc/src/index.ts
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
        onChange: () => void resolveAll(),
        description: "Needed for pictures: discord.com/developers \u2192 New Application \u2192 copy its ID \xB7 !rpc app <value>",
        default: ""
      },
      largeImage: {
        type: "text",
        title: "Big picture",
        onChange: () => void resolveAll(),
        description: "Image URL or an asset name of your app (needs Application ID) \xB7 !rpc image <value>",
        default: ""
      },
      largeText: { type: "text", title: "Big picture hover text", description: "Optional \xB7 !rpc imagetext <value>", default: "" },
      smallImage: {
        type: "text",
        title: "Small picture",
        onChange: () => void resolveAll(),
        description: "Image URL or asset name, shown in the corner \xB7 !rpc small <value>",
        default: ""
      },
      smallText: { type: "text", title: "Small picture hover text", description: "Optional \xB7 !rpc smalltext <value>", default: "" },
      showTime: { type: "switch", title: "Show elapsed time", default: true },
      replaceGames: {
        type: "switch",
        title: "Replace detected games",
        description: "Hides real games while this one shows",
        default: false
      }
    }),
    "rpc",
    { name: { key: "name", kind: "text" }, line1: { key: "details", kind: "text" }, line2: { key: "state", kind: "text" }, url: { key: "streamUrl", kind: "text" }, app: { key: "applicationId", kind: "text" }, image: { key: "largeImage", kind: "text" }, imagetext: { key: "largeText", kind: "text" }, small: { key: "smallImage", kind: "text" }, smalltext: { key: "smallText", kind: "text" } },
    () => void resolveAll()
  );
  var resolved = new Map(Object.entries(phoenix.storage.get("assets") ?? {}));
  var pending = /* @__PURE__ */ new Set();
  var warned = false;
  function appId() {
    const id = settings.applicationId.trim();
    return /^\d{17,20}$/.test(id) ? id : null;
  }
  async function resolve(value) {
    const v = value.trim();
    const app = appId();
    if (v && !app) {
      if (!warned) phoenix.ui.toast("Custom RPC: pictures need an Application ID (Developer Portal \u2192 New Application)");
      warned = true;
      return;
    }
    const key = `${app}|${v}`;
    if (!v || v.startsWith("mp:") || /^\d{17,20}$/.test(v) || resolved.has(key) || pending.has(key)) return;
    pending.add(key);
    try {
      if (/^https?:\/\//i.test(v)) {
        const res = await phoenix.discord.post(`/applications/${app}/external-assets`, { urls: [v] });
        const path = res.ok ? res.json()[0]?.external_asset_path : void 0;
        if (path) resolved.set(key, `mp:${path}`);
        else phoenix.ui.toast(`Custom RPC: couldn't load that image (${res.status})`);
      } else {
        const res = await phoenix.discord.get(`/oauth2/applications/${app}/assets`);
        const list = res.ok ? res.json() : [];
        const hit = list.find((a) => a.name.toLowerCase() === v.toLowerCase());
        if (hit) resolved.set(key, hit.id);
        else phoenix.ui.toast(`Custom RPC: no asset named "${v}" in that app`);
      }
      phoenix.storage.set("assets", Object.fromEntries(resolved));
    } catch (e) {
      phoenix.log.warn(`custom-rpc: image lookup failed: ${e}`);
    } finally {
      pending.delete(key);
    }
  }
  function image(value) {
    const v = value.trim();
    if (!v) return void 0;
    if (!appId()) return void resolve(v);
    if (v.startsWith("mp:") || /^\d{17,20}$/.test(v)) return v;
    const hit = resolved.get(`${appId()}|${v}`);
    if (!hit) void resolve(v);
    return hit;
  }
  async function resolveAll() {
    await resolve(settings.largeImage);
    await resolve(settings.smallImage);
  }
  void resolveAll();
  function build() {
    const name = settings.name.trim();
    if (!settings.enabled || !name) return null;
    const type = TYPES[settings.type] ?? 0;
    const activity = { type, name };
    if (settings.details.trim()) activity.details = settings.details.trim();
    if (settings.state.trim()) activity.state = settings.state.trim();
    if (type === 1 && settings.streamUrl.trim()) activity.url = settings.streamUrl.trim();
    const large = image(settings.largeImage);
    const small = image(settings.smallImage);
    if (large || small) {
      const assets = {};
      if (large) assets.large_image = large;
      if (large && settings.largeText.trim()) assets.large_text = settings.largeText.trim();
      if (small) assets.small_image = small;
      if (small && settings.smallText.trim()) assets.small_text = settings.smallText.trim();
      activity.assets = assets;
      activity.application_id = appId();
    } else if (/^\d{17,20}$/.test(settings.applicationId.trim())) activity.application_id = settings.applicationId.trim();
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
