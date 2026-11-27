// Shows a short message to you. Pop-ups (toasts) are drawn by Sunbird's overlay, which doesn't show
// on some Phoenix builds, so when there's a channel to put it in, the same text is also added there
// as a message only you can see.

export function say(text: string, channelId?: string | null, author = "Sunbird"): void {
  phoenix.ui.toast(text);
  if (!channelId) return;
  try {
    phoenix.messages.addLocal(channelId, text, { author });
  } catch (err) {
    phoenix.log.warn(`couldn't add a local message: ${String(err)}`);
  }
}
