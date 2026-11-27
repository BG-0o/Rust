const settings = phoenix.settings.define({
  friends: { type: "switch", title: "Unfriended", default: true },
  servers: { type: "switch", title: "Removed from a server", description: "Kicked, banned or server deleted", default: true },
  groups: { type: "switch", title: "Removed from a group", default: true },
  requests: { type: "switch", title: "Friend request cancelled", default: false },
});

type U = { id?: string; username?: string; global_name?: string | null };
type Rel = { id?: string; type?: number; user?: U; user_id?: string; nickname?: string | null };

const people = new Map<string, { name: string; type: number }>();
const guilds = new Map<string, string>();
const groups = new Map<string, string>();
// What you did yourself in the last minute, so it isn't reported.
const own = new Map<string, number>();
let me: string | null = null;

const recent = (id: string) => {
  const at = own.get(id);
  return at !== undefined && Date.now() - at < 60_000;
};
const userName = (u: U | undefined, fallback: string) =>
  u?.global_name || u?.username || fallback;

const tell = (title: string, body: string) => {
  phoenix.log.info(`${title}: ${body}`);
  phoenix.ui.notify({ title, body, durationMs: 0 });
};

function rememberRel(r: Rel, users?: Map<string, U>) {
  const id = r.id ?? r.user_id ?? r.user?.id;
  if (!id) return;
  const u = r.user ?? users?.get(id);
  people.set(id, { name: r.nickname || userName(u, id), type: r.type ?? 0 });
}

function rememberGuild(g: unknown) {
  const guild = g as { id?: string; name?: string; properties?: { name?: string } } | null;
  const name = guild?.name ?? guild?.properties?.name;
  if (guild?.id && name) guilds.set(guild.id, name);
}

function rememberGroup(c: unknown) {
  const ch = c as { id?: string; type?: number; name?: string | null; recipients?: U[] } | null;
  if (!ch?.id || ch.type !== 3) return;
  const name = ch.name || (ch.recipients ?? []).map((u) => userName(u, "?")).join(", ") || "Group";
  groups.set(ch.id, name);
}

const { gateway } = phoenix;
const on = (name: string, fn: (p: unknown) => void) => {
  const sig = gateway[name];
  if (sig) phoenix.on(sig, fn);
};

on("ready", (p) => {
  const r = p as {
    user?: U;
    relationships?: Rel[];
    users?: U[];
    guilds?: unknown[];
    private_channels?: unknown[];
  };
  if (r?.user?.id) me = r.user.id;
  const users = new Map((r?.users ?? []).filter((u) => u.id).map((u) => [u.id as string, u]));
  (r?.relationships ?? []).forEach((rel) => rememberRel(rel, users));
  (r?.guilds ?? []).forEach(rememberGuild);
  (r?.private_channels ?? []).forEach(rememberGroup);
});
on("guildCreate", rememberGuild);
on("guildUpdate", rememberGuild);
on("channelCreate", rememberGroup);
on("channelUpdate", rememberGroup);
on("relationshipAdd", (p) => rememberRel(p as Rel));
on("relationshipUpdate", (p) => rememberRel(p as Rel));

phoenix.discord.me().then((u) => {
  if (u?.id) me = u.id;
}).catch(() => {});

// Phoenix's cache, for server names right away.
phoenix.stores
  .sql<{ v: string }>("SELECT CAST(v AS TEXT) AS v FROM guilds")
  .then((rows) => {
    for (const { v } of rows) {
      try {
        rememberGuild(JSON.parse(v));
      } catch {}
    }
  })
  .catch(() => {});

// Your own unfriends, blocks, server and group leaves.
const mark = (path: string) => {
  const id = path.match(/(\d{17,20})/)?.[1];
  if (id) own.set(id, Date.now());
};
phoenix.discord.onRequest({ method: "DELETE", pathPrefix: "/users/@me/relationships/" }, (req) => {
  mark(req.path);
});
phoenix.discord.onRequest({ method: "PUT", pathPrefix: "/users/@me/relationships/" }, (req) => {
  mark(req.path);
});
phoenix.discord.onRequest({ method: "DELETE", pathPrefix: "/users/@me/guilds/" }, (req) => {
  mark(req.path);
});
phoenix.discord.onRequest({ method: "DELETE", pathPrefix: "/channels/" }, (req) => {
  if (/^\/channels\/\d+\/?$/.test(req.path)) mark(req.path);
});

on("relationshipRemove", (p) => {
  const r = p as Rel;
  const id = r.id ?? r.user_id;
  if (!id) return;
  const known = people.get(id);
  people.delete(id);
  if (recent(id) || !known) return;
  // 1 friend, 3 incoming request, 4 outgoing request.
  if (known.type === 1 && settings.friends) tell("Unfriended", `${known.name} is no longer your friend`);
  else if ((known.type === 3 || known.type === 4) && settings.requests)
    tell("Friend request cancelled", `The friend request with ${known.name} was cancelled`);
});

on("guildDelete", (p) => {
  const g = p as { id?: string; unavailable?: boolean };
  if (!g?.id || g.unavailable) return; // an outage, not a removal
  const name = guilds.get(g.id) ?? g.id;
  guilds.delete(g.id);
  if (recent(g.id) || !settings.servers) return;
  tell("Removed from a server", `You're no longer in ${name}`);
});

on("channelRecipientRemove", (p) => {
  const e = p as { channel_id?: string; user?: U };
  if (!e?.channel_id || !me || e.user?.id !== me) return;
  const name = groups.get(e.channel_id) ?? "a group";
  groups.delete(e.channel_id);
  if (recent(e.channel_id) || !settings.groups) return;
  tell("Removed from a group", `You were removed from ${name}`);
});

phoenix.log.info("relationship-notifier loaded");
