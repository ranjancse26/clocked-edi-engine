/**
 * Conservative X12 lexical parser. Detects delimiters from ISA when present,
 * preserves raw segment text and exposes 1-based element positions.
 * It does not claim full X12 implementation-guide validation.
 */
import { validateInterchangeEnvelope, validateFunctionalGroupEnvelope } from './validation.js';

/**
 * Detect delimiters.
 *
 * Standard ISA positions:
 * ISA01-ISA16 are fixed-width fields.
 * Index 3   = Element separator
 * Index 104 = Component separator (ISA16)
 * Index 105 = Segment terminator
 */
export function detectDelimiters(input) {
  const text = String(input ?? '').replace(/^\uFEFF/, '').trim();
  if (text.startsWith('ISA') && text.length >= 106) {
    const element = text[3]; // element separator is always at position 3 (right after "ISA")
    const isaParts = text.split(element);
    if (isaParts.length >= 17 && isaParts[16] && isaParts[16].length >= 2) {
      return { element, component: isaParts[16][0], segment: isaParts[16][1] };
    }
    // Fallback to original offsets for any edge case that fails the parse above.
    return { element, component: text[104], segment: text[105] };
  }
  const first = text.split(/[\r\n]/).find(Boolean) || text;
  const element = first.includes('*') ? '*' : '|';
  const segment = first.includes('~') ? '~' : (text.includes('\n') ? '\n' : '~');
  return { element, component: ':', segment };
}


export function parseX12(input, options = {}) 
{
  const source = String(input ?? '').replace(/^\uFEFF/, '').trim();
  if (!source) 
    throw new Error('EDI input is empty');

  const delimiters = { ...detectDelimiters(source), ...options.delimiters };
  const normalized = source.replace(/\r\n/g, delimiters.segment).replace(/\r/g, delimiters.segment).replace(/\n/g, delimiters.segment);
  const rawSegments = normalized.split(delimiters.segment).map(s => s.trim()).filter(Boolean);

  const segments = rawSegments.map((raw, index) => {
    const parts = raw.split(delimiters.element);
    return {
      index,
      name: parts[0],
      elements: parts.slice(1),
      raw,
      // X12 element positions are 1-based after the segment identifier.
      element: (position) => parts[position] ?? null
    };
  });

  const get = (name) => segments.filter(s => s.name === name);
  const first = (name) => get(name)[0] || null;
  const gs = first('GS');
  const st = first('ST');
  const isa = first('ISA');
  const se = get('SE').at(-1) || null;
  const gsVersion = gs?.elements?.[7] || null;
  const transactionCode = st?.elements?.[0] || null;
  const declaredCount = se?.elements?.[0] ? Number(se.elements[0]) : null;
  const actualCount = st && se ? segments.filter(s => s.index >= st.index && s.index <= se.index).length : null;
  const controlStart = st?.elements?.[1] ?? null;
  const controlEnd = se?.elements?.[1] ?? null;
  const issues = [];

  if (!isa) issues.push('Missing ISA interchange header');
  if (!gs) issues.push('Missing GS functional group header');
  if (!st) issues.push('Missing ST transaction header');
  if (!se) issues.push('Missing SE transaction trailer');

  if (declaredCount != null && actualCount != null && declaredCount !== actualCount) 
    issues.push(`SE segment count mismatch: declared ${declaredCount}, actual ${actualCount}`);
  if (controlStart != null && controlEnd != null && controlStart !== controlEnd) 
    issues.push(`ST/SE control number mismatch: ${controlStart} != ${controlEnd}`);
  
  issues.push(...validateInterchangeEnvelope(segments));
  issues.push(...validateFunctionalGroupEnvelope(segments));

  return {
    delimiters,
    segments,
    envelope: {
      interchangeControlNumber: isa?.elements?.[12] ?? null,
      senderId: isa?.elements?.[5] ?? null,
      receiverId: isa?.elements?.[7] ?? null,
      functionalGroupCode: gs?.elements?.[0] ?? null,
      version: gsVersion,
      transactionCode,
      transactionControlNumber: controlStart,
      declaredSegmentCount: declaredCount,
      actualSegmentCount: actualCount
    },
    issues,
    get,
    first
  };
}

export function segmentValue(segment, position) {
  return segment?.elements?.[position - 1] ?? null;
}

export function splitComposite(value, componentSeparator = ':') {
  return value == null ? [] : String(value).split(componentSeparator);
}
