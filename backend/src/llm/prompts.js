'use strict';

const SYSTEM_RE = `You are an expert IBM middleware reverse engineering architect.
Analyze the provided IBM middleware artifact metadata and extract a detailed reverse engineering specification.
ALWAYS respond with a single valid JSON object. Do not include any text before or after the JSON.`;

/**
 * Strips large/redundant fields from parsedData before embedding in the LLM prompt.
 * rawSpec, schemas, and full file content are omitted to stay within token limits.
 */
function sanitizeForPrompt(parsedData) {
  const clean = { ...parsedData };
  // rawSpec is the full original document — too large, not needed by LLM
  delete clean.rawSpec;
  // schemas / components can be enormous — keep only the key names as hints
  if (clean.schemas && typeof clean.schemas === 'object') {
    clean.schemas = Object.keys(clean.schemas);
  }
  // XSLT/GWS files — filenames only for DataPower (content already referenced via referencedFiles + policyActions.transform)
  if (Array.isArray(clean.xsltFiles)) {
    clean.xsltFiles = clean.xsltFiles.map(f => f.file);
  }
  if (Array.isArray(clean.gatewayScriptFiles)) {
    clean.gatewayScriptFiles = clean.gatewayScriptFiles.map(f => f.file);
  }
  // Trim endpoints
  if (Array.isArray(clean.endpoints)) {
    clean.endpoints = clean.endpoints.map(e => ({
      path: e.path, method: e.method, operationId: e.operationId,
      summary: e.summary, tags: e.tags, security: e.security,
      parameters: (e.parameters || []).slice(0, 10),
    }));
  }

  // ── DataPower-specific token reduction ────────────────────────────────────
  // policyActions can be large — keep only name, type, input, output, transform (drop timeout/retry/etc.)
  if (Array.isArray(clean.policyActions)) {
    clean.policyActions = clean.policyActions.map(a => ({
      name: a.name, type: a.type, input: a.input, output: a.output,
      transform: a.transform || undefined, inputConversion: a.inputConversion || undefined,
    }));
  }
  // policyRules — keep only name, direction, actions list
  if (Array.isArray(clean.policyRules)) {
    clean.policyRules = clean.policyRules.map(r => ({
      name: r.name, direction: r.direction, actions: r.actions,
    }));
  }
  // stylePolicies — keep name + policyMaps only
  if (Array.isArray(clean.stylePolicies)) {
    clean.stylePolicies = clean.stylePolicies.map(p => ({
      name: p.name, policyMaps: p.policyMaps,
    }));
  }
  // processingPolicies is a duplicate of stylePolicies — drop it from the prompt
  delete clean.processingPolicies;
  // matchingRules — keep name + first rule only (the default wildcard is already known)
  if (Array.isArray(clean.matchingRules)) {
    clean.matchingRules = clean.matchingRules.map(m => ({
      name: m.name, summary: m.summary, rules: (m.rules || []).slice(0, 2),
    }));
  }
  // referencedFiles — only user-uploaded local files, name only (drop src/hash)
  if (Array.isArray(clean.referencedFiles)) {
    clean.referencedFiles = clean.referencedFiles
      .filter(f => f.location === 'local' && !f.internal)
      .map(f => f.name);
  }
  // xsltMappings — keep only user local files (filter out dp-aux internal noise)
  if (Array.isArray(clean.xsltMappings)) {
    clean.xsltMappings = clean.xsltMappings
      .filter(m => m.file && m.file.startsWith('local/'))
      .map(m => ({
        direction:      m.direction,
        sourceField:    m.sourceField,
        targetField:    m.targetField,
        transformation: m.transformation,
        file:           m.file,
      }));
  }
  // httpConversionMaps — only the encoding value matters, keep compact
  if (Array.isArray(clean.httpConversionMaps)) {
    clean.httpConversionMaps = clean.httpConversionMaps.map(m => ({ name: m.name, encoding: m.defaultInputEncoding }));
  }
  // networkInterfaces — just IPs, no name field needed
  if (Array.isArray(clean.networkInterfaces)) {
    clean.networkInterfaces = clean.networkInterfaces.map(i => i.ipAddr);
  }
  // exportDetails — drop user/description/model fields, keep only the essential identity fields
  if (clean.exportDetails && typeof clean.exportDetails === 'object') {
    const ed = clean.exportDetails;
    clean.exportDetails = {
      deviceName: ed.deviceName, domain: ed.domain,
      firmware: ed.firmwareVersion, exportDate: ed.exportDate,
    };
  }
  return clean;
}

