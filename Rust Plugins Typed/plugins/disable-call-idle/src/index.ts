import { say } from "../../_lib/src/say";

// Vencord switches off Discord's idle timers. Phoenix's timers can't be reached from a plugin, so
// this works around what starts them instead:
// - DM calls: Discord drops you after ~3 minutes *alone*. When the last other person leaves, the
//   app is told they're still there, muted and deafened, so it never starts the timer. They show
//   with the deafened icon (and a 👻 next to their name in the DM list) so you can tell. Their
//   real "left" is handed over as soon as you leave, and dropped if they come back.
//   It only works once someone has been in the call: a call nobody answered still drops.
// - Servers: when the app tries to move you to the AFK channel, the move is turned into
//   "stay where I am", so Discord keeps you in your channel.

const settings = phoenix.settings.define({
  dm: {
    type: "switch",
    title: "Stay in DM calls",
    description: "Whoever leaves stays in the call (only for you), muted and deafened",
    default: true,
  },
  marker: {
    type: "switch",
    title: "Mark with 👻",
    description: "In the DM list, who is being held",
    default: true,
  },
  notify: { type: "switch", title: "Pop-up when holding someone", default: true },
  afk: {
    type: "switch",
    title: "Block AFK moves",
    description: "In servers. Also blocks joining AFK on purpose",
    default: true,
  },
});

type VoiceState = {
  user_id?: string;
  channel_id?: string | null;
  guild_id?: string | null;
  self_mute?: boolean;
  self_deaf?: boolean;
  self_video?: boolean;
  self_stream?: boolean;
  [key: string]: unknown;
};

let me: string | null = null;
let current: { channel: string; guild: string | null } | null = null;
// Who is in each voice channel you can see, and each person's last full voice state.
const members = new Map<string, Set<string>>();
const lastState = new Map<string, VoiceState>();
// Real "left the call" events held back while someone is kept in your DM call, by user id.
const held = new Map<string, VoiceState>();
const afkChannels = new Map<string, string>();

const { gateway } = phoenix;
const voiceSig = gateway["voiceStateUpdate"];

phoenix.discord
  .me()
  .then((u) => {
    if (u?.id) me = u.id;
  })
  .catch(() => {});

// --- 👻 next to held people in the DM / member list ----------------------------------------
const decoration = phoenix.ui.addMemberDecoration?.({
  render: ({ userId }) =>
    settings.marker && held.has(userId) ? { text: "👻", color: 0xfff23f43 } : null,
});
const redraw = (userId: string) => decoration?.update?.(userId);

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

function track(s: VoiceState) {
  if (!s?.user_id) return;
  for (const set of members.values()) set.delete(s.user_id);
  if (s.channel_id) {
    let set = members.get(s.channel_id);
    if (!set) members.set(s.channel_id, (set = new Set()));
    set.add(s.user_id);
    lastState.set(s.user_id, { ...s });
  }
}

// --- Incoming voice states ---------------------------------------------------------------
if (voiceSig) {
  phoenix.hook(voiceSig, {
    before(p) {
      const s = p as VoiceState;
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

      // Someone being held came back for real: their real state takes over.
      if (held.has(s.user_id)) {
        if (s.channel_id) {
          held.delete(s.user_id);
          redraw(s.user_id);
        } else {
          // A repeat of the leave we're already holding.
          held.set(s.user_id, { ...s });
          return false;
        }
      }

      const inDmCall = current !== null && current.guild === null;
      const leavingMyCall =
        inDmCall && s.channel_id !== current!.channel && members.get(current!.channel)?.has(s.user_id);

      if (settings.dm && leavingMyCall) {
        const others = [...(members.get(current!.channel) ?? [])].filter((id) => id !== me && id !== s.user_id);
        if (others.length === 0) {
          held.set(s.user_id, { ...s });
          redraw(s.user_id);
          phoenix.log.info(`disable-call-idle: keeping ${s.user_id} in the call so it doesn't time out`);
          if (settings.notify) say("👻 Kept them in the call so you don't drop", current!.channel, "call-idle");
          // Keep them in the call, muted and deafened, so it's clear they're not really there.
          return {
            ...(lastState.get(s.user_id) ?? {}),
            ...s,
            channel_id: current!.channel,
            guild_id: null,
            self_mute: true,
            self_deaf: true,
            self_video: false,
            self_stream: false,
          };
        }
      }
      track(s);
    },
  });
} else {
  phoenix.log.warn("disable-call-idle: this Discord build has no voiceStateUpdate event; DM part is off");
}

// Calls list everyone in them when they start or change.
for (const name of ["callCreate", "callUpdate"]) {
  const sig = gateway[name];
  if (!sig) continue;
  phoenix.on(sig, (p) => {
    for (const s of (p as { voice_states?: VoiceState[] })?.voice_states ?? []) track(s);
  });
}

// --- AFK channels ----------------------------------------------------------------------------
type G = {
  id?: string;
  afk_channel_id?: string | null;
  properties?: { afk_channel_id?: string | null };
  voice_states?: VoiceState[];
};
const rememberGuild = (g: unknown) => {
  const guild = g as G | null;
  if (!guild?.id) return;
  const afk = guild.afk_channel_id ?? guild.properties?.afk_channel_id;
  if (afk) afkChannels.set(guild.id, afk);
  else afkChannels.delete(guild.id);
  for (const s of guild.voice_states ?? []) track({ ...s, guild_id: guild.id });
};
if (gateway.ready) phoenix.on(gateway.ready, (r) => ((r as { guilds?: unknown[] }).guilds ?? []).forEach(rememberGuild));
for (const name of ["guildCreate", "guildUpdate", "initialGuild"]) {
  const sig = gateway[name];
  if (sig) phoenix.on(sig, rememberGuild);
}
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

// --- Outgoing voice state updates (op 4) -----------------------------------------------------
phoenix.gateway.onSend<Phoenix.VoiceStateUpdate>(4, (payload) => {
  if (!payload) return;
  const guild = payload.guild_id ?? null;
  const target = payload.channel_id ?? null;

  if (
    settings.afk &&
    guild &&
    target &&
    current &&
    current.guild === guild &&
    current.channel !== target &&
    afkChannels.get(guild) === target
  ) {
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
  releaseHeld();
  decoration?.();
});

phoenix.log.info("disable-call-idle loaded");
