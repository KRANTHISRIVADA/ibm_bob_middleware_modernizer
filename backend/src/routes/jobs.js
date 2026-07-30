'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const jobController = require('../controllers/jobController');
const { validateJobCreate, validateUpload } = require('../middleware/validators');
const { checkLLMConfig } = require('../llm/llmClient');
const ragStore = require('../rag/ragStore');

// Multer config — store to disk under uploads/<jobId>
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads', req.params.jobId || 'tmp');
    const fs = require('fs');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.yaml', '.yml', '.json', '.zip', '.wsdl', '.xsd', '.xml'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error(`File type ${ext} not allowed`), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '50') * 1024 * 1024 },
});

// LLM health check
router.get('/llm/status', (req, res) => res.json(checkLLMConfig()));

// ── RAG routes ────────────────────────────────────────────────────────────────

// GET /api/rag/status — returns index stats and a sample of indexed documents
router.get('/rag/status', (req, res) => {
  try {
    ragStore.ensureIndex();
    const stats = ragStore.getStats();
    const docs  = ragStore.getAllDocs().map(d => ({
      id: d.id, platform: d.platform, phase: d.phase, title: d.title,
    }));
    res.json({ status: 'ok', ...stats, documents: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rag/index — force rebuild the BM25 index (useful after hot-reloading knowledge files)
router.post('/rag/index', (req, res) => {
  try {
    ragStore.buildIndex();
    res.json({ status: 'rebuilt', ...ragStore.getStats() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rag/search — test retrieval for a free-text query (dev/debug tool)
router.post('/rag/search', (req, res) => {
  try {
    const { query, platform, phase, topK } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });
    const results = ragStore.search(query, {
      platform: platform || undefined,
      phase:    phase    || undefined,
      topK:     topK     || 5,
    });
    res.json({
      query, count: results.length,
      results: results.map(r => ({ id: r.id, title: r.title, score: r.score, platform: r.platform, phase: r.phase })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Routes
router.post('/jobs', validateJobCreate, jobController.createJob);
router.get('/jobs', jobController.listJobs);
router.get('/jobs/:jobId', jobController.getJob);
router.post('/jobs/:jobId/upload', upload.single('file'), jobController.uploadArtifact);
router.post('/jobs/:jobId/reverse-engineer', jobController.triggerReverseEngineer);
router.get('/jobs/:jobId/status', jobController.getStatus);
router.get('/jobs/:jobId/reverse-artifacts', jobController.listReverseArtifacts);
router.get('/jobs/:jobId/reverse-artifacts/download', jobController.downloadReverseArtifacts);
router.post('/jobs/:jobId/generate', jobController.triggerGenerate);
router.get('/jobs/:jobId/generated/download', jobController.downloadGenerated);

module.exports = router;