function buildAPICPrompt(parsedData, complexity, ragContext = '') {
  return {
    system: SYSTEM_RE,
    user: `Reverse engineer this IBM API Connect artifact and return a JSON object with the schema below.
${ragContext ? '\n' + ragContext + '\n' : ''}
COMPLEXITY: ${complexity}
PARSED METADATA:
${JSON.stringify(sanitizeForPrompt(parsedData), null, 2)}

Return EXACTLY this JSON structure (populate all fields):
{
  "sourcePlatform": "APIC",
  "complexity": "${complexity}",
  "apiTitle": "string",
  "apiVersion": "string",
  "executiveSummary": "string",
  "interfaceInventory": [{"name":"string","type":"REST|SOAP|OTHER","description":"string"}],
  "endpointCatalog": [{"method":"string","path":"string","operationId":"string","summary":"string","security":[],"backendUrl":"string"}],
  "sourceMappings": [{"sourceField":"string","targetField":"string","transformation":"string"}],
  "requestResponseSchemas": [{"endpoint":"string","requestSchema":{},"responseSchema":{}}],
  "transformationMapping": [{"step":"string","type":"string","logic":"string"}],
  "routingDocument": [{"rule":"string","condition":"string","backendUrl":"string"}],
  "securityAnalysis": {"policies":[],"oauthFlows":[],"apiKeys":[],"mtls":false,"jwt":false,"notes":"string"},
  "errorHandling": [{"errorCode":"string","handling":"string","response":"string"}],
  "nonFunctionalRequirements": {"timeout":"string","retry":"string","rateLimit":"string","logging":"string","throttling":"string"},
  "complexityAssessment": {"score":"SIMPLE|INTERMEDIATE|COMPLEX","rationale":"string","factors":[]},
  "migrationRecommendation": {"recommendedStack":"JAVA_SPRING_BOOT|NODEJS|PYTHON_FASTAPI","rationale":"string","risks":[],"estimatedEffort":"string"},
  "testScenarios": [{"id":"string","description":"string","input":"string","expectedOutput":"string","type":"UNIT|INTEGRATION|CONTRACT"}],
  "openApiSpec": {},
  "gaps": ["string"],
  "risks": ["string"],
  "recommendations": ["string"]
}`,
  };
}

