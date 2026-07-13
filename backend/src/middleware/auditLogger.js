'use strict';
const db = require('../config/database');

function auditLogger(req, res, next) {
  const original = res.json.bind(res);
  res.json = (body) => {
    const auditEvents = {
      'POST /api/jobs': 'JOB_CREATED',
      'POST /api/jobs/:jobId/upload': 'FILE_UPLOADED',
      'POST /api/jobs/:jobId/reverse-engineer': 'RE_TRIGGERED',
      'POST /api/jobs/:jobId/generate': 'GENERATE_TRIGGERED',
      'GET /api/jobs/:jobId/reverse-artifacts/download': 'RE_ARTIFACTS_DOWNLOADED',
      'GET /api/jobs/:jobId/generated/download': 'GENERATED_DOWNLOADED',
    };

    const routeKey = `${req.method} ${req.route ? req.route.path : req.path}`;
    const event = auditEvents[routeKey];
    if (event && res.statusCode < 400) {
      const jobId = req.params.jobId || (body && body.jobId) || null;
      try {
        db.saveAuditLog({ jobId, event, detail: JSON.stringify({ path: req.path, body: req.body }), ip: req.ip });
      } catch (_) {}
    }
    return original(body);
  };
  next();
}

module.exports = { auditLogger };
