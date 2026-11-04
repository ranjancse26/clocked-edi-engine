/**
 * X12 structural validation layer.
 *
 * Adds ISA/IEA and GS/GE count/control validation, required-segment validation,
 * and implementation-guide (IG) constraints for the supported transaction sets
 * (850, 810, 856, 820).
 *
 * All functions return arrays of human-readable issue strings. An empty array
 * means the document passed that validation category.
 */

import { segmentValue } from './parser.js';

/* -------------------------------------------------------------------------- *
 * Element-position helpers (1-based positions after the segment identifier)
 * -------------------------------------------------------------------------- */

/** ISA elements (X12 interchange header): ISA01..ISA16 */
const ISA = {
  authInfoQualifier: 1, authInfo: 2, securityInfoQualifier: 3, securityInfo: 4,
  senderIdQualifier: 5, senderId: 6, receiverIdQualifier: 7, receiverId: 8,
  date: 9, time: 10, repetitionSeparator: 11, version: 12,
  controlNumber: 13, ackRequested: 14, usageIndicator: 15, componentSeparator: 16,
};

/** IEA elements: IEA01 number of functional groups, IEA02 interchange control number */
const IEA = { groupCount: 1, controlNumber: 2 };

/** GS elements: GS01..GS08 */
const GS = {
  functionalId: 1, appSender: 2, appReceiver: 3, date: 4, time: 5,
  controlNumber: 6, agency: 7, version: 8,
};

/** GE elements: GE01 number of transaction sets, GE02 group control number */
const GE = { transactionSetCount: 1, controlNumber: 2 };

function el(seg, pos) {
  return segmentValue(seg, pos);
}

function present(v) {
  return v != null && v !== '';
}

/* -------------------------------------------------------------------------- *
 * ISA / IEA interchange envelope validation
 * -------------------------------------------------------------------------- */

/**
 * Validate ISA/IEA interchange envelope.
 * Only runs when an ISA segment is present (avoids cascading "missing" errors).
 */
export function validateInterchangeEnvelope(segments) {
  const issues = [];
  const isa = segments.find((s) => s.name === 'ISA');
  const iea = segments.find((s) => s.name === 'IEA');
  const gsGroups = segments.filter((s) => s.name === 'GS');

  if (!isa) return issues; // "Missing ISA" is already reported by the parser.

  const isaControlNumber = el(isa, ISA.controlNumber);
  const ieaControlNumber = iea ? el(iea, IEA.controlNumber) : null;
  const ieaGroupCount = iea ? el(iea, IEA.groupCount) : null;

  // ISA required-element checks.
  const isaRequired = [
    ISA.senderIdQualifier, ISA.senderId, ISA.receiverIdQualifier, ISA.receiverId,
    ISA.date, ISA.time, ISA.version, ISA.controlNumber,
  ];
  for (const pos of isaRequired) {
    if (!present(el(isa, pos))) {
      issues.push(`Missing required ISA element ISA0${pos}`);
    }
  }

  if (!iea) {
    issues.push('Missing IEA interchange trailer');
  } else {
    // Control number must match between ISA13 and IEA02.
    if (present(isaControlNumber) && present(ieaControlNumber) && isaControlNumber !== ieaControlNumber) {
      issues.push(`ISA/IEA control number mismatch: ISA13=${isaControlNumber} != IEA02=${ieaControlNumber}`);
    }
    // IEA01 declared functional-group count vs actual GS segments.
    if (present(ieaGroupCount)) {
      const actualGroupCount = gsGroups.length;
      if (Number(ieaGroupCount) !== actualGroupCount) {
        issues.push(`IEA functional group count mismatch: declared ${ieaGroupCount}, actual ${actualGroupCount}`);
      }
    }
  }

  return issues;
}

/* -------------------------------------------------------------------------- *
 * GS / GE functional-group envelope validation
 * -------------------------------------------------------------------------- */

/**
 * Validate GS/GE functional-group envelope.
 * Only runs when a GS segment is present.
 */
