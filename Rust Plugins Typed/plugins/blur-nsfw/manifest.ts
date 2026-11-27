export default {
   description: "Hides images and videos in NSFW channels behind a spoiler",
   version: "1.2.0",
   author: "Vendicated · Rust by BG_0o",
   permissions: {
      gateway: ["ready", "guildCreate", "initialGuild", "channelCreate", "channelUpdate", "threadCreate", "threadUpdate", "messageCreate", "messageUpdate"],
      discord: ["GET /channels/*", "GET /channels/*/messages"],
      stores: true,
      messages: true,
   },
} satisfies Phoenix.Manifest;
