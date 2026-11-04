import { map850 } from './850.js';
import { map810 } from './810.js';
import { map856 } from './856.js';
import { map820 } from './820.js';

const adapters = { '850': map850, '810': map810, '856': map856, '820': map820 };

export function normalizeTransaction(doc) {
  const code = doc.envelope.transactionCode;
  const adapter = adapters[code];
  if (!adapter)
    throw Object.assign(new Error(`Unsupported X12 transaction set: ${code || 'unknown'}. Supported: 850, 810, 856, 820.`), { status: 422 });
  return adapter(doc);
}