function buildDataPowerPrompt(parsedData, complexity, ragContext = '') {
  return {
    system: SYSTEM_RE,
    user: `Reverse engineer this IBM DataPower export and return a JSON document.
${ragContext ? '\n' + ragContext + '\n' : ''}
COMPLEXITY: ${complexity}
PARSED METADATA:
${JSON.stringify(sanitizeForPrompt(parsedData), null, 2)}

INSTRUCTIONS: Use exportDetails for executiveSummary. Map frontSideHandlers port→endpointCatalog port and allowedMethods→HTTP verbs. For each MPGW service map backendUrl→routingDocument, requestType+responseType→interfaceInventory type, frontTimeout+backTimeout→nonFunctionalRequirements. Trace policyRules by direction (request-rule/response-rule/error-rule) through policyActions to build processingPipeline steps. For xform actions record the Transform XSL file in xsltTransformations. For convert-http actions document JSON↔XML mediation. Map cryptoReferences→securityAnalysis.cryptoObjects. referencedFiles missing from xsltFiles→gaps[].

Return EXACTLY this JSON (populate all fields):
{
  "sourcePlatform": "DATAPOWER",
  "complexity": "${complexity}",
  "executiveSummary": "string",
  "deviceContext": {"deviceName":"string","domain":"string","firmwareVersion":"string","exportDate":"string"},
  "networkContext": [{"interfaceName":"string","ipAddress":"string","role":"inbound|backend|management"}],
  "services": [{"name":"string","type":"MPGW|WSP","frontProtocol":"string","backendUrl":"string","requestType":"string","responseType":"string","policy":"string","frontTimeout":"string","backTimeout":"string"}],
  "frontSideHandlers": [{"name":"string","port":"string","address":"string","allowedMethods":[],"httpVersion":"string"}],
  "interfaceInventory": [{"name":"string","type":"HTTP|HTTPS|MQ|FTP|OTHER","description":"string"}],
  "endpointCatalog": [{"service":"string","endpoint":"string","port":"string","protocol":"string","allowedMethods":[],"backendUrl":"string","summary":"string"}],
  "processingPipeline": [{"serviceName":"string","direction":"request|response|error","steps":[{"stepNumber":1,"actionName":"string","type":"string","input":"string","output":"string","transform":"string"}]}],
  "xsltTransformations": [{"file":"string","purpose":"string","direction":"request|response","inputFormat":"string","outputFormat":"string"}],
  "gatewayScripts": [{"file":"string","purpose":"string","keyLogic":"string"}],
  "sourceMappings": [{"sourceField":"string","targetField":"string","transformation":"string"}],
  "routingDocument": [{"rule":"string","condition":"string","matchingObject":"string","backendUrl":"string"}],
  "securityAnalysis": {"policies":[],"cryptoObjects":[],"oauth":false,"apiKey":false,"mtls":false,"jwt":false,"notes":"string"},
  "errorHandling": [{"errorCode":"string","handling":"string","response":"string","policyRule":"string"}],
  "nonFunctionalRequirements": {"frontTimeout":"string","backTimeout":"string","timeout":"string","retry":"string","rateLimit":"string","logging":"string","maxMessageSize":"string"},
  "complexityAssessment": {"score":"SIMPLE|INTERMEDIATE|COMPLEX","rationale":"string","factors":[]},
  "migrationRecommendation": {"recommendedStack":"JAVA_SPRING_BOOT|NODEJS|PYTHON_FASTAPI","rationale":"string","risks":[],"estimatedEffort":"string"},
  "testScenarios": [{"id":"string","description":"string","type":"UNIT|INTEGRATION","input":"string","expectedOutput":"string"}],
  "gaps": ["string"],
  "risks": ["string"],
  "recommendations": ["string"]
}`,
  };
}

function buildIIBACEPrompt(parsedData, complexity, ragContext = '') {
  return {
    system: SYSTEM_RE,
    user: `Reverse engineer this IBM IIB/ACE project and return a JSON reverse engineering document.
${ragContext ? '\n' + ragContext + '\n' : ''}
COMPLEXITY: ${complexity}
PARSED METADATA:
${JSON.stringify(sanitizeForPrompt(parsedData), null, 2)}

Return EXACTLY this JSON structure:
{
  "sourcePlatform": "IIB_ACE",
  "complexity": "${complexity}",
  "executiveSummary": "string",
  "messageFlows": [{"name":"string","inputNode":"string","outputNode":"string","processingNodes":[],"description":"string"}],
  "interfaceInventory": [{"name":"string","type":"REST|SOAP|MQ|FILE|OTHER","description":"string"}],
  "endpointCatalog": [{"flow":"string","endpoint":"string","protocol":"string","backendUrl":"string"}],
  "esqlModules": [{"name":"string","type":"string","purpose":"string","keyLogic":"string"}],
  "sourceMappings": [{"sourceField":"string","targetField":"string","transformation":"string"}],
  "routingDocument": [{"rule":"string","condition":"string","destination":"string"}],
  "securityAnalysis": {"policies":[],"notes":"string"},
  "errorHandling": [{"errorCode":"string","handling":"string"}],
  "nonFunctionalRequirements": {"timeout":"string","retry":"string","logging":"string"},
  "complexityAssessment": {"score":"SIMPLE|INTERMEDIATE|COMPLEX","rationale":"string","factors":[]},
  "migrationRecommendation": {"recommendedStack":"JAVA_SPRING_BOOT|NODEJS|PYTHON_FASTAPI","rationale":"string","risks":[],"estimatedEffort":"string"},
  "testScenarios": [{"id":"string","description":"string","type":"UNIT|INTEGRATION"}],
  "gaps": ["string"],
  "risks": ["string"],
  "recommendations": ["string"]
}`,
  };
}

