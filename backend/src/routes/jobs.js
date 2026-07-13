'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const jobController = require('../controllers/jobController');
const { validateJobCreate, validateUpload } = require('../middleware/validators');
const { checkLLMConfig } = require('../llm/llmClient');

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
