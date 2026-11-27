// @description "Show embeds" in the menu brings back removed link previews
// @version 1.0.0
// @author Ven · Rust by BG_0o

const SUPPRESS_EMBEDS = 1 << 2;

const flagsOf = (m: Phoenix.Message | undefined) => (typeof m?.flags === "number" ? m.flags : 0);

phoenix.ui.addMessageAction({
  label: "Show embeds",
  visible: (ctx) => (flagsOf(ctx.message) & SUPPRESS_EMBEDS) !== 0,
  onPress: (ctx) => {
    const channelId = ctx.channelId ?? ctx.message?.channel_id;
    if (!channelId) return;
    phoenix.discord
      .patch(`/channels/${channelId}/messages/${ctx.messageId}`, {
        flags: flagsOf(ctx.message) & ~SUPPRESS_EMBEDS,
      })
      .then((res) => {
        if (res.ok) phoenix.ui.toast("Embeds restored");
        else if (res.status === 403) phoenix.ui.toast("Needs \"Manage Messages\" here");
        else phoenix.ui.toast(`Couldn't do it (${res.status})`);
      })
      .catch(() => phoenix.ui.toast("Couldn't do it"));
  },
});

phoenix.log.info("unsuppress-embeds loaded");
