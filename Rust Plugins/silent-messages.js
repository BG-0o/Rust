// @description Send messages without notifying anyone, like @silent
// @version 1.2.0
// @author Nuckyz, CatNoir · Rust by BG_0o
// @discord POST /channels/*/messages
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
  var toggle = (channel) => {
    on = !on;
    phoenix.storage.set(KEY, on);
    say(on ? "\u{1F515} Silent mode on" : "\u{1F514} Silent mode off", channel, "silent");
  };
  phoenix.ui.addMessageAction({
    label: "Toggle silent mode",
    visible: () => settings.inMenu,
    onPress: (ctx) => toggle(ctx.channelId ?? ctx.message?.channel_id)
  });
  phoenix.messages.onSend((text, ctx) => {
    if (text.trim().toLowerCase() !== "!silent") return;
    toggle(ctx?.channelId);
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
