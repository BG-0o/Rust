// Shows a short message to you as a pop-up. (Before Sunbird 0.2 the pop-up layer didn't draw on
// some Phoenix builds and this also posted a local message; that's no longer needed.)

export function say(text: string, _channelId?: string | null, _author = "Sunbird"): void {
  phoenix.ui.toast(text);
}
