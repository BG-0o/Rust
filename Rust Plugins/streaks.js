// @description 🔥 Day streaks with people you DM
// @version 1.0.0
// @author Equicord · Rust by BG_0o
"use strict";
(() => {
  // streaks/src/index.ts
  var detected = -(/* @__PURE__ */ new Date()).getTimezoneOffset() / 60;
  var settings = phoenix.settings.define({
    minimum: { type: "number", title: "Show from", description: "Days in a row", default: 2 },
    headers: { type: "switch", title: "In messages", description: "After the timestamp", default: true, onChange: () => redrawAll() },
    list: { type: "switch", title: "In the DM list", default: true, onChange: () => redrawAll() },
    offset: {
      type: "number",
      title: "Your UTC offset",
      description: "Where a day ends, e.g. -3 for Bras\xEDlia",
      default: Number.isFinite(detected) && detected !== 0 ? detected : -3
    }
  });
  var dayOf = (ms) => Math.floor((ms + settings.offset * 36e5) / 864e5);
  var KEEP_DAYS = 400;
  var cache = /* @__PURE__ */ new Map();
  var load = (user) => {
    let d = cache.get(user);
    if (!d) {
      d = phoenix.storage.get(`d:${user}`) ?? { me: [], them: [] };
      cache.set(user, d);
    }
    return d;
  };
  function addDay(list, day) {
    if (list.includes(day)) return false;
    list.push(day);
    list.sort((a, b) => a - b);
    const floor = dayOf(Date.now()) - KEEP_DAYS;
    while (list.length && list[0] < floor) list.shift();
    return true;
  }
  function streakFrom(d, today) {
    const both = new Set(d.me.filter((x) => d.them.includes(x)));
    const active = both.has(today);
    let day = active ? today : today - 1;
    let count2 = 0;
    while (both.has(day)) {
      count2++;
      day--;
    }
    return { count: count2, active };
  }
  var streakOf = (user) => streakFrom(load(user), dayOf(Date.now()));
  var dmWith = /* @__PURE__ */ new Map();
  var notDm = /* @__PURE__ */ new Set();
  var me = null;
  phoenix.discord.me().then((u) => {
    if (u?.id) me = u.id;
  }).catch(() => {
  });
  var rememberChannel = (c) => {
    const ch = c;
    if (!ch?.id) return;
    if (ch.type === 1) {
      const other = ch.recipient_ids?.[0] ?? ch.recipients?.[0]?.id;
      if (other) dmWith.set(ch.id, other);
    } else notDm.add(ch.id);
  };
  var { gateway } = phoenix;
  if (gateway.ready)
    phoenix.on(gateway.ready, (r) => {
      (r.private_channels ?? []).forEach(rememberChannel);
    });
  for (const name of ["channelCreate", "channelUpdate"]) {
    const sig = gateway[name];
    if (sig) phoenix.on(sig, rememberChannel);
  }
  var looking = /* @__PURE__ */ new Set();
  async function lookup(channel) {
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
  var snowflakeMs = (id) => Number(BigInt(id) >> 22n) + 14200704e5;
  var timeOf = (m) => {
    const t = m.timestamp ? Date.parse(m.timestamp) : NaN;
    return Number.isFinite(t) ? t : m.id ? snowflakeMs(m.id) : NaN;
  };
  function count(m, other) {
    if (!me || !m.author?.id || m.author.bot) return false;
    const at = timeOf(m);
    if (!Number.isFinite(at)) return false;
    const d = load(other);
    const day = dayOf(at);
    if (m.author.id === me) return addDay(d.me, day);
    if (m.author.id === other) return addDay(d.them, day);
    return false;
  }
  var changed = /* @__PURE__ */ new Set();
  function flush() {
    for (const user of changed) {
      phoenix.storage.set(`d:${user}`, load(user));
      redraw(user);
    }
    changed.clear();
  }
  function handle(messages, channel) {
    const other = dmWith.get(channel);
    if (!other) return;
    for (const m of messages) if (count(m, other)) changed.add(other);
    flush();
  }
  if (gateway.messageCreate)
    phoenix.on(gateway.messageCreate, (m) => {
      const msg = m;
      if (!msg?.channel_id || msg.guild_id) return;
      if (dmWith.has(msg.channel_id)) handle([msg], msg.channel_id);
      else if (!notDm.has(msg.channel_id))
        void lookup(msg.channel_id).then(() => handle([msg], msg.channel_id));
    });
  phoenix.discord.onResponse({ method: "GET", pathPrefix: "/channels/", pathSuffix: "/messages" }, async (res) => {
    if (res.status < 200 || res.status >= 300) return;
    const channel = res.path.match(/^\/channels\/(\d+)\/messages/)?.[1];
    if (!channel || notDm.has(channel)) return;
    if (!dmWith.has(channel)) await lookup(channel);
    if (!dmWith.has(channel)) return;
    const list = res.json();
    if (Array.isArray(list)) handle(list, channel);
  });
  var GREY = 4288455599;
  var colorFor = (n) => n >= 100 ? 4288363006 : n >= 60 ? 4294394012 : n >= 45 ? 4286934014 : n >= 30 ? 4294398784 : n >= 14 ? 4294277899 : n >= 7 ? 4289760599 : 4294277899;
  var render = (enabled) => ({ userId }) => {
    if (!enabled() || userId === me || !cache.has(userId) && phoenix.storage.get(`d:${userId}`) === void 0) return null;
    const { count: n, active } = streakOf(userId);
    if (n < Math.max(1, settings.minimum)) return null;
    return { text: `\u{1F525}${n}`, color: active ? colorFor(n) : GREY };
  };
  var listRender = render(() => settings.list);
  var headerRender = render(() => settings.headers);
  var memberDeco = phoenix.ui.addMemberDecoration?.({ render: listRender });
  var headerAcc = phoenix.ui.addMessageAccessory({
    placement: "header",
    render: (ctx) => {
      const author = ctx.message?.author?.id;
      if (!author || ctx.message?.guild_id) return null;
      return headerRender({ userId: author });
    }
  });
  var removers = [memberDeco, headerAcc];
  function redraw(user) {
    memberDeco?.update?.(user);
    headerAcc.update?.();
  }
  function redrawAll() {
    removers.forEach((r) => r?.update?.());
  }
  phoenix.onUnload(() => removers.forEach((r) => r?.()));
  phoenix.log.info("streaks loaded");
})();
