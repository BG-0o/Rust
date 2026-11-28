const settings = phoenix.settings.define({
  reply: {
    type: "switch",
    title: "Double-click to reply",
    description: "On someone else's message",
    default: true,
  },
  own: {
    type: "select",
    title: "Double-click on my message",
    description: "On PC, Edit means: type the new text and press Enter",
    options: [
      { value: "none", label: "Nothing" },
      { value: "reply", label: "Reply" },
      { value: "delete", label: "Delete (no confirmation)" },
      { value: "edit", label: "Edit" },
    ],
    default: "edit",
  },
  deleteNow: {
    type: "switch",
    title: "\"Delete now\" in the menu",
    description: "Deletes your message without asking",
    default: true,
  },
});

const deleteMessage = (channelId: string | null | undefined, messageId: string) => {
  if (!channelId) return;
  phoenix.discord
    .delete(`/channels/${channelId}/messages/${messageId}`)
    .then((res) => {
      if (!res.ok) phoenix.ui.toast(`Couldn't delete (${res.status})`);
    })
    .catch(() => phoenix.ui.toast("Couldn't delete"));
};

// --- Menu ------------------------------------------------------------------------------------
phoenix.ui.addMessageAction({
  label: "Delete now",
  danger: true,
  visible: (ctx) =>
    settings.deleteNow && ctx.currentUserId != null && ctx.message?.author?.id === ctx.currentUserId,
  onPress: (ctx) => deleteMessage(ctx.channelId ?? ctx.message?.channel_id, ctx.messageId),
});

// --- Who wrote what ----------------------------------------------------------------------------
// On PC the double-click often comes without the message (an edited one is stored without its
// author, and the channel isn't passed), so the plugin keeps track of your messages itself.
let myId: string | null = null;
phoenix.discord
  .me()
  .then((u) => {
    if (u?.id) myId = u.id;
  })
  .catch(() => {});
const mine = new Map<string, string>(); // your message id → channel id
const authors = new Map<string, string>(); // message id → author id, from lookups
const remember = (m: unknown) => {
  const msg = m as { id?: string; channel_id?: string; author?: { id?: string } } | null;
  if (!msg?.id || !msg.author?.id) return;
  authors.set(msg.id, msg.author.id);
  if (myId && msg.author.id === myId && msg.channel_id) mine.set(msg.id, msg.channel_id);
  if (authors.size > 5000) authors.delete(authors.keys().next().value as string);
  if (mine.size > 5000) mine.delete(mine.keys().next().value as string);
};
const { gateway } = phoenix;
if (gateway.messageCreate) phoenix.on(gateway.messageCreate, remember);
if (gateway.messageUpdate) phoenix.on(gateway.messageUpdate, remember);

async function lookUpAuthor(channelId: string, messageId: string): Promise<string | null> {
  try {
    const res = await phoenix.discord.get(`/channels/${channelId}/messages?around=${messageId}&limit=1`);
    if (!res.ok) return null;
    const hit = res.json<{ id: string; channel_id: string; author?: { id?: string } }[]>().find((m) => m.id === messageId);
    if (hit) remember(hit);
    return hit?.author?.id ?? null;
  } catch {
    return null;
  }
}

// --- Edit on PC -----------------------------------------------------------------------------
// Pressing Discord's own Edit from a double-click crashes desktop Phoenix (a Sunbird bug), so on
// PC the double-click arms an edit instead: the next message you send in that channel replaces
// the text of the one you clicked, and isn't sent as a new one.
const ARM_MS = 120_000;
// channelId is null when the double-click didn't say; the channel you send in is used then.
let armed: { channelId: string | null; messageId: string; until: number } | null = null;
// Phoenix sends a cancelled message again; its repeat is dropped too.
let lastEdit: { channelId: string; text: string; at: number } | null = null;

function armEdit(channelId: string | null | undefined, messageId: string) {
  if (armed?.messageId === messageId) {
    armed = null;
    phoenix.ui.toast("Edit cancelled");
    return;
  }
  armed = { channelId: channelId ?? null, messageId, until: Date.now() + ARM_MS };
  phoenix.ui.toast("✏️ Type the new text and press Enter · double-click again to cancel");
}

