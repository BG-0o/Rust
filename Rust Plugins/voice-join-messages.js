// @description Notifies you when a friend joins a server voice channel
// @version 1.0.0
// @author Equicord · Rust by BG_0o
"use strict";
(() => {
  // voice-join-messages/src/index.ts
  var settings = phoenix.settings.define({
    who: {
      type: "select",
      title: "Notify about",
      options: [
        { value: "friends", label: "Friends only" },
        { value: "list", label: "Only the list below" },
        { value: "everyone", label: "Everyone in my servers" }
      ],
      default: "friends"
    },
    list: {
      type: "text",
      title: "People list",
      description: 'User IDs, comma separated. For "Only the list"',
      default: ""
    },
    ignored: {
      type: "text",
      title: "Never notify about",
      description: "User or server IDs, comma separated",
      default: ""
    },
    how: {
      type: "select",
      title: "How",
      options: [
        { value: "popup", label: "Pop-up" },
        { value: "dm", label: "Note in their DM (only you see it)" },
        { value: "both", label: "Both" }
      ],
      default: "popup"
    },
    leaves: { type: "switch", title: "Also when they leave", default: false },
    sameCall: {
      type: "switch",
      title: "Even if I'm in the same call",
      default: false
    }
  });
  var me = null;
  phoenix.discord.me().then((u) => {
    if (u?.id) me = u.id;
  }).catch(() => {
  });
  var friends = /* @__PURE__ */ new Set();
  var dmOf = /* @__PURE__ */ new Map();
  var names = /* @__PURE__ */ new Map();
  var guildNames = /* @__PURE__ */ new Map();
  var channelNames = /* @__PURE__ */ new Map();
  var where = /* @__PURE__ */ new Map();
  var myChannel = null;
  var nameOf = (u) => u?.global_name || u?.username || void 0;
  var rememberGuild = (g) => {
    const guild = g;
    if (!guild?.id) return;
    const name = guild.name ?? guild.properties?.name;
    if (name) guildNames.set(guild.id, name);
    for (const c of guild.channels ?? []) if (c.id && c.name) channelNames.set(c.id, c.name);
    for (const s of guild.voice_states ?? []) if (s.user_id && s.channel_id) where.set(s.user_id, s.channel_id);
  };
  var { gateway } = phoenix;
  if (gateway.ready)
    phoenix.on(gateway.ready, (p) => {
      const r = p;
      if (r.user?.id) me = r.user.id;
      for (const u of r.users ?? []) if (u.id && nameOf(u)) names.set(u.id, nameOf(u));
      for (const rel of r.relationships ?? []) {
        const id = rel.id ?? rel.user_id ?? rel.user?.id;
        if (id && rel.type === 1) friends.add(id);
        if (id && nameOf(rel.user)) names.set(id, nameOf(rel.user));
      }
      for (const c of r.private_channels ?? []) {
        if (c.type !== 1 || !c.id) continue;
        const other = c.recipient_ids?.[0] ?? c.recipients?.[0]?.id;
        if (other) dmOf.set(other, c.id);
      }
      (r.guilds ?? []).forEach(rememberGuild);
    });
  for (const name of ["guildCreate", "guildUpdate"]) {
    const sig = gateway[name];
    if (sig) phoenix.on(sig, rememberGuild);
  }
  for (const name of ["relationshipAdd", "relationshipUpdate"]) {
    const sig = gateway[name];
    if (sig)
      phoenix.on(sig, (p) => {
        const rel = p;
        if (!rel.id) return;
        if (rel.type === 1) friends.add(rel.id);
        else friends.delete(rel.id);
        if (nameOf(rel.user)) names.set(rel.id, nameOf(rel.user));
      });
  }
  var removed = gateway["relationshipRemove"];
  if (removed) phoenix.on(removed, (p) => friends.delete(p.id ?? ""));
  for (const name of ["channelCreate", "channelUpdate"]) {
    const sig = gateway[name];
    if (sig)
      phoenix.on(sig, (p) => {
        const c = p;
        if (!c?.id) return;
        if (c.type === 1) {
          const other = c.recipient_ids?.[0] ?? c.recipients?.[0]?.id;
          if (other) dmOf.set(other, c.id);
        } else if (c.name) channelNames.set(c.id, c.name);
      });
  }
  var ids = (s) => new Set(s.split(/[\s,]+/).filter(Boolean));
  function wanted(user, guild) {
    if (user === me) return false;
    const skip = ids(settings.ignored);
    if (skip.has(user) || skip.has(guild)) return false;
    if (settings.who === "friends") return friends.has(user);
    if (settings.who === "list") return ids(settings.list).has(user);
    return true;
  }
  function tell(user, text) {
    const how = settings.how;
    if (how === "popup" || how === "both") phoenix.ui.notify({ title: names.get(user) ?? "Someone", body: text });
    if (how === "dm" || how === "both") {
      const dm = dmOf.get(user);
      if (dm) phoenix.messages.addLocal(dm, `\u{1F50A} ${text}`, { author: "Calls" });
      else if (how === "dm") phoenix.ui.notify({ title: names.get(user) ?? "Someone", body: text });
    }
  }
  var voiceSig = gateway["voiceStateUpdate"];
  if (voiceSig)
    phoenix.on(voiceSig, (p) => {
      const s = p;
      if (!s?.user_id) return;
      const user = s.user_id;
      const before = where.get(user) ?? null;
      const now = s.channel_id ?? null;
      if (nameOf(s.member?.user)) names.set(user, s.member?.nick || nameOf(s.member?.user));
      if (now) where.set(user, now);
      else where.delete(user);
      if (user === me) {
        myChannel = now;
        return;
      }
      if (before === now || !s.guild_id) return;
      if (!wanted(user, s.guild_id)) return;
      const server = guildNames.get(s.guild_id) ?? "a server";
      if (now && !(myChannel === now && !settings.sameCall)) {
        const channel = channelNames.get(now);
        tell(user, `Joined ${channel ? `\u{1F50A} ${channel}` : "a voice channel"} \xB7 ${server}`);
      } else if (!now && before && settings.leaves) {
        tell(user, `Left voice \xB7 ${server}`);
      }
    });
  else phoenix.log.warn("voice-join-messages: this Discord build has no voice event");
  phoenix.log.info("voice-join-messages loaded");
})();
