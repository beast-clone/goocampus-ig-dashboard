import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests only, and deliberately so. Everything under tests/unit is a pure
// function with no network, no database and no clock of its own — every test
// that cares about time passes the instant in. That keeps `npm test` fast and,
// more importantly, trustworthy: a suite that fails because the office wifi
// blinked teaches people to ignore red.
//
// Route and browser coverage are a separate job and need a different runner.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // No test may reach the network. If one tries, it should fail loudly rather
    // than quietly depend on something outside the repo.
    testTimeout: 5_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
