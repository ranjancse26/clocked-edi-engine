import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class ClockedError extends Error 
{
  constructor(message, status, body) { 
    super(message); this.name = 'ClockedError'; this.status = status; this.body = body; 
  }
}

export class ClockedClient 
{
  constructor(config = env) { this.config = config; }

  async request(operation, payload, requestId = randomUUID()) 
  {
    if (this.config.clockedMode === 'mock') return this.mock(operation, payload);
    if (!this.config.clockedApiKey) 
      throw new ClockedError('CLOCKED_API_KEY is required when CLOCKED_MODE=live');

    const path = this.config.paths[operation];
    if (!path) 
      throw new ClockedError(`No Clocked endpoint configured for ${operation}`);

    let lastError;
    for (let attempt = 0; attempt <= this.config.clockedRetries; attempt++) 
    {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.clockedTimeoutMs);

      try {
        const response = await fetch(`${this.config.clockedBaseUrl}${path}`, {
          method: 'POST', signal: controller.signal,
          headers: { 'Authorization': `Bearer ${this.config.clockedApiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
          body: JSON.stringify(payload)
        });

        const raw = await response.text(); let data;
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
       
        if (!response.ok) 
          throw new ClockedError(`Clocked ${operation} failed (${response.status})`, response.status, data);
        
        return data;
      } catch (err) {
        lastError = err;
        const retryable = err.name === 'AbortError' || !err.status || err.status === 429 || err.status >= 500;
        
        if (!retryable || attempt === this.config.clockedRetries) break;
          await sleep(400 * (2 ** attempt));
      } finally { clearTimeout(timeout); }
    }

    throw lastError;
  }

  mock(operation, payload) {
    const text = payload.text || '';
    if (operation === 'pii') return { status: 'mock', detected: false, redacted_text: text, message: 'Mock mode: no PII scan was performed.' };
    if (operation === 'injection') return { status: 'mock', flagged: false, risk: 'unknown', message: 'Mock mode: no injection scan was performed.' };
    if (operation === 'extract') return { status: 'mock', extracted_fields: {}, message: 'Mock mode: extraction skipped.' };
    if (operation === 'decide') return { status: 'mock', decisions: { route_to_human: true, processing_status: 'mock' }, message: 'Mock mode: decision skipped.' };
    return { status: 'mock' };
  }
}

export function extractSafeText(result, fallback) {
  const candidates = [
    result?.anonymized_text,
    result?.redacted_text // for mock response
  ];
  return candidates.find(v => typeof v === 'string') ?? fallback;
}

export function injectionFlagged(result) {
  // The pipeline passes the raw Guard response body. Clocked nests the
  // assessment under `response`, while mocks and some tenants return a flat
  // shape. Normalize to the assessment object either way.
  const assessment = result?.response ?? result;

  // Explicit boolean flags (mock responses and tenant-specific shapes).
  for (const key of ['flagged', 'is_injection', 'injection_detected', 'blocked']) {
    if (assessment?.[key] === true) return true;
  }

  const verdict = assessment?.verdict;
  const injectionScore = assessment?.injection;
  const threshold = assessment?.threshold;

  // Verdict is the primary signal: anything other than "benign" is flagged.
  // Severity is diagnostic only and must not gate the decision - a non-benign
  // verdict with severity "none" is still a hit that must be blocked.
  const normalizedVerdict = typeof verdict === 'string' ? verdict.toLowerCase().trim() : '';
  if (normalizedVerdict.length > 0 && normalizedVerdict !== 'benign') return true;

  // Score-based defense-in-depth: flag when the injection probability meets
  // or exceeds the tenant's threshold, independent of the verdict string.
  if (typeof injectionScore === 'number' && typeof threshold === 'number') {
    if (injectionScore >= threshold) return true;
  }

  return false;
}
