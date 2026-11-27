export default {
   description: "🔥 Day streaks with people you DM",
   version: "1.2.0",
   author: "Equicord · Rust by BG_0o",
   permissions: {
      gateway: ["ready", "channelCreate", "channelUpdate", "messageCreate"],
      discord: ["GET /users/@me", "GET /channels/*", "GET /channels/*/messages"],
      messages: true,
   },
} satisfies Phoenix.Manifest;
