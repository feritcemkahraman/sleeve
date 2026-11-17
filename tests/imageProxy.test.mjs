import { test } from "node:test";
import assert from "node:assert/strict";
import { imageProxy } from "../server/imageProxy.js";

test("Vite rewrites only its own browser origin when proxying image imports", () => {
  let proxyRequest;
  imageProxy.configure({
    on(event, callback) {
      assert.equal(event, "proxyReq");
      proxyRequest = callback;
    },
  });
  const rewrite = (origin, host) => {
    const headers = {};
    proxyRequest(
      {
        setHeader: (key, value) => {
          headers[key] = value;
        },
      },
      { headers: { origin, host } },
    );
    return headers.Origin;
  };
  assert.equal(imageProxy.changeOrigin, true);
  assert.equal(
    rewrite("http://localhost:5173", "localhost:5173"),
    imageProxy.target,
  );
  assert.equal(
    rewrite("http://127.0.0.1:5173", "127.0.0.1:5173"),
    imageProxy.target,
  );
  assert.equal(rewrite("https://other-site.net", "localhost:5173"), undefined);
  assert.equal(rewrite("http://localhost:5174", "localhost:5173"), undefined);
  assert.equal(rewrite(undefined, "localhost:5173"), undefined);
});
