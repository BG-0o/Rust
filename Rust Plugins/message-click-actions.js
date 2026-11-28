// @description Double-click to reply/edit, plus "Delete now" in the menu
// @version 1.3.1
// @author Vendicated · Rust by BG_0o
// @permissions hooks
// @gateway messageCreate messageUpdate
// @discord DELETE /channels/*/messages/*
// @discord GET /channels/*/messages
// @discord GET /users/@me
// @discord PATCH /channels/*/messages/*
// @messages
// @ui-tree
"use strict";
(() => {
  // plugins/message-click-actions/src/index.ts
  var settings = phoenix.settings.define({
    reply: {
      type: "switch",
      title: "Double-click to reply",
      description: "On someone else's message",
      default: true
    },
    own: {
      type: "select",
      title: "Double-click on my message",
      description: "On PC, Edit means: type the new text and press Enter",
      options: [
        { value: "none", label: "Nothing" },
        { value: "reply", label: "Reply" },
        { value: "delete", label: "Delete (no confirmation)" },
        { value: "edit", label: "Edit" }
      ],
      default: "edit"
    },
    deleteNow: {
      type: "switch",
      title: '"Delete now" in the menu',
      description: "Deletes your message without asking",
      default: true
    }
  });
  var deleteMessage = (channelId, messageId) => {
    if (!channelId) return;
    phoenix.discord.delete(`/channels/${channelId}/messages/${messageId}`).then((res) => {
      if (!res.ok) phoenix.ui.toast(`Couldn't delete (${res.status})`);
    }).catch(() => phoenix.ui.toast("Couldn't delete"));
  };
  phoenix.ui.addMessageAction({
    label: "Delete now",
    danger: true,
    visible: (ctx) => settings.deleteNow && ctx.currentUserId != null && ctx.message?.author?.id === ctx.currentUserId,
    onPress: (ctx) => deleteMessage(ctx.channelId ?? ctx.message?.channel_id, ctx.messageId)
  });
  var myId = null;
  phoenix.discord.me().then((u) => {
    if (u?.id) myId = u.id;
  }).catch(() => {
  });
  var mine = /* @__PURE__ */ new Map();
  var authors = /* @__PURE__ */ new Map();
  var remember = (m) => {
    const msg = m;
    if (!msg?.id || !msg.author?.id) return;
    authors.set(msg.id, msg.author.id);
    if (myId && msg.author.id === myId && msg.channel_id) mine.set(msg.id, msg.channel_id);
    if (authors.size > 5e3) authors.delete(authors.keys().next().value);
    if (mine.size > 5e3) mine.delete(mine.keys().next().value);
  };
  var { gateway } = phoenix;
  if (gateway.messageCreate) phoenix.on(gateway.messageCreate, remember);
  if (gateway.messageUpdate) phoenix.on(gateway.messageUpdate, remember);
  async function lookUpAuthor(channelId, messageId) {
    try {
      const res = await phoenix.discord.get(`/channels/${channelId}/messages?around=${messageId}&limit=1`);
      if (!res.ok) return null;
      const hit = res.json().find((m) => m.id === messageId);
      if (hit) remember(hit);
      return hit?.author?.id ?? null;
    } catch {
      return null;
    }
  }
  var ARM_MS = 12e4;
  var armed = null;
  var lastEdit = null;
  function armEdit(channelId, messageId) {
    if (armed?.messageId === messageId) {
      armed = null;
      phoenix.ui.toast("Edit cancelled");
      return;
    }
    armed = { channelId: channelId ?? null, messageId, until: Date.now() + ARM_MS };
    phoenix.ui.toast("\u270F\uFE0F Type the new text and press Enter \xB7 double-click again to cancel");
  }
  phoenix.messages.onSend((text, ctx) => {
    const now = Date.now();
    if (lastEdit && lastEdit.channelId === ctx?.channelId && lastEdit.text === text && now - lastEdit.at < 2e4) {
      return false;
    }
    if (!armed || now > armed.until || armed.channelId && armed.channelId !== ctx?.channelId) {
      if (armed && now > armed.until) armed = null;
      return;
    }
    const messageId = armed.messageId;
    const channelId = armed.channelId ?? ctx?.channelId;
    armed = null;
    if (!channelId) return;
    lastEdit = { channelId, text, at: now };
    phoenix.discord.patch(`/channels/${channelId}/messages/${messageId}`, { content: text }).then((res) => {
      if (res.ok) mine.set(messageId, channelId);
      phoenix.ui.toast(res.ok ? "Edited" : `Couldn't edit (${res.status})`);
    }).catch(() => phoenix.ui.toast("Couldn't edit"));
    return false;
  });
  phoenix.ui.patchProps({ prefix: "message.content:" }, { addOn: ["rowDoubleTap"] }, { target: "list" });
  var pending = null;
  var pendingUntil = 0;
  var run = (ev, action) => {
    if (ev.press) {
      ev.press(action);
      return;
    }
    pending = action;
    pendingUntil = Date.now() + 2e3;
    phoenix.ui.patchProps(
      "message.actions.root",
      { hidden: true, opacity: 0, scrimOpacity: 0 },
      { target: "sheet", once: true, timeoutMs: 2e3 }
    );
    phoenix.ui.dispatch(ev.node, "rowLongPress", ev.payload ?? {});
  };
  phoenix.ui.onEvent(
    "rowDoubleTap",
    (ev) => {
      if (!ev.messageId) return false;
      const me = ev.currentUserId ?? myId;
      const channelId = ev.channelId ?? ev.message?.channel_id ?? mine.get(ev.messageId) ?? null;
      const author = ev.message?.author?.id ?? authors.get(ev.messageId) ?? (mine.has(ev.messageId) ? me : null);
      if (!author && ev.press) {
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
    { intercept: true }
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
})();
