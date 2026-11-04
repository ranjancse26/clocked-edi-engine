import { val, date, partyBlocks, findParty, refs, dates, money } from './common.js';

export function map820(doc) {
  const s = doc.segments; const bpr = s.find(x => x.name === 'BPR'); const trn = s.find(x => x.name === 'TRN');
  const remittances = []; let current = null;

  for (const x of s) {
    if (x.name === 'RMR') {
      current = { referenceQualifier: val(x, 1), invoiceReference: val(x, 2), paymentActionCode: val(x, 3), amountPaidRaw: val(x, 4), amountPaid: money(val(x, 4)), discountAmount: money(val(x, 5)), adjustmentAmount: money(val(x, 6)) };
      remittances.push(current);
    } else if (current && x.name === 'REF') current.references = [...(current.references || []), { qualifier: val(x, 1), value: val(x, 2) }];
    else if (current && x.name === 'DTM') current.dates = [...(current.dates || []), { qualifier: val(x, 1), date: date(val(x, 2)) }];
    else if (x.name === 'ENT') current = null;
  }

  const parties = partyBlocks(s);
  
  return {
    transactionType: '820', documentType: 'Payment Order/Remittance Advice', controlNumber: doc.envelope.transactionControlNumber,
    payment: { handlingCode: val(bpr, 1), amountRaw: val(bpr, 2), amount: money(val(bpr, 2)), creditDebitFlag: val(bpr, 3), paymentMethod: val(bpr, 4), paymentFormat: val(bpr, 5), date: date(val(bpr, 15)) },
    trace: { typeCode: val(trn, 1), referenceNumber: val(trn, 2), originCompanyId: val(trn, 3) }, references: refs(s), dates: dates(s), parties,
    payer: findParty(parties, 'PR'), payee: findParty(parties, 'PE'), remittances
  };
}
