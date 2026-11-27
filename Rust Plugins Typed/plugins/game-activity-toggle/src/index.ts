import { say } from "../../_lib/src/say";

// When hidden it does two things:
// 1. Turns off the account's "Share detected activities" (the setting Vencord uses).
// 2. Strips games from your status before it's sent, as a fallback.
// Your own client may still show the game to you; others don't see it.

// Activity types: 0 Playing, 1 Streaming, 2 Listening, 3 Watching, 4 Custom status, 5 Competing.
const GAMES = new Set([0, 1, 3, 5]);
const LISTENING = 2;
const KEY = "visible";

let visible = phoenix.storage.get<boolean>(KEY) ?? phoenix.storage.get<boolean>("mostrar") ?? phoenix.storage.get<boolean>("showGame") ?? true;

const settings = phoenix.settings.define({
  toggle: {
    type: "button",
    title: "Toggle now",
    description: "Or send !game in any chat",
    onPress: () => set(!visible, true),
  },
  hideSpotify: {
    type: "switch",
    title: "Also hide Spotify",
    description: "While the game is hidden",
    default: false,
  },
  inMenu: {
    type: "switch",
    title: "Right-click option",
    description: "\"Show/hide game\" in any message's menu",
    default: true,
  },
});

// Account: PreloadedUserSettings.status (11) -> show_current_game (3), as base64 protobuf.
const PROTO_ON = "WgQaAggB";
const PROTO_OFF = "WgIaAA==";

async function syncAccount(value: boolean, notify: boolean, channel?: string | null) {
  try {
    const res = await phoenix.discord.patch("/users/@me/settings-proto/1", { settings: value ? PROTO_ON : PROTO_OFF });
    if (!res.ok) {
      phoenix.log.warn(`game-activity-toggle: PATCH failed ${res.status}`);
      if (notify) say(`Couldn't change it on Discord (${res.status})`, channel, "game");
      return;
    }
    if (notify) say(value ? "🎮 Game visible" : "🎮 Game hidden", channel, "game");
  } catch {
    if (notify) say("Can't reach Discord", channel, "game");
  }
}

function set(value: boolean, notify: boolean, channel?: string | null) {
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
  onPress: (ctx) => set(!visible, true, ctx.channelId ?? ctx.message?.channel_id),
});

// Op 3 = presence update: { status, since, activities, afk }.
phoenix.gateway.onSend<{ activities?: { type?: number }[] }>(3, (payload) => {
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
