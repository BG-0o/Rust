// @description Show or hide the game you're playing on your status · Desktop
// @version 1.1.0
// @author Nuckyz, RuukuLada · Rust by BG_0o
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

  // game-activity-toggle/src/index.ts
  var GAMES = /* @__PURE__ */ new Set([0, 1, 3, 5]);
  var LISTENING = 2;
  var KEY = "visible";
  var visible = phoenix.storage.get(KEY) ?? phoenix.storage.get("mostrar") ?? phoenix.storage.get("showGame") ?? true;
  var settings = phoenix.settings.define({
    toggle: {
      type: "button",
      title: "Toggle now",
      description: "Or send !game in any chat",
      onPress: () => set(!visible, true)
    },
    hideSpotify: {
      type: "switch",
      title: "Also hide Spotify",
      description: "While the game is hidden",
      default: false
    },
    inMenu: {
      type: "switch",
      title: "Right-click option",
      description: `"Show/hide game" in any message's menu`,
      default: true
    }
  });
  var PROTO_ON = "WgQaAggB";
  var PROTO_OFF = "WgIaAA==";
  async function syncAccount(value, notify, channel) {
    try {
      const res = await phoenix.discord.patch("/users/@me/settings-proto/1", { settings: value ? PROTO_ON : PROTO_OFF });
      if (!res.ok) {
        phoenix.log.warn(`game-activity-toggle: PATCH failed ${res.status}`);
        if (notify) say(`Couldn't change it on Discord (${res.status})`, channel, "game");
        return;
      }
      if (notify) say(value ? "\u{1F3AE} Game visible" : "\u{1F3AE} Game hidden", channel, "game");
    } catch {
      if (notify) say("Can't reach Discord", channel, "game");
    }
  }
  function set(value, notify, channel) {
    visible = value;
    phoenix.storage.set(KEY, value);
    void syncAccount(value, notify, channel);
  }
  phoenix.messages.onSend((text, ctx) => {
    if (text.trim().toLowerCase() !== "!game") return;
    set(!visible, true, ctx?.channelId);
    return false;
  });
  phoenix.ui.addMessageAction({
    label: "Show/hide game",
    visible: () => settings.inMenu,
    onPress: (ctx) => set(!visible, true, ctx.channelId ?? ctx.message?.channel_id)
  });
  phoenix.gateway.onSend(3, (payload) => {
    if (visible || !payload || !Array.isArray(payload.activities)) return;
    payload.activities = payload.activities.filter((a) => {
      const type = a?.type ?? 0;
      if (GAMES.has(type)) return false;
      if (type === LISTENING && settings.hideSpotify) return false;
      return true;
    });
    return payload;
  });
  phoenix.log.info(`game-activity-toggle loaded (game ${visible ? "visible" : "hidden"})`);
})();
