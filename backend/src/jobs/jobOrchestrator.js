'use strict';
const fs = require('fs');
const path = require('path');
const { parseSource } = require('../parsers');
const { invokeLLM } = require('../llm/llmClient');
const prompts = require('../llm/prompts');
const { validateRE, validateGen } = require('../llm/schemaValidator');
const { buildArtifacts } = require('../artifacts/artifactBuilder');
const db = require('../config/database');
const logger = require('../utils/logger');
const { retrieveForRE, retrieveForGen } = require('../rag/ragRetriever');

async function runReverseEngineer(jobId) {
  logger.info(`Starting reverse engineering for job ${jobId}`);
  const job = db.getJob(jobId);
  if (!job) throw new Error('Job not found');

  // Find uploaded file
  const uploadDir = path.join(__dirname, '../../uploads', jobId);
  if (!fs.existsSync(uploadDir)) throw new Error('No uploaded file found');
  const files = fs.readdirSync(uploadDir);
  if (!files.length) throw new Error('Upload directory is empty');
  const filePath = path.join(uploadDir, files[0]);

  // Parse source
  logger.info(`Parsing ${job.sourcePlatform} file: ${files[0]}`);
  const parsedData = await parseSource(jobId, job.sourcePlatform, filePath);

  // ── RAG: retrieve domain knowledge relevant to this source artifact ──────
  logger.info(`RAG: retrieving domain knowledge for ${job.sourcePlatform} RE`);
  const ragContext = retrieveForRE(parsedData, job.sourcePlatform);

  // Build prompt — inject RAG context as additional system knowledge
  let prompt;
  if (job.sourcePlatform === 'APIC') prompt = prompts.buildAPICPrompt(parsedData, job.complexity, ragContext);
  else if (job.sourcePlatform === 'DATAPOWER') prompt = prompts.buildDataPowerPrompt(parsedData, job.complexity, ragContext);
  else prompt = prompts.buildIIBACEPrompt(parsedData, job.complexity, ragContext);

  // Invoke LLM
  logger.info(`Invoking LLM for reverse engineering job ${jobId}`);
  let reData;
  try {
    reData = await invokeLLM(prompt.system, prompt.user);
  } catch (llmErr) {
    logger.warn(`LLM failed, using fallback stub: ${llmErr.message}`);
    reData = buildFallbackRE(job, parsedData);
  }

  // Validate
  const validation = validateRE(reData);
  if (!validation.valid) {
    logger.warn(`RE validation warnings for ${jobId}: ${validation.errors.join(', ')}`);
  }

  // Build artifact files
  const artifacts = buildArtifacts(jobId, { jobId, ...reData });
  logger.info(`Built ${artifacts.length} artifacts for job ${jobId}`);

  db.updateJob(jobId, { status: 'RE_COMPLETE', updatedAt: new Date().toISOString() });
  logger.info(`Reverse engineering complete for job ${jobId}`);
}

