import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseX12 } from "../src/edi/parser.js";
import { normalizeTransaction } from "../src/adapters/index.js";
const sample = name => readFile(new URL(`../examples/${name}`, import.meta.url), "utf8");

test("parses 810 invoice header and IT1 line", async () => {
  const d = parseX12(await sample("sample-810.edi"));
  const n = normalizeTransaction(d);
  assert.equal(n.invoice.number, "INV-10025");
  assert.equal(n.invoice.purchaseOrderNumber, "PO-50021");
  assert.equal(n.lineItems[0].quantity, "10");
  assert.equal(n.totals.invoiceTotal, "1500.00");
  // The sample is now a structurally valid 810 (ISA/GS/GE/IEA envelopes,
  // required BIG/TDS segments, and matching ST/SE segment count), so no issues.
  assert.equal(d.issues.length, 0);
});

test("maps 850 parties and PO1", async () => {
  const n = normalizeTransaction(parseX12(await sample("sample-850.edi")));
  assert.equal(n.purchaseOrder.number, "PO-50021");
  assert.equal(n.buyer.name, "ABC CORPORATION");
  assert.equal(n.shipTo.name, "ABC WAREHOUSE");
  assert.equal(n.lineItems[0].productIds[0].value, "PROD-100");
});

test("maps 856 HL parent-child hierarchy", async () => {
  const n = normalizeTransaction(parseX12(await sample("sample-856.edi")));
  assert.equal(n.shipment.shipmentId, "SHIP-9001");
  assert.equal(n.hierarchy[0].children[0].children[0].children[0].levelCode, "I");
});

test("maps 820 payment and invoice reference", async () => {
  const n = normalizeTransaction(parseX12(await sample("sample-820.edi")));
  assert.equal(n.remittances[0].invoiceReference, "INV-10025");
});

test("runs full pipeline in mock mode", async () => {
    // Force mock mode deterministically regardless of repo .env (CLOCKED_MODE=live).
  process.env.CLOCKED_MODE = 'mock';
  process.env.CLOCKED_FAIL_CLOSED = 'false';
  const { EdiPipeline } = await import("../src/services/pipeline.js");
  const { env } = await import("../src/config/env.js");
  env.clockedMode = 'mock';
  env.clockedFailClosed = false;
  const result = await new EdiPipeline().process(await sample("sample-810.edi"), { requestId:"test-request-810" });
  assert.equal(result.transactionType, "810");
  assert.equal(result.security.blocked, false);
  assert.ok(result.clocked.extract);
  assert.ok(result.clocked.decide);
});


test("validateInterchangeEnvelope: ISA/IEA control number match", async () => {
  const { validateInterchangeEnvelope } = await import("../src/edi/validation.js");
  const segments = [
    { name: "ISA", elements: ["00", "", "00", "", "ZZ", "SENDER   ", "ZZ", "RECEIVER ", "261031", "0930", "*", "00501", "CTRLNUM1", "0", "P", ">"] },
    { name: "IEA", elements: ["0", "CTRLNUM1"] },
  ];
  const issues = validateInterchangeEnvelope(segments);
  assert.equal(issues.length, 0);
});

test("validateInterchangeEnvelope: ISA/IEA control number mismatch", async () => {
  const { validateInterchangeEnvelope } = await import("../src/edi/validation.js");
  const segments = [
    { name: "ISA", elements: ["00", "", "00", "", "ZZ", "SENDER   ", "ZZ", "RECEIVER ", "261031", "0930", "*", "00501", "CTRLNUM1", "0", "P", ">"] },
    { name: "IEA", elements: ["0", "CTRLNUM2"] },
  ];
  const issues = validateInterchangeEnvelope(segments);
  assert.ok(issues.some(x => x.includes("ISA/IEA control number mismatch")));
});

test("validateInterchangeEnvelope: missing IEA trailer", async () => {
  const { validateInterchangeEnvelope } = await import("../src/edi/validation.js");
  const segments = [
    { name: "ISA", elements: ["00", "", "00", "", "ZZ", "SENDER   ", "ZZ", "RECEIVER ", "261031", "0930", "*", "00501", "CTRLNUM1", "0", "P", ">"] },
  ];
  const issues = validateInterchangeEnvelope(segments);
  assert.ok(issues.some(x => x.includes("Missing IEA interchange trailer")));
});


test("validateFunctionalGroupEnvelope: GS/GE control number match", async () => {
  const { validateFunctionalGroupEnvelope } = await import("../src/edi/validation.js");
  const segments = [
    { name: "GS", elements: ["IN", "SENDER   ", "RECEIVER ", "20261031", "0930", "GRPCTRL1", "X", "005010"] },
    { name: "GE", elements: ["0", "GRPCTRL1"] },
  ];
  const issues = validateFunctionalGroupEnvelope(segments);
  assert.equal(issues.length, 0);
});

test("validateFunctionalGroupEnvelope: GS/GE control number mismatch", async () => {
  const { validateFunctionalGroupEnvelope } = await import("../src/edi/validation.js");
  const segments = [
    { name: "GS", elements: ["IN", "SENDER   ", "RECEIVER ", "20261031", "0930", "GRPCTRL1", "X", "005010"] },
    { name: "GE", elements: ["0", "GRPCTRL2"] },
  ];
  const issues = validateFunctionalGroupEnvelope(segments);
  assert.ok(issues.some(x => x.includes("GS/GE control number mismatch")));
});

