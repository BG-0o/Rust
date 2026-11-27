// @description Alerts you when you're unfriended or removed from a server/group
// @version 1.1.0
// @author nick · Rust by BG_0o
// @permissions gateway discord
// @gateway ready guildCreate guildUpdate channelCreate channelUpdate relationshipAdd relationshipUpdate relationshipRemove guildDelete channelRecipientRemove
// @discord GET /users/@me
// @discord DELETE /users/@me/relationships/*
// @discord PUT /users/@me/relationships/*
// @discord DELETE /users/@me/guilds/*
// @discord DELETE /channels/*
// @stores
"use strict";
(() => {
  // plugins/relationship-notifier/src/index.ts
  var settings = phoenix.settings.define({
    friends: { type: "switch", title: "Unfriended", default: true },
    servers: { type: "switch", title: "Removed from a server", description: "Kicked, banned or server deleted", default: true },
    groups: { type: "switch", title: "Removed from a group", default: true },
    requests: { type: "switch", title: "Friend request cancelled", default: false }
  });
  var people = /* @__PURE__ */ new Map();
  var guilds = /* @__PURE__ */ new Map();
  var groups = /* @__PURE__ */ new Map();
  var own = /* @__PURE__ */ new Map();
  var me = null;
  var recent = (id) => {
    const at = own.get(id);
    return at !== void 0 && Date.now() - at < 6e4;
  };
  var userName = (u, fallback) => u?.global_name || u?.username || fallback;
  var tell = (title, body) => {
    phoenix.log.info(`${title}: ${body}`);
    phoenix.ui.notify({ title, body, durationMs: 0 });
  };
  function rememberRel(r, users) {
    const id = r.id ?? r.user_id ?? r.user?.id;
    if (!id) return;
    const u = r.user ?? users?.get(id);
    people.set(id, { name: r.nickname || userName(u, id), type: r.type ?? 0 });
  }
  function rememberGuild(g) {
    const guild = g;
    const name = guild?.name ?? guild?.properties?.name;
    if (guild?.id && name) guilds.set(guild.id, name);
  }
  function rememberGroup(c) {
    const ch = c;
    if (!ch?.id || ch.type !== 3) return;
    const name = ch.name || (ch.recipients ?? []).map((u) => userName(u, "?")).join(", ") || "Group";
    groups.set(ch.id, name);
  }
  var { gateway } = phoenix;
  var on = (name, fn) => {
    const sig = gateway[name];
    if (sig) phoenix.on(sig, fn);
  };
  on("ready", (p) => {
    const r = p;
    if (r?.user?.id) me = r.user.id;
    const users = new Map((r?.users ?? []).filter((u) => u.id).map((u) => [u.id, u]));
    (r?.relationships ?? []).forEach((rel) => rememberRel(rel, users));
    (r?.guilds ?? []).forEach(rememberGuild);
    (r?.private_channels ?? []).forEach(rememberGroup);
  });
  on("guildCreate", rememberGuild);
  on("guildUpdate", rememberGuild);
  on("channelCreate", rememberGroup);
  on("channelUpdate", rememberGroup);
  on("relationshipAdd", (p) => rememberRel(p));
  on("relationshipUpdate", (p) => rememberRel(p));
  phoenix.discord.me().then((u) => {
    if (u?.id) me = u.id;
  }).catch(() => {
  });
  phoenix.stores.sql("SELECT CAST(v AS TEXT) AS v FROM guilds").then((rows) => {
    for (const { v } of rows) {
      try {
        rememberGuild(JSON.parse(v));
      } catch {
      }
    }
  }).catch(() => {
  });
  var mark = (path) => {
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
    const r = p;
    const id = r.id ?? r.user_id;
    if (!id) return;
    const known = people.get(id);
    people.delete(id);
    if (recent(id) || !known) return;
    if (known.type === 1 && settings.friends) tell("Unfriended", `${known.name} is no longer your friend`);
    else if ((known.type === 3 || known.type === 4) && settings.requests)
      tell("Friend request cancelled", `The friend request with ${known.name} was cancelled`);
  });
  on("guildDelete", (p) => {
    const g = p;
    if (!g?.id || g.unavailable) return;
    const name = guilds.get(g.id) ?? g.id;
    guilds.delete(g.id);
    if (recent(g.id) || !settings.servers) return;
    tell("Removed from a server", `You're no longer in ${name}`);
  });
  on("channelRecipientRemove", (p) => {
    const e = p;
    if (!e?.channel_id || !me || e.user?.id !== me) return;
    const name = groups.get(e.channel_id) ?? "a group";
    groups.delete(e.channel_id);
    if (recent(e.channel_id) || !settings.groups) return;
    tell("Removed from a group", `You were removed from ${name}`);
  });
  phoenix.log.info("relationship-notifier loaded");
})();