async function runGenerate(jobId, targetStack) {
  logger.info(`Starting code generation for job ${jobId}, target: ${targetStack}`);
  const job = db.getJob(jobId);
  if (!job) throw new Error('Job not found');

  // Load RE artifacts
  const reverseDir = path.join(__dirname, '../../artifacts', jobId, 'reverse');
  const reJsonPath = path.join(reverseDir, 'full-reverse-engineering.json');
  if (!fs.existsSync(reJsonPath)) throw new Error('Reverse engineering artifacts not found. Run reverse engineering first.');
  const reData = JSON.parse(fs.readFileSync(reJsonPath, 'utf8'));

  // Build a rich context object from the RE structured JSON + individual markdown artifacts.
  // Each markdown file captures a dedicated RE section — feeding them alongside the JSON
  // gives the LLM the full picture without relying on it to parse one monolithic blob.
  const reContext = buildREContext(reverseDir, reData);

  // ── RAG: retrieve code generation patterns for this stack + platform ──────
  logger.info(`RAG: retrieving codegen patterns for ${targetStack}`);
  const ragContext = retrieveForGen(reContext, targetStack);

  // Build prompt(s) with RAG context injected.
  // Spring Boot returns an ARRAY of batch prompts (A/B/C) to stay within token limits.
  // Node.js and Python return a single prompt object.
  let promptOrBatches;
  if (targetStack === 'JAVA_SPRING_BOOT') promptOrBatches = prompts.buildSpringBootPrompt(reContext, job.complexity, ragContext);
  else if (targetStack === 'NODEJS')       promptOrBatches = prompts.buildNodeJSPrompt(reContext, job.complexity, ragContext);
  else if (targetStack === 'PYTHON_FASTAPI') promptOrBatches = prompts.buildPythonPrompt(reContext, job.complexity, ragContext);
  else throw new Error(`Unknown targetStack: ${targetStack}`);

  // Invoke LLM — jsonMode:false because code-gen produces large multi-line file content.
  // Spring Boot calls LLM once per batch and merges all files[] arrays.
  logger.info(`Invoking LLM for code generation job ${jobId}`);
  let genData;
  try {
    const batches = Array.isArray(promptOrBatches) ? promptOrBatches : [promptOrBatches];
    const allFiles = [];
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      // Pause between batches to avoid Groq/OpenAI per-minute rate limits (free tier = ~30 RPM).
      // First batch runs immediately; subsequent batches wait 3 seconds.
      if (i > 0) await sleep(3000);
      logger.info(`LLM batch ${batch.batch || 'single'} (${i + 1}/${batches.length}) for job ${jobId}`);
      // Retry once on 429 after a longer back-off
      const batchResult = await invokeLLMWithRetry(batch.system, batch.user, { jsonMode: false }, logger);
      if (batchResult.files && Array.isArray(batchResult.files)) {
        logger.info(`Batch ${batch.batch || 'single'} returned ${batchResult.files.length} files`);
        allFiles.push(...batchResult.files);
      } else {
        logger.warn(`Batch ${batch.batch || 'single'} returned unexpected shape — skipping`);
      }
    }
    if (allFiles.length === 0) throw new Error('All batches returned empty file lists');
    genData = { files: allFiles };
  } catch (llmErr) {
    logger.warn(`LLM failed, using fallback stub: ${llmErr.message}`);
    genData = buildFallbackGen(targetStack, reData);
  }

  // Validate merged output
  const validation = validateGen(genData);
  if (!validation.valid) {
    logger.warn(`Gen validation failed for ${jobId}: ${validation.errors.join(', ')} — using fallback stub`);
    genData = buildFallbackGen(targetStack, reData);
  }

  // Write files
  const genDir = path.join(__dirname, '../../artifacts', jobId, 'generated');
  fs.mkdirSync(genDir, { recursive: true });
  for (const file of genData.files) {
    // Prevent path traversal
    const safePath = path.join(genDir, file.path.replace(/\.\.\//g, '').replace(/\.\.\\/g, ''));
    fs.mkdirSync(path.dirname(safePath), { recursive: true });
    fs.writeFileSync(safePath, file.content, 'utf8');
  }

  logger.info(`Generated ${genData.files.length} files for job ${jobId}`);
  db.updateJob(jobId, { status: 'GEN_COMPLETE', updatedAt: new Date().toISOString() });
  logger.info(`Code generation complete for job ${jobId}`);
}

function buildFallbackRE(job, parsedData) {
  return {
    sourcePlatform: job.sourcePlatform,
    complexity: job.complexity,
    executiveSummary: `Reverse engineering of ${job.sourcePlatform} artifact. LLM not available — parsed metadata used as baseline. Manual review required.`,
    interfaceInventory: parsedData.endpoints?.map(e => ({ name: e.operationId || e.path, type: 'REST', description: e.summary || '' })) || [],
    endpointCatalog: parsedData.endpoints?.map(e => ({ method: e.method, path: e.path, operationId: e.operationId, summary: e.summary, security: [], backendUrl: parsedData.backendUrls?.[0] || '' })) || [],
    sourceMappings: [],
    requestResponseSchemas: [],
    transformationMapping: [],
    routingDocument: [],
    securityAnalysis: { policies: parsedData.securityPolicies?.map(s => s.name) || [], notes: 'Manual review required' },
    errorHandling: [],
    nonFunctionalRequirements: { timeout: 'Not specified', retry: 'Not specified', rateLimit: 'Not specified', logging: 'Standard', throttling: 'Not specified' },
    complexityAssessment: { score: job.complexity, rationale: 'Based on user-selected complexity', factors: [] },
    migrationRecommendation: { recommendedStack: 'JAVA_SPRING_BOOT', rationale: 'Default recommendation. LLM analysis required for detailed recommendation.', risks: [], estimatedEffort: 'TBD' },
    testScenarios: [],
    gaps: ['LLM analysis not available - configure OPENAI_API_KEY or IBM watsonx credentials'],
    risks: ['Manual review of all extracted metadata required'],
    recommendations: ['Configure LLM provider for full AI-driven analysis'],
  };
}

function buildFallbackGen(targetStack, reData) {
  const files = [];
  if (targetStack === 'JAVA_SPRING_BOOT') {
    files.push({ path: 'README.md', content: `# Generated Microservice\n\nSource: ${reData.sourcePlatform}\n\n> LLM not available. Configure OPENAI_API_KEY and re-run code generation.\n` });
    files.push({ path: 'pom.xml', content: `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0">\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>com.modernizer</groupId>\n  <artifactId>generated-service</artifactId>\n  <version>1.0.0-SNAPSHOT</version>\n  <!-- Configure LLM for full generation -->\n</project>\n` });
  } else if (targetStack === 'NODEJS') {
    files.push({ path: 'README.md', content: `# Generated Microservice\n\nSource: ${reData.sourcePlatform}\n\n> LLM not available. Configure OPENAI_API_KEY and re-run code generation.\n` });
    files.push({ path: 'package.json', content: JSON.stringify({ name: 'generated-service', version: '1.0.0' }, null, 2) });
  } else {
    files.push({ path: 'README.md', content: `# Generated Microservice\n\nSource: ${reData.sourcePlatform}\n\n> LLM not available. Configure OPENAI_API_KEY and re-run code generation.\n` });
    files.push({ path: 'requirements.txt', content: 'fastapi\nuvicorn\npydantic\n' });
  }
  return { files };
}

/**
 * Assembles a rich, focused code-generation context from:
 *  - The structured fields of full-reverse-engineering.json  (endpoints, schemas, security, NFR, etc.)
 *  - The individual markdown artifact files                  (human-readable RE sections as text)
 *
 * Noise fields (jobId, raw openApiSpec blob) are stripped to keep token count in check.
 * Every code-generation prompt receives this single object instead of the raw RE JSON.
 */
function buildREContext(reverseDir, reData) {
  // 1. Structured fields — strip noise, keep everything the code generator needs
  const structured = {
    sourcePlatform:           reData.sourcePlatform,
    complexity:               reData.complexity,
    apiTitle:                 reData.apiTitle || reData.services?.[0]?.name || 'GeneratedService',
    apiVersion:               reData.apiVersion || '1.0.0',
    executiveSummary:         reData.executiveSummary || '',
    interfaceInventory:       reData.interfaceInventory       || [],
    endpointCatalog:          reData.endpointCatalog          || [],
    sourceMappings:           reData.sourceMappings           || [],
    requestResponseSchemas:   reData.requestResponseSchemas   || [],
    transformationMapping:    reData.transformationMapping    || reData.xsltTransformations || [],
    routingDocument:          reData.routingDocument          || [],
    securityAnalysis:         reData.securityAnalysis         || {},
    errorHandling:            reData.errorHandling            || [],
    nonFunctionalRequirements:reData.nonFunctionalRequirements|| {},
    complexityAssessment:     reData.complexityAssessment     || {},
    migrationRecommendation:  reData.migrationRecommendation  || {},
    testScenarios:            reData.testScenarios            || [],
    gaps:                     reData.gaps                     || [],
    risks:                    reData.risks                    || [],
    recommendations:          reData.recommendations          || [],
    // Platform-specific extras
    services:                 reData.services                 || [],   // DataPower MPGW/WSP
    messageFlows:             reData.messageFlows             || [],   // IIB/ACE
    esqlModules:              reData.esqlModules              || [],   // IIB/ACE
    xsltTransformations:      reData.xsltTransformations      || [],   // DataPower
    gatewayScripts:           reData.gatewayScripts           || [],   // DataPower
  };

  // 2. Individual artifact markdown files — read each one so the LLM sees
  //    the already-formatted RE output section by section
  const artifactFiles = [
    '01-executive-summary.md',
    '02-interface-inventory.md',
    '03-endpoint-catalog.md',
    '04-source-target-mapping.md',
    '05-request-response-schemas.md',
    '06-transformation-mapping.md',
    '07-routing-document.md',
    '08-security-analysis.md',
    '09-error-handling.md',
    '10-non-functional-requirements.md',
    '11-complexity-assessment.md',
    '12-migration-recommendation.md',
    '13-test-scenarios.md',
  ];

  const artifacts = {};
  for (const filename of artifactFiles) {
    const fullPath = require('path').join(reverseDir, filename);
    if (fs.existsSync(fullPath)) {
      const key = filename.replace(/^\d+-/, '').replace('.md', '').replace(/-/g, '_');
      artifacts[key] = fs.readFileSync(fullPath, 'utf8');
    }
  }

  return { structured, artifacts };
}

/** Waits ms milliseconds */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calls invokeLLM and retries once on HTTP 429 (rate limit).
 * Reads Retry-After header if present, otherwise backs off 15 seconds.
 */
async function invokeLLMWithRetry(system, user, options, log) {
  try {
    return await invokeLLM(system, user, options);
  } catch (err) {
    const status = err.response?.status;
    if (status === 429) {
      const retryAfter = parseInt(err.response?.headers?.['retry-after'] || '15', 10);
      const waitMs = (retryAfter + 2) * 1000;   // add 2s buffer
      log.warn(`Rate limited (429). Retrying batch after ${waitMs / 1000}s...`);
      await sleep(waitMs);
      return await invokeLLM(system, user, options);  // one retry only
    }
    throw err;
  }
}

module.exports = { runReverseEngineer, runGenerate };
