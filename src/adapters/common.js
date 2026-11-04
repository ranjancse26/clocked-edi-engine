import { segmentValue } from '../edi/parser.js';

export const val = (s, n) => segmentValue(s, n);
export const date = (v) => v && /^\d{8}$/.test(v) ? `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}` : (v || null);
export const money = (v) => {
  if (v == null || v === '') return null;
  // X12 monetary elements commonly use an implied decimal with two places.
  const n = Number(v);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : null;
};

export function partyBlocks(segments) {
  const parties = [];
  let current = null;

  for (const s of segments) {
    if (s.name === 'N1') {
      current = { qualifier: val(s,1), name: val(s,2), identificationQualifier: val(s,3), identificationCode: val(s,4), address: null, city: null, state: null, postalCode: null, country: null, contacts: [] };
      parties.push(current);
    } else if (current && s.name === 'N2') current.additionalName = [current.additionalName, val(s,1), val(s,2)].filter(Boolean).join(' ');
    else if (current && s.name === 'N3') current.address = [val(s,1), val(s,2)].filter(Boolean).join(' ');
    else if (current && s.name === 'N4') Object.assign(current, { city: val(s,1), state: val(s,2), postalCode: val(s,3), country: val(s,4) });
    else if (current && s.name === 'PER') current.contacts.push({ functionCode: val(s,1), name: val(s,2), communicationQualifier1: val(s,3), communicationNumber1: val(s,4), communicationQualifier2: val(s,5), communicationNumber2: val(s,6) });
    else if (['N1','N2','N3','N4','PER'].includes(s.name) === false && s.name !== 'REF') current = null;
  }
  
  return parties;
}

export const findParty = (parties, ...codes) => parties.find(p => codes.includes(p.qualifier)) || null;
export function refs(segments) { return segments.filter(s => s.name === 'REF').map(s => ({ qualifier: val(s,1), value: val(s,2) })); }
export function dates(segments) { return segments.filter(s => s.name === 'DTM').map(s => ({ qualifier: val(s,1), date: date(val(s,2)), time: val(s,3) })); }
export function amountNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
