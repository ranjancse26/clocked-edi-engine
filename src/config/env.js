import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Small dotenv-compatible loader using only Node built-ins.
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) 
      continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) 
      continue;

    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) 
      value = value.slice(1, -1);
    
    process.env[match[1]] = value;
  }
}

const bool = (value, fallback) => value == null ? fallback : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());

export const env = {
  port: Number(process.env.PORT || 8080),
  nodeEnv: process.env.NODE_ENV || 'development',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 15),
  clockedMode: (process.env.CLOCKED_MODE || 'mock').toLowerCase(),
  clockedBaseUrl: (process.env.CLOCKED_API_BASE_URL || 'https://clocked.rezolve.ai').replace(/\/$/, ''),
  clockedApiKey: process.env.CLOCKED_API_KEY || '',
  clockedTimeoutMs: Number(process.env.CLOCKED_TIMEOUT_MS || 60000),
  clockedRetries: Number(process.env.CLOCKED_RETRIES || 2),
  clockedFailClosed: bool(process.env.CLOCKED_FAIL_CLOSED, true),
  clockedDebug: bool(process.env.CLOCKED_DEBUG, false),
  paths: {
    extract: process.env.CLOCKED_EXTRACT_PATH || '/clocked/extract',
    decide: process.env.CLOCKED_DECIDE_PATH || '/clocked/decide',
    pii: process.env.CLOCKED_PII_PATH || '/clocked/pii',
    injection: process.env.CLOCKED_INJECTION_PATH || '/clocked/injection'
  }
};

if (env.clockedMode !== 'mock' && !env.clockedApiKey) 
  console.warn('CLOCKED_API_KEY is empty. Set it before using live Clocked mode.');
