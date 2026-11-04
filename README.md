# Clocked EDI Engine

A runnable Node.js service for ANSI X12 transaction sets **850 (Purchase Order), 810 (Invoice), 856 (Advance Ship Notice), and 820 (Payment Order/Remittance Advice)**. It parses the X12 structure, maps common segments into normalized JSON, runs Clocked PII Protection and Injection Guard before sending content to Clocked Extract and Decide, and exposes REST/n8n-compatible webhooks.

Working with ANSI X12 EDI has traditionally required specialized knowledge - delimiter parsing, segment dictionaries, control numbers, trading partner companion guides, and legacy translators that feel like they belong in the 1990s. `clocked-edi-engine` removes that barrier. It is a modern, open-source Node.js service (Express, ESM, Node 20+) that sits between your trading partners and your ERP, turning decades-old X12 transaction sets into clean, secure, JSON-powered workflows without requiring EDI expertise.

The engine processes raw X12 through a single pipeline:

- **Parse** - Auto-detects ISA delimiters, segments the text, and preserves raw segment data with 1-based element positions.
- **Validate** - Checks required ISA/GS/ST/SE envelopes, ST/SE control numbers, segment counts, and implementation-specific constraints.
- **Secure** - Sends content through Clocked PII Protection and Injection Guard before any AI model sees it. PII is redacted first; injection-flagged content is blocked with a `422` response.
- **Extract + Decide** - Runs Clocked Extract and Decide in parallel on the protected text to surface structured fields and assess processing readiness.
- **Serve** - Returns normalized JSON over REST (`/api/edi/process`) or an n8n-compatible webhook (`/webhooks/edi`), with idempotency keys, bounded retries, and fail-closed security behavior.

Best of all, it ships with a **mock mode** (`CLOCKED_MODE=mock`), so you can develop and test the parser and API locally without a Clocked API key or any EDI experience. Switch to live mode when you are ready to process real EDI with sensitive data.

## Architecture Diagram

![Clocked EDI Engine Architecture](assets/Clocked%20EDI%20Engine%20Architecture.png)

## Features

- Node.js 20+, ES modules; Express REST API.
- X12 delimiter detection for ISA envelopes and basic delimiter fallback.
- Raw segment preservation, ST/SE control number and segment-count checks.
- Transaction adapters for 850, 810, 856 and 820.
- 856 HL parent-child hierarchy preservation.
- Party loops (N1/N2/N3/N4/PER), references (REF), dates (DTM), line items and remittance mappings.
- Clocked sequence: PII Protection - Injection Guard - Extract + Decide.
- Idempotency-Key support and bounded retry for retryable Clocked failures (network errors, 429, >=500; 409 Conflict is non-retryable).
- Fail-closed behavior for live security API failures (configurable via CLOCKED_FAIL_CLOSED).
- Mock mode for local parser/API development without Clocked credentials.
- File upload and JSON webhook endpoints for n8n.
- Segment validation: `validateRequiredSegments` and `validateImplementationGuide` check for required envelopes, control numbers, and implementation-specific constraints.

## Quick start

```bash
cp .env.example .env  # creates .env if it exists; otherwise create .env manually see Config Clocked section below
npm install
npm test
npm run start
```

The default is `CLOCKED_MODE=mock`, so no Clocked API key is needed for local testing. Health check:

```bash
curl http://localhost:8080/health
```

Parse one of the supplied samples without calling Clocked:

```bash
npm run parse:sample -- examples/sample-810.edi
```

## Configure Clocked

Edit `.env`:

```dotenv
CLOCKED_MODE=live
CLOCKED_API_BASE_URL=https://clocked.rezolve.ai
CLOCKED_API_KEY=YOUR_CLOCKED_API_KEY
CLOCKED_EXTRACT_PATH=/clocked/extract
CLOCKED_DECIDE_PATH=/clocked/decide
CLOCKED_PII_PATH=/clocked/pii
CLOCKED_INJECTION_PATH=/clocked/injection
CLOCKED_FAIL_CLOSED=true
```

Verify each path and payload contract with your Clocked API documentation. If your PII or Injection endpoint expects a different body (for example `content`, `input`, or additional policy options), update the corresponding call in `src/services/pipeline.js`. If the API returns its protected text or injection flag under a different property, update `extractSafeText()` or `injectionFlagged()` in `src/clocked/client.js`.

### Clocked request sequence