export function validateFunctionalGroupEnvelope(segments) {
  const issues = [];
  const gs = segments.find((s) => s.name === 'GS');
  const ge = segments.find((s) => s.name === 'GE');
  const stSegments = segments.filter((s) => s.name === 'ST');

  if (!gs) return issues; // "Missing GS" is already reported by the parser.

  const gsControlNumber = el(gs, GS.controlNumber);
  const geControlNumber = ge ? el(ge, GE.controlNumber) : null;
  const geTxCount = ge ? el(ge, GE.transactionSetCount) : null;

  // GS required-element checks.
  const gsRequired = [
    GS.functionalId, GS.appSender, GS.appReceiver, GS.date, GS.time,
    GS.controlNumber, GS.agency, GS.version,
  ];
  for (const pos of gsRequired) {
    if (!present(el(gs, pos))) {
      issues.push(`Missing required GS element GS0${pos}`);
    }
  }

  if (!ge) {
    issues.push('Missing GE functional group trailer');
  } else {
    // Control number must match between GS06 and GE02.
    if (present(gsControlNumber) && present(geControlNumber) && gsControlNumber !== geControlNumber) {
      issues.push(`GS/GE control number mismatch: GS06=${gsControlNumber} != GE02=${geControlNumber}`);
    }
    // GE01 declared transaction-set count vs actual ST segments.
    if (present(geTxCount)) {
      const actualTxCount = stSegments.length;
      if (Number(geTxCount) !== actualTxCount) {
        issues.push(`GE transaction set count mismatch: declared ${geTxCount}, actual ${actualTxCount}`);
      }
    }
  }

  return issues;
}
/* -------------------------------------------------------------------------- *
 * Required-segment validation (per transaction type)
 * -------------------------------------------------------------------------- */

/** Minimum required segment identifiers per X12 transaction set. */
const REQUIRED_SEGMENTS = {
  '850': ['ST', 'BEG', 'CTT', 'SE'],
  '810': ['ST', 'BIG', 'TDS', 'SE'],
  '856': ['ST', 'BSN', 'SE'],
  '820': ['ST', 'BPR', 'SE'],
};

/**
 * Validate that the segments required for the given transaction type are present.
 */
export function validateRequiredSegments(transactionCode, segments) {
  const issues = [];
  const required = REQUIRED_SEGMENTS[transactionCode];
  if (!required) return issues; // Unsupported transaction; adapter already reports it.

  const presentNames = new Set(segments.map((s) => s.name));
  for (const name of required) {
    if (!presentNames.has(name)) {
      issues.push(`Missing required segment ${name} for transaction ${transactionCode}`);
    }
  }
  return issues;
}
/* -------------------------------------------------------------------------- *
 * Implementation-guide constraints (per transaction type)
 * -------------------------------------------------------------------------- */

const DATE_RE = /^\d{8}$/;

/**
 * Transaction-specific implementation-guide constraints.
 * These are conservative, cross-trading-partner sanity checks rather than a
 * full companion-guide implementation.
 */
