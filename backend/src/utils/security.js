'use strict';
// Security utility — masks secrets/credentials in uploaded content
const MASK = '***MASKED***';
const SECRET_PATTERNS = [
  /apikey\s*[:=]\s*\S+/gi,
  /api[_-]?key\s*[:=]\s*\S+/gi,
  /password\s*[:=]\s*\S+/gi,
  /secret\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi,
  /Authorization:\s*(Basic|Bearer)\s+\S+/gi,
  /-----BEGIN [A-Z ]*KEY-----[\s\S]*?-----END [A-Z ]*KEY-----/gi,
];

function maskCredentials(text) {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, MASK);
  }
  return result;
}

function sanitizeFilePath(inputPath) {
  // Prevent path traversal
  return inputPath.replace(/\.\./g, '').replace(/[/\\]{2,}/g, '/').replace(/^[/\\]/, '');
}

function validateFileExtension(filename, allowed = ['.yaml', '.yml', '.json', '.zip', '.wsdl', '.xsd', '.xml']) {
  const ext = require('path').extname(filename).toLowerCase();
  return allowed.includes(ext);
}

module.exports = { maskCredentials, sanitizeFilePath, validateFileExtension };
