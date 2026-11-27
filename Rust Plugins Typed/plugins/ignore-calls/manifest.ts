export default {
   description: "Calls from people you choose don't ring",
   version: "1.3.0",
   author: "TheArmagan, thororen · Rust by BG_0o",
   permissions: {
      gateway: ["callCreate", "callUpdate", "messageCreate"],
      discord: ["GET /users/@me"],
      messages: true,
   },
} satisfies Phoenix.Manifest;
