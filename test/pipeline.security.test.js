import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ClockedError } from "../src/clocked/client.js";
import { env } from "../src/config/env.js";

// Force fail-closed live mode deterministically (independent of repo .env and of
// concurrent test files mutating process.env) so the blocked security paths below
// are exercised reliably.
env.clockedMode = "live";
env.clockedFailClosed = true;

const sample = name => readFile(new URL(`../examples/${name}`, import.meta.url), "utf8");
const { EdiPipeline } = await import("../src/services/pipeline.js");

test("blocked injection returns a detailed, user-understandable response", async () => {
  const injection = { status: "ok", flagged: true, risk: "high", message: "Prompt injection detected" };
  const client = {
    request: async (operation) => {
      if (operation === "pii") return { status: "ok", detected: false, redacted_text: "" };
      if (operation === "injection") return injection;
      return {};
    },
  };
  const result = await new EdiPipeline(client).process(await sample("sample-810.edi"), { requestId: "t-blocked-injection" });

  assert.equal(result.status, "blocked_injection");
  assert.equal(result.blocked, true);
  assert.equal(result.security.blocked, true);
  assert.equal(result.security.blockedReason, "injection_guard_flagged");
  assert.equal(result.security.blockedAt, "injection");
  assert.ok(typeof result.security.reason === "string" && result.security.reason.length > 0);
  assert.ok(result.security.reason.includes("injection guard"));
  assert.equal(result.security.detail.flagged, true);
  assert.equal(result.security.detail.risk, "high");
  assert.equal(result.security.detail.message, "Prompt injection detected");
  assert.equal(result.clocked.extract, undefined);
  assert.equal(result.clocked.decide, undefined);

  // Raw EDI text and API secrets must never be leaked in a blocked response.
  const payload = JSON.stringify(result);
  assert.ok(!payload.includes("ISA*00*"));
  assert.ok(!payload.includes("BIG*20261031"));
});

test("security check failure at the pii stage returns a detailed blocked response", async () => {
  const client = {
    request: async () => { throw new ClockedError("PII service unavailable", 503, {}); },
  };
  const result = await new EdiPipeline(client).process(await sample("sample-810.edi"), { requestId: "t-sec-fail-pii" });

  assert.equal(result.status, "security_check_failed");
  assert.equal(result.blocked, true);
  assert.equal(result.security.blockedReason, "security_check_failed");
  assert.equal(result.security.blockedAt, "pii");
  assert.ok(typeof result.security.reason === "string" && result.security.reason.includes("fail-closed"));
  assert.equal(result.security.error.message, "PII service unavailable");
  assert.equal(result.security.error.status, 503);
  assert.equal(result.error.message, "PII service unavailable");
  assert.equal(result.error.status, 503);
  assert.equal(result.error.retryable, true);
});

test("security check failure at the injection stage records the failing stage", async () => {
  const client = {
    request: async (operation) => {
      if (operation === "pii") return { status: "ok", detected: false, redacted_text: "" };
      throw new ClockedError("injection endpoint errored", 500, {});
    },
  };
  const result = await new EdiPipeline(client).process(await sample("sample-810.edi"), { requestId: "t-sec-fail-injection" });

  assert.equal(result.status, "security_check_failed");
  assert.equal(result.blocked, true);
  assert.equal(result.security.blockedAt, "injection");
  assert.equal(result.security.error.message, "injection endpoint errored");
  assert.equal(result.security.error.status, 500);
  assert.equal(result.error.retryable, true);
});

test("security check failure with 409 conflict at the injection stage is non-retryable", async () => {
  const client = {
    request: async (operation) => {
      if (operation === "pii") return { status: "ok", detected: false, redacted_text: "" };
      throw new ClockedError("Clocked injection failed (409)", 409, {});
    },
  };
  const result = await new EdiPipeline(client).process(await sample("sample-810.edi"), { requestId: "t-sec-fail-injection-409" });

  assert.equal(result.status, "security_check_failed");
  assert.equal(result.blocked, true);
  assert.equal(result.security.blockedReason, "security_check_failed");
  assert.equal(result.security.blockedAt, "injection");
  assert.equal(result.security.error.message, "Clocked injection failed (409)");
  assert.equal(result.security.error.status, 409);
  assert.equal(result.error.status, 409);
  // 409 Conflict is not retryable (only network, 429, and >=500 are retried).
  assert.equal(result.error.retryable, false);
});

test("client error without http status is reported with null status", async () => {
  const client = {
    request: async () => { throw new Error("network down"); },
  };
  const result = await new EdiPipeline(client).process(await sample("sample-810.edi"), { requestId: "t-sec-fail-no-status" });

  assert.equal(result.status, "security_check_failed");
  assert.equal(result.blocked, true);
  assert.equal(result.security.error.status, null);
  assert.equal(result.error.message, "network down");
  // Status-less (network/abort) errors are treated as retryable, matching the client's retry policy.
  assert.equal(result.error.retryable, true);
});

test("client errors with a non-retryable http status are reported as not retryable", async () => {
  const client = {
    request: async () => { throw new ClockedError("unauthorized clocked key", 401, {}); },
  };
  const result = await new EdiPipeline(client).process(await sample("sample-810.edi"), { requestId: "t-sec-fail-401" });

  assert.equal(result.status, "security_check_failed");
  assert.equal(result.blocked, true);
  assert.equal(result.security.error.status, 401);
  assert.equal(result.error.retryable, false);
});