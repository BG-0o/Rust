export default {
   description: "Marks every server as read at once",
   version: "1.2.0",
   author: "kemo · Rust by BG_0o",
   permissions: {
      gateway: ["ready", "guildCreate", "guildDelete"],
      discord: ["POST /guilds/*/ack"],
      stores: true,
      messages: true,
   },
} satisfies Phoenix.Manifest;
