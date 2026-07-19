import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Integration tests share one PostgreSQL database and one of them
    // truncates it; parallel files would race each other's fixtures.
    fileParallelism: false,
  },
});