// --- Code Generation Prompts ---

const SYSTEM_GEN = `You are an expert software engineer generating production-grade microservice code from IBM middleware reverse engineering artifacts.
Always respond with a single valid JSON object containing a "files" array where each element has "path" and "content" string fields.
Generate complete, compilable, production-ready code — no truncation, no "// TODO", no placeholders.
Use the reverse engineering artifacts as the authoritative source of truth.
Do not invent endpoints, models, or behaviours that are not present in the RE artifacts.
IMPORTANT: The response will be parsed as JSON. Every "content" field must be a single complete string with \\n for newlines. Do NOT use + concatenation.`;

/**
 * Serialises the RE context (structured JSON + markdown artifacts) into a
 * compact, clearly-labelled prompt section that the LLM can parse section by section.
 */
function formatREContext(reContext) {
  const { structured, artifacts } = reContext;

  const lines = [];

  lines.push('=== REVERSE ENGINEERING ARTIFACTS ===');
  lines.push('');

  // --- Structured JSON sections (machine-readable, precise) ---
  lines.push('--- API IDENTITY ---');
  lines.push(`Source Platform : ${structured.sourcePlatform}`);
  lines.push(`API Title       : ${structured.apiTitle}`);
  lines.push(`API Version     : ${structured.apiVersion}`);
  lines.push(`Complexity      : ${structured.complexity}`);
  lines.push('');

  lines.push('--- EXECUTIVE SUMMARY ---');
  lines.push(structured.executiveSummary);
  lines.push('');

  if ((structured.endpointCatalog || []).length) {
    lines.push('--- ENDPOINT CATALOG (use these to generate controllers) ---');
    lines.push(JSON.stringify(structured.endpointCatalog, null, 2));
    lines.push('');
  }

  if ((structured.requestResponseSchemas || []).length) {
    lines.push('--- REQUEST / RESPONSE SCHEMAS (use these to generate model classes / types) ---');
    lines.push(JSON.stringify(structured.requestResponseSchemas, null, 2));
    lines.push('');
  }

  // Prefer LLM-derived sourceMappings; fall back to XSL-parsed xsltMappings when empty
  const effectiveMappings = (structured.sourceMappings || []).length
    ? structured.sourceMappings
    : (structured.xsltMappings || []);
  if (effectiveMappings.length) {
    lines.push('--- FIELD MAPPINGS (use these to generate mapper classes) ---');
    lines.push(JSON.stringify(effectiveMappings, null, 2));
    lines.push('');
  }

  if ((structured.transformationMapping || []).length) {
    lines.push('--- TRANSFORMATION LOGIC (use these to implement service / mapper logic) ---');
    lines.push(JSON.stringify(structured.transformationMapping, null, 2));
    lines.push('');
  }

  if ((structured.routingDocument || []).length) {
    lines.push('--- ROUTING RULES (use these to configure client routing and backend URLs) ---');
    lines.push(JSON.stringify(structured.routingDocument, null, 2));
    lines.push('');
  }

  lines.push('--- SECURITY ANALYSIS (use this to configure security filters / middleware) ---');
  lines.push(JSON.stringify(structured.securityAnalysis || {}, null, 2));
  lines.push('');

  if ((structured.errorHandling || []).length) {
    lines.push('--- ERROR HANDLING (use these to implement exception handlers) ---');
    lines.push(JSON.stringify(structured.errorHandling, null, 2));
    lines.push('');
  }

  lines.push('--- NON-FUNCTIONAL REQUIREMENTS (apply to application.yml / config / clients) ---');
  lines.push(JSON.stringify(structured.nonFunctionalRequirements || {}, null, 2));
  lines.push('');

  if ((structured.testScenarios || []).length) {
    lines.push('--- TEST SCENARIOS (implement each as a test class / function) ---');
    lines.push(JSON.stringify(structured.testScenarios, null, 2));
    lines.push('');
  }

  lines.push('--- MIGRATION RECOMMENDATION ---');
  lines.push(JSON.stringify(structured.migrationRecommendation, null, 2));
  lines.push('');

  // Platform-specific extras
  if ((structured.services || []).length) {
    lines.push('--- DATAPOWER SERVICES (map each service to a controller + client) ---');
    lines.push(JSON.stringify(structured.services, null, 2));
    lines.push('');
  }
  if ((structured.messageFlows || []).length) {
    lines.push('--- IIB/ACE MESSAGE FLOWS (map each flow to a service / route handler) ---');
    lines.push(JSON.stringify(structured.messageFlows, null, 2));
    lines.push('');
  }
  if ((structured.esqlModules || []).length) {
    lines.push('--- ESQL MODULES (translate logic to service methods) ---');
    lines.push(JSON.stringify(structured.esqlModules, null, 2));
    lines.push('');
  }

  // --- Markdown artifact sections (human-readable, add narrative context) ---
  lines.push('=== DETAILED RE ARTIFACT DOCUMENTS ===');
  lines.push('(These are the rendered reverse engineering reports — use them for additional context)');
  lines.push('');
  const sectionOrder = [
    'executive_summary', 'interface_inventory', 'endpoint_catalog',
    'source_target_mapping', 'request_response_schemas', 'transformation_mapping',
    'routing_document', 'security_analysis', 'error_handling',
    'non_functional_requirements', 'complexity_assessment',
    'migration_recommendation', 'test_scenarios',
  ];
  for (const key of sectionOrder) {
    if (artifacts[key]) {
      lines.push(artifacts[key]);
      lines.push('');
    }
  }

  lines.push('=== END OF REVERSE ENGINEERING ARTIFACTS ===');
  return lines.join('\n');
}

