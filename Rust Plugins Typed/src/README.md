# Sunbird-Rust plugin sources

TypeScript sources for the plugins in `Sunbird-Rust/`. One file per plugin; the `.js` next to it is
this file bundled as an IIFE.

## API types

They're typed against Sunbird's `phoenix` API: `crates/runtime/phoenix.d.ts` in the Sunbird repo.
To type-check, put a file in Sunbird's `plugins/<name>/src/index.ts` and run `tsc -p plugins/tsconfig.json`.

## Build

```
esbuild <name>.ts --bundle --format=iife --target=es2023 --outfile=<name>.js \
  --banner:js="// @description ...\n// @version ...\n// @author ..."
```

(The `// @` header lines at the top of each `.ts` are the banner.)

## Known limits

- **message-click-actions**: the double-click relies on Sunbird's `rowDoubleTap`, measured on Phoenix
  build 2233. On older builds a double-click just selects text. "Delete now" (right-click menu) doesn't
  depend on it.
- **questify**: empties JSON from `GET /quests*` and drops `questsUserStatusUpdate` / `questsNewQuests`.
  If Phoenix loads quests from another path or from READY, quests still show.
- **i-love-spam**: clears `1 << 20` from `author.public_flags` / `author.flags` on MESSAGE_CREATE,
  MESSAGE_UPDATE and message history. Untested against a real flagged account.
- **disable-call-idle** (beta): holds the last person's leave in a DM call and replays it via
  `phoenix.enqueue` when you leave. Doesn't help with calls nobody answered.