test("validateFunctionalGroupEnvelope: GE transaction set count mismatch", async () => {
  const { validateFunctionalGroupEnvelope } = await import("../src/edi/validation.js");
  const segments = [
    { name: "GS", elements: ["IN", "SENDER   ", "RECEIVER ", "20261031", "0930", "GRPCTRL1", "X", "005010"] },
    { name: "GE", elements: ["5", "GRPCTRL1"] },
    { name: "ST", elements: ["810", "0001"] },
    { name: "SE", elements: ["1", "0001"] },
  ];
  const issues = validateFunctionalGroupEnvelope(segments);
  assert.ok(issues.some(x => x.includes("GE transaction set count mismatch")));
});


test("validateRequiredSegments: missing required segments for 810", async () => {
  const { validateRequiredSegments } = await import("../src/edi/validation.js");
  const segments = [
    { name: "ST", elements: ["810", "0001"] },
    { name: "SE", elements: ["2", "0001"] },
  ];
  const issues = validateRequiredSegments("810", segments);
  assert.ok(issues.some(x => x.includes("Missing required segment BIG")));
  assert.ok(issues.some(x => x.includes("Missing required segment TDS")));
});

test("validateRequiredSegments: all required segments present for 850", async () => {
  const { validateRequiredSegments } = await import("../src/edi/validation.js");
  const segments = [
    { name: "ST", elements: ["850", "0001"] },
    { name: "BEG", elements: ["00", "SA", "PO-123", "", "20261031"] },
    { name: "CTT", elements: ["1"] },
    { name: "SE", elements: ["4", "0001"] },
  ];
  const issues = validateRequiredSegments("850", segments);
  assert.equal(issues.length, 0);
});


test("validateImplementationGuide: 810 missing BIG01 date", async () => {
  const { validateImplementationGuide } = await import("../src/edi/validation.js");
  const segments = [
    { name: "BIG", elements: ["", "INV-100", "", "PO-123"] },
    { name: "TDS", elements: ["150000"] },
  ];
  const issues = validateImplementationGuide("810", segments);
  assert.ok(issues.some(x => x.includes("BIG01")));
});

test("validateImplementationGuide: 810 invalid BIG01 date format", async () => {
  const { validateImplementationGuide } = await import("../src/edi/validation.js");
  const segments = [
    { name: "BIG", elements: ["2026-10-31", "INV-100", "", "PO-123"] },
    { name: "TDS", elements: ["150000"] },
  ];
  const issues = validateImplementationGuide("810", segments);
  assert.ok(issues.some(x => x.includes("BIG01 date must be CCYYMMDD")));
});

test("validateImplementationGuide: 850 CTT line count mismatch", async () => {
  const { validateImplementationGuide } = await import("../src/edi/validation.js");
  const segments = [
    { name: "BEG", elements: ["00", "SA", "PO-123", "", "20261031"] },
    { name: "CTT", elements: ["5"] },
    { name: "PO1", elements: ["1", "10", "EA", "150.00"] },
    { name: "PO1", elements: ["2", "5", "EA", "100.00"] },
  ];
  const issues = validateImplementationGuide("850", segments);
  assert.ok(issues.some(x => x.includes("CTT01 line count")));
});

test("validateImplementationGuide: 856 HL missing parent", async () => {
  const { validateImplementationGuide } = await import("../src/edi/validation.js");
  const segments = [
    { name: "BSN", elements: ["00", "SHIP-1", "20261101", "0930", "0001"] },
    { name: "HL", elements: ["2", "", "O"] },
  ];
  const issues = validateImplementationGuide("856", segments);
  assert.ok(issues.some(x => x.includes("has no parent HL02")));
});

test("validateImplementationGuide: 820 missing RMR", async () => {
  const { validateImplementationGuide } = await import("../src/edi/validation.js");
  const segments = [
    { name: "BPR", elements: ["I", "150000", "C", "CHK"] },
  ];
  const issues = validateImplementationGuide("820", segments);
  assert.ok(issues.some(x => x.includes("At least one RMR remittance detail segment is required")));
});

test("validateDocument: combined validation returns all issue categories", async () => {
  const { validateDocument } = await import("../src/edi/validation.js");
  const doc = {
    segments: [
      { name: "ISA", elements: ["00", "", "00", "", "ZZ", "SENDER   ", "ZZ", "RECEIVER ", "261031", "0930", "*", "00501", "CTRLNUM1", "0", "P", ">"] },
      { name: "IEA", elements: ["0", "CTRLNUM2"] },
      { name: "GS", elements: ["IN", "SENDER   ", "RECEIVER ", "20261031", "0930", "GRPCTRL1", "X", "005010"] },
      { name: "ST", elements: ["810", "0001"] },
      { name: "SE", elements: ["2", "0001"] },
    ],
    envelope: { transactionCode: "810" },
  };
  const issues = validateDocument(doc);
  assert.ok(issues.some(x => x.includes("ISA/IEA control number mismatch")));
  assert.ok(issues.some(x => x.includes("Missing required segment BIG")));
  assert.ok(issues.some(x => x.includes("Missing required segment TDS")));
});
