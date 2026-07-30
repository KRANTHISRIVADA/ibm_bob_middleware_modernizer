'use strict';
/**
 * RAG Retriever — builds BM25 queries from parsed metadata and formats
 * retrieved knowledge chunks as a prompt section injected before LLM calls.
 *
 * Public API:
 *   retrieveForRE(parsedData, sourcePlatform)  → string (prompt block)
 *   retrieveForGen(reContext, targetStack)      → string (prompt block)
 */
const store = require('./ragStore');
const logger = require('../utils/logger');

// ─── Query builders ───────────────────────────────────────────────────────────

/**
 * Builds a BM25 query string from parsed source artifact metadata.
 * The richer the parsed data, the more targeted the retrieval.
 */
function buildREQuery(parsedData, sourcePlatform) {
  const terms = [sourcePlatform];

  // Platform-specific signals
  if (sourcePlatform === 'DATAPOWER') {
    // Service types present in the export
    const serviceTypes = (parsedData.services || []).map(s => s.type).filter(Boolean);
    if (serviceTypes.includes('MPGW')) terms.push('MPGW MultiProtocolGateway service routing');
    if (serviceTypes.includes('WSP'))  terms.push('WSP WebServicesProxy SOAP WSDL');

    if ((parsedData.xsltFiles || []).length)         terms.push('XSLT transformation stylesheet');
    if ((parsedData.gatewayScriptFiles || []).length) terms.push('GatewayScript JavaScript gws');
    if ((parsedData.cryptoReferences || []).length)   terms.push('crypto TLS certificate OAuth JWT');

    // Incomplete export signals → surface the "handling incomplete" doc
    const hasServices = (parsedData.services || []).length > 0;
    const hasXSLT     = (parsedData.xsltFiles || []).length > 0;
    const hasBackends = (parsedData.backendUrls || []).length > 0;
    if (!hasServices || !hasXSLT || !hasBackends) {
      terms.push('missing incomplete partial gap inference reconstruct');
    }
    if ((parsedData.matchingRules || []).length || (parsedData.processingPolicies || []).length) {
      terms.push('processing policy rule match action');
    }
    if ((parsedData.variables || []).length) terms.push('service variable set-variable context');
  }

  if (sourcePlatform === 'IIB_ACE') {
    const flows = parsedData.messageFlows || [];
    if (flows.length) terms.push('message flow msgflow input output node');

    // Detect MQ nodes
    const hasMQ = flows.some(f =>
      (f.nodes || []).some(n => n.type && n.type.toLowerCase().includes('mq'))
    );
    if (hasMQ) terms.push('MQ queue JMS IBM MQ listener');

    if ((parsedData.esqlModules || []).length) terms.push('ESQL compute module procedure function');
    if ((parsedData.schemas || []).length)     terms.push('XSD schema type element');
    if ((parsedData.wsdlServices || []).length) terms.push('WSDL SOAP portType operation');
    if ((parsedData.mappings || []).length)     terms.push('graphical mapping map field');

    // Incomplete export
    const hasFlows  = flows.length > 0;
    const hasESQL   = (parsedData.esqlModules || []).length > 0;
    const hasEndpts = (parsedData.endpoints   || []).length > 0;
    if (!hasFlows || !hasESQL || !hasEndpts) {
      terms.push('missing incomplete no ESQL no msgflow gap inference');
    }

    if ((parsedData.properties && Object.keys(parsedData.properties).length)) {
      terms.push('properties endpoint URL configuration');
    }
  }

  if (sourcePlatform === 'APIC') {
    const endpoints = parsedData.endpoints || [];
    if (endpoints.length) terms.push('path operation method REST endpoint controller');

    const security = parsedData.securityPolicies || [];
    const secTypes = security.map(s => s.type).filter(Boolean);
    if (secTypes.includes('oauth2'))  terms.push('OAuth2 securityDefinitions securitySchemes flow');
    if (secTypes.includes('apiKey'))  terms.push('apiKey X-IBM-Client-Id header');
    if (secTypes.includes('http'))    terms.push('JWT bearer token basic auth');

    if ((parsedData.backendUrls || []).length) terms.push('target-url backend invoke assembly');

    const rawSpec = parsedData.rawSpec || {};
    if (rawSpec['x-ibm-configuration']) terms.push('x-ibm-configuration assembly execute policy');
  }

  return terms.join(' ');
}

/**
 * Builds a BM25 query from the RE context used for code generation.
 */
