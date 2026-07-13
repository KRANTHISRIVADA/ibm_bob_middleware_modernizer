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
  // XSLT and GatewayScript file contents can be very large — keep filename + first 300 chars
  if (Array.isArray(clean.xsltFiles)) {
    clean.xsltFiles = clean.xsltFiles.map(f => ({ file: f.file, contentPreview: (f.content || '').slice(0, 300) }));
  }
  if (Array.isArray(clean.gatewayScriptFiles)) {
    clean.gatewayScriptFiles = clean.gatewayScriptFiles.map(f => ({ file: f.file, contentPreview: (f.content || '').slice(0, 300) }));
  }
  // Trim individual endpoint descriptions/parameters to avoid bloat
  if (Array.isArray(clean.endpoints)) {
    clean.endpoints = clean.endpoints.map(e => ({
      path: e.path, method: e.method, operationId: e.operationId,
      summary: e.summary, tags: e.tags, security: e.security,
      parameters: (e.parameters || []).slice(0, 10),
    }));
  }
  return clean;
}

function buildAPICPrompt(parsedData, complexity) {
  return {
    system: SYSTEM_RE,
    user: `Reverse engineer this IBM API Connect artifact and return a JSON object with the schema below.

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

function buildDataPowerPrompt(parsedData, complexity) {
  return {
    system: SYSTEM_RE,
    user: `Reverse engineer this IBM DataPower configuration and return a JSON reverse engineering document.

COMPLEXITY: ${complexity}
PARSED METADATA:
${JSON.stringify(sanitizeForPrompt(parsedData), null, 2)}

Return EXACTLY this JSON structure:
{
  "sourcePlatform": "DATAPOWER",
  "complexity": "${complexity}",
  "executiveSummary": "string",
  "services": [{"name":"string","type":"MPGW|WSP","localEndpoint":"string","backendUrl":"string","policy":"string"}],
  "interfaceInventory": [{"name":"string","type":"string","description":"string"}],
  "endpointCatalog": [{"service":"string","endpoint":"string","protocol":"string","backendUrl":"string"}],
  "xsltTransformations": [{"file":"string","purpose":"string","inputs":[],"outputs":[]}],
  "gatewayScripts": [{"file":"string","purpose":"string","keyLogic":"string"}],
  "sourceMappings": [{"sourceField":"string","targetField":"string","transformation":"string"}],
  "routingDocument": [{"rule":"string","condition":"string","backendUrl":"string"}],
  "securityAnalysis": {"policies":[],"cryptoObjects":[],"oauth":false,"apiKey":false,"mtls":false,"notes":"string"},
  "errorHandling": [{"errorCode":"string","handling":"string","response":"string"}],
  "nonFunctionalRequirements": {"timeout":"string","retry":"string","rateLimit":"string","logging":"string"},
  "complexityAssessment": {"score":"SIMPLE|INTERMEDIATE|COMPLEX","rationale":"string","factors":[]},
  "migrationRecommendation": {"recommendedStack":"JAVA_SPRING_BOOT|NODEJS|PYTHON_FASTAPI","rationale":"string","risks":[],"estimatedEffort":"string"},
  "testScenarios": [{"id":"string","description":"string","type":"UNIT|INTEGRATION"}],
  "gaps": ["string"],
  "risks": ["string"],
  "recommendations": ["string"]
}`,
  };
}

function buildIIBACEPrompt(parsedData, complexity) {
  return {
    system: SYSTEM_RE,
    user: `Reverse engineer this IBM IIB/ACE project and return a JSON reverse engineering document.

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

const SYSTEM_GEN = `You are an expert software engineer generating production-grade microservice code.
Always respond with a single valid JSON object containing a "files" array where each file has "path" and "content".
Generate complete, compilable code - no stubs or placeholders unless absolutely required.`;

function buildSpringBootPrompt(reArtifact, complexity) {
  return {
    system: SYSTEM_GEN,
    user: `Generate a complete Java 21 Spring Boot 3.x microservice based on this reverse engineering specification.

REVERSE ENGINEERING SPEC:
${JSON.stringify(reArtifact, null, 2)}

COMPLEXITY: ${complexity}

Generate these files in a Maven project structure:
- pom.xml
- src/main/java/{package}/Application.java
- src/main/java/{package}/controller/*.java (REST controllers)
- src/main/java/{package}/service/*.java (business logic)
- src/main/java/{package}/mapper/*.java (request/response transformers)
- src/main/java/{package}/client/*.java (WebClient backend integrations)
- src/main/java/{package}/config/*.java (security, webclient config)
- src/main/java/{package}/exception/*.java (exception handling)
- src/main/java/{package}/model/*.java (request/response POJOs)
- src/main/resources/application.yml
- src/test/java/{package}/**/*.java (JUnit 5 + Mockito tests)
- Dockerfile
- docker-compose.yml
- k8s/deployment.yaml
- k8s/service.yaml
- README.md
- postman/collection.json

Return JSON: { "files": [{ "path": "relative/path.ext", "content": "file content string" }] }`,
  };
}

function buildNodeJSPrompt(reArtifact, complexity) {
  return {
    system: SYSTEM_GEN,
    user: `Generate a complete TypeScript Node.js (NestJS or Express) microservice.

REVERSE ENGINEERING SPEC:
${JSON.stringify(reArtifact, null, 2)}

COMPLEXITY: ${complexity}

Generate: package.json, tsconfig.json, src/app.ts, src/routes/*.ts, src/controllers/*.ts, src/services/*.ts, src/mappers/*.ts, src/clients/*.ts, src/middleware/*.ts, src/types/*.ts, tests/*.test.ts, Dockerfile, docker-compose.yml, k8s/deployment.yaml, README.md, .env.example

Return JSON: { "files": [{ "path": "relative/path.ext", "content": "file content string" }] }`,
  };
}

function buildPythonPrompt(reArtifact, complexity) {
  return {
    system: SYSTEM_GEN,
    user: `Generate a complete Python FastAPI microservice.

REVERSE ENGINEERING SPEC:
${JSON.stringify(reArtifact, null, 2)}

COMPLEXITY: ${complexity}

Generate: main.py, requirements.txt, app/routers/*.py, app/services/*.py, app/mappers/*.py, app/clients/*.py, app/models/*.py, app/config.py, app/exceptions.py, tests/test_*.py, Dockerfile, docker-compose.yml, k8s/deployment.yaml, README.md, .env.example

Return JSON: { "files": [{ "path": "relative/path.ext", "content": "file content string" }] }`,
  };
}

module.exports = { buildAPICPrompt, buildDataPowerPrompt, buildIIBACEPrompt, buildSpringBootPrompt, buildNodeJSPrompt, buildPythonPrompt };
