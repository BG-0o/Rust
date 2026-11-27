// @description Show or hide the game you're playing on your status · Desktop
// @version 1.0.0
// @author Nuckyz, RuukuLada · Rust by BG_0o
"use strict";
(() => {
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
  async function syncAccount(value, notify) {
    try {
      const res = await phoenix.discord.patch("/users/@me/settings-proto/1", { settings: value ? PROTO_ON : PROTO_OFF });
      if (!res.ok) {
        phoenix.log.warn(`game-activity-toggle: PATCH failed ${res.status}`);
        if (notify) phoenix.ui.toast(`Couldn't change it on Discord (${res.status})`);
        return;
      }
      if (notify) phoenix.ui.toast(value ? "\u{1F3AE} Game visible" : "\u{1F3AE} Game hidden");
    } catch {
      if (notify) phoenix.ui.toast("Can't reach Discord");
    }
  }
  function set(value, notify) {
    visible = value;
    phoenix.storage.set(KEY, value);
    void syncAccount(value, notify);
  }
  phoenix.messages.onSend((text) => {
    if (text.trim().toLowerCase() !== "!game") return;
    set(!visible, true);
    return false;
  });
  phoenix.ui.addMessageAction({
    label: "Show/hide game",
    visible: () => settings.inMenu,
    onPress: () => set(!visible, true)
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
