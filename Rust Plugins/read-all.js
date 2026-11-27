// @description Marks every server as read at once
// @version 1.2.0
// @author kemo · Rust by BG_0o
// @gateway ready guildCreate guildDelete
// @discord POST /guilds/*/ack
// @stores
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

  // read-all/src/index.ts
  var guilds = /* @__PURE__ */ new Set();
  var remember = (g) => {
    const id = g?.id;
    if (id) guilds.add(id);
  };
  var { gateway } = phoenix;
  if (gateway.ready) phoenix.on(gateway.ready, (r) => (r.guilds ?? []).forEach(remember));
  if (gateway.guildCreate) phoenix.on(gateway.guildCreate, remember);
  var deleted = gateway["guildDelete"];
  if (deleted) phoenix.on(deleted, (g) => {
    const id = g?.id;
    if (id && !g.unavailable) guilds.delete(id);
  });
  phoenix.stores.sql("SELECT CAST(k AS TEXT) AS k FROM guilds").then((rows) => {
    for (const { k } of rows) {
      const id = String(k).replace(/^0+/, "");
      if (/^\d{17,20}$/.test(id)) guilds.add(id);
    }
  }).catch(() => {
  });
  var running = false;
  async function readAll(channel) {
    const tell = (m) => say(m, channel, "readall");
    if (running) {
      tell("Already marking\u2026");
      return;
    }
    const ids = [...guilds];
    if (ids.length === 0) {
      tell("Servers still loading, try again in a moment");
      return;
    }
    running = true;
    tell(`Marking ${ids.length} servers as read\u2026`);
    let done = 0;
    let failed = 0;
    try {
      for (const id of ids) {
        try {
          const res = await phoenix.discord.post(`/guilds/${id}/ack`, {});
          if (res.ok) done++;
          else if (res.status === 429) {
            tell(`Discord asked to slow down after ${done} servers. Try again in a minute`);
            return;
          } else failed++;
        } catch {
          failed++;
        }
      }
      tell(failed ? `\u2705 ${done} servers read (${failed} failed)` : `\u2705 ${done} servers read`);
    } finally {
      running = false;
    }
  }
  phoenix.messages.onSend((text, ctx) => {
    if (text.trim().toLowerCase() !== "!readall") return;
    void readAll(ctx?.channelId);
    return false;
  });
  var settings = phoenix.settings.define({
    now: {
      type: "button",
      title: "Mark all as read now",
      description: "Or send !readall in any chat",
      onPress: () => void readAll()
    },
    inMenu: {
      type: "switch",
      title: "Right-click option",
      description: `"Mark all as read" in any message's menu`,
      default: true
    }
  });
  phoenix.ui.addMessageAction({
    label: "Mark all as read",
    visible: () => settings.inMenu,
    onPress: (ctx) => void readAll(ctx.channelId ?? ctx.message?.channel_id)
  });
  phoenix.log.info("read-all loaded");
})();
