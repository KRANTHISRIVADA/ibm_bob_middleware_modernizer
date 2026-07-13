'use strict';
const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  logger.error('Unhandled error', { status, message, stack: err.stack, path: req.path });
  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
