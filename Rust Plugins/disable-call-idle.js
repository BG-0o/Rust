// @description Don't get dropped from DM calls or moved to AFK · Desktop
// @version 1.0.0
// @author Nuckyz · Rust by BG_0o
// @permissions hooks
// @gateway ready guildCreate guildUpdate initialGuild voiceStateUpdate callCreate callUpdate
// @gateway-send 4
// @discord GET /users/@me
// @stores
// @messages
"use strict";
(() => {
  // plugins/_lib/src/say.ts
  function say(text, _channelId, _author = "Sunbird") {
    phoenix.ui.toast(text);
  }

  // plugins/disable-call-idle/src/index.ts
  var native = phoenix.ui.disableCallIdle;
  var holds = /* @__PURE__ */ new Map();
  function sync(timer, off) {
    const restore = holds.get(timer);
    if (off && !restore && native) holds.set(timer, native(timer));
    else if (!off && restore) {
      restore();
      holds.delete(timer);
    }
  }
  var settings = phoenix.settings.define({
    dm: {
      type: "switch",
      title: "Stay in DM calls",
      description: native ? "Discord won't drop you after 3 minutes alone" : "Whoever leaves stays in the call (only for you), muted and deafened",
      default: true,
      onChange: (on) => sync("dmCall", on)
    },
    marker: {
      type: "switch",
      title: "Mark with \u{1F47B}",
      description: "Older Sunbird only: in the DM list, who is being held",
      default: true
    },
    notify: { type: "switch", title: "Pop-up when holding someone", description: "Older Sunbird only", default: true },
    afk: {
      type: "switch",
      title: "Block AFK moves",
      description: native ? "In servers, Discord won't move or disconnect you for being idle" : "In servers. Also blocks joining AFK on purpose",
      default: true,
      onChange: (on) => sync("guildAfk", on)
    }
  });
  sync("dmCall", settings.dm);
  sync("guildAfk", settings.afk);
  var me = null;
  var current = null;
  var members = /* @__PURE__ */ new Map();
  var lastState = /* @__PURE__ */ new Map();
  var held = /* @__PURE__ */ new Map();
  var afkChannels = /* @__PURE__ */ new Map();
  var { gateway } = phoenix;
  var voiceSig = gateway["voiceStateUpdate"];
  phoenix.discord.me().then((u) => {
    if (u?.id) me = u.id;
  }).catch(() => {
  });
  var decoration = phoenix.ui.addMemberDecoration?.({
    render: ({ userId }) => settings.marker && held.has(userId) ? { text: "\u{1F47B}", color: 4294065987 } : null
  });
  var redraw = (userId) => decoration?.update?.(userId);
  function releaseHeld() {
    if (!held.size) return;
    const events = [...held.values()];
    held.clear();
    for (const e of events) {
      if (e.user_id) redraw(e.user_id);
      if (!voiceSig) continue;
      try {
        phoenix.enqueue(voiceSig, e);
      } catch (err) {
        phoenix.log.warn("disable-call-idle: couldn't hand back a held voice event", err);
      }
    }
    phoenix.log.info(`disable-call-idle: handed back ${events.length} held leave event(s)`);
  }
  function track(s) {
    if (!s?.user_id) return;
    for (const set of members.values()) set.delete(s.user_id);
    if (s.channel_id) {
      let set = members.get(s.channel_id);
      if (!set) members.set(s.channel_id, set = /* @__PURE__ */ new Set());
      set.add(s.user_id);
      lastState.set(s.user_id, { ...s });
    }
  }
  if (voiceSig && !native) {
    phoenix.hook(voiceSig, {
      before(p) {
        const s = p;
        if (!s?.user_id) return;
        if (me && s.user_id === me) {
          if (s.channel_id) current = { channel: s.channel_id, guild: s.guild_id ?? null };
          else {
            current = null;
            releaseHeld();
          }
          track(s);
          return;
        }
        if (held.has(s.user_id)) {
          if (s.channel_id) {
            held.delete(s.user_id);
            redraw(s.user_id);
          } else {
            held.set(s.user_id, { ...s });
            return false;
          }
        }
        const inDmCall = current !== null && current.guild === null;
        const leavingMyCall = inDmCall && s.channel_id !== current.channel && members.get(current.channel)?.has(s.user_id);
        if (settings.dm && leavingMyCall) {
          const others = [...members.get(current.channel) ?? []].filter((id) => id !== me && id !== s.user_id);
          if (others.length === 0) {
            held.set(s.user_id, { ...s });
            redraw(s.user_id);
            phoenix.log.info(`disable-call-idle: keeping ${s.user_id} in the call so it doesn't time out`);
            if (settings.notify) say("\u{1F47B} Kept them in the call so you don't drop", current.channel, "call-idle");
            return {
              ...lastState.get(s.user_id) ?? {},
              ...s,
              channel_id: current.channel,
              guild_id: null,
              self_mute: true,
              self_deaf: true,
              self_video: false,
              self_stream: false
            };
          }
        }
        track(s);
      }
    });
  } else if (!native) {
    phoenix.log.warn("disable-call-idle: this Discord build has no voiceStateUpdate event; DM part is off");
  }
  for (const name of ["callCreate", "callUpdate"]) {
    const sig = gateway[name];
    if (!sig) continue;
    phoenix.on(sig, (p) => {
      for (const s of p?.voice_states ?? []) track(s);
    });
  }
  var rememberGuild = (g) => {
    const guild = g;
    if (!guild?.id) return;
    const afk = guild.afk_channel_id ?? guild.properties?.afk_channel_id;
    if (afk) afkChannels.set(guild.id, afk);
    else afkChannels.delete(guild.id);
    for (const s of guild.voice_states ?? []) track({ ...s, guild_id: guild.id });
  };
  if (gateway.ready) phoenix.on(gateway.ready, (r) => (r.guilds ?? []).forEach(rememberGuild));
  for (const name of ["guildCreate", "guildUpdate", "initialGuild"]) {
    const sig = gateway[name];
    if (sig) phoenix.on(sig, rememberGuild);
  }
  phoenix.stores?.sql("SELECT CAST(v AS TEXT) AS v FROM guilds").then((rows) => {
    for (const { v } of rows) {
      try {
        rememberGuild(JSON.parse(v));
      } catch {
      }
    }
  }).catch(() => {
  });
  phoenix.gateway.onSend(4, (payload) => {
    if (!payload || native) return;
    const guild = payload.guild_id ?? null;
    const target = payload.channel_id ?? null;
    if (settings.afk && guild && target && current && current.guild === guild && current.channel !== target && afkChannels.get(guild) === target) {
      phoenix.log.info("disable-call-idle: blocked a move to the AFK channel");
      payload.channel_id = current.channel;
      return payload;
    }
    if (target) {
      if (current && current.channel !== target) releaseHeld();
      current = { channel: target, guild };
    } else {
      current = null;
      releaseHeld();
    }
  });
  phoenix.onUnload(() => {
    for (const restore of holds.values()) restore();
    holds.clear();
    releaseHeld();
    decoration?.();
  });
  phoenix.log.info(`disable-call-idle loaded (${native ? "native timers off" : "workaround"})`);
})();
