export default {
   description: "Notifies you when someone writes a word you chose",
   version: "1.3.0",
   author: "Equicord · Rust by BG_0o",
   permissions: {
      gateway: ["ready", "guildCreate", "messageCreate"],
      discord: ["GET /users/@me"],
      messages: true,
   },
} satisfies Phoenix.Manifest;
