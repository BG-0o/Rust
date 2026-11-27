// @description Switches to Do Not Disturb while you're playing · Desktop
// @version 1.0.0
// @author thororen · Rust by BG_0o

const settings = phoenix.settings.define({
  status: {
    type: "select",
    title: "Status while playing",
    options: [
      { value: "dnd", label: "Do Not Disturb" },
      { value: "idle", label: "Idle" },
      { value: "invisible", label: "Invisible" },
    ],
    default: "dnd",
  },
  exclude: {
    type: "text",
    title: "Ignored games",
    description: "One per line; these won't change your status",
    default: "",
    multiline: true,
  },
});

type Presence = { status?: string; activities?: { type?: number; name?: string }[] };

phoenix.gateway.onSend<Presence>(3, (payload) => {
  // Only changes an Online status; a status you picked yourself is left alone.
  if (!payload || payload.status !== "online" || !Array.isArray(payload.activities)) return;
  const skip = settings.exclude
    .split(/\r?\n|,/)
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  const playing = payload.activities.some(
    (a) => a?.type === 0 && !skip.includes((a.name ?? "").toLowerCase()),
  );
  if (!playing) return;
  payload.status = settings.status;
  return payload;
});

phoenix.log.info("auto-dnd loaded");
