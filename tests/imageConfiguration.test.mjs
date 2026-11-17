import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";
import { validateImageConfiguration } from "../worker/configuration.ts";

function environment() {
  return {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    SUPABASE_SERVICE_ROLE_KEY: "server-key",
    IMAGES: {},
    IMAGE_IMPORT_LIMITER: {},
  };
}

test("configuration rejects malformed runtime settings without including secret values", () => {
  validateImageConfiguration(environment());
  for (const url of [
    "SUPABASE_URL=https://project.supabase.co",
    '"https://project.supabase.co"',
    "https://project.supabase.co/rest/v1",
    "https://user:password@project.supabase.co",
    "https://project.supabase.co?token=private",
  ]) {
    assert.throws(
      () => validateImageConfiguration({ ...environment(), SUPABASE_URL: url }),
      (error) =>
        error.status === 503 &&
        error.message.includes("SUPABASE_URL") &&
        !error.message.includes("private"),
    );
  }
  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    assert.throws(
      () => validateImageConfiguration({ ...environment(), [name]: "" }),
      new RegExp(name),
    );
    assert.throws(
      () =>
        validateImageConfiguration({
          ...environment(),
          [name]: "secret-with\nnewline",
        }),
      (error) => error.status === 503 && !error.message.includes("secret-with"),
    );
  }
  assert.throws(
    () =>
      validateImageConfiguration({
        ...environment(),
        IMAGE_IMPORT_LIMITER: undefined,
      }),
    /IMAGE_IMPORT_LIMITER/,
  );
});

test("an authentication transport failure identifies the stage without exposing exception text", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.error;
  const logs = [];
  globalThis.fetch = async () => {
    throw new TypeError("Invalid setting: PRIVATE-CREDENTIAL");
  };
  console.error = (...args) => logs.push(args);
  try {
    const response = await worker.fetch(
      new Request("https://sleeve.net/api/images/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid-token",
        },
        body: "{}",
      }),
      environment(),
    );
    assert.equal(response.status, 502);
    const result = await response.json();
    assert.match(result.error, /Could not contact Supabase Auth/);
    assert.doesNotMatch(JSON.stringify({ result, logs }), /PRIVATE-CREDENTIAL/);
    assert.equal(logs[0][1].stage, "authentication");
    assert.equal(logs[0][1].name, "TypeError");
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalLog;
  }
});
