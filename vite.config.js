var _a;
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
// CampusIQ is intended to be hosted as a static SPA on GitHub Pages.
// GitHub Pages serves a project at /<repo-name>/, so `base` should be set to
// that repo path in production. HashRouter (see src/app/router) sidesteps
// the GitHub Pages deep-link/refresh problem without needing a custom 404
// rewrite trick, so `base` mainly matters for asset URLs.
export default defineConfig({
    plugins: [react()],
    base: (_a = process.env.VITE_BASE_PATH) !== null && _a !== void 0 ? _a : "/",
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 5173,
    },
    build: {
        outDir: "dist",
        sourcemap: true,
    },
});
