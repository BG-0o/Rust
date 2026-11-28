# Sunbird-Rust plugin sources

TypeScript sources, laid out like Sunbird's own repo: `plugins/<name>/manifest.ts` (description,
version, author and **permissions**) and `plugins/<name>/src/index.ts`. The `.js` files are these
bundled as IIFEs with the manifest written as the `// @` banner (Sunbird only installs bundles).

Sunbird gives a plugin only what its banner declares. Since 27 Nov 2026 (evening) that's one
`// @permissions` line with up to five grants (`gateway`, `discord`, `http`, `messages`, `hooks`),
taken from `manifest.ts`. Builds from earlier that day read per-route lines instead (`@gateway`,
`@gateway-send`, `@discord`, `@stores`, `@messages`, `@ui-tree`), kept in
`plugins/_lib/legacy-permissions.json`. Each runtime ignores the other's lines, so the bundles carry
both and load on either.

## API types

They're typed against Sunbird's `phoenix` API: `crates/runtime/phoenix.d.ts` in the Sunbird repo.
To type-check, copy the `plugins/` folders into a Sunbird checkout and run `tsc -p plugins/tsconfig.json`
(or bundle with `node web/tools/bundle-plugins.ts`).

## Build

Copy `plugins/` into a Sunbird checkout and run `node web/tools/bundle-plugins.ts`, or use
`build.mjs` here (writes both permission formats): `node build.mjs <outdir> <plugin names…>`.

## Known limits

- **message-click-actions**: the double-click relies on Sunbird's `rowDoubleTap`, measured on Phoenix
  build 2233. On older builds a double-click just selects text. "Delete now" (right-click menu) doesn't
  depend on it.
- **questify** (1.1.0): empties quest lists in every `GET` whose path includes `quest` and drops live
  quest events. The sidebar "Quests" entry is drawn natively and can't be removed on desktop. Turn on
  "Log quest requests" to see which quest calls Phoenix makes.
- **i-love-spam**: clears `1 << 20` from `author.public_flags` / `author.flags` on MESSAGE_CREATE,
  MESSAGE_UPDATE and message history. Untested against a real flagged account.
- **disable-call-idle** was removed: Sunbird now ships an official one built on
  `phoenix.ui.disableCallIdle`.

## Chat commands (`plugins/_lib/src/commands.ts`)

Sunbird's "Edit" box for text/number settings doesn't open on some Phoenix builds, so the plugins with
text, number or list settings also take them from chat. A value set this way wins over the settings
page until it's cleared, and is kept in the plugin's storage. The message itself isn't sent.

| Plugin | Command |
|---|---|
| custom-rpc | `!rpc name/line1/line2/url/app <value>` |
| ignore-activities | `!hideact add/remove/set/clear <names>` |
| auto-dnd | `!dnd add/remove <games>` |
| anonymous-files | `!anon name <text>`, `!anon length <n>` |
| keyword-notify | `!kw add/remove <words>`, `!kw channels add <ids>` |
| voice-join-messages | `!vc list add <ids>`, `!vc ignore add <ids>` |
| ignore-calls | `!calls add/remove <ids>` |
| blur-nsfw | `!nsfw add/remove <channel ids>` |
| send-timestamps | `!ts offset <hours>` |
| streaks | `!streak min <days>`, `!streak offset <hours>` |

`!<cmd>` alone shows the current values, `!<cmd> help` lists the fields, `<field> clear` (text/number) or
`<field> reset` (list) goes back to the settings page value.

## Retries (`plugins/_lib/src/once.ts`)

When a plugin cancels a send, Phoenix takes it for a network failure and retries the same message, so
a `!command` ran twice (e.g. `!game` hid then showed the game). Each command now acts once per
channel and text within 20 seconds; the retries are still cancelled.

## Replies (`plugins/_lib/src/say.ts`)

Pop-ups again (Sunbird fixed its overlay); before that this also posted a local message.
