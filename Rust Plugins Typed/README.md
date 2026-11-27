# Sunbird-Rust plugin sources

TypeScript sources, laid out like Sunbird's own repo: `plugins/<name>/manifest.ts` (description,
version, author and **permissions**) and `plugins/<name>/src/index.ts`. The `.js` files are these
bundled as IIFEs with the manifest written as the `// @` banner (Sunbird only installs bundles).

Since Sunbird 0.1.1 a plugin only gets what its banner declares (`@gateway`, `@gateway-send`,
`@discord`, `@stores`, `@messages`, `@ui-tree`); anything else is missing or refused. Each
`manifest.ts` lists exactly what that plugin uses.

## API types

They're typed against Sunbird's `phoenix` API: `crates/runtime/phoenix.d.ts` in the Sunbird repo.
To type-check, copy the `plugins/` folders into a Sunbird checkout and run `tsc -p plugins/tsconfig.json`
(or bundle with `node web/tools/bundle-plugins.ts`).

## Build

Copy `plugins/` into a Sunbird checkout and run `node web/tools/bundle-plugins.ts`, or use
`build.mjs` here (same banner): `node build.mjs <outdir> <plugin names…>`.

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

## Replies (`plugins/_lib/src/say.ts`)

On Phoenix builds where Sunbird's overlay doesn't draw (the same one the "Edit" box uses), pop-ups
(`phoenix.ui.toast` / `notify`) are invisible. Commands, menu actions and a few alerts therefore also
answer with a message only you see (`phoenix.messages.addLocal`) in the channel you used them in.
keyword-notify's "Mark in chat" and voice-join-messages' "Both" are on by default for the same reason.
