import test from "node:test";
import assert from "node:assert/strict";
import { injectionFlagged } from "../src/clocked/client.js";

test("injectionFlagged returns false for a benign Guard response", () => {
  // Exact shape returned by the Clocked Guard for the sample EDI content.
  const result = {
    endpoint: "injection",
    response: {
      injection: 0.0022311616210136664,
      verdict: "benign",
      threshold: 0.5,
      category: "benign",
      severity: "none",
    },
    roundTripMs: 1706,
  };

  assert.equal(injectionFlagged(result), false);
});

test("injectionFlagged flags a non-benign verdict even with severity none", () => {
  // Old logic returned false here (false negative): non-benign verdict was
  // gated on severity !== "none".
  const result = {
    response: {
      injection: 0.01,
      verdict: "instruction override",
      threshold: 0.5,
      severity: "none",
    },
  };

  assert.equal(injectionFlagged(result), true);
});

test("injectionFlagged flags any non-benign verdict", () => {
  for (const verdict of ["malicious", "jailbreak", "BENIGN ", "Benign"]) {
    const benignish = verdict.toLowerCase().trim() === "benign";
    const result = { response: { verdict, severity: "high" } };
    assert.equal(
      injectionFlagged(result),
      !benignish,
      `verdict ${JSON.stringify(verdict)} should be ${benignish ? "not " : ""}flagged`
    );
  }
});

test("injectionFlagged flags when injection score meets or exceeds threshold", () => {
  // Verdict string is benign/ambiguous, but the score crosses the threshold.
  assert.equal(
    injectionFlagged({
      response: { verdict: "benign", injection: 0.5, threshold: 0.5 },
    }),
    true
  );
  assert.equal(
    injectionFlagged({
      response: { verdict: "benign", injection: 0.8, threshold: 0.5 },
    }),
    true
  );
  assert.equal(
    injectionFlagged({
      response: { verdict: "benign", injection: 0.49, threshold: 0.5 },
    }),
    false
  );
});

test("injectionFlagged honors explicit boolean flags (flat and nested shapes)", () => {
  assert.equal(injectionFlagged({ flagged: true }), true);
  assert.equal(injectionFlagged({ is_injection: true }), true);
  assert.equal(injectionFlagged({ injection_detected: true }), true);
  assert.equal(injectionFlagged({ blocked: true }), true);
  assert.equal(injectionFlagged({ flagged: false }), false);
  assert.equal(
    injectionFlagged({ response: { flagged: true, verdict: "benign" } }),
    true
  );
});

test("injectionFlagged handles the mock response shape", () => {
  assert.equal(
    injectionFlagged({
      status: "mock",
      flagged: false,
      risk: "unknown",
      message: "Mock mode: no injection scan was performed.",
    }),
    false
  );
});

test("injectionFlagged returns false for empty or unknown shapes", () => {
  assert.equal(injectionFlagged(undefined), false);
  assert.equal(injectionFlagged(null), false);
  assert.equal(injectionFlagged({}), false);
  assert.equal(injectionFlagged({ response: {} }), false);
  assert.equal(injectionFlagged({ response: { verdict: "", severity: "high" } }), false);
});
