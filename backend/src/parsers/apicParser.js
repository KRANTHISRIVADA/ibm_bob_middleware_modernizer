'use strict';
/**
 * APIC Parser — extracts metadata from IBM API Connect YAML/OpenAPI files.
 */
const yaml = require('js-yaml');
const fs = require('fs');

function parse(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const doc = yaml.load(raw);

  const info = doc.info || {};
  const paths = doc.paths || {};
  const components = doc.components || doc.definitions || {};
  const security = doc.securityDefinitions || doc.components?.securitySchemes || {};
  const servers = doc.servers || (doc.host ? [{ url: `${doc.schemes?.[0] || 'https'}://${doc.host}${doc.basePath || ''}` }] : []);

  const endpoints = [];
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!['get','post','put','patch','delete','head','options'].includes(method)) continue;
      endpoints.push({
        path: pathKey,
        method: method.toUpperCase(),
        operationId: operation.operationId || `${method}_${pathKey.replace(/[^a-zA-Z0-9]/g,'_')}`,
        summary: operation.summary || '',
        description: operation.description || '',
        parameters: operation.parameters || [],
        requestBody: operation.requestBody || null,
        responses: operation.responses || {},
        security: operation.security || [],
        tags: operation.tags || [],
        xIBMConfiguration: operation['x-ibm-configuration'] || null,
      });
    }
  }

  const securityPolicies = Object.entries(security).map(([name, scheme]) => ({
    name,
    type: scheme.type,
    scheme: scheme.scheme || null,
    flows: scheme.flows || null,
    in: scheme.in || null,
  }));

  const backendUrls = [];
  if (doc['x-ibm-configuration']) {
    const xibm = doc['x-ibm-configuration'];
    const assembly = xibm.assembly;
    if (assembly && assembly.execute) {
      for (const step of assembly.execute) {
        if (step.invoke && step.invoke['target-url']) {
          backendUrls.push(step.invoke['target-url']);
        }
      }
    }
  }

  return {
    sourcePlatform: 'APIC',
    apiTitle: info.title || 'Unknown',
    apiVersion: info.version || 'Unknown',
    description: info.description || '',
    servers,
    endpoints,
    securityPolicies,
    backendUrls,
    schemas: components,
    rawSpec: doc,
  };
}

module.exports = { parse };
