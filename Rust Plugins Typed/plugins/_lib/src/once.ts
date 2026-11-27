// When a plugin cancels a send, Phoenix treats it as a network failure and retries the same
// message, which runs the command again. A command is acted on once per channel and text within
// this window; the retries are still cancelled, just not acted on.

const WINDOW_MS = 20_000;
const seen = new Map<string, number>();

/** True the first time this command text is seen in this channel within the window. */
export function firstTime(text: string, channelId?: string | null): boolean {
  const now = Date.now();
  for (const [key, at] of seen) if (now - at > WINDOW_MS) seen.delete(key);
  const key = `${channelId ?? ""}\u0000${text.trim().toLowerCase()}`;
  if (seen.has(key)) return false;
  seen.set(key, now);
  return true;
}