1. `pii`: `{ "text": "<raw EDI>" }` - PII Protection.
2. `injection`: `{ "text": "<PII-protected EDI>" }` - Injection Guard.
3. `extract`: `{ "text": "<protected EDI>", "instructions": "...", "fields": { ... } }` - Extraction of structured data.
4. `decide`: `{ "state": "<normalized transaction + structural validation>", "instructions": "...", "fields": { ... }, "questions": { ... } }` - Typed decisions and probabilities behind them.

Every call includes an `Idempotency-Key` header. When retrying the same inbound request, send the same `Idempotency-Key` value. Clocked API retry behavior: network errors, `429`, and status >= 500 are retried (up to `CLOCKED_RETRIES` attempts, default 2); `409 Conflict` is **not** retryable.

**Security note:** In live mode, PII and Injection failures stop downstream processing by default (governed by `CLOCKED_FAIL_CLOSED`). The engine blocks when the response contains a recognized boolean flag (`flagged`, `is_injection`, `injection_detected`, or `blocked`). Confirm your tenant's response shape and extend the mapping in `src/clocked/client.js` (`injectionFlagged()`) if needed. Do not silently disable fail-closed behavior in production without a security review.

## Clocked Protect Playground

The [Clocked Protect Playground](https://clocked.rezolve.ai/playground) lets you interactively test PII Protection and Injection Guard on raw EDI content before integrating it into the engine. Use it to experiment with redaction policies, injection detection thresholds, and response shapes without writing code.

### Demo 1 - PII Protection

The first demo shows raw X12 EDI (an 850 Purchase Order) being submitted to the PII Protection endpoint. Sensitive fields such as names, addresses, and other personally identifiable information are detected and redacted in the protected output.

![Clocked Protect Playground Demo 1](assets/Clocked%20Protect%20Playground%20Demo%201.png)

### Demo 2 - Injection Guard

The second demo shows the same EDI content being evaluated by the Injection Guard. The playground analyzes the text for prompt injection, jailbreak attempts, and other adversarial patterns, returning a verdict, severity score, and category probabilities.

![Clocked Protect Playground Demo 2](assets/Clocked%20Protect%20Playground%20Demo%202.png)

### How it maps to the engine

The engine mirrors these two playground capabilities in its pipeline:

| Playground capability | Engine pipeline stage | Source |
|---|---|---|
| PII Protection | `pii` - redacts/protects sensitive data | `src/clocked/client.js` (`extractSafeText()`) |
| Injection Guard | `injection` - blocks malicious content | `src/clocked/client.js` (`injectionFlagged()`) |

Use the playground to confirm your tenant's response schema (e.g., which field holds the protected text, which boolean indicates injection risk), then update `extractSafeText()` and `injectionFlagged()` in `src/clocked/client.js` accordingly before running in live mode.

## API

### `POST /api/edi/process`

JSON body:

```json
{ "edi": "ST*810*0001~\\nBIG*20261031*INV-10025**PO-50021~\\n..." }
```

Or upload a file as multipart form-data with field name `file`:

```bash
curl -X POST http://localhost:8080/api/edi/process \\
  -H 'Idempotency-Key: edi-inbound-000123' \\
  -F 'file=@examples/sample-810.edi'
```

Example with a sample 850 Purchase Order file:

```bash
curl --location 'http://localhost:8080/api/edi/process' \
  --header 'Idempotency-Key: 8a2c1a7f-d9a4-4599-9097-d06c174cb92b' \
  --form 'file=@"sample-850.edi"'
```

Response:

```json
{
    "requestId": "8a2c1a7f-d9a4-4599-9097-d06c174cb92b",
    "transactionType": "850",
    "structural": {
        "valid": true,
        "issues": [],
        "envelope": {
            "interchangeControlNumber": "000000001",
            "senderId": "ABC CORPORATION",
            "receiverId": "ACME SUPPLY     ",
            "functionalGroupCode": "IN",
            "version": "004010",
            "transactionCode": "850",
            "transactionControlNumber": "0002",
            "declaredSegmentCount": 14,
            "actualSegmentCount": 14
        }
    },
    "normalized": {
        "transactionType": "850",
        "documentType": "Purchase Order",
        "controlNumber": "0002",
        "purchaseOrder": {
            "purposeCode": "00",
            "typeCode": "SA",
            "number": "PO-50021",
            "date": null,
            "releaseNumber": "20261031"
        },
        "references": [],
        "dates": [
            {
                "qualifier": "002",
                "date": "2026-11-15",
                "time": null
            }
        ],
        "parties": [
            {
                "qualifier": "BY",
                "name": "ABC CORPORATION",
                "identificationQualifier": null,
                "identificationCode": null,
                "address": "123 MAIN STREET",
                "city": "DALLAS",
                "state": "TX",
                "postalCode": "75001",
                "country": null,
                "contacts": []
            },
            {
                "qualifier": "ST",
                "name": "ABC WAREHOUSE",
                "identificationQualifier": null,
                "identificationCode": null,
                "address": "500 INDUSTRIAL ROAD",
                "city": "DALLAS",
                "state": "TX",
                "postalCode": "75002",
                "country": null,
                "contacts": []
            },
            {
                "qualifier": "VN",
                "name": "ACME SUPPLY",
                "identificationQualifier": null,
                "identificationCode": null,
                "address": null,
                "city": null,
                "state": null,
                "postalCode": null,
                "country": null,
                "contacts": []
            }
        ],
        "buyer": {
            "qualifier": "BY",
            "name": "ABC CORPORATION",
            "identificationQualifier": null,
            "identificationCode": null,
            "address": "123 MAIN STREET",
            "city": "DALLAS",
            "state": "TX",
            "postalCode": "75001",
            "country": null,
            "contacts": []
        },
        "vendor": {
            "qualifier": "VN",
            "name": "ACME SUPPLY",
            "identificationQualifier": null,
            "identificationCode": null,
            "address": null,
            "city": null,
            "state": null,
            "postalCode": null,
            "country": null,
            "contacts": []
        },
        "shipTo": {
            "qualifier": "ST",
            "name": "ABC WAREHOUSE",
            "identificationQualifier": null,
            "identificationCode": null,
            "address": "500 INDUSTRIAL ROAD",
            "city": "DALLAS",
            "state": "TX",
            "postalCode": "75002",
            "country": null,
            "contacts": []
        },
        "billTo": null,
        "lineItems": [
            {
                "lineNumber": "1",
                "quantity": "10",
                "unitOfMeasure": "EA",
                "unitPrice": "150.00",
                "basisOfUnitPrice": "",
                "productIds": [
                    {
                        "qualifier": "VN",
                        "value": "PROD-100"
                    }
                ],
                "descriptions": [
                    {
                        "type": "F",
                        "description": "Industrial component"
                    }
                ]
            }
        ],
        "controlTotal": {
            "lineCount": "1",
            "hashTotal": null
        }
    },
    "security": {
        "pii": {
            "model": "clocked-1.0",
            "entities": [
                {
                    "type": "address",
                    "value": "123 MAIN STREET",
                    "start": 241,
                    "end": 256,
                    "confidence": 1,
                    "source": "model",
                    "mentions": 1
                },
                {
                    "type": "address",
                    "value": "DALLAS*TX*75001",
                    "start": 261,
                    "end": 276,
                    "confidence": 1,
                    "source": "model",
                    "mentions": 1
                },
                {
                    "type": "address",
                    "value": "500 INDUSTRIAL ROAD",
                    "start": 302,
                    "end": 321,
                    "confidence": 1,
                    "source": "model",
                    "mentions": 1
                },
                {
                    "type": "address",
                    "value": "DALLAS*TX*75002",
                    "start": 326,
                    "end": 341,
                    "confidence": 1,
                    "source": "model",
                    "mentions": 1
                }
            ],
            "counts": {
                "address": 4
            },
            "threshold": 0.5,
            "instructions_used": "default",
            "mentions": {
                "candidates": 0,
                "variants": 0,
                "reads": 0,
                "verified": 0,
                "occurrences": {
                    "read": 0,
                    "kept": 0
                },
                "rejected": {},
                "spans": 0,
                "ms": 0
            },
            "checks": {
                "trimmed": 0,
                "split": 0,
                "rejected": {}
            },
            "timing": {
                "read_ms": 257,
                "total_ms": 258
            }
        },
        "injection": {
            "model": "clocked-1.0",
            "injection": 0.0017524764275881344,
            "verdict": "benign",
            "threshold": 0.5,
            "source": "user",
            "instructions_used": "default",
            "category": "benign",
            "categories": {
                "benign": 0.970651599576904,
                "instruction override": 0.003720064139687001,
                "role-play or persona jailbreak": 0.0026560234418516564,
                "system prompt or secret extraction": 0.0029119219473680872,
                "obfuscated or encoded payload": 0.014732767296635715,
                "tool misuse or data exfiltration": 0.002834216534549979,
                "social engineering": 0.0024934070630036158
            },
            "severity": "none",
            "severity_expected": 1.012,
            "severities": {
                "none": 0.9952757287335123,
                "low": 0.0012767246560237853,
                "medium": 0.0010809835386830797,
                "high": 0.001007600286121651,
                "critical": 0.001358962785659151
            },
            "evidence": [],
            "timing": {
                "read_ms": 31,
                "total_ms": 31
            }
        },
        "blocked": false,
        "blockedReason": null,
        "blockedAt": null
    },
    "clocked": {
        "extract": {
            "model": "clocked-1.0",
            "fields": {
                "transaction_type": {
                    "value": "850",
                    "start": 176,
                    "end": 179,
                    "confidence": 0.9999999997036941,
                    "p_verify": 0.9999999997036941,
                    "normalized": {
                        "value": "850",
                        "source": "derived",
                        "rule": "id_explicit_format",
                        "confidence": 0.9999999997036941
                    }
                },
                "control_number": {
                    "value": "0002",
                    "start": 180,
                    "end": 184,
                    "confidence": 0.9999999985013734,
                    "p_verify": 0.9999999985013734,
                    "normalized": {
                        "value": "0002",
                        "source": "derived",
                        "rule": "id_explicit_format",
                        "confidence": 0.9999999985013734
                    }
                },
                "validation_issues": {
                    "value": [],
                    "items": [],
                    "confidence": 1
                },
                "document_type": {
                    "value": null,
                    "confidence": 1
                },
                "parties": {
                    "value": null,
                    "confidence": 1
                },
                "line_items_or_remittance": {
                    "value": null,
                    "confidence": 1
                },
                "business_summary": {
                    "value": null,
                    "confidence": 1
                },
                "purchase_order_number": {
                    "value": "PO-50021",
                    "start": 196,
                    "end": 204,
                    "confidence": 0.9999999997313012,
                    "p_verify": 0.9999999997313012,
                    "normalized": {
                        "value": "PO-50021",
                        "source": "derived",
                        "rule": "id_explicit_format",
                        "confidence": 0.9999999997313012
                    }
                },
                "buyer": {
                    "value": "ABC CORPORATION",
                    "start": 37,
                    "end": 52,
                    "confidence": 0.9999999976189422,
                    "p_verify": 0.9999999976189422
                },
                "vendor": {
                    "value": "ACME SUPPLY",
                    "start": 56,
                    "end": 67,
                    "confidence": 0.9999999523570563,
                    "p_verify": 0.9999999523570563
                },
                "ship_to": {
                    "value": null,
                    "confidence": 1
                },
                "requested_delivery_date": {
                    "value": "002*20261115",
                    "start": 430,
                    "end": 442,
                    "confidence": 0.999999914369021,
                    "p_verify": 0.999999914369021,
                    "normalized": null,
                    "normalization_reason": "not_parseable_or_not_stated"
                }
            },
            "timing": {
                "read_ms": 510,
                "forwards": {
                    "fields": [
                        28,
                        0
                    ]
                },
                "stages": {
                    "fields": {
                        "reader": "recognition",
                        "doc": 0,
                        "branches": 2,
                        "generate": 477,
                        "locate": 1,
                        "verify": 28,
                        "assemble": 0
                    }
                },
                "total_ms": 510,
                "server_ms": 513
            }
        },
        },
        "decide": {
            "model": "clocked-1.0",
            "answers": {
                "processing_ready": {
                    "type": "noul",
                    "noul": 0.002,
                    "decision": false,
                    "threshold": 0.75
                },
                "review_scope": {
                    "type": "choice",
                    "choice": "business",
                    "probabilities": {
                        "none": 0.0022,
                        "structural": 0.0032,
                        "business": 0.9894,
                        "unsupported": 0.0053
                    },
                    "confidence": 0.9858
                },
                "risk_indicators": {
                    "type": "multiselect",
                    "selected": [
                        "missing_party"
                    ],
                    "probabilities": {
                        "missing_control_number": 0.01614348020692813,
                        "invalid_qualifier": 0.0063508495745153715,
                        "monetary_discrepancy": 0.005117496524991605,
                        "missing_party": 0.964158285504593,
                        "duplicate_reference": 0.0034353102863415863
                    },
                    "threshold": 0.65
                },
                "confidence": {
                    "type": "score",
                    "score": 1.8584,
                    "legend": {
                        "0": "High: complete, consistent, no validation issues.",
                        "1": "Medium: minor gaps or issues suitable for routine review.",
                        "2": "Low: significant missing or conflicting data; do not process without review."
                    },
                    "probabilities": {
                        "0": 0.0084,
                        "1": 0.1249,
                        "2": 0.8667
                    },
                    "confidence": 0.8001
                }
            },
            "usage": {
                "input_tokens": 942,
                "output_tokens": 19
            }
        }
    },
    "status": "processed",
    "blocked": false
}
```

Or send JSON directly:

```bash
curl -X POST http://localhost:8080/api/edi/process \\
  -H 'Content-Type: application/json' \\
  -H 'Idempotency-Key: edi-inbound-000123' \\
  -d '{"edi":"ST*810*0001~\\nBIG*20261031*INV-10025**PO-50021~\\n..."}'
```

### n8n Webhook endpoint (`POST /webhooks/edi`)

Suitable as the target of an n8n Webhook node. Accepts either:

- **Multipart form-data** with field name `file` (same as `/api/edi/process`)
- **JSON body** with an `edi` field: `{ "edi": "ST*810*0001~..." }`

Configure the Webhook node to accept POST and return the response from the last node / HTTP request.

### Response shape

```json
{
  "requestId": "...",
  "transactionType": "810",
  "structural": { "valid": true, "issues": [], "envelope": {} },
  "normalized": { "transactionType": "810", "invoice": {}, "lineItems": [] },
  "security": { "pii": {}, "injection": {}, "blocked": false },
  "clocked": { "extract": {}, "decide": {} },
  "status": "processed",
  "blocked": false
}
```

Possible statuses: `processed`, `processed_with_validation_issues`, `blocked_injection`, `security_check_failed`.

When `blocked` is true, the HTTP status is `422` (`blocked_injection`) or `503` (`security_check_failed`), and `security` includes:
- `blockedReason`: `injection_guard_flagged` or `security_check_failed`
- `blockedAt`: `pii` or `injection` - which security check blocked processing
- `reason`: a human-readable explanation of the block
- `detail` (injection block): safe diagnostic fields from the Clocked injection response (`flagged`, `risk`, `message`, `status`)
- `error` (check failure): `message`, `status` (`null` when the Clocked request had no HTTP status), and `retryable` - `retryable` is `true` for network errors, `429`, and >= 500; `false` for 409 Conflict and other non-retryable HTTP statuses

Raw EDI text and API secrets are never included in the response.

## Normalized transaction mapping

| Transaction | Key segments | Normalized content |
|---|---|---|
| 850 | BEG, REF, DTM, N1, PO1, PID, SCH | PO number/date, buyer/vendor/ship-to, references, dates, PO lines and schedules |
| 810 | BIG, REF, DTM, N1, IT1, PID, TDS | Invoice number/date, PO reference, bill-to/vendor, invoice lines and total |
| 856 | BSN, HL, TD1, TD5, REF, LIN, SN1, MAN, DTM | Shipment ID, carrier, references/tracking, HL tree and shipped quantities |
| 820 | BPR, TRN, REF, DTM, N1, RMR, ADX | Payment amount/method, trace, payer/payee and remittance invoice references |

## Project structure

```text
src/
  adapters/       # Transaction-specific 850/810/856/820 mappings
  clocked/        # Clocked HTTP client and per-transaction field definitions
  config/         # Environment configuration
  edi/            # X12 delimiter detection and segment parser
  services/       # End-to-end security + Extract + Decide pipeline
  index.js        # Express API and n8n webhook
  cli.js          # Local parse-only CLI
examples/         # Sample transaction files
 test/            # Node test runner tests
```

## Important production work before go-live

This is a working starter engine, not a certified X12 translator or trading-partner compliance product. Before production:

- Validate against the actual X12 release and each trading partner's companion guide.
- Expand loop scoping and qualifier-specific rules (especially N1 loops, 856 HL levels, 820 ENT/RMR/ADX groupings).
- Verify decimal scaling and currency rules per segment/transaction; do not treat every numeric field as cents. The 810 TDS conversion uses the conventional implied two-decimal example.
- Add authentication/authorization, rate limits, request-size policy, durable queue/retry/dead-letter handling, encrypted storage, retention policy and audit logging.
- Avoid storing raw EDI or unredacted PII in application logs.
- Reconcile invoice/order/payment against ERP records separately; Clocked extraction is not proof of external reconciliation.
- Confirm Clocked response schemas and ensure injection detection results are mapped correctly for your account.

## License

MIT License

Copyright (c) 2026 Ranjan Dailata