phoenix.messages.onSend((text, ctx) => {
  const now = Date.now();
  if (lastEdit && lastEdit.channelId === ctx?.channelId && lastEdit.text === text && now - lastEdit.at < 20_000) {
    return false;
  }
  if (!armed || now > armed.until || (armed.channelId && armed.channelId !== ctx?.channelId)) {
    if (armed && now > armed.until) armed = null;
    return;
  }
  const messageId = armed.messageId;
  const channelId = armed.channelId ?? ctx?.channelId;
  armed = null;
  if (!channelId) return;
  lastEdit = { channelId, text, at: now };
  phoenix.discord
    .patch(`/channels/${channelId}/messages/${messageId}`, { content: text })
    .then((res) => {
      if (res.ok) mine.set(messageId, channelId);
      phoenix.ui.toast(res.ok ? "Edited" : `Couldn't edit (${res.status})`);
    })
    .catch(() => phoenix.ui.toast("Couldn't edit"));
  return false;
});

// --- Clique duplo ----------------------------------------------------------------------------
// Needs a recent Discord Phoenix (build 2233+); on older builds a double-click just selects text.
phoenix.ui.patchProps({ prefix: "message.content:" }, { addOn: ["rowDoubleTap"] }, { target: "list" });

let pending: string | null = null;
let pendingUntil = 0;

const run = (ev: Phoenix.ViewEvent, action: string) => {
  if (ev.press) {
    ev.press(action); // Desktop: presses the menu item directly
    return;
  }
  // Mobile: opens the menu invisibly and presses the item.
  pending = action;
  pendingUntil = Date.now() + 2000;
  phoenix.ui.patchProps(
    "message.actions.root",
    { hidden: true, opacity: 0, scrimOpacity: 0 },
    { target: "sheet", once: true, timeoutMs: 2000 },
  );
  phoenix.ui.dispatch(ev.node, "rowLongPress", (ev.payload as Record<string, unknown>) ?? {});
};

phoenix.ui.onEvent(
  "rowDoubleTap",
  (ev) => {
    if (!ev.messageId) return false;
    const me = ev.currentUserId ?? myId;
    const channelId = ev.channelId ?? ev.message?.channel_id ?? mine.get(ev.messageId) ?? null;
    const author = ev.message?.author?.id ?? authors.get(ev.messageId) ?? (mine.has(ev.messageId) ? me : null);
    if (!author && ev.press) {
      // PC without the author: ask Discord, then act. A reply needs the click itself, so for
      // someone else's message the next double-click replies.
      if (!channelId || !me) return false;
      const messageId = ev.messageId;
      void lookUpAuthor(channelId, messageId).then((who) => {
        if (who !== me) return;
        if (settings.own === "edit") armEdit(channelId, messageId);
        else if (settings.own === "delete") deleteMessage(channelId, messageId);
      });
      return true;
    }
    const own = me != null && author === me;
    if (own) {
      const mode = settings.own;
      if (mode === "none") return false;
      if (mode === "delete") {
        deleteMessage(channelId, ev.messageId);
        return true;
      }
      if (mode === "edit" && ev.press) {
        armEdit(channelId, ev.messageId);
        return true;
      }
      run(ev, mode === "edit" ? "message.actions.edit" : "message.actions.reply");
      return true;
    }
    if (!settings.reply) return false;
    run(ev, "message.actions.reply");
    return true;
  },
  { intercept: true },
);

phoenix.ui.onNode("message.actions.root", (node) => {
  if (!pending) return;
  const action = pending;
  pending = null;
  if (Date.now() > pendingUntil) return;
  const btn = phoenix.ui.findDown(node.id, action, 8);
  if (btn != null) phoenix.ui.dispatch(btn, "press");
  else if (node.sheet != null) phoenix.ui.dispatch(node.sheet, "dismiss");
});

phoenix.log.info("message-click-actions loaded");
