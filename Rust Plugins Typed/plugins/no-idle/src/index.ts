// @description Stops Discord from setting you Idle on its own · Desktop
// @version 1.0.0
// @author newwares, Nuckyz · Rust by BG_0o

// When you go AFK Discord sends `afk: true` and status "idle". The status you picked is the one
// sent while not AFK; it's remembered and sent instead.

type Presence = { status?: string; afk?: boolean; since?: number | null };

let chosen = phoenix.storage.get<string>("chosen") ?? "online";

phoenix.gateway.onSend<Presence>(3, (payload) => {
  if (!payload) return;
  if (payload.afk !== true) {
    if (typeof payload.status === "string" && payload.status !== chosen) {
      chosen = payload.status;
      phoenix.storage.set("chosen", chosen);
    }
    return;
  }
  payload.afk = false;
  payload.since = 0;
  payload.status = chosen;
  return payload;
});

phoenix.log.info("no-idle loaded");
