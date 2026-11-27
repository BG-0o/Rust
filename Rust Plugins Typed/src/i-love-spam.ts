// @description Shows messages from accounts flagged as "likely spammer"
// @version 1.0.0
// @author Ven, Nuckyz · Rust by BG_0o

const SPAMMER = 1 << 20;

type WithAuthor = { author?: { public_flags?: number; flags?: number } };

const clean = (m: WithAuthor | null | undefined): boolean => {
  const a = m?.author;
  if (!a) return false;
  let changed = false;
  if (typeof a.public_flags === "number" && a.public_flags & SPAMMER) {
    a.public_flags &= ~SPAMMER;
    changed = true;
  }
  if (typeof a.flags === "number" && a.flags & SPAMMER) {
    a.flags &= ~SPAMMER;
    changed = true;
  }
  return changed;
};

const { gateway } = phoenix;
for (const sig of [gateway.messageCreate, gateway.messageUpdate]) {
  if (!sig) continue;
  phoenix.hook(sig, {
    before(m) {
      const ref = (m as { referenced_message?: WithAuthor | null }).referenced_message;
      const a = clean(m as WithAuthor);
      const b = clean(ref);
      if (a || b) return m;
    },
  });
}

phoenix.discord.onResponse({ method: "GET", pathPrefix: "/channels/", pathSuffix: "/messages" }, (res) => {
  if (res.status < 200 || res.status >= 300 || !res.body.includes("public_flags")) return;
  const list = res.json<(WithAuthor & { referenced_message?: WithAuthor | null })[]>();
  if (!Array.isArray(list)) return;
  let changed = false;
  for (const m of list) {
    if (clean(m)) changed = true;
    if (clean(m.referenced_message)) changed = true;
  }
  return changed ? { body: list } : undefined;
});

phoenix.log.info("i-love-spam loaded");