function buildGenQuery(reContext, targetStack) {
  const { structured } = reContext;
  const terms = [targetStack || 'Spring Boot'];

  // Always inject Spring Boot recipe docs
  if (targetStack === 'JAVA_SPRING_BOOT') {
    terms.push('Spring Boot controller service mapper WebClient pom.xml Dockerfile');
    terms.push('SecurityConfig application.yml GlobalExceptionHandler correlation');
    if ((structured.securityAnalysis?.policies || []).length) {
      terms.push('security OAuth JWT API key filter authentication');
    }
    if ((structured.testScenarios || []).length) {
      terms.push('test JUnit MockMvc SpringBootTest assert');
    }
  }

  // Source platform signals → retrieve platform-specific migration recipes
  const platform = structured.sourcePlatform;
  if (platform === 'DATAPOWER') {
    terms.push('DataPower MPGW migration Spring Boot mapper client XSLT GatewayScript');
    if ((structured.services || []).length) terms.push('MPGW WSP service controller');
    if ((structured.xsltTransformations || []).length) terms.push('XSLT transformation mapper class');
  }
  if (platform === 'IIB_ACE') {
    terms.push('IIB ACE message flow service route handler ESQL service method');
    if ((structured.messageFlows || []).length) terms.push('flow controller service Spring Boot');
    if ((structured.esqlModules || []).length)  terms.push('ESQL service method Java translate');
  }
  if (platform === 'APIC') {
    terms.push('API Connect endpoint path controller BackendClient invoke assembly');
  }

  return terms.join(' ');
}

// ─── Formatter ────────────────────────────────────────────────────────────────

/**
 * Formats a list of retrieved documents into a prompt section string.
 * The section starts and ends with clear delimiters so the LLM knows
 * it is retrieved reference material, not part of the task instruction.
 *
 * @param {Array} docs - retrieved doc objects with title + content
 * @param {string} [label] - section label for the prompt
 * @returns {string}
 */
function formatRetrievedContext(docs, label = 'RETRIEVED DOMAIN KNOWLEDGE') {
  if (!docs || docs.length === 0) return '';

  const lines = [
    `=== ${label} ===`,
    'The following IBM middleware patterns and migration recipes are provided as reference.',
    'Apply this knowledge when interpreting the artifact metadata and producing your output.',
    '',
  ];

  for (const doc of docs) {
    lines.push(`--- ${doc.title} ---`);
    lines.push(doc.content.trim());
    lines.push('');
  }

  lines.push(`=== END OF ${label} ===`);
  return lines.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieves domain knowledge relevant for reverse engineering a parsed source artifact.
 *
 * @param {object} parsedData     - output of a source parser (apicParser, datapowerParser, etc.)
 * @param {string} sourcePlatform - 'APIC' | 'DATAPOWER' | 'IIB_ACE'
 * @param {number} [topK=5]       - max chunks to retrieve
 * @returns {string}              - formatted prompt section (empty string if nothing retrieved)
 */
function retrieveForRE(parsedData, sourcePlatform, topK = 5) {
  try {
    const query = buildREQuery(parsedData, sourcePlatform);
    logger.info(`RAG RE query (${sourcePlatform}): "${query.slice(0, 120)}..."`);

    const docs = store.search(query, { platform: sourcePlatform, phase: 're', topK });
    // Also get ALL-platform docs (Spring Boot structure hints for RE phase)
    const allDocs = store.search(query, { platform: 'ALL', phase: 're', topK: 2 });
    // Merge, deduplicate by id
    const seen = new Set();
    const merged = [];
    for (const d of [...docs, ...allDocs]) {
      if (!seen.has(d.id)) { seen.add(d.id); merged.push(d); }
    }

    logger.info(`RAG: retrieved ${merged.length} docs for RE (${sourcePlatform}): ${merged.map(d => d.id).join(', ')}`);
    return formatRetrievedContext(merged, 'RETRIEVED IBM MIDDLEWARE DOMAIN KNOWLEDGE');
  } catch (err) {
    logger.warn(`RAG retrieval failed for RE: ${err.message}`);
    return '';
  }
}

/**
 * Retrieves code generation patterns relevant for a specific targetStack + source platform.
 *
 * @param {object} reContext   - { structured, artifacts } built by buildREContext in jobOrchestrator
 * @param {string} targetStack - 'JAVA_SPRING_BOOT' | 'NODEJS' | 'PYTHON_FASTAPI'
 * @param {number} [topK=6]    - max chunks to retrieve
 * @returns {string}           - formatted prompt section
 */
function retrieveForGen(reContext, targetStack, topK = 6) {
  try {
    const query = buildGenQuery(reContext, targetStack);
    logger.info(`RAG Gen query (${targetStack}): "${query.slice(0, 120)}..."`);

    const { structured } = reContext;
    const platform = structured.sourcePlatform;

    // Retrieve platform-specific docs for gen
    const platDocs = store.search(query, { platform, phase: 'gen', topK: 3 });
    // Retrieve ALL-platform gen docs (Spring Boot recipes, etc.)
    const allDocs  = store.search(query, { platform: 'ALL', phase: 'gen', topK });

    const seen = new Set();
    const merged = [];
    for (const d of [...platDocs, ...allDocs]) {
      if (!seen.has(d.id)) { seen.add(d.id); merged.push(d); }
    }

    logger.info(`RAG: retrieved ${merged.length} docs for Gen (${targetStack}): ${merged.map(d => d.id).join(', ')}`);
    return formatRetrievedContext(merged, 'RETRIEVED CODE GENERATION PATTERNS');
  } catch (err) {
    logger.warn(`RAG retrieval failed for Gen: ${err.message}`);
    return '';
  }
}

module.exports = { retrieveForRE, retrieveForGen, buildREQuery, buildGenQuery };