export function validateImplementationGuide(transactionCode, segments) {
  const issues = [];
  const byName = (name) => segments.find((s) => s.name === name);
  const all = (name) => segments.filter((s) => s.name === name);

  const add = (msg) => issues.push(msg);

  switch (transactionCode) {
    case '850': {
      const beg = byName('BEG');
      const ctt = byName('CTT');
      const po1s = all('PO1');

      if (beg) {
        if (!present(el(beg, 1))) add('850 IG: Missing BEG01 (Transaction Set Purpose Code)');
        if (!present(el(beg, 2))) add('850 IG: Missing BEG02 (Transaction Set Type Code)');
        if (!present(el(beg, 3))) add('850 IG: Missing BEG03 (Purchase Order Number)');
        const begDate = el(beg, 5);
        if (present(begDate) && !DATE_RE.test(begDate)) {
          add(`850 IG: BEG05 date must be CCYYMMDD, got '${begDate}'`);
        }
      }

      // CTT01 line count should match number of PO1 segments when CTT is present.
      if (ctt && po1s.length > 0) {
        const declared = Number(el(ctt, 1));
        if (Number.isFinite(declared) && declared !== po1s.length) {
          add(`850 IG: CTT01 line count ${declared} does not match PO1 segment count ${po1s.length}`);
        }
      }
      break;
    }

    case '810': {
      const big = byName('BIG');
      const tds = byName('TDS');

      if (big) {
        if (!present(el(big, 1))) add('810 IG: Missing BIG01 (Invoice Date)');
        const bigDate = el(big, 1);
        if (present(bigDate) && !DATE_RE.test(bigDate)) {
          add(`810 IG: BIG01 date must be CCYYMMDD, got '${bigDate}'`);
        }
        if (!present(el(big, 2))) add('810 IG: Missing BIG02 (Invoice Number)');
      }

      if (tds) {
        if (!present(el(tds, 1))) add('810 IG: Missing TDS01 (Invoice Total)');
        const tdsVal = el(tds, 1);
        if (present(tdsVal) && !/^-?\d+(\.\d+)?$/.test(tdsVal)) {
          add(`810 IG: TDS01 must be a numeric amount, got '${tdsVal}'`);
        }
      }
      break;
    }

    case '856': {
      const bsn = byName('BSN');
      const hls = all('HL');

      if (bsn) {
        if (!present(el(bsn, 1))) add('856 IG: Missing BSN01 (Shipment Purpose Code)');
        if (!present(el(bsn, 2))) add('856 IG: Missing BSN02 (Shipment Identification)');
        const bsnDate = el(bsn, 3);
        if (present(bsnDate) && !DATE_RE.test(bsnDate)) {
          add(`856 IG: BSN03 date must be CCYYMMDD, got '${bsnDate}'`);
        }
      }

      // Every HL node except the root (level S / parentId empty) should have a parent.
      for (const hl of hls) {
        const level = el(hl, 3);
        const parentId = el(hl, 2);
        const id = el(hl, 1);
        if (!present(id)) add('856 IG: Missing HL01 (Hierarchical ID Number)');
        if (!present(level)) add('856 IG: Missing HL03 (Hierarchical Level Code)');
        if (level !== 'S' && !present(parentId)) {
          add(`856 IG: HL01=${id} level ${level} has no parent HL02`);
        }
      }
      break;
    }

    case '820': {
      const bpr = byName('BPR');
      const rmrs = all('RMR');

      if (bpr) {
        if (!present(el(bpr, 1))) add('820 IG: Missing BPR01 (Transaction Handling Code)');
        if (!present(el(bpr, 2))) add('820 IG: Missing BPR02 (Payment Amount)');
        const bprVal = el(bpr, 2);
        if (present(bprVal) && !/^-?\d+(\.\d+)?$/.test(bprVal)) {
          add(`820 IG: BPR02 must be a numeric amount, got '${bprVal}'`);
        }
      }

      if (rmrs.length === 0) {
        add('820 IG: At least one RMR remittance detail segment is required');
      }
      break;
    }

    default:
      // No IG constraints defined for unsupported transaction types.
      break;
  }

  return issues;
}

/* -------------------------------------------------------------------------- *
 * Combined entry point
 * -------------------------------------------------------------------------- */

/**
 * Run all structural validation categories against a parsed EDI document and
 * return a flat list of issue strings.
 *
 * @param {object} doc - result of parseX12() (must include .segments, .envelope.transactionCode)
 * @returns {string[]} validation issues
 */
export function validateDocument(doc) {
  const { segments, envelope } = doc;
  const issues = [];
  issues.push(...validateInterchangeEnvelope(segments));
  issues.push(...validateFunctionalGroupEnvelope(segments));
  if (envelope && envelope.transactionCode) {
    issues.push(...validateRequiredSegments(envelope.transactionCode, segments));
    issues.push(...validateImplementationGuide(envelope.transactionCode, segments));
  }
  return issues;
}
