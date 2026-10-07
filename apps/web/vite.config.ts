import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// BASE_PATH is set by CI for GitHub Pages project sites, e.g. "/sharing-app/".
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  server: { port: 5173 },
  // The lazily loaded chat page (assistant-ui + markdown) is the largest chunk.
  build: { chunkSizeWarningLimit: 600 },
});
