// @description Send messages without notifying anyone, like @silent
// @version 1.1.0
// @author Nuckyz, CatNoir · Rust by BG_0o

import { say } from "../../_lib/src/say";

const SUPPRESS_NOTIFICATIONS = 1 << 12;
const KEY = "on";

let on = phoenix.storage.get<boolean>(KEY) ?? false;

const settings = phoenix.settings.define({
  on: {
    type: "switch",
    title: "Silent mode",
    description: "Or send !silent in any chat",
    default: on,
    onChange(value) {
      on = value;
      phoenix.storage.set(KEY, on);
    },
  },
  once: {
    type: "switch",
    title: "Next message only",
    description: "Turns off after one message",
    default: false,
  },
  inMenu: {
    type: "switch",
    title: "Right-click option",
    description: "\"Silent mode\" in any message's menu",
    default: true,
  },
});

// The last !silent wins over the switch, which can lag behind.

const toggle = (channel?: string | null) => {
  on = !on;
  phoenix.storage.set(KEY, on);
  say(on ? "🔕 Silent mode on" : "🔔 Silent mode off", channel, "silent");
};

phoenix.ui.addMessageAction({
  label: "Toggle silent mode",
  visible: () => settings.inMenu,
  onPress: (ctx) => toggle(ctx.channelId ?? ctx.message?.channel_id),
});

phoenix.messages.onSend((text, ctx) => {
  if (text.trim().toLowerCase() !== "!silent") return;
  toggle(ctx?.channelId);
  return false;
});

phoenix.discord.onRequest({ method: "POST", pathPrefix: "/channels/", pathSuffix: "/messages" }, (req) => {
  if (!on) return;
  const payload = req.json<Record<string, unknown>>();
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
