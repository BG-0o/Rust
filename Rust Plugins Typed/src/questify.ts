// @description Hides Discord Quests
// @version 1.0.0
// @author Equicord · Rust by BG_0o

// Discord builds Quests from the list it downloads from /quests. Here that list arrives empty,
// so no quests, banners or new-quest alerts show up.

const settings = phoenix.settings.define({
  enabled: {
    type: "switch",
    title: "Hide quests",
    description: "Restart Discord for it to fully apply",
    default: true,
  },
});

type Quests = { quests?: unknown[]; [k: string]: unknown };

phoenix.discord.onResponse({ method: "GET", pathPrefix: "/quests" }, (res) => {
  if (!settings.enabled || res.status < 200 || res.status >= 300 || !res.body.includes("quest")) return;
  const data = res.json<Quests | unknown[]>();
  if (Array.isArray(data)) return data.length ? { body: [] } : undefined;
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
  return changed ? { body: data } : undefined;
});

// Live quest progress events.
for (const name of ["questsUserStatusUpdate", "questsNewQuests"]) {
  const sig = phoenix.gateway[name];
  if (sig) phoenix.hook(sig, { before: () => (settings.enabled ? false : undefined) });
}

phoenix.log.info("questify loaded");
