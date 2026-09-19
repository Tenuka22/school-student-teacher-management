import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";
import vitest from "ultracite/oxlint/vitest";
import tanstackJsPlugins from "ultracite/oxlint/tanstack/js-plugins";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";

const jsPlugins = selectJsPlugins(["react-doctor"]);

export default defineConfig({
  extends: [core, react, tanstack, vitest, tanstackJsPlugins, jsPlugins],
  ignorePatterns: core.ignorePatterns,
  jsPlugins: jsPlugins.jsPlugins,
  settings: jsPluginSettings,
});
