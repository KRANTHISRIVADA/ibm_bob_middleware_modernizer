'use strict';
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const db = require('../config/database');
const jobOrchestrator = require('../jobs/jobOrchestrator');
const logger = require('../utils/logger');

// POST /api/jobs
async function createJob(req, res, next) {
  try {
    const { name, sourcePlatform, complexity, description } = req.body;
    const jobId = uuidv4();
    const now = new Date().toISOString();
    const job = {
      id: jobId, name, sourcePlatform, complexity,
      description: description || '',
      status: 'CREATED',
      createdAt: now, updatedAt: now,
    };
    db.saveJob(job);
    logger.info(`Job created: ${jobId}`, { jobId, sourcePlatform, complexity });
    res.status(201).json({ jobId, ...job });
  } catch (err) { next(err); }
}

// GET /api/jobs
async function listJobs(req, res, next) {
  try {
    const jobs = db.listJobs();
    res.json({ jobs });
  } catch (err) { next(err); }
}

// GET /api/jobs/:jobId
async function getJob(req, res, next) {
  try {
    const job = db.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) { next(err); }
}

// POST /api/jobs/:jobId/upload
async function uploadArtifact(req, res, next) {
  try {
    const { jobId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const job = db.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    db.updateJob(jobId, { uploadedFile: req.file.originalname, status: 'UPLOADED', updatedAt: new Date().toISOString() });
    logger.info(`File uploaded for job ${jobId}: ${req.file.originalname}`);
    res.json({ jobId, filename: req.file.originalname, size: req.file.size, status: 'UPLOADED' });
  } catch (err) { next(err); }
}

// POST /api/jobs/:jobId/reverse-engineer
async function triggerReverseEngineer(req, res, next) {
  try {
    const { jobId } = req.params;
    const job = db.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!['UPLOADED', 'RE_FAILED'].includes(job.status))
      return res.status(400).json({ error: `Cannot reverse engineer from status: ${job.status}` });

    db.updateJob(jobId, { status: 'RE_IN_PROGRESS', updatedAt: new Date().toISOString() });
    // Run async
    jobOrchestrator.runReverseEngineer(jobId).catch(err => {
      logger.error(`RE failed for ${jobId}`, { err: err.message });
      db.updateJob(jobId, { status: 'RE_FAILED', error: err.message, updatedAt: new Date().toISOString() });
    });
    res.json({ jobId, status: 'RE_IN_PROGRESS' });
  } catch (err) { next(err); }
}

// GET /api/jobs/:jobId/status
async function getStatus(req, res, next) {
  try {
    const job = db.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ jobId: job.id, status: job.status, updatedAt: job.updatedAt, error: job.error || null });
  } catch (err) { next(err); }
}

// GET /api/jobs/:jobId/reverse-artifacts
async function listReverseArtifacts(req, res, next) {
  try {
    const { jobId } = req.params;
    const artifactsDir = path.join(__dirname, '../../artifacts', jobId, 'reverse');
    if (!fs.existsSync(artifactsDir)) return res.json({ artifacts: [] });
    const files = fs.readdirSync(artifactsDir).map(f => ({
      name: f,
      size: fs.statSync(path.join(artifactsDir, f)).size,
      url: `/api/jobs/${jobId}/reverse-artifacts/download?file=${encodeURIComponent(f)}`,
    }));
    res.json({ artifacts: files });
  } catch (err) { next(err); }
}

// GET /api/jobs/:jobId/reverse-artifacts/download
async function downloadReverseArtifacts(req, res, next) {
  try {
    const { jobId } = req.params;
    const artifactsDir = path.join(__dirname, '../../artifacts', jobId, 'reverse');
    if (!fs.existsSync(artifactsDir)) return res.status(404).json({ error: 'No artifacts found' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="reverse-artifacts-${jobId}.zip"`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => next(err));
    archive.pipe(res);
    archive.directory(artifactsDir, false);
    archive.finalize();
  } catch (err) { next(err); }
}

// POST /api/jobs/:jobId/generate
async function triggerGenerate(req, res, next) {
  try {
    const { jobId } = req.params;
    const { targetStack } = req.body;
    if (!targetStack) return res.status(400).json({ error: 'targetStack is required (JAVA_SPRING_BOOT|NODEJS|PYTHON_FASTAPI)' });

    const job = db.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!['RE_COMPLETE', 'GEN_FAILED'].includes(job.status))
      return res.status(400).json({ error: `Cannot generate from status: ${job.status}` });

    db.updateJob(jobId, { targetStack, status: 'GEN_IN_PROGRESS', updatedAt: new Date().toISOString() });
    jobOrchestrator.runGenerate(jobId, targetStack).catch(err => {
      logger.error(`Generation failed for ${jobId}`, { err: err.message });
      db.updateJob(jobId, { status: 'GEN_FAILED', error: err.message, updatedAt: new Date().toISOString() });
    });
    res.json({ jobId, targetStack, status: 'GEN_IN_PROGRESS' });
  } catch (err) { next(err); }
}

// GET /api/jobs/:jobId/generated/download
async function downloadGenerated(req, res, next) {
  try {
    const { jobId } = req.params;
    const generatedDir = path.join(__dirname, '../../artifacts', jobId, 'generated');
    if (!fs.existsSync(generatedDir)) return res.status(404).json({ error: 'No generated code found' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="generated-microservice-${jobId}.zip"`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => next(err));
    archive.pipe(res);
    archive.directory(generatedDir, false);
    archive.finalize();
  } catch (err) { next(err); }
}

module.exports = {
  createJob, listJobs, getJob, uploadArtifact, triggerReverseEngineer,
  getStatus, listReverseArtifacts, downloadReverseArtifacts, triggerGenerate, downloadGenerated,
};
