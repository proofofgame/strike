
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
      include: ["contracts/**"],
    },
  },
});