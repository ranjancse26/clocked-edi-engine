import { val, date, partyBlocks, findParty, refs, dates } from './common.js';

export function map850(doc) {
  const s = doc.segments;
  const beg = s.find(x => x.name === 'BEG');
  const parties = partyBlocks(s);
  const lines = [];
  let line = null;

  for (const x of s) {
    if (x.name === 'PO1') {
      if (line) lines.push(line);
      line = { lineNumber: val(x, 1), quantity: val(x, 2), unitOfMeasure: val(x, 3), unitPrice: val(x, 4), basisOfUnitPrice: val(x, 5), productIds: [] };
      for (let i = 6; i <= x.elements.length - 1; i += 2) if (val(x, i) != null) line.productIds.push({ qualifier: val(x, i), value: val(x, i + 1) });
    } else if (line && x.name === 'PID') line.descriptions = [...(line.descriptions || []), { type: val(x, 1), description: val(x, 5) }];
    else if (line && x.name === 'SCH') line.schedules = [...(line.schedules || []), { quantity: val(x, 1), unitOfMeasure: val(x, 2), dateQualifier: val(x, 5), date: date(val(x, 6)) }];
    else if (line && x.name !== 'CTT' && x.name !== 'AMT' && x.name !== 'PO1') { lines.push(line); line = null; }
  }
  
  if (line) lines.push(line);
  return {
    transactionType: '850', documentType: 'Purchase Order', controlNumber: doc.envelope.transactionControlNumber,
    purchaseOrder: { purposeCode: val(beg, 1), typeCode: val(beg, 2), number: val(beg, 3), date: date(val(beg, 5)), releaseNumber: val(beg, 4) },
    references: refs(s), dates: dates(s), parties,
    buyer: findParty(parties, 'BY'), vendor: findParty(parties, 'VN', 'SU'), shipTo: findParty(parties, 'ST'), billTo: findParty(parties, 'BT'),
    lineItems: lines,
    controlTotal: s.find(x => x.name === 'CTT') ? { lineCount: val(s.find(x => x.name === 'CTT'), 1), hashTotal: val(s.find(x => x.name === 'CTT'), 2) } : null
  };
}
