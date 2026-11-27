// @description Notifies you when someone writes a word you chose
// @version 1.0.0
// @author Equicord · Rust by BG_0o

const settings = phoenix.settings.define({
  keywords: {
    type: "text",
    title: "Keywords",
    description: "One per line, e.g. your name, a game",
    default: "",
    multiline: true,
  },
  wholeWord: {
    type: "switch",
    title: "Whole words only",
    description: "\"bg\" won't match \"bgs\"",
    default: true,
  },
  regex: {
    type: "switch",
    title: "Use regex",
    description: "Each line is a regular expression",
    default: false,
  },
  ignoreBots: { type: "switch", title: "Ignore bots", default: true },
  ignoredChannels: {
    type: "text",
    title: "Ignored channels",
    description: "Channel or server IDs, comma separated",
    default: "",
  },
  markInChat: {
    type: "switch",
    title: "Mark in chat",
    description: "Adds a note only you see under the message",
    default: false,
  },
});

let me: string | null = null;
phoenix.discord
  .me()
  .then((u) => {
    if (u?.id) me = u.id;
  })
  .catch(() => {});

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let cacheKey = "";
let patterns: RegExp[] = [];
function compile(): RegExp[] {
  const key = `${settings.keywords}|${settings.wholeWord}|${settings.regex}`;
  if (key === cacheKey) return patterns;
  cacheKey = key;
  patterns = [];
  for (const line of settings.keywords.split(/\r?\n/)) {
    const word = line.trim();
    if (!word) continue;
    try {
      const body = settings.regex ? word : escape(word);
      patterns.push(new RegExp(settings.wholeWord && !settings.regex ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body, "iu"));
    } catch {
      phoenix.log.warn(`keyword-notify: skipped invalid regex: ${word}`);
    }
  }
  return patterns;
}

const guildNames = new Map<string, string>();
const rememberGuild = (g: unknown) => {
  const guild = g as { id?: string; name?: string; properties?: { name?: string } } | null;
  const name = guild?.name ?? guild?.properties?.name;
  if (guild?.id && name) guildNames.set(guild.id, name);
};
const { gateway } = phoenix;
if (gateway.ready) phoenix.on(gateway.ready, (r) => ((r as { guilds?: unknown[] }).guilds ?? []).forEach(rememberGuild));
if (gateway.guildCreate) phoenix.on(gateway.guildCreate, rememberGuild);

const shorten = (s: string, n = 120) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

if (gateway.messageCreate)
  phoenix.on(gateway.messageCreate, (m) => {
    const content = m?.content;
    if (!content || !m.author?.id || m.author.id === me) return;
    if (settings.ignoreBots && m.author.bot) return;
    const ignored = new Set(settings.ignoredChannels.split(/[\s,]+/).filter(Boolean));
    const guildId = (m as { guild_id?: string }).guild_id;
    if (ignored.has(m.channel_id) || (guildId && ignored.has(guildId))) return;
    const hit = compile().find((re) => re.test(content));
    if (!hit) return;
    const who = m.author.global_name || m.author.username || "Someone";
    const where = guildId ? guildNames.get(guildId) ?? "a server" : "DM";
    phoenix.ui.notify({ title: `${who} in ${where}`, body: shorten(content) });
    if (settings.markInChat)
      phoenix.messages.addLocal(m.channel_id, `🔔 Keyword in the message above from **${who}**`, { author: "Keywords" });
  });

phoenix.log.info("keyword-notify loaded");
