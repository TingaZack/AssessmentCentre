import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "conditional-coep",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // ONLY apply strict headers to the sandbox route
          if (req.url && req.url.startsWith("/sandbox")) {
            res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
            res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
          }
          next();
        });
      },
    },
  ],
});

// import { defineConfig, type Plugin } from "vite";
// import react from "@vitejs/plugin-react";
// import { resolve } from "path";

// function scopedIsolationHeaders(matchPaths: string[]): Plugin {
//   return {
//     name: "scoped-isolation-headers",
//     configureServer(server) {
//       server.middlewares.use((req, res, next) => {
//         if (matchPaths.some((p) => (req.url || "").startsWith(p))) {
//           // Apply strict WebContainer headers ONLY to the sandbox
//           res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
//           res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
//         }
//         next();
//       });
//     },
//   };
// }

// export default defineConfig({
//   plugins: [react(), scopedIsolationHeaders(["/sandbox.html"])],
//   build: {
//     rollupOptions: {
//       input: {
//         main: resolve(__dirname, "index.html"),
//         sandbox: resolve(__dirname, "sandbox.html"),
//       },
//     },
//   },
// });

// // import { defineConfig } from "vite";
// // import react from "@vitejs/plugin-react";

// // // https://vite.dev/config/
// // export default defineConfig({
// //   plugins: [react()],
// //   server: {
// //     headers: {
// //       "Cross-Origin-Opener-Policy": "same-origin",
// //       "Cross-Origin-Embedder-Policy": "credentialless",
// //       // "Cross-Origin-Embedder-Policy": "require-corp",
// //     },
// //   },
// // });
