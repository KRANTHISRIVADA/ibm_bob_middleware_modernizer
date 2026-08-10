'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Builds the 14 reverse engineering artifacts (Markdown + JSON) from the LLM output.
 */
function buildArtifacts(jobId, reData) {
  const artifactsDir = path.join(__dirname, '../../artifacts', jobId, 'reverse');
  fs.mkdirSync(artifactsDir, { recursive: true });

  const files = [];

  // 1. Executive Summary
  files.push(write(artifactsDir, '01-executive-summary.md', buildExecutiveSummary(reData)));
  // 2. Interface Inventory
  files.push(write(artifactsDir, '02-interface-inventory.md', buildInterfaceInventory(reData)));
  // 3. Endpoint Catalog
  files.push(write(artifactsDir, '03-endpoint-catalog.md', buildEndpointCatalog(reData)));
  // 4. Source-to-Target Mapping Specification
  files.push(write(artifactsDir, '04-source-target-mapping.md', buildSourceMapping(reData)));
  // 5. Request/Response Schema Specification
  files.push(write(artifactsDir, '05-request-response-schemas.md', buildSchemas(reData)));
  // 6. Transformation Mapping Document
  files.push(write(artifactsDir, '06-transformation-mapping.md', buildTransformationMapping(reData)));
  // 7. Routing and Backend Endpoint Document
  files.push(write(artifactsDir, '07-routing-document.md', buildRoutingDocument(reData)));
  // 8. Security Policy Analysis
  files.push(write(artifactsDir, '08-security-analysis.md', buildSecurityAnalysis(reData)));
  // 9. Error Handling Document
  files.push(write(artifactsDir, '09-error-handling.md', buildErrorHandling(reData)));
  // 10. Non-Functional Requirements
  files.push(write(artifactsDir, '10-non-functional-requirements.md', buildNFR(reData)));
  // 11. Complexity Assessment
  files.push(write(artifactsDir, '11-complexity-assessment.md', buildComplexity(reData)));
  // 12. Migration Recommendation
  files.push(write(artifactsDir, '12-migration-recommendation.md', buildMigration(reData)));
  // 13. Test Scenario Inventory
  files.push(write(artifactsDir, '13-test-scenarios.md', buildTestScenarios(reData)));
  // 14. OpenAPI Specification
  if (reData.openApiSpec) {
    files.push(write(artifactsDir, '14-target-openapi-spec.json', JSON.stringify(reData.openApiSpec, null, 2)));
  }
  // Full JSON artifact
  files.push(write(artifactsDir, 'full-reverse-engineering.json', JSON.stringify({ jobId, ...reData }, null, 2)));

  return files;
}

function write(dir, name, content) {
  fs.writeFileSync(path.join(dir, name), content, 'utf8');
  return name;
}

function buildExecutiveSummary(d) {
  const device = d.deviceContext || {};
  const deviceInfo = device.deviceName
    ? `\n## Device Context\n- **Device:** ${device.deviceName}\n- **Domain:** ${device.domain || 'N/A'}\n- **Firmware:** ${device.firmwareVersion || 'N/A'}\n- **Export Date:** ${device.exportDate || 'N/A'}\n`
    : '';
  return `# Executive Summary\n\n**Source Platform:** ${d.sourcePlatform}\n**Complexity:** ${d.complexity}\n\n${d.executiveSummary || ''}${deviceInfo}\n## Key Facts\n- **Service Name:** ${d.apiTitle || d.services?.[0]?.name || 'N/A'}\n- **Endpoints Identified:** ${(d.endpointCatalog || []).length}\n- **Interfaces:** ${(d.interfaceInventory || []).length}\n- **Processing Pipeline Steps:** ${(d.processingPipeline || []).reduce((acc, p) => acc + (p.steps || []).length, 0)}\n- **XSLT Transformations:** ${(d.xsltTransformations || []).length}\n- **Gaps:** ${(d.gaps || []).length}\n- **Risks:** ${(d.risks || []).length}\n`;
}

