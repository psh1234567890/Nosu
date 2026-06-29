import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiHost = process.env.API_HOST ?? "127.0.0.1";
const apiPort = process.env.API_PORT ?? "4000";
const apiTarget = `http://${apiHost}:${apiPort}`;

export default defineConfig({
  plugins: [react],
  server: {
    proxy: {
      "/api": apiTarget,
      "/socket.io": {
        target: apiTarget,
        ws: true,
      },
    },
  },
});
