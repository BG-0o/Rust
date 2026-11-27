export default {
   description: "Alerts you when you're unfriended or removed from a server/group",
   version: "1.1.0",
   author: "nick · Rust by BG_0o",
   permissions: {
      gateway: ["ready", "guildCreate", "guildUpdate", "channelCreate", "channelUpdate", "relationshipAdd", "relationshipUpdate", "relationshipRemove", "guildDelete", "channelRecipientRemove"],
      discord: ["GET /users/@me", "DELETE /users/@me/relationships/*", "PUT /users/@me/relationships/*", "DELETE /users/@me/guilds/*", "DELETE /channels/*"],
      stores: true,
   },
} satisfies Phoenix.Manifest;
