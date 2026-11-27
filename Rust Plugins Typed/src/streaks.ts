// @description 🔥 Day streaks with people you DM
// @version 1.0.0
// @author Equicord · Rust by BG_0o

// Equicord's version syncs through its own server and needs both people on Equicord. Here it is
// worked out on this device from the DMs Phoenix sees: a day counts when you both sent at least
// one message in your DM that day. It starts counting from what's loaded, so open a DM to let it
// read the recent history.

const detected = -new Date().getTimezoneOffset() / 60;

const settings = phoenix.settings.define({
  minimum: { type: "number", title: "Show from", description: "Days in a row", default: 2 },
  headers: { type: "switch", title: "In messages", description: "After the timestamp", default: true, onChange: () => redrawAll() },
  list: { type: "switch", title: "In the DM list", default: true, onChange: () => redrawAll() },
  offset: {
    type: "number",
    title: "Your UTC offset",
    description: "Where a day ends, e.g. -3 for Brasília",
    default: Number.isFinite(detected) && detected !== 0 ? detected : -3,
  },
});

// Day number on your clock.
const dayOf = (ms: number): number => Math.floor((ms + settings.offset * 3600_000) / 86400_000);
const KEEP_DAYS = 400;

type Days = { me: number[]; them: number[] };
const cache = new Map<string, Days>();

const load = (user: string): Days => {
  let d = cache.get(user);
  if (!d) {
    d = phoenix.storage.get<Days>(`d:${user}`) ?? { me: [], them: [] };
    cache.set(user, d);
  }
  return d;
};

function addDay(list: number[], day: number): boolean {
  if (list.includes(day)) return false;
  list.push(day);
  list.sort((a, b) => a - b);
  const floor = dayOf(Date.now()) - KEEP_DAYS;
  while (list.length && list[0] < floor) list.shift();
  return true;
}

function streakFrom(d: Days, today: number): { count: number; active: boolean } {
  const both = new Set(d.me.filter((x) => d.them.includes(x)));
  // Today still counts as "on time" until it's over, so start from yesterday if today isn't done.
  const active = both.has(today);
  let day = active ? today : today - 1;
  let count = 0;
  while (both.has(day)) {
    count++;
    day--;
  }
  return { count, active };
}

const streakOf = (user: string): { count: number; active: boolean } => streakFrom(load(user), dayOf(Date.now()));

// --- Which channels are 1:1 DMs, and with whom ------------------------------------------------
const dmWith = new Map<string, string>(); // channel -> other user
const notDm = new Set<string>();
let me: string | null = null;

phoenix.discord
  .me()
  .then((u) => {
    if (u?.id) me = u.id;
  })
  .catch(() => {});

type Ch = { id?: string; type?: number; recipient_ids?: string[]; recipients?: { id?: string }[]; guild_id?: string };
const rememberChannel = (c: unknown) => {
  const ch = c as Ch | null;
  if (!ch?.id) return;
  if (ch.type === 1) {
    const other = ch.recipient_ids?.[0] ?? ch.recipients?.[0]?.id;
    if (other) dmWith.set(ch.id, other);
  } else notDm.add(ch.id);
};

const { gateway } = phoenix;
if (gateway.ready)
  phoenix.on(gateway.ready, (r) => {
    ((r as { private_channels?: unknown[] }).private_channels ?? []).forEach(rememberChannel);
  });
for (const name of ["channelCreate", "channelUpdate"]) {
  const sig = gateway[name];
  if (sig) phoenix.on(sig, rememberChannel);
}

const looking = new Set<string>();
async function lookup(channel: string) {
  if (dmWith.has(channel) || notDm.has(channel) || looking.has(channel)) return;
  looking.add(channel);
  try {
    const res = await phoenix.discord.get(`/channels/${channel}`);
    if (res.ok) rememberChannel(res.json());
  } catch {
  } finally {
    looking.delete(channel);
  }
}

// --- Counting --------------------------------------------------------------------------------
type Msg = { id?: string; channel_id?: string; guild_id?: string; author?: { id?: string; bot?: boolean }; timestamp?: string };

