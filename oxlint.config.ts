import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";
import tanstackJsPlugins from "ultracite/oxlint/tanstack/js-plugins";
import vitest from "ultracite/oxlint/vitest";

const jsPlugins = selectJsPlugins(["react-doctor"]);

export default defineConfig({
  extends: [core, react, tanstack, vitest, tanstackJsPlugins, jsPlugins],
  ignorePatterns: [...core.ignorePatterns, "packages/ui/**"],
  jsPlugins: jsPlugins.jsPlugins,
  settings: jsPluginSettings,
});
