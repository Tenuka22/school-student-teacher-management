import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { varlockVitePlugin } from "@varlock/vite-integration";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3001,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    varlockVitePlugin({ ssrInjectMode: "auto-load" }),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: "node-server",
      // `serverDir` is where Nitro scans for tasks; nothing is scanned without
      // it, so the scheduled sweep below would silently never run.
      serverDir: "./server",
      experimental: {
        tasks: true,
      },
      tasks: {
        "accounts:purge-unverified": {
          description:
            "Delete unverified accounts older than the retention window",
        },
      },
      // 04:10 every day. An off-minute slot on purpose: nothing else in this
      // project is scheduled, and a sweep that lands on the hour is the one
      // most likely to collide with a deploy or a backup.
      scheduledTasks: {
        "10 4 * * *": ["accounts:purge-unverified"],
      },
    }),
    viteReact(),
  ],
});
