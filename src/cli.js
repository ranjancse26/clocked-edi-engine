import { readFile } from 'node:fs/promises';
import { parseX12 } from './edi/parser.js';
import { normalizeTransaction } from './adapters/index.js';

const path = process.argv[2];
if (!path) { 
    console.error('Usage: npm run parse:sample -- path/to/file.edi'); 
    process.exit(1); 
}

const text = await readFile(path, 'utf8');
const parsed = parseX12(text);

console.log(JSON.stringify({ 
    structural: { envelope: parsed.envelope, issues: parsed.issues }, 
    normalized: normalizeTransaction(parsed) 
}, null, 2));
