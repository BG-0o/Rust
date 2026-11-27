export default {
   description: "Renames the files you upload",
   version: "1.2.0",
   author: "fawn · Rust by BG_0o",
   permissions: {
      discord: ["POST /channels/*/messages"],
      messages: true,
   },
} satisfies Phoenix.Manifest;
