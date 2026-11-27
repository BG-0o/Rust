# Sunbird-Rust plugin sources

TypeScript sources for the plugins in `Sunbird-Rust/`, laid out like Sunbird's own repo:
`plugins/<name>/src/index.ts`. The `.js` files are these bundled as IIFEs (Sunbird only installs bundles).

## API types

They're typed against Sunbird's `phoenix` API: `crates/runtime/phoenix.d.ts` in the Sunbird repo.
To type-check, copy the `plugins/` folders into a Sunbird checkout and run `tsc -p plugins/tsconfig.json`
(or bundle with `node web/tools/bundle-plugins.ts`).

## Build

```
esbuild plugins/<name>/src/index.ts --bundle --format=iife --target=es2023 --outfile=<name>.js \
  --banner:js="// @description ...\n// @version ...\n// @author ..."
```

(The `// @` header lines at the top of each `.ts` are the banner.)

## Known limits

- **message-click-actions**: the double-click relies on Sunbird's `rowDoubleTap`, measured on Phoenix
  build 2233. On older builds a double-click just selects text. "Delete now" (right-click menu) doesn't
  depend on it.
- **questify** (1.1.0): empties quest lists in every `GET` whose path includes `quest` and drops live
  quest events. The sidebar "Quests" entry is drawn natively and can't be removed on desktop. Turn on
  "Log quest requests" to see which quest calls Phoenix makes.
- **i-love-spam**: clears `1 << 20` from `author.public_flags` / `author.flags` on MESSAGE_CREATE,
  MESSAGE_UPDATE and message history. Untested against a real flagged account.
- **disable-call-idle** (beta): holds the last person's leave in a DM call and replays it via
  `phoenix.enqueue` when you leave. Doesn't help with calls nobody answered.
