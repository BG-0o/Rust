// @description Hides Discord Quests
// @version 1.0.0
// @author Equicord · Rust by BG_0o
"use strict";
(() => {
  // questify/src/index.ts
  var settings = phoenix.settings.define({
    enabled: {
      type: "switch",
      title: "Hide quests",
      description: "Restart Discord for it to fully apply",
      default: true
    }
  });
  phoenix.discord.onResponse({ method: "GET", pathPrefix: "/quests" }, (res) => {
    if (!settings.enabled || res.status < 200 || res.status >= 300 || !res.body.includes("quest")) return;
    const data = res.json();
    if (Array.isArray(data)) return data.length ? { body: [] } : void 0;
    if (!data || typeof data !== "object") return;
    let changed = false;
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && /quest/i.test(key) && value.length) {
        data[key] = [];
        changed = true;
      } else if (/^quest(_to_deliver)?$/i.test(key) && value) {
        data[key] = null;
        changed = true;
      }
    }
    return changed ? { body: data } : void 0;
  });
  for (const name of ["questsUserStatusUpdate", "questsNewQuests"]) {
    const sig = phoenix.gateway[name];
    if (sig) phoenix.hook(sig, { before: () => settings.enabled ? false : void 0 });
  }
  phoenix.log.info("questify loaded");
})();
