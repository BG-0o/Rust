export default {
   description: "Send messages without notifying anyone, like @silent",
   version: "1.2.0",
   author: "Nuckyz, CatNoir · Rust by BG_0o",
   permissions: {
      discord: ["POST /channels/*/messages"],
      messages: true,
   },
} satisfies Phoenix.Manifest;