const snowflakeMs = (id: string) => Number(BigInt(id) >> 22n) + 1420070400000;
const timeOf = (m: Msg) => {
  const t = m.timestamp ? Date.parse(m.timestamp) : NaN;
  return Number.isFinite(t) ? t : m.id ? snowflakeMs(m.id) : NaN;
};

function count(m: Msg, other: string): boolean {
  if (!me || !m.author?.id || m.author.bot) return false;
  const at = timeOf(m);
  if (!Number.isFinite(at)) return false;
  const d = load(other);
  const day = dayOf(at);
  if (m.author.id === me) return addDay(d.me, day);
  if (m.author.id === other) return addDay(d.them, day);
  return false;
}

const changed = new Set<string>();
function flush() {
  for (const user of changed) {
    phoenix.storage.set(`d:${user}`, load(user));
    redraw(user);
  }
  changed.clear();
}

function handle(messages: Msg[], channel: string) {
  const other = dmWith.get(channel);
  if (!other) return;
  for (const m of messages) if (count(m, other)) changed.add(other);
  flush();
}

if (gateway.messageCreate)
  phoenix.on(gateway.messageCreate, (m) => {
    const msg = m as Msg;
    if (!msg?.channel_id || msg.guild_id) return;
    if (dmWith.has(msg.channel_id)) handle([msg], msg.channel_id);
    else if (!notDm.has(msg.channel_id))
      void lookup(msg.channel_id).then(() => handle([msg], msg.channel_id!));
  });

// History loaded when a DM opens fills in earlier days.
phoenix.discord.onResponse({ method: "GET", pathPrefix: "/channels/", pathSuffix: "/messages" }, async (res) => {
  if (res.status < 200 || res.status >= 300) return;
  const channel = res.path.match(/^\/channels\/(\d+)\/messages/)?.[1];
  if (!channel || notDm.has(channel)) return;
  if (!dmWith.has(channel)) await lookup(channel);
  if (!dmWith.has(channel)) return;
  const list = res.json<Msg[]>();
  if (Array.isArray(list)) handle(list, channel);
});

// --- Showing it ------------------------------------------------------------------------------
const GREY = 0xff9ca3af;
const colorFor = (n: number) =>
  n >= 100 ? 0xff9b39fe : n >= 60 ? 0xfff7409c : n >= 45 ? 0xff856bfe : n >= 30 ? 0xfff75340 : n >= 14 ? 0xfff57b0b : n >= 7 ? 0xffb08d57 : 0xfff57b0b;

const render = (enabled: () => boolean) => ({ userId }: { userId: string }): Phoenix.Rendered => {
  if (!enabled() || userId === me || (!cache.has(userId) && phoenix.storage.get(`d:${userId}`) === undefined)) return null;
  const { count: n, active }: { count: number; active: boolean } = streakOf(userId);
  if (n < Math.max(1, settings.minimum)) return null;
  // Grey until you've both talked today: it's still alive, but needs today's messages.
  return { text: `🔥${n}`, color: active ? colorFor(n) : GREY };
};

// The DM list takes text; message headers only draw icons there, so in messages it goes after
// the timestamp instead.
const listRender = render(() => settings.list);
const headerRender = render(() => settings.headers);
const memberDeco: Phoenix.Remover | undefined = phoenix.ui.addMemberDecoration?.({ render: listRender });
const headerAcc: Phoenix.Remover = phoenix.ui.addMessageAccessory({
  placement: "header",
  render: (ctx) => {
    const author = ctx.message?.author?.id;
    if (!author || (ctx.message as { guild_id?: string } | undefined)?.guild_id) return null;
    return headerRender({ userId: author });
  },
});
const removers: (Phoenix.Remover | undefined)[] = [memberDeco, headerAcc];
function redraw(user: string): void {
  memberDeco?.update?.(user);
  headerAcc.update?.();
}
function redrawAll(): void {
  removers.forEach((r) => r?.update?.());
}

phoenix.onUnload(() => removers.forEach((r) => r?.()));
phoenix.log.info("streaks loaded");
