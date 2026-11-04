import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import path from 'node:path';
import { env } from './config/env.js';
import { EdiPipeline } from './services/pipeline.js';

const app = express();
const pipeline = new EdiPipeline();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 }
});

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: `${env.maxUploadMb}mb` }));

// Serve frontend static files
const frontendPath = path.resolve(process.cwd(), 'frontend');
app.use(express.static(frontendPath));

// Serve frontend for SPA routes
app.get('/', (_req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  service: 'clocked-edi-engine',
  mode: env.clockedMode,
  supportedTransactions: ['850', '810', '856', '820']
}));

async function handleEdi(req, res, next) {
  try {
    const rawText = req.file ?
      req.file.buffer.toString('utf8') :
      (req.body?.edi || req.body?.text || req.body?.rawText);

    if (!rawText || typeof rawText !== 'string')
      return res.status(400).json({
        error: 'Provide EDI content in `edi`, `text`, or `rawText`, or upload a file.'
      });

    const result = await pipeline.process(rawText, { requestId: req.get('Idempotency-Key') || undefined });
    const statusCode = result.status === 'security_check_failed' ? 503 :
      result.status === 'blocked_injection' ? 422 : 200;

    return res.status(statusCode).json(result);
  } catch (err) { next(err); }
}

app.post('/api/edi/process', upload.single('file'), handleEdi);

// n8n Webhook node can POST raw EDI in JSON { "edi": "..." }.
app.post('/webhooks/edi', upload.single('file'), handleEdi);

app.use((err, _req, res, _next) => {
  const status = err.status || (err instanceof multer.MulterError ? 413 : 500);
  res.status(status).json({
    error: err.message || 'Internal server error',
    details: env.nodeEnv === 'development' ? err.body : undefined
  });
});

app.listen(env.port, () =>
  console.log(`Clocked EDI Engine listening on :${env.port} (${env.clockedMode} mode)`));