/**
 * Spring Boot generation is split into 3 focused batches so each prompt fits within
 * the 8192-token output limit of Groq/free-tier LLMs.
 *
 * Batch A — API layer:  controller + model + mapper + client + service
 * Batch B — Infra:      pom.xml + Application.java + config/* + exception/* + application.yml
 * Batch C — DevOps+tests: Dockerfile + docker-compose + k8s + postman + test classes + README
 *
 * Each returns { system, user, batch } — jobOrchestrator calls invokeLLM for each
 * and merges all files[] arrays.
 */
function buildSpringBootPrompt(reContext, complexity, ragContext = '') {
  const { structured } = reContext;
  const serviceName = (structured.apiTitle || 'GeneratedService')
    .replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const javaPackage = 'com.modernizer.' + serviceName.replace(/-/g, '');
  const pkgPath     = javaPackage.replace(/\./g, '/');

  // Compact RE context — only the sections each batch actually needs
  const identity = `Package: ${javaPackage}\nService: ${serviceName}\nComplexity: ${complexity}\nPlatform: ${structured.sourcePlatform}`;

  const endpointBlock     = (structured.endpointCatalog || []).length
    ? `ENDPOINTS:\n${JSON.stringify(structured.endpointCatalog, null, 2)}`       : 'ENDPOINTS: none — infer a sensible REST API from the XSLT transformations or services.';
  const schemaBlock       = (structured.requestResponseSchemas || []).length
    ? `SCHEMAS:\n${JSON.stringify(structured.requestResponseSchemas, null, 2)}`   : 'SCHEMAS: none — create minimal POJOs as needed.';
  // Use LLM-derived sourceMappings when available; fall back to XSL-parsed xsltMappings
  // so real field names from the ZIP are always present even on a fallback-stub RE run.
  const effectiveMappings = (structured.sourceMappings || []).length
    ? structured.sourceMappings
    : (structured.xsltMappings || []);
  const mappingBlock      = effectiveMappings.length
    ? `MAPPINGS (extracted from XSLT field mappings — use these exact field names for Request/Response POJOs and the Mapper):\n${JSON.stringify(effectiveMappings, null, 2)}`
    : '';
  const transformBlock    = ((structured.transformationMapping || []).length || (structured.xsltTransformations || []).length)
    ? `TRANSFORMATIONS:\n${JSON.stringify((structured.transformationMapping || []).length ? structured.transformationMapping : structured.xsltTransformations, null, 2)}` : '';
  const routingBlock      = (structured.routingDocument || []).length
    ? `ROUTING:\n${JSON.stringify(structured.routingDocument, null, 2)}`          : '';
  const securityBlock     = `SECURITY:\n${JSON.stringify(structured.securityAnalysis || {}, null, 2)}`;
  const errorBlock        = (structured.errorHandling || []).length
    ? `ERROR HANDLING:\n${JSON.stringify(structured.errorHandling, null, 2)}`    : '';
  const nfrBlock          = `NFR:\n${JSON.stringify(structured.nonFunctionalRequirements || {}, null, 2)}`;
  const testBlock         = (structured.testScenarios || []).length
    ? `TEST SCENARIOS:\n${JSON.stringify(structured.testScenarios, null, 2)}`     : '';

  // ── Batch A: API layer ─────────────────────────────────────────────────────
  const batchA = {
    system: SYSTEM_GEN,
    batch: 'A-api-layer',
    user: `Generate ONLY the API layer Java files listed below for a Spring Boot 3 / Java 21 microservice.
${ragContext ? '\n' + ragContext + '\n' : ''}
${identity}
${endpointBlock}
${schemaBlock}
${mappingBlock}
${transformBlock}
${routingBlock}

FILES TO GENERATE (generate ALL of them, fully implemented, no stubs):
1. src/main/java/${pkgPath}/controller/${toPascal(serviceName)}Controller.java
   - @RestController, @RequestMapping
   - One @GetMapping/@PostMapping/@PutMapping/@DeleteMapping per endpoint in ENDPOINTS
   - Inject ${toPascal(serviceName)}Service and call it for each operation
2. src/main/java/${pkgPath}/model/Request.java  (request POJO from SCHEMAS — use @JsonProperty)
3. src/main/java/${pkgPath}/model/Response.java (response POJO from SCHEMAS — use @JsonProperty)
4. src/main/java/${pkgPath}/mapper/${toPascal(serviceName)}Mapper.java
   - Maps Request→domain and domain→Response using MAPPINGS
5. src/main/java/${pkgPath}/client/BackendClient.java
   - WebClient-based; one method per backend URL in ROUTING
   - Uses @Value for base URL
6. src/main/java/${pkgPath}/service/${toPascal(serviceName)}Service.java
   - One method per endpoint; calls BackendClient, applies mapper, implements TRANSFORMATIONS

Return JSON: { "files": [{ "path": "...", "content": "..." }] }
Every "content" value must be a complete Java file as a single JSON string. Use \\n for newlines.`,
  };

  // ── Batch B: Infrastructure layer ─────────────────────────────────────────
  const batchB = {
    system: SYSTEM_GEN,
    batch: 'B-infra',
    user: `Generate ONLY the infrastructure / configuration files listed below for a Spring Boot 3 / Java 21 microservice.
${ragContext ? '\n' + ragContext + '\n' : ''}
${identity}
${securityBlock}
${errorBlock}
${nfrBlock}

FILES TO GENERATE (generate ALL of them, fully implemented):
1. pom.xml
   - Spring Boot 3.x parent, Java 21, spring-boot-starter-web, spring-boot-starter-webflux,
     spring-boot-starter-security, spring-boot-starter-actuator, resilience4j-spring-boot3,
     lombok, jackson-databind, spring-boot-starter-test, junit-jupiter
2. src/main/java/${pkgPath}/Application.java
   - @SpringBootApplication main class
3. src/main/java/${pkgPath}/config/SecurityConfig.java
   - Configure Spring Security based on SECURITY policies
4. src/main/java/${pkgPath}/config/WebClientConfig.java
   - @Bean WebClient.Builder with timeout from NFR
5. src/main/java/${pkgPath}/exception/GlobalExceptionHandler.java
   - @RestControllerAdvice, one @ExceptionHandler per ERROR HANDLING entry
6. src/main/resources/application.yml
   - server.port=8080, spring app name=${serviceName}
   - Resilience4j retry config using NFR retry value
   - WebClient timeout using NFR timeout value
   - Logging levels from NFR

Return JSON: { "files": [{ "path": "...", "content": "..." }] }
Every "content" value must be a complete file as a single JSON string. Use \\n for newlines.`,
  };

  // ── Batch C: DevOps + tests ────────────────────────────────────────────────
  const batchC = {
    system: SYSTEM_GEN,
    batch: 'C-devops-tests',
    user: `Generate ONLY the DevOps, test, and documentation files listed below for a Spring Boot 3 / Java 21 microservice.
${ragContext ? '\n' + ragContext + '\n' : ''}
${identity}
${endpointBlock}
${testBlock}

FILES TO GENERATE (generate ALL of them, fully implemented):
1. Dockerfile
   - Multi-stage: maven:3.9-eclipse-temurin-21 build stage → eclipse-temurin:21-jre-alpine runtime
2. docker-compose.yml
   - Service "${serviceName}" on port 8080
3. k8s/deployment.yaml
   - 2 replicas, image ${serviceName}:latest, containerPort 8080, readinessProbe on /actuator/health
4. k8s/service.yaml
   - ClusterIP, port 80 → targetPort 8080
5. postman/collection.json
   - One request per endpoint in ENDPOINTS (GET/POST/PUT/DELETE with example bodies)
6. src/test/java/${pkgPath}/${toPascal(serviceName)}ControllerTest.java
   - @SpringBootTest + @AutoConfigureMockMvc
   - One @Test method per TEST SCENARIO (or per endpoint if no scenarios defined)
   - Uses MockMvc with mockito
7. README.md
   - Project overview, endpoints table, how to build (mvn package), how to run (java -jar / docker), k8s deploy

Return JSON: { "files": [{ "path": "...", "content": "..." }] }
Every "content" value must be a complete file as a single JSON string. Use \\n for newlines.`,
  };

  // Return an array of batches — jobOrchestrator iterates and merges
  return [batchA, batchB, batchC];
}

