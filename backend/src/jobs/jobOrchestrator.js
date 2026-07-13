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

  // Build prompt
  let prompt;
  if (job.sourcePlatform === 'APIC') prompt = prompts.buildAPICPrompt(parsedData, job.complexity);
  else if (job.sourcePlatform === 'DATAPOWER') prompt = prompts.buildDataPowerPrompt(parsedData, job.complexity);
  else prompt = prompts.buildIIBACEPrompt(parsedData, job.complexity);

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

  // Load RE artifact
  const reJsonPath = path.join(__dirname, '../../artifacts', jobId, 'reverse', 'full-reverse-engineering.json');
  if (!fs.existsSync(reJsonPath)) throw new Error('Reverse engineering artifacts not found. Run reverse engineering first.');
  const reData = JSON.parse(fs.readFileSync(reJsonPath, 'utf8'));

  // Build prompt
  let prompt;
  if (targetStack === 'JAVA_SPRING_BOOT') prompt = prompts.buildSpringBootPrompt(reData, job.complexity);
  else if (targetStack === 'NODEJS') prompt = prompts.buildNodeJSPrompt(reData, job.complexity);
  else if (targetStack === 'PYTHON_FASTAPI') prompt = prompts.buildPythonPrompt(reData, job.complexity);
  else throw new Error(`Unknown targetStack: ${targetStack}`);

  // Invoke LLM
  logger.info(`Invoking LLM for code generation job ${jobId}`);
  let genData;
  try {
    genData = await invokeLLM(prompt.system, prompt.user);
  } catch (llmErr) {
    logger.warn(`LLM failed, using fallback stub: ${llmErr.message}`);
    genData = buildFallbackGen(targetStack, reData);
  }

  // Validate
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

module.exports = { runReverseEngineer, runGenerate };
