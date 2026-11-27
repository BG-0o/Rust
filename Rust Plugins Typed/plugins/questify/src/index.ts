// @description Hides Discord Quests
// @version 1.1.0
// @author Equicord · Rust by BG_0o

// Discord builds Quests from what it downloads from the API (/quests/@me, /quests/decision and
// others). Every API response whose path mentions "quest" has its quest lists emptied, so no
// quests, banners or new-quest alerts show up. The "Quests" entry in the sidebar is drawn by the
// app itself and plugins can't remove it on desktop.

const settings = phoenix.settings.define({
  enabled: {
    type: "switch",
    title: "Hide quests",
    description: "Restart Discord for it to fully apply",
    default: true,
  },
  debug: {
    type: "switch",
    title: "Log quest requests",
    description: "Writes each quest API call to the Sunbird log, to find what still gets through",
    default: false,
  },
});

const QUEST_KEY = /quest/i;

// Empties every quest list (and single quest object) anywhere in the response.
function strip(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 6) return false;
  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) changed = strip(item, depth + 1) || changed;
    return changed;
  }
  const obj = value as Record<string, unknown>;
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
  const data = res.json<unknown>();
  if (Array.isArray(data) && /\/quests/i.test(res.path)) return data.length ? { body: [] } : undefined;
  return strip(data) ? { body: data as object } : undefined;
});

// Live quest events.
for (const name of ["questsUserStatusUpdate", "questsNewQuests", "questsUserCompletionUpdate"]) {
  const sig = phoenix.gateway[name];
  if (sig) phoenix.hook(sig, { before: () => (settings.enabled ? false : undefined) });
}

phoenix.log.info("questify loaded");