function buildInterfaceInventory(d) {
  const rows = (d.interfaceInventory || []).map((i, idx) =>
    `| ${idx + 1} | ${i.name} | ${i.type} | ${i.description} |`).join('\n');
  return `# Interface Inventory\n\n| # | Name | Type | Description |\n|---|------|------|-------------|\n${rows}\n`;
}

function buildEndpointCatalog(d) {
  const rows = (d.endpointCatalog || []).map((e, idx) =>
    `| ${idx + 1} | ${(e.allowedMethods || [e.method]).filter(Boolean).join(', ') || '-'} | ${e.path || e.endpoint || ''} | ${e.port ? `:${e.port}` : ''} | ${e.summary || ''} | ${(e.security || []).join(', ')} | ${e.backendUrl || ''} |`).join('\n');
  return `# Endpoint Catalog\n\n| # | Methods | Path | Port | Summary | Security | Backend URL |\n|---|---------|------|------|---------|----------|-------------|\n${rows}\n`;
}

function buildSourceMapping(d) {
  const rows = (d.sourceMappings || []).map((m, idx) =>
    `| ${idx + 1} | ${m.sourceField} | ${m.targetField} | ${m.transformation} |`).join('\n');
  return `# Source-to-Target Mapping Specification\n\n| # | Source Field | Target Field | Transformation |\n|---|-------------|-------------|----------------|\n${rows}\n`;
}

function buildSchemas(d) {
  if (!d.requestResponseSchemas || !d.requestResponseSchemas.length) return '# Request/Response Schema Specification\n\n_No schemas extracted._\n';
  return '# Request/Response Schema Specification\n\n' + d.requestResponseSchemas.map(s =>
    `## ${s.endpoint}\n\n**Request Schema:**\n\`\`\`json\n${JSON.stringify(s.requestSchema || {}, null, 2)}\n\`\`\`\n\n**Response Schema:**\n\`\`\`json\n${JSON.stringify(s.responseSchema || {}, null, 2)}\n\`\`\`\n`
  ).join('\n');
}

function buildTransformationMapping(d) {
  // Prefer xsltTransformations (DataPower) then fall back to transformationMapping
  const xslt = (d.xsltTransformations || []).map((t, i) =>
    `### ${i + 1}. ${t.file || 'Transformation'}\n- **Direction:** ${t.direction || 'N/A'}\n- **Purpose:** ${t.purpose || ''}\n- **Input Format:** ${t.inputFormat || 'N/A'} → **Output Format:** ${t.outputFormat || 'N/A'}\n`).join('\n');
  const generic = (d.transformationMapping || []).map((t, i) =>
    `### ${i + 1}. ${t.step || 'Step'}\n- **Type:** ${t.type || ''}\n- **Logic:** ${t.logic || t.purpose || ''}\n`).join('\n');
  const pipeline = buildPipelineSection(d);
  return `# Transformation Mapping Document\n\n${pipeline}${xslt || generic || '_No transformations identified._'}\n`;
}

function buildPipelineSection(d) {
  if (!(d.processingPipeline || []).length) return '';
  const sections = (d.processingPipeline || []).map(p => {
    const steps = (p.steps || []).map(s =>
      `  ${s.stepNumber}. **${s.type}** \`${s.actionName}\` — Input: \`${s.input || '-'}\` → Output: \`${s.output || '-'}\`${s.transform ? ` [${s.transform}]` : ''}${s.notes ? ` — ${s.notes}` : ''}`
    ).join('\n');
    return `### Service: ${p.serviceName} (${p.direction})\n${steps}`;
  }).join('\n\n');
  return `## Processing Pipeline\n\n${sections}\n\n`;
}

