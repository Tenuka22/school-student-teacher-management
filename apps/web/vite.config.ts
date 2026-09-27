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
  optimizeDeps: {
    // `@base-ui/utils`'s store hook imports these two CJS subpaths
    // (`use-sync-external-store/shim` and `.../shim/with-selector`) as named
    // ESM exports. Left out of the pre-bundle, Vite can serve the raw CJS
    // file straight from `node_modules` via `/@fs/` the first time a route
    // reaches it — before the dependency scanner has discovered and
    // re-optimized it — which throws "does not provide an export named
    // useSyncExternalStoreWithSelector" instead of self-healing. Listing both
    // subpaths here forces them into the initial pre-bundle every time, so
    // the CJS-to-ESM interop always runs before either is imported.
    include: [
      "use-sync-external-store/shim",
      "use-sync-external-store/shim/with-selector",
    ],
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
