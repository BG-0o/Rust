import { commands } from "../../_lib/src/commands";

const settings = commands(
  phoenix.settings.define({
  names: {
    type: "text",
    title: "Hide",
    description: "One name per line, as shown on your status, e.g. Roblox · !hideact names add <x>",
    default: "",
    multiline: true,
  },
  partial: {
    type: "switch",
    title: "Match part of the name",
    description: "\"craft\" also hides Minecraft",
    default: false,
  },
  hideListening: { type: "switch", title: "Hide all \"Listening\"", description: "Spotify etc.", default: false },
  hideWatching: { type: "switch", title: "Hide all \"Watching\"", default: false },
  }),
  "hideact",
  { names: { key: "names", kind: "list" } }
);

const list = () =>
  settings.names
    .split(/\r?\n|,/)
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);

type Activity = { type?: number; name?: string };

function hidden(a: Activity, names: string[], partial: boolean): boolean {
  if (a?.type === 4) return false; // custom status
  if (a?.type === 2 && settings.hideListening) return true;
  if (a?.type === 3 && settings.hideWatching) return true;
  const name = (a?.name ?? "").toLowerCase();
  if (!name) return false;
  return names.some((n) => (partial ? name.includes(n) : name === n));
}

phoenix.gateway.onSend<{ activities?: Activity[] }>(3, (payload) => {
  if (!payload || !Array.isArray(payload.activities)) return;
  const names = list();
  const kept = payload.activities.filter((a) => !hidden(a, names, settings.partial));
  if (kept.length === payload.activities.length) return;
  payload.activities = kept;
  return payload;
});

phoenix.log.info("ignore-activities loaded");
