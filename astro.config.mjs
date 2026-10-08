// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://oscen.ai",
  // /first is a campaign alias of /support (canonical), so it stays out of the sitemap.
  integrations: [sitemap({ filter: (page) => !/\/first\/?$/.test(page) })],
  vite: {
    plugins: [tailwindcss()],
  },
});
