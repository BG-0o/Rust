import { commands } from "../../_lib/src/commands";

const TYPES: Record<string, number> = { playing: 0, streaming: 1, listening: 2, watching: 3, competing: 5 };
const startedAt = Date.now();

const settings = commands(
  phoenix.settings.define({
  enabled: {
    type: "switch",
    title: "Enabled",
    description: "Applies on your next status change (switch status once to apply now)",
    default: true,
  },
  type: {
    type: "select",
    title: "Type",
    options: [
      { value: "playing", label: "Playing" },
      { value: "listening", label: "Listening to" },
      { value: "watching", label: "Watching" },
      { value: "competing", label: "Competing in" },
      { value: "streaming", label: "Streaming" },
    ],
    default: "playing",
  },
  name: { type: "text", title: "Name", description: "Required, e.g. a game name · !rpc name <value>", default: "" },
  details: { type: "text", title: "Line 1", description: "Optional · !rpc line1 <value>", default: "" },
  state: { type: "text", title: "Line 2", description: "Optional · !rpc line2 <value>", default: "" },
  streamUrl: {
    type: "text",
    title: "Stream URL",
    description: "Streaming only (twitch.tv or youtube.com) · !rpc url <value>",
    default: "",
  },
  applicationId: {
    type: "text",
    title: "Application ID",
    description: "Optional, from the Developer Portal, for an icon · !rpc app <value>",
    default: "",
  },
  showTime: { type: "switch", title: "Show elapsed time", default: true },
  replaceGames: {
    type: "switch",
    title: "Replace detected games",
    description: "Hides real games while this one shows",
    default: false,
  },
  }),
  "rpc",
  { name: { key: "name", kind: "text" }, line1: { key: "details", kind: "text" }, line2: { key: "state", kind: "text" }, url: { key: "streamUrl", kind: "text" }, app: { key: "applicationId", kind: "text" } }
);

type Activity = Record<string, unknown> & { type?: number };

function build(): Activity | null {
  const name = settings.name.trim();
  if (!settings.enabled || !name) return null;
  const type = TYPES[settings.type] ?? 0;
  const activity: Activity = { type, name };
  if (settings.details.trim()) activity.details = settings.details.trim();
  if (settings.state.trim()) activity.state = settings.state.trim();
  if (type === 1 && settings.streamUrl.trim()) activity.url = settings.streamUrl.trim();
  if (/^\d{17,20}$/.test(settings.applicationId.trim())) activity.application_id = settings.applicationId.trim();
  if (settings.showTime) activity.timestamps = { start: startedAt };
  return activity;
}

phoenix.gateway.onSend<{ activities?: Activity[] }>(3, (payload) => {
  const custom = build();
  if (!custom || !payload) return;
  let list = Array.isArray(payload.activities) ? payload.activities : [];
  // Keeps the custom status (type 4); drops detected games only when asked.
  list = list.filter((a) => a?.type === 4 || !settings.replaceGames);
  payload.activities = [custom, ...list];
  return payload;
});

phoenix.log.info("custom-rpc loaded");
