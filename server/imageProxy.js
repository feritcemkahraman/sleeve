const WORKER_ORIGIN = "http://127.0.0.1:8787";

// The browser talks to Vite on its own origin. Normalize that origin only at
// this local proxy boundary; the deployed Worker keeps its strict origin check.
export const imageProxy = {
  target: WORKER_ORIGIN,
  changeOrigin: true,
  configure(proxy) {
    proxy.on("proxyReq", (upstream, request) => {
      if (request.headers.origin === `http://${request.headers.host}`)
        upstream.setHeader("Origin", WORKER_ORIGIN);
    });
  },
};
