# AI Modernizer — IBM Middleware Migration Accelerator

An AI-powered accelerator that reverse-engineers IBM API Connect, IBM DataPower, and IBM IIB/ACE artifacts and generates production-ready containerized microservices in Java Spring Boot, Node.js, or Python FastAPI.

Powered by **Retrieval-Augmented Generation (RAG)** — a curated IBM middleware knowledge base is retrieved at runtime and injected into every LLM prompt, grounding the AI output in real platform patterns even when uploaded artifacts are sparse or incomplete.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                      React UI  (port 5173 / 80)                      │
│   Dashboard → Upload → Reverse Engineer → Artifacts →                │
│   Select Stack → Generate → Download → Job History                   │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTP REST  /api/*
┌──────────────────────────────▼───────────────────────────────────────┐
│                    Node.js Backend  (port 4000)                       │
│                                                                       │
│  ┌─────────────┐   ┌─────────────────────────────────────────────┐  │
│  │  Parsers    │   │              RAG Pipeline                    │  │
│  │  ─────────  │   │  ┌───────────────┐   ┌──────────────────┐  │  │
│  │  APIC       │──▶│  │  ragRetriever │──▶│    ragStore      │  │  │
│  │  DataPower  │   │  │  buildREQuery │   │  BM25 Index      │  │  │
│  │  IIB/ACE    │   │  │  buildGenQuery│   │  29 knowledge    │  │  │
│  └─────────────┘   │  └───────┬───────┘   │  documents       │  │  │
│                    │          │            └──────────────────┘  │  │
│  ┌─────────────┐   │  retrieved context (top-K chunks)           │  │
│  │  Prompt     │◀──┤          │                                   │  │
│  │  Builder    │   └──────────┘                                   │  │
│  │  (prompts.js│                                                   │  │
│  └──────┬──────┘                                                   │  │
│         │  enriched prompt                                          │  │
│  ┌──────▼──────┐   ┌──────────────┐   ┌───────────────────────┐  │  │
│  │  LLM Client │   │  Artifact    │   │  Job Orchestrator     │  │  │
│  │  openai /   │   │  Builder     │   │  runReverseEngineer   │  │  │
│  │  gemini /   │──▶│  14 docs     │   │  runGenerate          │  │  │
│  │  groq /     │   │  (md + json) │   │  (batch A / B / C)    │  │  │
│  │  ollama /   │   └──────────────┘   └───────────────────────┘  │  │
│  │  watsonx    │                                                   │  │
│  └─────────────┘                                                   │  │
│                                                                       │
│  SQLite  (job tracking + audit log)    Local FS  (uploads/artifacts) │
└──────────────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│   LLM Provider:  OpenAI · Gemini · Groq · Ollama (local) · watsonx   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## How RAG Works

### The Problem
DataPower ZIP exports and IIB/ACE project archives are frequently **incomplete** — missing XSLT stylesheets, ESQL files, processing policies, or backend URLs. Without additional context the LLM can only guess from sparse config metadata.

### The Solution — Retrieval-Augmented Generation

Before every LLM call (both reverse engineering and code generation), the system:

1. **Builds a BM25 query** from the parsed artifact metadata — detecting which service types, node types, security schemes, and missing files are present.
2. **Searches 29 curated knowledge documents** covering IBM DataPower, IIB/ACE, API Connect patterns, and Spring Boot migration recipes.
3. **Injects the top-K retrieved chunks** into the LLM prompt as a `=== RETRIEVED IBM MIDDLEWARE DOMAIN KNOWLEDGE ===` section, above the artifact metadata.

```
LLM Prompt Structure (Reverse Engineering)
───────────────────────────────────────────
[System prompt: RE architect role]

[User prompt:]
  Reverse engineer this IBM DataPower configuration…

  === RETRIEVED IBM MIDDLEWARE DOMAIN KNOWLEDGE ===      ← RAG injection
  --- DataPower MPGW Service Pattern ---
  IBM DataPower MultiProtocolGateway (MPGW) is a versatile service…
  --- DataPower XSLT Transformation Migration ---
  DataPower XSLT stylesheets implement field mapping…
  --- Handling Incomplete DataPower Artifacts ---
  When a DataPower ZIP export is incomplete or contains only partial…
  === END OF RETRIEVED IBM MIDDLEWARE DOMAIN KNOWLEDGE ===

  COMPLEXITY: INTERMEDIATE
  PARSED METADATA:
  { "services": [...], "xsltFiles": [...], … }          ← artifact data

  Return EXACTLY this JSON structure: { … }
```

### Knowledge Base — 29 Documents

| Source | Documents | Covers |
|--------|-----------|--------|
| DataPower | 8 | MPGW, WSP/SOAP, XSLT migration, GatewayScript, processing policy, crypto/OAuth/mTLS, SLM/NFR, **incomplete export handling** |
| IIB/ACE | 7 | Message flow anatomy, ESQL patterns (every keyword → Java), MQ/JMS, XSD/WSDL, **missing artifact inference**, error handling |
| API Connect | 5 | Assembly policies, security definitions, path→controller mapping, backend WebClient, OpenAPI extraction |
| Spring Boot | 8 (platform-agnostic) | pom.xml, application.yml, SecurityConfig, WebClientConfig, GlobalExceptionHandler, test patterns, Dockerfile, correlation ID |

### Incomplete Artifact Handling
When the uploaded ZIP is missing files (no XSLT, no ESQL, no backend URL), the retriever automatically adds `missing incomplete partial gap inference reconstruct` signals to the BM25 query. This surfaces the `dp-missing-config` and `iib-missing-artifacts` knowledge documents, which instruct the LLM on:
- Inference rules based on service naming conventions
- What to flag as a `GAP` in the `gaps[]` array
- How to reconstruct intent from available metadata

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ | Backend and frontend |
| npm | 9+ | Package management |
| Git | Any | Source control |
| **LLM provider** | — | See [LLM Configuration](#llm-configuration) below |

No GPU, no vector database server, no model download required — the RAG engine is pure JavaScript (BM25), runs fully in-process.

---

## Quick Start (Local Development)

### 1. Clone and install

```bash
git clone <repository-url>
cd ai-modernizer

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

### 2. Configure LLM provider

```bash
cp .env.example backend/.env
# Edit backend/.env — pick one LLM provider (see below)
```

### 3. Start the backend

```bash
cd backend
npm run dev
# Backend starts on http://localhost:4000
# RAG index (29 docs) is built automatically on startup
```

### 4. Start the frontend

```bash
cd frontend
npm run dev
# Frontend starts on http://localhost:5173
```

### 5. Open the application

Navigate to **http://localhost:5173**

---

## Docker Compose

```bash
# Copy root-level env file
cp .env.example .env
# Edit .env — set LLM_PROVIDER and credentials

# Build and start
docker compose up --build -d

# Frontend: http://localhost:3000
# Backend:  http://localhost:4000
```

---

## LLM Configuration

Set `LLM_PROVIDER` in `backend/.env` to one of the following:

### Free Options (No Credit Card Required)

#### Google Gemini — 1,500 req/day free
```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-1.5-flash-latest
```
Get a key at: https://aistudio.google.com/app/apikey

#### Groq — ~14,400 req/day free (fastest)
```env
LLM_PROVIDER=groq
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```
Get a key at: https://console.groq.com

#### Ollama — Unlimited, runs 100% locally (no internet)
```bash
# Install Ollama: https://ollama.com/download
ollama pull llama3.2
```
```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

### Paid Options

#### OpenAI
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

#### IBM watsonx.ai (Lite plan free tier)
```env
LLM_PROVIDER=watsonx
IBM_WATSONX_API_KEY=your_key_here
IBM_WATSONX_PROJECT_ID=your_project_id
IBM_WATSONX_URL=https://us-south.ml.cloud.ibm.com
IBM_WATSONX_MODEL=ibm/granite-13b-chat-v2
```

> **Stub mode:** If no LLM is configured or the LLM call fails, the system falls back to a baseline stub built entirely from the parsed artifact metadata. Full AI analysis requires a valid provider.

---

## End-to-End Workflow

```
1. Create Job
   POST /api/jobs
   { "name": "My API", "sourcePlatform": "DATAPOWER", "complexity": "INTERMEDIATE" }
   → Returns jobId, status: CREATED

2. Upload Source Artifact
   POST /api/jobs/:jobId/upload  (multipart file)
   → YAML/JSON for APIC, ZIP for DataPower or IIB/ACE
   → status: UPLOADED

3. Trigger Reverse Engineering
   POST /api/jobs/:jobId/reverse-engineer
   → Parser extracts structured metadata
   → RAG retrieves relevant IBM middleware domain knowledge
   → Enriched prompt sent to LLM
   → LLM JSON response validated, 14 artifact files written to disk
   → status: RE_COMPLETE

4. Review Artifacts
   GET /api/jobs/:jobId/reverse-artifacts         → list of 14+ files
   GET /api/jobs/:jobId/reverse-artifacts/download → ZIP download

5. Generate Target Microservice
   POST /api/jobs/:jobId/generate
   { "targetStack": "JAVA_SPRING_BOOT" }
   → RAG retrieves platform-specific Spring Boot migration recipes
   → 3 LLM batches (API layer / infra / DevOps+tests) run sequentially
   → All generated files written to disk
   → status: GEN_COMPLETE

6. Download Generated Code
   GET /api/jobs/:jobId/generated/download
   → ZIP containing complete, production-ready microservice project
```

---

## API Reference

### Job API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/jobs` | Create a new modernization job |
| `GET` | `/api/jobs` | List all jobs (reverse chronological) |
| `GET` | `/api/jobs/:jobId` | Get job details |
| `POST` | `/api/jobs/:jobId/upload` | Upload source artifact (multipart) |
| `POST` | `/api/jobs/:jobId/reverse-engineer` | Trigger reverse engineering (async) |
| `GET` | `/api/jobs/:jobId/status` | Poll job status |
| `GET` | `/api/jobs/:jobId/reverse-artifacts` | List RE artifact files |
| `GET` | `/api/jobs/:jobId/reverse-artifacts/download` | Download RE artifacts as ZIP |
| `POST` | `/api/jobs/:jobId/generate` | Trigger code generation (async) |
| `GET` | `/api/jobs/:jobId/generated/download` | Download generated code as ZIP |

### LLM Status API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/llm/status` | Check LLM provider configuration |

### RAG Admin API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/rag/status` | Index stats + all 29 document titles |
| `POST` | `/api/rag/index` | Force-rebuild the BM25 index |
| `POST` | `/api/rag/search` | Test retrieval: `{ "query": "...", "platform": "DATAPOWER", "topK": 3 }` |

#### Example: Test RAG retrieval

```bash
curl -X POST http://localhost:4000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{ "query": "XSLT transformation DataPower MPGW", "platform": "DATAPOWER", "topK": 3 }'
```

```json
{
  "query": "XSLT transformation DataPower MPGW",
  "count": 3,
  "results": [
    { "id": "dp-xslt-migration",   "score": 9.038, "platform": "DATAPOWER" },
    { "id": "dp-mpgw-pattern",     "score": 8.783, "platform": "DATAPOWER" },
    { "id": "dp-processing-policy","score": 5.378, "platform": "DATAPOWER" }
  ]
}
```

---

## Job Status Flow

```
CREATED → UPLOADED → RE_IN_PROGRESS → RE_COMPLETE → GEN_IN_PROGRESS → GEN_COMPLETE
                                    ↘ RE_FAILED                     ↘ GEN_FAILED
```

---

## Supported Input Formats

### IBM API Connect
- OpenAPI 3.x YAML / JSON
- Swagger 2.0 YAML / JSON
- IBM-extended `x-ibm-configuration` assembly policies

### IBM DataPower
- Export ZIP containing any combination of:
  - Multi-Protocol Gateway (MPGW) XML configurations (`.xml`, `.xcfg`)
  - Web Service Proxy (WSP) configurations
  - XSLT stylesheets (`.xsl`, `.xslt`)
  - GatewayScript files (`.js`, `.gws`)
  - Crypto / certificate references (`CryptoIdentCred`)
  - Processing policies and matching rules
  - Service variables (`StylesheetVariable`)

### IBM IIB / ACE
- Project ZIP containing any combination of:
  - Message Flow files (`.msgflow`)
  - ESQL compute modules (`.esql`)
  - XML Schema definitions (`.xsd`)
  - WSDL service definitions (`.wsdl`)
  - Graphical mapping files (`.map`)
  - Properties files (`*.properties`)

> **Partial ZIPs are handled gracefully.** The RAG engine provides inference rules for every missing file type, and the `gaps[]` array in the RE output explicitly lists what could not be determined.

---

## Reverse Engineering Output (14 Artifacts)

| # | File | Format |
|---|------|--------|
| 1 | `01-executive-summary.md` | Markdown |
| 2 | `02-interface-inventory.md` | Markdown |
| 3 | `03-endpoint-catalog.md` | Markdown |
| 4 | `04-source-target-mapping.md` | Markdown |
| 5 | `05-request-response-schemas.md` | Markdown |
| 6 | `06-transformation-mapping.md` | Markdown |
| 7 | `07-routing-document.md` | Markdown |
| 8 | `08-security-analysis.md` | Markdown |
| 9 | `09-error-handling.md` | Markdown |
| 10 | `10-non-functional-requirements.md` | Markdown |
| 11 | `11-complexity-assessment.md` | Markdown |
| 12 | `12-migration-recommendation.md` | Markdown |
| 13 | `13-test-scenarios.md` | Markdown |
| 14 | `14-target-openapi-spec.json` | JSON (OpenAPI 3.0) |
| + | `full-reverse-engineering.json` | JSON (complete structured output) |

---

## Generated Code Contents

### Java Spring Boot 3 / Java 21 (3-batch LLM generation)

| Batch | Files Generated |
|-------|----------------|
| A — API layer | `controller/`, `model/`, `mapper/`, `client/BackendClient.java`, `service/` |
| B — Infrastructure | `pom.xml`, `Application.java`, `config/SecurityConfig.java`, `config/WebClientConfig.java`, `exception/GlobalExceptionHandler.java`, `application.yml` |
| C — DevOps + Tests | `Dockerfile`, `docker-compose.yml`, `k8s/deployment.yaml`, `k8s/service.yaml`, `postman/collection.json`, `*ControllerTest.java`, `README.md` |

### Node.js TypeScript
`package.json`, `tsconfig.json`, `src/app.ts`, routes, controllers, services, mappers, middleware (security, error, correlation), Jest tests, Dockerfile, docker-compose, k8s, README

### Python FastAPI
`main.py`, `requirements.txt`, `app/routers/`, `app/models/`, `app/services/`, `app/mappers/`, `app/clients/`, `app/security.py`, `app/exceptions.py`, `app/config.py`, Pytest tests, Dockerfile, docker-compose, k8s, README

---

## Project Structure

```
ai-modernizer/
├── frontend/                        # React + TypeScript UI
│   ├── src/
│   │   ├── pages/                   # 9 UI screens (Dashboard → Download)
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── NewJobPage.tsx
│   │   │   ├── UploadPage.tsx
│   │   │   ├── ReverseEngineerPage.tsx
│   │   │   ├── ArtifactViewerPage.tsx
│   │   │   ├── GeneratePage.tsx
│   │   │   ├── DownloadPage.tsx
│   │   │   └── JobHistoryPage.tsx
│   │   ├── components/common/       # Button, Card, Layout, ProgressBar, StatusBadge
│   │   ├── services/api.ts          # Typed API client (all REST calls)
│   │   ├── store/appStore.ts        # Zustand global state
│   │   └── types/
│   ├── Dockerfile                   # nginx:alpine, non-root
│   └── nginx.conf
│
├── backend/                         # Node.js Express API
│   ├── src/
│   │   ├── server.js                # Express app + startup (warms RAG index)
│   │   ├── routes/jobs.js           # All routes: /api/jobs/*, /api/llm/*, /api/rag/*
│   │   ├── controllers/
│   │   │   └── jobController.js     # Request handlers
│   │   ├── parsers/
│   │   │   ├── apicParser.js        # OpenAPI / Swagger YAML → structured metadata
│   │   │   ├── datapowerParser.js   # DataPower ZIP → services, XSLT, GWS, crypto
│   │   │   ├── iibAceParser.js      # IIB/ACE ZIP → flows, ESQL, XSD, WSDL, maps
│   │   │   └── index.js             # Parser dispatcher
│   │   ├── rag/                     # ── RAG subsystem ──────────────────────────
│   │   │   ├── ragStore.js          # BM25 index engine (wink-bm25-text-search)
│   │   │   ├── ragRetriever.js      # Query builder + formatted context formatter
│   │   │   └── knowledge/
│   │   │       ├── datapower-patterns.js   # 8 DataPower knowledge docs
│   │   │       ├── iib-ace-patterns.js     # 7 IIB/ACE knowledge docs
│   │   │       ├── apic-patterns.js        # 5 API Connect knowledge docs
│   │   │       └── springboot-recipes.js   # 8 Spring Boot migration recipes
│   │   ├── llm/
│   │   │   ├── llmClient.js         # Multi-provider router (OpenAI/Gemini/Groq/Ollama/watsonx)
│   │   │   ├── prompts.js           # 6 prompt builders — all accept ragContext parameter
│   │   │   └── schemaValidator.js   # JSON schema validation for RE + gen output
│   │   ├── artifacts/
│   │   │   └── artifactBuilder.js   # Renders 14 Markdown + JSON artifact files
│   │   ├── jobs/
│   │   │   └── jobOrchestrator.js   # Coordinates parse → RAG → prompt → LLM → artifacts
│   │   ├── middleware/
│   │   │   ├── auditLogger.js       # Audit log for all API events
│   │   │   ├── errorHandler.js      # Centralised Express error handler
│   │   │   └── validators.js        # Express-validator rules
│   │   ├── config/
│   │   │   └── database.js          # sql.js SQLite (jobs + audit_logs tables)
│   │   └── utils/
│   │       ├── logger.js            # Winston structured logger
│   │       └── security.js          # Path traversal prevention, credential masking
│   ├── tests/
│   │   ├── jobs.test.js             # Job CRUD + RE trigger (19 tests)
│   │   ├── parsers.test.js          # APIC parser tests
│   │   ├── security.test.js         # Security utility tests
│   │   └── rag.test.js              # RAG subsystem tests (24 tests)
│   ├── uploads/                     # Uploaded source artifacts (per jobId)
│   ├── artifacts/                   # Generated RE + code artifacts (per jobId)
│   ├── data/                        # SQLite database file
│   ├── package.json
│   └── Dockerfile
│
├── sample-inputs/
│   ├── apic/customer-api.yaml       # Sample APIC OpenAPI spec
│   ├── datapower/                   # Sample DataPower ZIP
│   └── iib-ace/                     # Sample IIB/ACE project ZIP
│
├── sample-outputs/
│   ├── reverse-engineering/         # Expected RE artifact examples
│   ├── generated-java/              # Expected Spring Boot output
│   ├── generated-nodejs/            # Expected Node.js output
│   └── generated-python/            # Expected Python output
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Security Features

| Feature | Implementation |
|---------|----------------|
| File type whitelist | `.yaml`, `.yml`, `.json`, `.zip`, `.wsdl`, `.xsd`, `.xml` only |
| File size limit | 50 MB (configurable via `MAX_UPLOAD_SIZE_MB`) |
| Path traversal prevention | ZIP entries stripped of `../` before write |
| Credential masking | `security.js` masks secrets in extracted content |
| Non-root containers | `RUN adduser -S appuser` in all Dockerfiles |
| Audit logging | Every upload/RE/generate/download event logged to SQLite |
| Security headers | `helmet()` middleware on all routes |
| Rate limiting | 200 requests / 15 minutes per IP |
| CORS | Configurable `CORS_ORIGIN` — defaults to `localhost:5173` |

---

## Running Tests

```bash
cd backend
npm test
```

**43 tests across 4 suites — all passing:**

| Suite | Tests | Covers |
|-------|-------|--------|
| `jobs.test.js` | 9 | Job CRUD, upload, RE trigger, status, 404 handling |
| `parsers.test.js` | 7 | APIC YAML parsing, endpoint extraction, schema extraction |
| `security.test.js` | 3 | Path traversal prevention, credential masking |
| `rag.test.js` | 24 | BM25 store (search, filters, edge cases), retriever query building, prompt injection, all 3 RAG API routes |

---

## Key Architectural Decisions

### Why BM25 instead of vector embeddings?
| Aspect | BM25 (chosen) | Vector embeddings |
|--------|---------------|-------------------|
| Dependencies | None — pure JS | Requires model download (100MB–1GB) or API call |
| Offline | Yes | Only with local model |
| IBM terminology | Excellent — exact keyword matching for `ESQL`, `MPGW`, `GatewayScript`, `msgflow` | Semantic, may miss exact IBM terms |
| Latency | < 1ms | 50–500ms (local) or network round-trip |
| Cost | Zero | API embedding cost or GPU |

IBM middleware uses highly specific terminology that BM25 matches better than semantic embeddings.

### Why 3 batches for Spring Boot generation?
Free-tier LLMs (Groq, Ollama) have a hard 8,192-token output limit. A full Spring Boot project (controller + service + mapper + client + pom.xml + security + tests + Dockerfile + k8s) exceeds this in a single call. The 3-batch split (API layer / infrastructure / DevOps+tests) keeps each call within token limits while the orchestrator merges all `files[]` arrays.

### RAG is injected at prompt-build time, not retrieval time
Retrieved chunks are formatted as a `=== RETRIEVED DOMAIN KNOWLEDGE ===` section prepended to the user prompt. This means:
- The LLM sees the knowledge **before** the task instruction
- Each batch prompt for Spring Boot gets the **same** RAG context
- If RAG retrieval fails (network issues, bad input), it degrades gracefully to an empty string — the LLM call still proceeds

---

## Extending the Knowledge Base

To add new IBM middleware knowledge documents:

1. **Add a document** to any file in `backend/src/rag/knowledge/` following the existing shape:

```js
{
  id: 'dp-my-new-pattern',        // unique stable key
  platform: 'DATAPOWER',          // 'DATAPOWER' | 'IIB_ACE' | 'APIC' | 'ALL'
  phase: 'both',                  // 're' | 'gen' | 'both'
  tags: ['keyword1', 'keyword2'], // BM25 field weight ×3 — list IBM-specific terms
  title: 'My New Pattern',
  content: `Full knowledge text…`
}
```

2. **Rebuild the index** at runtime (no restart needed):

```bash
curl -X POST http://localhost:4000/api/rag/index
```

3. **Verify retrieval** using the search endpoint:

```bash
curl -X POST http://localhost:4000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{ "query": "your test query", "platform": "DATAPOWER", "topK": 3 }'
```

---

## Out of Scope (MVP)

- Automated cloud deployment pipeline
- Runtime traffic capture from live IBM middleware
- Multi-application portfolio migration dashboard
- Enterprise SSO / LDAP integration
- Automatic production cutover

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m 'Add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## License

Apache 2.0 — See [LICENSE](LICENSE)
