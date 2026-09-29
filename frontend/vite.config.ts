/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// No dev proxy on purpose: the browser calls the API directly, so a working
// login proves the backend's CORS configuration is correct.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"], testTimeout: 30000 },
});
