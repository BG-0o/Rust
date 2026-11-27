export default {
   description: "Show or hide the game you're playing on your status · Desktop",
   version: "1.2.0",
   author: "Nuckyz, RuukuLada · Rust by BG_0o",
   permissions: {
      gatewaySend: [3],
      discord: ["PATCH /users/@me/settings-proto/1"],
      messages: true,
   },
} satisfies Phoenix.Manifest;
