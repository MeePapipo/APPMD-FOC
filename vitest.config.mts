import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirrors the "@/*" path mapping in tsconfig.json. Without it, tests can only
// import modules they also vi.mock(), because a mocked specifier is never
// actually resolved — which quietly limited what these tests could cover.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
