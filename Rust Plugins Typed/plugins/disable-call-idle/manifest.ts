export default {
   description: "Don't get dropped from DM calls or moved to AFK · Desktop · beta",
   version: "0.11.0",
   author: "Nuckyz · Rust by BG_0o",
   permissions: {
      gateway: ["ready", "guildCreate", "guildUpdate", "initialGuild", "voiceStateUpdate", "callCreate", "callUpdate"],
      gatewaySend: [4],
      discord: ["GET /users/@me"],
      stores: true,
      messages: true,
   },
} satisfies Phoenix.Manifest;
