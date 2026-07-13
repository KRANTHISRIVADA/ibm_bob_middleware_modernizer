'use strict';

// JSON Schema for the reverse engineering output
const RE_SCHEMA = {
  type: 'object',
  required: ['sourcePlatform', 'complexity', 'executiveSummary'],
  properties: {
    sourcePlatform: { type: 'string', enum: ['APIC', 'DATAPOWER', 'IIB_ACE'] },
    complexity: { type: 'string', enum: ['SIMPLE', 'INTERMEDIATE', 'COMPLEX'] },
    executiveSummary: { type: 'string', minLength: 10 },
    interfaceInventory: { type: 'array' },
    endpointCatalog: { type: 'array' },
    sourceMappings: { type: 'array' },
    securityAnalysis: { type: 'object' },
    errorHandling: { type: 'array' },
    complexityAssessment: { type: 'object' },
    migrationRecommendation: { type: 'object' },
    testScenarios: { type: 'array' },
    gaps: { type: 'array' },
    risks: { type: 'array' },
    recommendations: { type: 'array' },
  },
};

const GEN_SCHEMA = {
  type: 'object',
  required: ['files'],
  properties: {
    files: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['path', 'content'],
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
      },
    },
  },
};

const { Validator } = require('jsonschema');
const validator = new Validator();

function validateRE(data) {
  const result = validator.validate(data, RE_SCHEMA);
  return { valid: result.valid, errors: result.errors.map(e => e.message) };
}

function validateGen(data) {
  const result = validator.validate(data, GEN_SCHEMA);
  return { valid: result.valid, errors: result.errors.map(e => e.message) };
}

module.exports = { validateRE, validateGen, RE_SCHEMA, GEN_SCHEMA };
