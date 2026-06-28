import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function requestLogger(): Plugin {
  return {
    name: "request-logger",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const start = Date.now();
        const originalEnd = res.end.bind(res);

        res.end = function (...args: any[]) {
          const duration = Date.now() - start;
          const method = req.method || "?";
          const url = req.url || "/";
          const status = res.statusCode || 0;
          const color = status >= 400 ? "\x1b[31m" : status >= 300 ? "\x1b[33m" : "\x1b[32m";
          console.log(`${color}${method}\x1b[0m ${url} \x1b[2m${status}\x1b[0m ${color}${duration}ms\x1b[0m`);
          return originalEnd(...args);
        };
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    requestLogger(),
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