/** Converts kebab-case or any string to PascalCase */
function toPascal(str) {
  return str.replace(/(?:^|[-_\s])(\w)/g, (_, c) => c.toUpperCase());
}

function buildNodeJSPrompt(reContext, complexity, ragContext = '') {
  const { structured } = reContext;
  const serviceName = (structured.apiTitle || 'GeneratedService')
    .replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

  return {
    system: SYSTEM_GEN,
    user: `Generate a complete TypeScript Node.js (Express + inversify or NestJS) microservice that faithfully implements the IBM middleware migration described in the reverse engineering artifacts below.
${ragContext ? '\n' + ragContext + '\n' : ''}
COMPLEXITY: ${complexity}
SERVICE NAME: ${serviceName}

${formatREContext(reContext)}

GENERATION INSTRUCTIONS — map each RE artifact section to these files:
1. endpointCatalog           → src/routes/*.ts + src/controllers/*.ts
                               One router file per logical group. Exact HTTP methods, paths, operationIds as handler names.
2. requestResponseSchemas    → src/types/*.ts
                               TypeScript interfaces / zod schemas per request/response schema entry.
3. sourceMappings            → src/mappers/*.ts
                               Mapper functions implementing each sourceField→targetField entry.
4. routingDocument + backendUrls → src/clients/*.ts
                               Axios-based typed clients. One client class per distinct backendUrl host.
5. securityAnalysis          → src/middleware/security.ts
                               Express middleware implementing the security policies (JWT, OAuth2, API key).
6. errorHandling             → src/middleware/errorHandler.ts
                               Express error middleware with one case per errorCode.
7. nonFunctionalRequirements → src/config.ts + .env.example
                               Timeout, retry (axios-retry), rate-limit (express-rate-limit) values from NFR.
8. transformationMapping     → src/services/*.ts
                               Service methods implementing each transformation step.
9. testScenarios             → tests/*.test.ts
                               Jest tests — one describe/it block per scenario id/description.

Also generate: package.json, tsconfig.json, src/app.ts, Dockerfile, docker-compose.yml, k8s/deployment.yaml, README.md

Return JSON: { "files": [{ "path": "relative/path/file.ts", "content": "full file content" }] }`,
  };
}