function buildRoutingDocument(d) {
  const rows = (d.routingDocument || []).map((r, idx) =>
    `| ${idx + 1} | ${r.rule} | ${r.condition} | ${r.matchingObject || '-'} | ${r.backendUrl || r.destination || ''} |`).join('\n');
  return `# Routing and Backend Endpoint Document\n\n| # | Rule | Condition | Matching Object | Backend URL |\n|---|------|-----------|----------------|-------------|\n${rows}\n`;
}

function buildSecurityAnalysis(d) {
  const sec = d.securityAnalysis || {};
  return `# Security Policy Analysis\n\n**Policies:** ${(sec.policies || []).join(', ') || 'None'}\n\n**OAuth:** ${sec.oauth || sec.oauthFlows?.length ? 'Yes' : 'No'}\n**API Key:** ${sec.apiKey || sec.apiKeys?.length ? 'Yes' : 'No'}\n**JWT:** ${sec.jwt ? 'Yes' : 'No'}\n**mTLS:** ${sec.mtls ? 'Yes' : 'No'}\n\n**Notes:** ${sec.notes || ''}\n\n## Crypto Objects\n${(sec.cryptoObjects || []).map(c => `- ${c.name || c}`).join('\n') || '- None'}\n`;
}

function buildErrorHandling(d) {
  const rows = (d.errorHandling || []).map((e, idx) =>
    `| ${idx + 1} | ${e.errorCode} | ${e.handling} | ${e.response || ''} |`).join('\n');
  return `# Error Handling and Fault Mapping\n\n| # | Error Code | Handling Strategy | Response |\n|---|-----------|-------------------|----------|\n${rows || '| - | - | No error handling defined | - |'}\n`;
}

function buildNFR(d) {
  const nfr = d.nonFunctionalRequirements || {};
  return `# Non-Functional Requirements\n\n| Concern | Value |\n|---------|-------|\n| Front Timeout | ${nfr.frontTimeout || nfr.timeout || 'Not specified'} |\n| Back Timeout | ${nfr.backTimeout || 'Not specified'} |\n| Retry | ${nfr.retry || 'Not specified'} |\n| Rate Limiting | ${nfr.rateLimit || 'Not specified'} |\n| Logging | ${nfr.logging || 'Not specified'} |\n| Throttling | ${nfr.throttling || 'Not specified'} |\n| Max Message Size | ${nfr.maxMessageSize || 'Not specified'} |\n| Persistent Connections | ${nfr.persistentConnections || 'Not specified'} |\n`;
}

function buildComplexity(d) {
  const c = d.complexityAssessment || {};
  const factors = (c.factors || []).map(f => `- ${f}`).join('\n');
  return `# Complexity Assessment Report\n\n**Score:** ${c.score || d.complexity}\n\n**Rationale:** ${c.rationale || ''}\n\n## Contributing Factors\n${factors || '- Not specified'}\n`;
}

function buildMigration(d) {
  const m = d.migrationRecommendation || {};
  const risks = (m.risks || []).map(r => `- ${r}`).join('\n');
  return `# Migration Recommendation Report\n\n**Recommended Target Stack:** ${m.recommendedStack || 'Not specified'}\n**Estimated Effort:** ${m.estimatedEffort || 'Not specified'}\n\n**Rationale:** ${m.rationale || ''}\n\n## Risks\n${risks || '- None identified'}\n\n## General Recommendations\n${(d.recommendations || []).map(r => `- ${r}`).join('\n') || '- None'}\n`;
}

function buildTestScenarios(d) {
  const rows = (d.testScenarios || []).map((t, idx) =>
    `| ${t.id || idx + 1} | ${t.type || ''} | ${t.description} | ${t.input || ''} | ${t.expectedOutput || ''} |`).join('\n');
  return `# Test Scenario Inventory\n\n| ID | Type | Description | Input | Expected Output |\n|----|------|-------------|-------|-----------------|\n${rows || '| - | - | No test scenarios defined | - | - |'}\n`;
}

module.exports = { buildArtifacts };
