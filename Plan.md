# AI Modernizer Accelerator - Master Prompt for Copilot / IBM Bob

## Role
You are a senior enterprise modernization architect and full-stack AI engineering lead. Build an MVP accelerator named **AI Modernizer** that reverse-engineers IBM API Connect, IBM DataPower, and IBM Integration Bus / App Connect Enterprise interfaces and generates target containerized microservices in Java Spring Boot, Node.js, or Python.

## Business Objective
Create a 3-layer accelerator:
1. **React UI Layer** for upload, complexity selection, reverse-engineering review, target migration selection, artifact download, and generated code download.
2. **Node.js Backend API Layer** for file ingestion, validation, extraction, orchestration, prompt construction, LLM invocation, job tracking, security checks, artifact storage, and ZIP generation.
3. **LLM Modernization Layer** for reverse engineering and code generation using structured prompts, deterministic JSON outputs, validation, and post-processing.

## Input Sources
Support the following input types:
- IBM API Connect YAML / OpenAPI / Swagger files.
- IBM DataPower ZIP export containing MPGW/WSP configuration, XSLT, GatewayScript, XML, crypto references, processing policies, processing rules, matching rules, backend URLs, and service variables.
- IBM IIB / ACE PI/BAR/project interface artifacts including message flows, ESQL, maps, schemas, DFDL/XSD/WSDL, properties, and endpoint definitions.

## UI Requirements
Build a React UI with the following screens:
1. Dashboard / New Modernization Job
2. Upload Source Artifacts
3. Select Source Platform: API Connect, DataPower, IIB/ACE
4. Select Complexity:
   - Simple: proxy APIs, pass-through routing, minimal policy logic
   - Intermediate: medium transformations, mappings, conditional routing, security policies
   - Complex: orchestration, multiple backend calls, complex transformations, custom policies, GatewayScript, ESQL, XSLT
5. Reverse Engineering Progress
6. Reverse Engineering Artifact Viewer and Download
7. Target Migration Selection:
   - Java Spring Boot
   - Node.js Express/NestJS
   - Python FastAPI
8. Code Generation Progress
9. Generated Microservice ZIP Download
10. Job History and Audit Trail

## Backend API Requirements
Create Node.js backend APIs:
- POST /api/jobs - create modernization job
- POST /api/jobs/:jobId/upload - upload source artifacts
- POST /api/jobs/:jobId/reverse-engineer - trigger reverse engineering
- GET /api/jobs/:jobId/status - get job status
- GET /api/jobs/:jobId/reverse-artifacts - list reverse engineering artifacts
- GET /api/jobs/:jobId/reverse-artifacts/download - download artifacts ZIP
- POST /api/jobs/:jobId/generate - generate target microservice
- GET /api/jobs/:jobId/generated/download - download generated code ZIP
- GET /api/jobs - job history

## Reverse Engineering Requirements
For every uploaded source, extract and generate these artifacts:
1. Executive Summary
2. Interface Inventory
3. Endpoint Catalog
4. Source-to-Target Mapping Specification
5. Request/Response Schema Specification
6. Transformation Mapping Document
7. Routing and Backend Endpoint Document
8. Security Policy Analysis: OAuth, API Key, JWT, mTLS, basic auth, header auth
9. Error Handling and Fault Mapping Document
10. Non-Functional Requirement Summary: timeout, retry, logging, rate limit, throttling
11. Complexity Assessment Report
12. Migration Recommendation Report
13. Test Scenario Inventory
14. OpenAPI Specification for the target microservice

## Reverse Engineering Output Format
Generate both Markdown and JSON artifacts. JSON must be machine-readable and follow this general structure:
{
  "jobId": "string",
  "sourcePlatform": "APIC|DATAPOWER|IIB_ACE",
  "complexity": "SIMPLE|INTERMEDIATE|COMPLEX",
  "interfaces": [
    {
      "name": "string",
      "type": "REST|SOAP|MQ|FILE|OTHER",
      "sourceEndpoint": "string",
      "targetEndpoint": "string",
      "backendEndpoints": [],
      "methods": [],
      "security": [],
      "transformations": [],
      "routingRules": [],
      "errorHandling": [],
      "dependencies": []
    }
  ],
  "gaps": [],
  "risks": [],
  "recommendations": []
}

