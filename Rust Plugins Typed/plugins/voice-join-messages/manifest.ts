export default {
   description: "Notifies you when a friend joins a server voice channel",
   version: "1.3.0",
   author: "Equicord · Rust by BG_0o",
   permissions: {
      gateway: ["ready", "guildCreate", "guildUpdate", "relationshipAdd", "relationshipUpdate", "relationshipRemove", "channelCreate", "channelUpdate", "voiceStateUpdate"],
      discord: ["GET /users/@me"],
      messages: true,
   },
} satisfies Phoenix.Manifest;
