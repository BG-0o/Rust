export default {
   description: "Shows messages from accounts flagged as \"likely spammer\"",
   version: "1.1.0",
   author: "Ven, Nuckyz · Rust by BG_0o",
   permissions: {
      gateway: ["messageCreate", "messageUpdate"],
      discord: ["GET /channels/*/messages"],
   },
} satisfies Phoenix.Manifest;
