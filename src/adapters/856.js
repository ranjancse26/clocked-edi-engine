import { val, date, partyBlocks, findParty, refs, dates } from './common.js';

export function map856(doc) {
  const s = doc.segments; const bsn = s.find(x => x.name === 'BSN');
  const nodes = []; const stack = []; let current = null;

  for (const x of s) {
    if (x.name === 'HL') {
      const node = { id: val(x, 1), parentId: val(x, 2), levelCode: val(x, 3), childCode: val(x, 4), details: {}, children: [] };
      while (stack.length && stack.at(-1).id !== node.parentId) stack.pop();
      if (node.parentId && stack.length) stack.at(-1).children.push(node); else nodes.push(node);
      stack.push(node); current = node;
    } else if (current && x.name === 'TD1') current.details.packaging = [...(current.details.packaging || []), { packagingCode: val(x, 1), ladingQuantity: val(x, 2), weight: val(x, 6), weightUnit: val(x, 7) }];
    else if (current && x.name === 'TD5') current.details.carrier = { routingSequence: val(x, 1), identificationCodeQualifier: val(x, 2), identificationCode: val(x, 3), transportationMethod: val(x, 4), routing: val(x, 5) };
    else if (current && x.name === 'REF') current.details.references = [...(current.details.references || []), { qualifier: val(x, 1), value: val(x, 2) }];
    else if (current && x.name === 'LIN') current.details.item = { assignedId: val(x, 1), productIds: x.elements.slice(1).reduce((a, v, i, arr) => { if (i % 2 === 0 && arr[i + 1] != null) a.push({ qualifier: v, value: arr[i + 1] }); return a; }, []) };
    else if (current && x.name === 'SN1') current.details.shippedQuantity = { quantity: val(x, 2), unitOfMeasure: val(x, 3), quantityOrdered: val(x, 4) };
    else if (current && x.name === 'MAN') current.details.marksAndNumbers = [...(current.details.marksAndNumbers || []), { qualifier: val(x, 1), number: val(x, 2), number2: val(x, 3) }];
    else if (current && x.name === 'DTM') current.details.dates = [...(current.details.dates || []), { qualifier: val(x, 1), date: date(val(x, 2)) }];
  }
  
  const parties = partyBlocks(s);
  return {
    transactionType: '856', documentType: 'Advance Ship Notice', controlNumber: doc.envelope.transactionControlNumber,
    shipment: { purposeCode: val(bsn, 1), shipmentId: val(bsn, 2), date: date(val(bsn, 3)), time: val(bsn, 4), hierarchyStructureCode: val(bsn, 5) },
    references: refs(s), dates: dates(s), parties, shipFrom: findParty(parties, 'SF'), shipTo: findParty(parties, 'ST'), vendor: findParty(parties, 'VN', 'SU'),
    hierarchy: nodes
  };
}
