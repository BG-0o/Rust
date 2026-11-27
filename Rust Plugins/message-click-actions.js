// @description Double-click to reply/edit, plus "Delete now" in the menu
// @version 1.1.0
// @author Vendicated · Rust by BG_0o
// @permissions hooks
// @discord DELETE /channels/*/messages/*
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
      options: [
        { value: "edit", label: "Edit" },
        { value: "delete", label: "Delete (no confirmation)" },
        { value: "reply", label: "Reply" },
        { value: "none", label: "Nothing" }
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
      const own = ev.currentUserId != null && ev.message?.author?.id === ev.currentUserId;
      if (own) {
        const mode = settings.own;
        if (mode === "none") return false;
        if (mode === "delete") {
          deleteMessage(ev.channelId ?? ev.message?.channel_id, ev.messageId);
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
