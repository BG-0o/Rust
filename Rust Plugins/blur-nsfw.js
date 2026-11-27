// @description Hides images and videos in NSFW channels behind a spoiler
// @version 1.0.0
// @author Vendicated · Rust by BG_0o
"use strict";
(() => {
  // blur-nsfw/src/index.ts
  var IS_SPOILER = 1 << 3;
  var settings = phoenix.settings.define({
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
      description: "Channel or category IDs, comma separated",
      default: "",
      multiline: true
    }
  });
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
