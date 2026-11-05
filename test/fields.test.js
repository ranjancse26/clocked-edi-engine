import test from "node:test";
import assert from "node:assert/strict";
import { fieldsFor, decideFields, decideQuestions } from "../src/clocked/fields.js";

// Clocked Extract/Decide accepts these field types; anything else yields HTTP 422.
const VALID_TYPES = new Set(['boolean','date','email','enum','id','integer','money','number','phone','string']);
const LEGACY_TYPES = new Set(['extract','generate','choice','yes_no']);

function inspectFields(fields, label) {
  for (const [name, spec] of Object.entries(fields)) {
    if (typeof spec === 'string') continue;
    assert.ok(spec && typeof spec === 'object', `${label}.${name} must be a string or object`);
    if (spec.type !== undefined) {
      assert.ok(VALID_TYPES.has(spec.type), `${label}.${name} has invalid Clocked type "${spec.type}"`);
    }
    if (spec.list !== undefined) {
      assert.equal(typeof spec.list, 'boolean', `${label}.${name} list flag must be boolean`);
    }
    if (spec.type === 'enum') {
      assert.ok(Array.isArray(spec.options) && spec.options.length > 0, `${label}.${name} enum field must have options`);
    }
  }
}

test("fieldsFor uses only Clocked-accepted field types for every transaction", () => {
  for (const code of ['850','810','856','820']) {
    inspectFields(fieldsFor(code), `fieldsFor(${code})`);
  }
});

test("decideFields uses only Clocked-accepted field types", () => {
  for (const code of ['850','810','856','820']) {
    inspectFields(decideFields(code), `decideFields(${code})`);
  }
});

test("document_type and recommended_action use enum type with short distinct options", () => {
  assert.equal(fieldsFor('810').document_type.type, 'string');
  assert.equal(decideFields('810').recommended_action.type, 'enum');
  assert.ok(fieldsFor('810').document_type.options.includes('810 - Invoice'));
  assert.ok(fieldsFor('810').document_type.options.includes('Other'));
  for (const opt of fieldsFor('810').document_type.options) {
    assert.ok(typeof opt === 'string' && opt.length > 0, `enum option must be nonempty string: ${JSON.stringify(opt)}`);
    assert.ok(opt.length <= 32, `enum option too long: ${JSON.stringify(opt)}`);
  }
  assert.ok(fieldsFor('810').document_type.options.length >= 2);
  assert.ok(fieldsFor('810').document_type.options.length <= 32);
});

test("yes_no fields became boolean", () => {
  const d = decideFields('810');
  assert.equal(d.document_supported.type, 'boolean');
  assert.equal(d.structural_review_required.type, 'boolean');
  assert.equal(d.business_review_required.type, 'boolean');
});

test("no legacy type names remain in extract or decide fields", () => {
  for (const code of ['850','810','856','820']) {
    for (const spec of Object.values({ ...fieldsFor(code), ...decideFields(code) })) {
      if (typeof spec === 'object' && spec.type) {
        assert.ok(!LEGACY_TYPES.has(spec.type), `legacy type ${spec.type} still present`);
      }
    }
  }
});

const QUESTION_TYPES = new Set(['noul','choice','multiselect','score']);

test("decideQuestions returns well-formed questions for every transaction", () => {
  for (const code of ['850','810','856','820']) {
    const questions = decideQuestions(code);
    assert.ok(questions && typeof questions === 'object', `decideQuestions(${code}) must return an object`);
    for (const [name, spec] of Object.entries(questions)) {
      assert.ok(spec && typeof spec === 'object', `decideQuestions(${code}).${name} must be an object`);
      assert.ok(typeof spec.instructions === 'string' && spec.instructions.length > 0, `decideQuestions(${code}).${name} needs instructions`);
      assert.ok(QUESTION_TYPES.has(spec.type), `decideQuestions(${code}).${name} has unknown type ${spec.type}`);
      if (spec.type === 'choice' || spec.type === 'multiselect') {
        assert.ok(spec.criteria && typeof spec.criteria === 'object', `decideQuestions(${code}).${name} choice/multiselect needs criteria`);
      }
      if (spec.type === 'score') {
        assert.ok(Array.isArray(spec.criteria) && spec.criteria.length > 0, `decideQuestions(${code}).${name} score needs criteria`);
      }
      if (spec.type === 'noul') {
        assert.ok(typeof spec.threshold === 'number', `decideQuestions(${code}).${name} noul needs a numeric threshold`);
      }
    }
  }
});
