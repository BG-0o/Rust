// @description Stops Discord from setting you Idle on its own · Desktop
// @version 1.1.0
// @author newwares, Nuckyz · Rust by BG_0o
// @permissions hooks
// @gateway-send 3
"use strict";
(() => {
  // plugins/no-idle/src/index.ts
  var chosen = phoenix.storage.get("chosen") ?? "online";
  phoenix.gateway.onSend(3, (payload) => {
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
})();
