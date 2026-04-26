
/// <reference types="vitest" />

import { defineConfig } from "vite";
import { vitestSetupFilePath, getClarinetVitestsArgv } from "@stacks/clarinet-sdk/vitest";

export default defineConfig({
  test: {
    environment: "clarinet", // use vitest-environment-clarinet
    pool: "forks",
    poolOptions: {
      threads: { singleThread: true },
      forks: { singleFork: true },
    },
    setupFiles: [
      vitestSetupFilePath,
      // custom setup files can be added here
    ],
    environmentOptions: {
      clarinet: {
        ...getClarinetVitestsArgv(),
        // add or override options
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json"],
      reportsDirectory: "./coverage",
      // Clarity contracts are not instrumented by V8; collect coverage from TypeScript test/runtime files.
      include: ["tests/**/*.ts"],
      // Override Vitest defaults that exclude test files, otherwise lcov stays empty.
      exclude: ["node_modules/**", "coverage/**"],
    },
  },
});