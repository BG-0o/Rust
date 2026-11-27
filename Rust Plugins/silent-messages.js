// @description Send messages without notifying anyone, like @silent
// @version 1.0.0
// @author Nuckyz, CatNoir · Rust by BG_0o
"use strict";
(() => {
  // silent-messages/src/index.ts
  var SUPPRESS_NOTIFICATIONS = 1 << 12;
  var KEY = "on";
  var on = phoenix.storage.get(KEY) ?? false;
  var settings = phoenix.settings.define({
    on: {
      type: "switch",
      title: "Silent mode",
      description: "Or send !silent in any chat",
      default: on,
      onChange(value) {
        on = value;
        phoenix.storage.set(KEY, on);
      }
    },
    once: {
      type: "switch",
      title: "Next message only",
      description: "Turns off after one message",
      default: false
    },
    inMenu: {
      type: "switch",
      title: "Right-click option",
      description: `"Silent mode" in any message's menu`,
      default: true
    }
  });
  var toggle = () => {
    on = !on;
    phoenix.storage.set(KEY, on);
    phoenix.ui.toast(on ? "\u{1F515} Silent mode on" : "\u{1F514} Silent mode off");
  };
  phoenix.ui.addMessageAction({
    label: "Toggle silent mode",
    visible: () => settings.inMenu,
    onPress: toggle
  });
  phoenix.messages.onSend((text) => {
    if (text.trim().toLowerCase() !== "!silent") return;
    toggle();
    return false;
  });
  phoenix.discord.onRequest({ method: "POST", pathPrefix: "/channels/", pathSuffix: "/messages" }, (req) => {
    if (!on) return;
    const payload = req.json();
    if (!payload || typeof payload !== "object") return;
    const flags = typeof payload.flags === "number" ? payload.flags : 0;
    payload.flags = flags | SUPPRESS_NOTIFICATIONS;
    if (settings.once) {
      on = false;
      phoenix.storage.set(KEY, on);
    }
    return { body: payload };
  });
  phoenix.log.info("silent-messages loaded");
})();
