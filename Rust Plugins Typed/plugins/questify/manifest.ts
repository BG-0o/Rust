export default {
   description: "Hides Discord Quests",
   version: "1.2.0",
   author: "Equicord · Rust by BG_0o",
   permissions: {
      gateway: ["questsUserStatusUpdate", "questsNewQuests", "questsUserCompletionUpdate"],
      discord: ["GET /quests", "GET /quests/**", "GET /users/@me/quests/**"],
   },
} satisfies Phoenix.Manifest;
