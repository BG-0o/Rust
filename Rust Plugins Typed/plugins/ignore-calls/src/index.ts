// @description Calls from people you choose don't ring
// @version 1.1.0
// @author TheArmagan, thororen · Rust by BG_0o

import { commands } from "../../_lib/src/commands";

// Discord rings you because your id is in the call's `ringing` list. When the call comes from
// someone you ignore, your id is taken out before the app sees it, so nothing rings. The call
// itself still exists and you can join it from the DM if you want.

const settings = commands(
  phoenix.settings.define({
  users: {
    type: "text",
    title: "Ignored people",
    description: "User IDs, comma separated. Or right-click > \"Ignore calls\" · !calls users add <x>",
    default: "",
    multiline: true,
  },
  notify: { type: "switch", title: "Pop-up when a call is ignored", default: true },
  }),
  "calls",
  { users: { key: "users", kind: "list" } }
);

const parse = () =>
  new Set(
    settings.users
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{17,20}$/.test(s)),
  );

// Text settings can't be changed from code, so the menu keeps its own list next to it.
const KEY = "extra";
let extra = new Set<string>(phoenix.storage.get<string[]>(KEY) ?? []);
const save = () => phoenix.storage.set(KEY, [...extra]);
const ignored = () => {
  const all = parse();
  for (const id of extra) all.add(id);
  return all;
};

let me: string | null = null;
phoenix.discord
  .me()
  .then((u) => {
    if (u?.id) me = u.id;
  })
  .catch(() => {});

type Call = { channel_id?: string; ringing?: string[]; voice_states?: { user_id?: string; channel_id?: string | null }[] };

const names = new Map<string, string>();
const told = new Set<string>();

function filter(call: Call): Call | void {
  if (!call || !me || !Array.isArray(call.ringing) || !call.ringing.includes(me)) return;
  const list = ignored();
  const caller = (call.voice_states ?? []).find((s) => s.user_id && s.user_id !== me && list.has(s.user_id));
  if (!caller?.user_id) return;
  call.ringing = call.ringing.filter((id) => id !== me);
  const key = `${call.channel_id}:${caller.user_id}`;
  if (settings.notify && !told.has(key)) {
    told.add(key);
    if (told.size > 100) told.clear();
    phoenix.ui.toast(`📵 Ignored a call from ${names.get(caller.user_id) ?? "someone you ignore"}`);
  }
  return call;
}

const { gateway } = phoenix;
for (const name of ["callCreate", "callUpdate"]) {
  const sig = gateway[name];
  if (!sig) {
    phoenix.log.warn(`ignore-calls: this Discord build has no ${name} event`);
    continue;
  }
  phoenix.hook(sig, { before: (p) => filter(p as Call) as typeof p | void });
}

// Remember names to say who was ignored.
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
    phoenix.ui.toast(`📵 Calls from ${names.get(a.id)} are ignored`);
  },
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
    phoenix.ui.toast("📞 Their calls ring again");
  },
});

phoenix.log.info("ignore-calls loaded");
