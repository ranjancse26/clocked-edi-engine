import { val, date, partyBlocks, findParty, refs, dates, money } from './common.js';

export function map810(doc) {
  const s = doc.segments; const big = s.find(x => x.name === 'BIG');
  const parties = partyBlocks(s); const lines = []; let line = null;

  for (const x of s) {
    if (x.name === 'IT1') {
      if (line) lines.push(line);
      line = { lineNumber: val(x, 1), quantity: val(x, 2), unitOfMeasure: val(x, 3), unitPrice: val(x, 4), productIds: [] };
      for (let i = 6; i <= x.elements.length - 1; i += 2) if (val(x, i) != null) line.productIds.push({ qualifier: val(x, i), value: val(x, i + 1) });
    } else if (line && x.name === 'PID') line.descriptions = [...(line.descriptions || []), val(x, 5)].filter(Boolean);
    else if (line && x.name !== 'IT1' && !['SAC', 'TXI', 'TDS'].includes(x.name)) { lines.push(line); line = null; }
  }

  if (line) lines.push(line);
  const tds = s.find(x => x.name === 'TDS');

  return {
    transactionType: '810', documentType: 'Invoice', controlNumber: doc.envelope.transactionControlNumber,
    invoice: { number: val(big, 2), date: date(val(big, 1)), purchaseOrderNumber: val(big, 4), releaseNumber: val(big, 5), changeOrderNumber: val(big, 6) },
    references: refs(s), dates: dates(s), parties, billTo: findParty(parties, 'BT'), remitTo: findParty(parties, 'RI'), vendor: findParty(parties, 'VN', 'SU'),
    lineItems: lines, totals: { invoiceTotalRaw: val(tds, 1), invoiceTotal: money(val(tds, 1)) }
  };
}
