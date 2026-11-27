// @description Hides images and videos in NSFW channels behind a spoiler
// @version 1.1.0
// @author Vendicated · Rust by BG_0o

import { commands } from "../../_lib/src/commands";

// Phoenix has no CSS, so there's no blur. The closest thing is the spoiler cover:
// attachments are marked as spoilers and only show when clicked.

const IS_SPOILER = 1 << 3;

const settings = commands(
  phoenix.settings.define({
  allChannels: {
    type: "switch",
    title: "Hide in all channels",
    description: "Not just NSFW ones",
    default: false,
  },
  embeds: {
    type: "switch",
    title: "Hide link images too",
    description: "GIFs and link previews",
    default: true,
  },
  ignored: {
    type: "text",
    title: "Ignored channels",
    description: "Channel or category IDs, comma separated · !nsfw ignore add <x>",
    default: "",
    multiline: true,
  },
  }),
  "nsfw",
  { ignore: { key: "ignored", kind: "list" } }
);

type ChannelInfo = { nsfw: boolean; parent: string | null };
const channels = new Map<string, ChannelInfo>();
const fetching = new Set<string>();

const remember = (c: Partial<Phoenix.Channel> | null | undefined) => {
  if (!c?.id) return;
  channels.set(c.id, { nsfw: c.nsfw === true, parent: c.parent_id ?? null });
};

const ignoredIds = () => new Set(settings.ignored.split(/[\s,]+/).filter(Boolean));

// Threads inherit NSFW from their parent channel.
const isNsfw = (id: string): boolean | undefined => {
  const c = channels.get(id);
  if (!c) return undefined;
  if (c.nsfw) return true;
  if (c.parent) return channels.get(c.parent)?.nsfw === true;
  return false;
};

const shouldHide = (channelId: string): boolean | undefined => {
  const ignored = ignoredIds();
  if (ignored.has(channelId)) return false;
  const parent = channels.get(channelId)?.parent;
  if (parent && ignored.has(parent)) return false;
  if (settings.allChannels) return true;
  return isNsfw(channelId);
};

const lookup = async (channelId: string) => {
  if (channels.has(channelId) || fetching.has(channelId)) return;
  fetching.add(channelId);
  try {
    const res = await phoenix.discord.get(`/channels/${channelId}`);
    if (res.ok) {
      const c = res.json<Phoenix.Channel>();
      remember(c);
      if (c.parent_id && !channels.has(c.parent_id)) await lookup(c.parent_id);
    }
  } catch {
    // Not reachable now; the next message tries again.
  } finally {
    fetching.delete(channelId);
  }
};

const spoilerMessage = (m: Partial<Phoenix.Message> | null | undefined): boolean => {
  if (!m) return false;
  let changed = false;
  for (const a of m.attachments ?? []) {
    if (a.is_spoiler && a.filename?.startsWith("SPOILER_")) continue;
    a.is_spoiler = true;
    a.flags = (a.flags ?? 0) | IS_SPOILER;
    if (a.filename && !a.filename.startsWith("SPOILER_")) a.filename = `SPOILER_${a.filename}`;
    changed = true;
  }
  if (settings.embeds) {
    for (const e of m.embeds ?? []) {
      for (const media of [e.image, e.thumbnail, e.video]) {
        if (media) {
          media.flags = (media.flags ?? 0) | IS_SPOILER;
          changed = true;
        }
      }
    }
  }
  for (const c of m.components ?? []) {
    if (c.type === 12) for (const item of c.items) { item.spoiler = true; changed = true; }
    if (c.type === 11) { c.spoiler = true; changed = true; }
  }
  if (m.referenced_message) changed = spoilerMessage(m.referenced_message) || changed;
  return changed;
};

// Learn which channels are NSFW from what the app already receives.
const { gateway } = phoenix;
type WithChannels = { channels?: Phoenix.Channel[]; threads?: Phoenix.Channel[] };
const fromGuild = (g: unknown) => {
  const guild = g as WithChannels | null;
  for (const c of guild?.channels ?? []) remember(c);
  for (const c of guild?.threads ?? []) remember(c);
};
if (gateway.ready) phoenix.on(gateway.ready, (r) => ((r as { guilds?: unknown[] }).guilds ?? []).forEach(fromGuild));
if (gateway.guildCreate) phoenix.on(gateway.guildCreate, fromGuild);
if (gateway.initialGuild) phoenix.on(gateway.initialGuild, fromGuild);
for (const name of ["channelCreate", "channelUpdate", "threadCreate", "threadUpdate"]) {
  const sig = gateway[name];
  if (sig) phoenix.on(sig, (c) => remember(c as Phoenix.Channel));
}

// Phoenix's own cache, for channels seen in earlier sessions.
phoenix.stores
  .sql<{ v: string }>("SELECT CAST(v AS TEXT) AS v FROM guilds")
  .then((rows) => {
    for (const { v } of rows) {
      try {
        fromGuild(JSON.parse(v));
      } catch {}
    }
  })
  .catch(() => {});

// New messages: the hook must answer right away, so it uses what is known and looks up the rest.
if (gateway.messageCreate) {
  phoenix.hook(gateway.messageCreate, {
    before(m) {
      const hide = shouldHide(m.channel_id);
      if (hide === undefined) {
        void lookup(m.channel_id);
        return;
      }
      if (hide && spoilerMessage(m)) return m;
    },
  });
}
if (gateway.messageUpdate) {
  phoenix.hook(gateway.messageUpdate, {
    before(m) {
      if (shouldHide(m.channel_id) && spoilerMessage(m)) return m;
    },
  });
}

// Message history loaded when a channel opens: here there is time to look the channel up first.
phoenix.discord.onResponse({ method: "GET", pathPrefix: "/channels/", pathSuffix: "/messages" }, async (res) => {
  if (res.status < 200 || res.status >= 300) return;
  const channelId = res.path.match(/^\/channels\/(\d+)\/messages/)?.[1];
  if (!channelId) return;
  if (shouldHide(channelId) === undefined) await lookup(channelId);
  phoenix.log.info(`history ${channelId}: hide=${shouldHide(channelId)}`);
  if (!shouldHide(channelId)) return;
  const list = res.json<Phoenix.Message[]>();
  if (!Array.isArray(list)) return;
  let changed = false;
  for (const m of list) changed = spoilerMessage(m) || changed;
  return changed ? { body: list } : undefined;
});

phoenix.log.info("blur-nsfw loaded");