## Code Generation Requirements
Based on selected target stack, generate a production-grade microservice ZIP including:
- Source code
- REST controllers/routes
- Service layer
- Mapper/transformer layer
- Backend client/integration layer
- Security implementation
- Error handling
- Logging and correlation ID
- Config externalization
- Health check endpoint
- OpenAPI specification
- Unit tests
- Integration tests / mocked backend tests
- Dockerfile
- docker-compose.yml
- Kubernetes deployment YAML
- README.md
- Postman collection or HTTP test file
- CI pipeline YAML sample

## Java Spring Boot Standards
Generate Java 21 / Spring Boot 3.x service with:
- Maven or Gradle structure
- Controller, service, mapper, client, config, exception packages
- Spring Web, validation, actuator, security where applicable
- WebClient for backend calls
- JUnit 5 and Mockito tests
- OpenAPI/Swagger annotations
- Dockerfile with non-root user

## Node.js Standards
Generate Node.js service with:
- TypeScript preferred
- Express or NestJS architecture
- routes/controllers, services, mappers, clients, middleware
- Jest unit tests
- OpenAPI spec
- Dockerfile with non-root user

## Python Standards
Generate Python FastAPI service with:
- routers, services, mappers, clients, config, exception handlers
- Pydantic models
- Pytest tests
- OpenAPI support
- Dockerfile with non-root user

## Security and Compliance Requirements
- Do not expose secrets.
- Mask credentials discovered in uploaded files.
- Store artifacts by job ID.
- Validate file type and size.
- Prevent path traversal during ZIP extraction.
- Generate secure Dockerfiles using non-root users.
- Add audit logs for upload, reverse engineering, code generation, and download events.

## LLM Invocation Requirements
Implement prompt templates for:
1. API Connect reverse engineering
2. DataPower reverse engineering
3. IIB/ACE reverse engineering
4. Target Spring Boot code generation
5. Target Node.js code generation
6. Target Python FastAPI code generation
7. Artifact validation and completeness check

The LLM must return structured JSON first. Backend should validate JSON schema, then generate Markdown and code files from validated output.

## MVP Scope
MVP must support:
- Upload one APIC YAML, one DataPower ZIP, or one IIB/ACE project ZIP per job.
- Complexity selection.
- Reverse engineering artifact generation.
- Download reverse engineering ZIP.
- Generate one target microservice stack per job.
- Download generated code ZIP.
- Store jobs locally or in a database.

## Out of Scope for MVP
- Full automated deployment to cloud.
- Runtime traffic capture.
- Multi-application portfolio migration dashboard.
- Automatic production cutover.
- Enterprise SSO integration.

## Expected Deliverables
Generate the complete MVP project with:
- /frontend React application
- /backend Node.js API
- /backend/src/llm prompt templates
- /backend/src/parsers source parsers
- /backend/src/generators code generators
- /backend/src/artifacts reverse engineering artifact builders
- /backend/src/jobs job orchestration
- Docker support for frontend and backend
- README with setup and run instructions
- Sample input folder
- Sample output folders

## Quality Gates
Before finalizing, ensure:
- Uploaded ZIP files are safely extracted.
- Reverse engineering JSON validates against schema.
- Generated code compiles or has clear placeholders only where unavoidable.
- Tests are generated.
- Docker build instructions are included.
- README explains full end-to-end flow.

## Build Incrementally
Step 1: Generate solution architecture and folder structure.
Step 2: Generate React UI.
Step 3: Generate Node.js backend APIs.
Step 4: Generate file parsers and metadata extractors.
Step 5: Generate LLM prompt templates and JSON schemas.
Step 6: Generate artifact builders.
Step 7: Generate target code generators for Java, Node.js, Python.
Step 8: Generate Docker files and README.
Step 9: Generate sample inputs and sample outputs.
Step 10: Add validation, error handling, and audit logging.

Start by creating the complete folder structure and MVP implementation plan, then generate code module by module.
