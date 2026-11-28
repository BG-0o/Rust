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
    title: "Application ID", onChange: () => void resolveAll(),
    description: "Needed for pictures: discord.com/developers → New Application → copy its ID · !rpc app <value>",
    default: "",
  },
  largeImage: {
    type: "text",
    title: "Big picture", onChange: () => void resolveAll(),
    description: "Image URL or an asset name of your app (needs Application ID) · !rpc image <value>",
    default: "",
  },
  largeText: { type: "text", title: "Big picture hover text", description: "Optional · !rpc imagetext <value>", default: "" },
  smallImage: {
    type: "text",
    title: "Small picture", onChange: () => void resolveAll(),
    description: "Image URL or asset name, shown in the corner · !rpc small <value>",
    default: "",
  },
  smallText: { type: "text", title: "Small picture hover text", description: "Optional · !rpc smalltext <value>", default: "" },
  showTime: { type: "switch", title: "Show elapsed time", default: true },
  replaceGames: {
    type: "switch",
    title: "Replace detected games",
    description: "Hides real games while this one shows",
    default: false,
  },
  }),
  "rpc",
  { name: { key: "name", kind: "text" }, line1: { key: "details", kind: "text" }, line2: { key: "state", kind: "text" }, url: { key: "streamUrl", kind: "text" }, app: { key: "applicationId", kind: "text" }, image: { key: "largeImage", kind: "text" }, imagetext: { key: "largeText", kind: "text" }, small: { key: "smallImage", kind: "text" }, smalltext: { key: "smallText", kind: "text" } },
  () => void resolveAll()
);

// Discord only draws pictures for an application. A URL becomes an "mp:external/…" path through
// the app's external-assets endpoint (the same call the desktop client makes); an asset name
// becomes the numeric id from the app's asset list. Results are cached, since the gateway hook
// that sends the activity can't wait for a request.
const resolved = new Map<string, string>(Object.entries(phoenix.storage.get<Record<string, string>>("assets") ?? {}));
const pending = new Set<string>();
let warned = false;

function appId(): string | null {
  const id = settings.applicationId.trim();
  return /^\d{17,20}$/.test(id) ? id : null;
}

async function resolve(value: string): Promise<void> {
  const v = value.trim();
  const app = appId();
  if (v && !app) {
    if (!warned) phoenix.ui.toast("Custom RPC: pictures need an Application ID (Developer Portal → New Application)");
    warned = true;
    return;
  }
  const key = `${app}|${v}`;
  if (!v || v.startsWith("mp:") || /^\d{17,20}$/.test(v) || resolved.has(key) || pending.has(key)) return;
  pending.add(key);
  try {
    if (/^https?:\/\//i.test(v)) {
      const res = await phoenix.discord.post(`/applications/${app}/external-assets`, { urls: [v] });
      const path = res.ok ? res.json<{ external_asset_path?: string }[]>()[0]?.external_asset_path : undefined;
      if (path) resolved.set(key, `mp:${path}`);
      else phoenix.ui.toast(`Custom RPC: couldn't load that image (${res.status})`);
    } else {
      const res = await phoenix.discord.get(`/oauth2/applications/${app}/assets`);
      const list = res.ok ? res.json<{ id: string; name: string }[]>() : [];
      const hit = list.find((a) => a.name.toLowerCase() === v.toLowerCase());
      if (hit) resolved.set(key, hit.id);
      else phoenix.ui.toast(`Custom RPC: no asset named "${v}" in that app`);
    }
    phoenix.storage.set("assets", Object.fromEntries(resolved));
  } catch (e) {
    phoenix.log.warn(`custom-rpc: image lookup failed: ${e}`);
  } finally {
    pending.delete(key);
  }
}

function image(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (!appId()) return void resolve(v);
  if (v.startsWith("mp:") || /^\d{17,20}$/.test(v)) return v;
  const hit = resolved.get(`${appId()}|${v}`);
  if (!hit) void resolve(v);
  return hit;
}

async function resolveAll(): Promise<void> {
  await resolve(settings.largeImage);
  await resolve(settings.smallImage);
}
void resolveAll();

type Activity = Record<string, unknown> & { type?: number };

function build(): Activity | null {
  const name = settings.name.trim();
  if (!settings.enabled || !name) return null;
  const type = TYPES[settings.type] ?? 0;
  const activity: Activity = { type, name };
  if (settings.details.trim()) activity.details = settings.details.trim();
  if (settings.state.trim()) activity.state = settings.state.trim();
  if (type === 1 && settings.streamUrl.trim()) activity.url = settings.streamUrl.trim();
  const large = image(settings.largeImage);
  const small = image(settings.smallImage);
  if (large || small) {
    const assets: Record<string, string> = {};
    if (large) assets.large_image = large;
    if (large && settings.largeText.trim()) assets.large_text = settings.largeText.trim();
    if (small) assets.small_image = small;
    if (small && settings.smallText.trim()) assets.small_text = settings.smallText.trim();
    activity.assets = assets;
    activity.application_id = appId()!;
  } else if (/^\d{17,20}$/.test(settings.applicationId.trim())) activity.application_id = settings.applicationId.trim();
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