function buildPythonPrompt(reContext, complexity, ragContext = '') {
  const { structured } = reContext;
  const serviceName = (structured.apiTitle || 'GeneratedService')
    .replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

  return {
    system: SYSTEM_GEN,
    user: `Generate a complete Python FastAPI microservice that faithfully implements the IBM middleware migration described in the reverse engineering artifacts below.
${ragContext ? '\n' + ragContext + '\n' : ''}
COMPLEXITY: ${complexity}
SERVICE NAME: ${serviceName}

${formatREContext(reContext)}

GENERATION INSTRUCTIONS — map each RE artifact section to these files:
1. endpointCatalog           → app/routers/*.py
                               One APIRouter per logical group. Exact HTTP methods, paths, operation_ids.
2. requestResponseSchemas    → app/models/*.py
                               Pydantic v2 BaseModel classes per request/response schema entry.
3. sourceMappings            → app/mappers/*.py
                               Mapper functions implementing each sourceField→targetField entry.
4. routingDocument + backendUrls → app/clients/*.py
                               httpx AsyncClient wrappers. One client class per distinct backendUrl host.
5. securityAnalysis          → app/security.py
                               FastAPI dependencies implementing the security policies (OAuth2, JWT, API key).
6. errorHandling             → app/exceptions.py
                               HTTPException subclasses and @app.exception_handler entries per errorCode.
7. nonFunctionalRequirements → app/config.py + .env.example
                               Pydantic Settings with timeout, retry (tenacity), rate-limit values from NFR.
8. transformationMapping     → app/services/*.py
                               Service functions implementing each transformation step.
9. testScenarios             → tests/test_*.py
                               pytest + httpx.AsyncClient — one test function per scenario id/description.

Also generate: main.py, requirements.txt, Dockerfile, docker-compose.yml, k8s/deployment.yaml, README.md

Return JSON: { "files": [{ "path": "relative/path/file.py", "content": "full file content" }] }`,
  };
}

module.exports = { buildAPICPrompt, buildDataPowerPrompt, buildIIBACEPrompt, buildSpringBootPrompt, buildNodeJSPrompt, buildPythonPrompt };
