export default {
   description: "Double-click to reply/edit, plus \"Delete now\" in the menu",
   version: "1.1.0",
   author: "Vendicated · Rust by BG_0o",
   permissions: {
      discord: ["DELETE /channels/*/messages/*"],
      uiTree: true,
   },
} satisfies Phoenix.Manifest;
