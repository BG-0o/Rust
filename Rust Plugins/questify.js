// @description Hides Discord Quests
// @version 1.1.0
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
    },
    debug: {
      type: "switch",
      title: "Log quest requests",
      description: "Writes each quest API call to the Sunbird log, to find what still gets through",
      default: false
    }
  });
  var QUEST_KEY = /quest/i;
  function strip(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 6) return false;
    let changed = false;
    if (Array.isArray(value)) {
      for (const item of value) changed = strip(item, depth + 1) || changed;
      return changed;
    }
    const obj = value;
    for (const [key, v] of Object.entries(obj)) {
      if (QUEST_KEY.test(key)) {
        if (Array.isArray(v) && v.length) {
          obj[key] = [];
          changed = true;
          continue;
        }
        if (v && typeof v === "object" && !Array.isArray(v) && ("id" in v || "config" in v)) {
          obj[key] = null;
          changed = true;
          continue;
        }
      }
      changed = strip(v, depth + 1) || changed;
    }
    return changed;
  }
  phoenix.discord.onResponse({ method: "GET", pathIncludes: "quest" }, (res) => {
    if (settings.debug) phoenix.log.info(`questify: ${res.status} ${res.path}`);
    if (!settings.enabled || res.status < 200 || res.status >= 300) return;
    const data = res.json();
    if (Array.isArray(data) && /\/quests/i.test(res.path)) return data.length ? { body: [] } : void 0;
    return strip(data) ? { body: data } : void 0;
  });
  for (const name of ["questsUserStatusUpdate", "questsNewQuests", "questsUserCompletionUpdate"]) {
    const sig = phoenix.gateway[name];
    if (sig) phoenix.hook(sig, { before: () => settings.enabled ? false : void 0 });
  }
  phoenix.log.info("questify loaded");
})();
