// @description Renames the files you upload
// @version 1.1.0
// @author fawn · Rust by BG_0o

import { commands } from "../../_lib/src/commands";

const settings = commands(
  phoenix.settings.define({
  enabled: { type: "switch", title: "Enabled", default: true },
  method: {
    type: "select",
    title: "New name",
    options: [
      { value: "random", label: "Random characters" },
      { value: "consistent", label: "Always the same name" },
      { value: "timestamp", label: "Time sent" },
    ],
    default: "random",
  },
  length: { type: "number", title: "Random name length", description: "!anon length <value>", default: 7 },
  consistent: { type: "text", title: "Fixed name", description: "For \"Always the same name\" · !anon name <value>", default: "image" },
  keepExtension: { type: "switch", title: "Keep extension", description: ".png, .mp4…", default: true },
  }),
  "anon",
  { name: { key: "consistent", kind: "text" }, length: { key: "length", kind: "number" } }
);

const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function newName(original: string): string {
  const spoiler = original.startsWith("SPOILER_");
  const bare = spoiler ? original.slice(8) : original;
  const dot = bare.lastIndexOf(".");
  const ext = settings.keepExtension && dot > 0 ? bare.slice(dot) : "";
  let base: string;
  if (settings.method === "consistent") base = settings.consistent.trim() || "image";
  else if (settings.method === "timestamp") base = String(Date.now());
  else {
    const len = Math.min(Math.max(Math.floor(settings.length) || 7, 1), 64);
    base = Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
  }
  return (spoiler ? "SPOILER_" : "") + base + ext;
}

// The final name is the `filename` in the message posting the file. `uploaded_filename` is the
// upload slot and must stay as is.
const names = new Map<string, string>();

phoenix.discord.onRequest({ method: "POST", pathPrefix: "/channels/", pathSuffix: "/messages" }, (req) => {
  if (!settings.enabled) return;
  const payload = req.json<{ attachments?: { filename?: string; id?: string }[] }>();
  if (!payload || !Array.isArray(payload.attachments) || payload.attachments.length === 0) return;
  let changed = false;
  for (const a of payload.attachments) {
    if (typeof a.filename !== "string" || !a.filename) continue;
    const key = `${a.id ?? ""}:${a.filename}`;
    const name = names.get(key) ?? newName(a.filename);
    names.set(key, name);
    a.filename = name;
    changed = true;
  }
  if (names.size > 200) names.clear();
  return changed ? { body: payload } : undefined;
});

phoenix.log.info("anonymous-files loaded");
