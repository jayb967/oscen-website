// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://oscen.ai",
  // Pages build as folders (team/index.html), so the canonical URL ends in a slash.
  // Links use the slash form too, which avoids a 301 hop on every click.
  trailingSlash: "always",
  // Kept out of the sitemap: /first (campaign alias of /support, canonical),
  // /investor-pitch/* (confidential deck, robots-disallowed) and /dev/* (internal
  // noindex harness pages, not linked from anywhere).
  integrations: [
    sitemap({
      filter: (page) =>
        !/\/first\/?$/.test(page) && !/\/(investor-pitch|dev)(\/|$)/.test(new URL(page).pathname),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
