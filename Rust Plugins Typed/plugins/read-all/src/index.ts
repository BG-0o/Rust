// @description Marks every server as read at once
// @version 1.0.0
// @author kemo · Rust by BG_0o

const guilds = new Set<string>();

const remember = (g: unknown) => {
  const id = (g as { id?: string } | null)?.id;
  if (id) guilds.add(id);
};

const { gateway } = phoenix;
if (gateway.ready) phoenix.on(gateway.ready, (r) => ((r as { guilds?: unknown[] }).guilds ?? []).forEach(remember));
if (gateway.guildCreate) phoenix.on(gateway.guildCreate, remember);
const deleted = gateway["guildDelete"];
if (deleted) phoenix.on(deleted, (g) => {
  const id = (g as { id?: string; unavailable?: boolean } | null)?.id;
  if (id && !(g as { unavailable?: boolean }).unavailable) guilds.delete(id);
});

// Phoenix's cache keys guilds by zero-padded id.
phoenix.stores
  .sql<{ k: string }>("SELECT CAST(k AS TEXT) AS k FROM guilds")
  .then((rows) => {
    for (const { k } of rows) {
      const id = String(k).replace(/^0+/, "");
      if (/^\d{17,20}$/.test(id)) guilds.add(id);
    }
  })
  .catch(() => {});

let running = false;

async function readAll() {
  if (running) {
    phoenix.ui.toast("Already marking…");
    return;
  }
  const ids = [...guilds];
  if (ids.length === 0) {
    phoenix.ui.toast("Servers still loading, try again in a moment");
    return;
  }
  running = true;
  phoenix.ui.toast(`Marking ${ids.length} servers as read…`);
  let done = 0;
  let failed = 0;
  try {
    for (const id of ids) {
      try {
        const res = await phoenix.discord.post(`/guilds/${id}/ack`, {});
        if (res.ok) done++;
        else if (res.status === 429) {
          phoenix.ui.toast(`Discord asked to slow down after ${done} servers. Try again in a minute`);
          return;
        } else failed++;
      } catch {
        failed++;
      }
    }
    phoenix.ui.toast(failed ? `✅ ${done} servers read (${failed} failed)` : `✅ ${done} servers read`);
  } finally {
    running = false;
  }
}

phoenix.messages.onSend((text) => {
  if (text.trim().toLowerCase() !== "!readall") return;
  void readAll();
  return false;
});

const settings = phoenix.settings.define({
  now: {
    type: "button",
    title: "Mark all as read now",
    description: "Or send !readall in any chat",
    onPress: () => void readAll(),
  },
  inMenu: {
    type: "switch",
    title: "Right-click option",
    description: "\"Mark all as read\" in any message's menu",
    default: true,
  },
});

phoenix.ui.addMessageAction({
  label: "Mark all as read",
  visible: () => settings.inMenu,
  onPress: () => void readAll(),
});

phoenix.log.info("read-all loaded");
