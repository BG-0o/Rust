// @description Hide only the games/apps you choose from your status · Desktop
// @version 1.0.0
// @author Nuckyz · Rust by BG_0o
"use strict";
(() => {
  // ignore-activities/src/index.ts
  var settings = phoenix.settings.define({
    names: {
      type: "text",
      title: "Hide",
      description: "One name per line, as shown on your status, e.g. Roblox",
      default: "",
      multiline: true
    },
    partial: {
      type: "switch",
      title: "Match part of the name",
      description: '"craft" also hides Minecraft',
      default: false
    },
    hideListening: { type: "switch", title: 'Hide all "Listening"', description: "Spotify etc.", default: false },
    hideWatching: { type: "switch", title: 'Hide all "Watching"', default: false }
  });
  var list = () => settings.names.split(/\r?\n|,/).map((n) => n.trim().toLowerCase()).filter(Boolean);
  function hidden(a, names, partial) {
    if (a?.type === 4) return false;
    if (a?.type === 2 && settings.hideListening) return true;
    if (a?.type === 3 && settings.hideWatching) return true;
    const name = (a?.name ?? "").toLowerCase();
    if (!name) return false;
    return names.some((n) => partial ? name.includes(n) : name === n);
  }
  phoenix.gateway.onSend(3, (payload) => {
    if (!payload || !Array.isArray(payload.activities)) return;
    const names = list();
    const kept = payload.activities.filter((a) => !hidden(a, names, settings.partial));
    if (kept.length === payload.activities.length) return;
    payload.activities = kept;
    return payload;
  });
  phoenix.log.info("ignore-activities loaded");
})();
