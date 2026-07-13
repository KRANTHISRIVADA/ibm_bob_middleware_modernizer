'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const jobRoutes = require('./routes/jobs');
const { errorHandler } = require('./middleware/errorHandler');
const { auditLogger } = require('./middleware/auditLogger');
const logger = require('./utils/logger');
const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 4000;

// Ensure storage directories exist
['uploads', 'artifacts'].forEach(dir => {
  const p = path.join(__dirname, '..', dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Security middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Audit logging
app.use(auditLogger);

// Routes
app.use('/api', jobRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use(errorHandler);

// Start server (async because db.init() is async)
async function start() {
  await db.init();
  app.listen(PORT, () => {
    logger.info(`AI Modernizer backend running on port ${PORT}`);
  });
}

// Only start when run directly (not required by tests)
if (require.main === module) {
  start().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { app, start };
