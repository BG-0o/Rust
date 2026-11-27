// @description Calls from people you choose don't ring
// @version 1.0.0
// @author TheArmagan, thororen · Rust by BG_0o
"use strict";
(() => {
  // ignore-calls/src/index.ts
  var settings = phoenix.settings.define({
    users: {
      type: "text",
      title: "Ignored people",
      description: 'User IDs, comma separated. Or right-click > "Ignore calls"',
      default: "",
      multiline: true
    },
    notify: { type: "switch", title: "Pop-up when a call is ignored", default: true }
  });
  var parse = () => new Set(
    settings.users.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^\d{17,20}$/.test(s))
  );
  var KEY = "extra";
  var extra = new Set(phoenix.storage.get(KEY) ?? []);
  var save = () => phoenix.storage.set(KEY, [...extra]);
  var ignored = () => {
    const all = parse();
    for (const id of extra) all.add(id);
    return all;
  };
  var me = null;
  phoenix.discord.me().then((u) => {
    if (u?.id) me = u.id;
  }).catch(() => {
  });
  var names = /* @__PURE__ */ new Map();
  var told = /* @__PURE__ */ new Set();
  function filter(call) {
    if (!call || !me || !Array.isArray(call.ringing) || !call.ringing.includes(me)) return;
    const list = ignored();
    const caller = (call.voice_states ?? []).find((s) => s.user_id && s.user_id !== me && list.has(s.user_id));
    if (!caller?.user_id) return;
    call.ringing = call.ringing.filter((id) => id !== me);
    const key = `${call.channel_id}:${caller.user_id}`;
    if (settings.notify && !told.has(key)) {
      told.add(key);
      if (told.size > 100) told.clear();
      phoenix.ui.toast(`\u{1F4F5} Ignored a call from ${names.get(caller.user_id) ?? "someone you ignore"}`);
    }
    return call;
  }
  var { gateway } = phoenix;
  for (const name of ["callCreate", "callUpdate"]) {
    const sig = gateway[name];
    if (!sig) {
      phoenix.log.warn(`ignore-calls: this Discord build has no ${name} event`);
      continue;
    }
    phoenix.hook(sig, { before: (p) => filter(p) });
  }
  if (gateway.messageCreate)
    phoenix.on(gateway.messageCreate, (m) => {
      const a = m?.author;
      if (a?.id) names.set(a.id, a.global_name || a.username || a.id);
    });
  phoenix.ui.addMessageAction({
    label: "Ignore calls",
    visible: (ctx) => {
      const id = ctx.message?.author?.id;
      return !!id && id !== ctx.currentUserId && !ignored().has(id);
    },
    onPress: (ctx) => {
      const a = ctx.message?.author;
      if (!a?.id) return;
      extra.add(a.id);
      save();
      names.set(a.id, a.global_name || a.username || a.id);
      phoenix.ui.toast(`\u{1F4F5} Calls from ${names.get(a.id)} are ignored`);
    }
  });
  phoenix.ui.addMessageAction({
    label: "Stop ignoring calls",
    visible: (ctx) => {
      const id = ctx.message?.author?.id;
      return !!id && extra.has(id);
    },
    onPress: (ctx) => {
      const id = ctx.message?.author?.id;
      if (!id) return;
      extra.delete(id);
      save();
      phoenix.ui.toast("\u{1F4DE} Their calls ring again");
    }
  });
  phoenix.log.info("ignore-calls loaded");
})();
