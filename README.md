# AI Modernizer — IBM Middleware Migration Accelerator

An AI-powered accelerator that reverse-engineers IBM API Connect, IBM DataPower, and IBM IIB/ACE artifacts and generates production-ready containerized microservices in Java Spring Boot, Node.js, or Python FastAPI.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React UI (port 5173/80)                   │
│  Dashboard → Upload → Reverse Engineer → Artifacts →        │
│  Generate → Download → Job History                          │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP REST /api/*
┌─────────────────────▼───────────────────────────────────────┐
│               Node.js Backend (port 4000)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Parsers  │ │   LLM    │ │Artifact  │ │  Generators  │  │
│  │ APIC     │ │ Client   │ │ Builder  │ │  Java/Node/  │  │
│  │ DataPower│ │ (OpenAI/ │ │ (14 docs)│ │  Python      │  │
│  │ IIB/ACE  │ │ watsonx) │ │          │ │              │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  SQLite (job tracking)   Local filesystem (artifacts)       │
└─────────────────────────────────────────────────────────────┘
                      │ REST API
┌─────────────────────▼───────────────────────────────────────┐
│            LLM Provider (OpenAI / IBM watsonx.ai)           │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

- Node.js 20+
- npm 9+
- Git
- OpenAI API key **or** IBM watsonx.ai credentials

---

## Quick Start (Local Development)

### 1. Clone and install

```bash
git clone <repository-url>
cd ai-modernizer

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies  
cd frontend && npm install && cd ..
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and set your OPENAI_API_KEY
```

### 3. Start the backend

```bash
cd backend
npm run dev
# Backend runs on http://localhost:4000
```

### 4. Start the frontend

```bash
cd frontend
npm run dev
# Frontend runs on http://localhost:5173
```

### 5. Open the application

Navigate to **http://localhost:5173**

---

## Docker Compose (Production)

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys

# Build and start all services
docker compose up --build -d

# Access the application
open http://localhost:3000
```

---

## LLM Configuration

### Option A: OpenAI

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

### Option B: IBM watsonx.ai

```env
LLM_PROVIDER=watsonx
IBM_WATSONX_API_KEY=...
IBM_WATSONX_PROJECT_ID=...
IBM_WATSONX_URL=https://us-south.ml.cloud.ibm.com
```

> **Note:** If no LLM is configured, the accelerator runs in **stub mode** — parsers extract metadata and build baseline artifacts, but full AI analysis requires a valid LLM provider.

---

## End-to-End Workflow

```
1. Create Job
   POST /api/jobs
   → Select source platform (APIC / DataPower / IIB_ACE) and complexity

2. Upload Source Artifact
   POST /api/jobs/:jobId/upload
   → YAML/JSON for APIC, ZIP for DataPower/IIB_ACE

3. Reverse Engineering
   POST /api/jobs/:jobId/reverse-engineer
   → Parses source, invokes LLM, validates JSON, builds 14 artifacts

4. Review Artifacts
   GET /api/jobs/:jobId/reverse-artifacts
   → Download ZIP of all 14 Markdown + JSON documents

5. Code Generation
   POST /api/jobs/:jobId/generate  { "targetStack": "JAVA_SPRING_BOOT" }
   → LLM generates production-ready microservice code

6. Download
   GET /api/jobs/:jobId/generated/download
   → ZIP containing complete microservice project
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/jobs` | Create modernization job |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/:jobId` | Get job details |
| POST | `/api/jobs/:jobId/upload` | Upload source artifact |
| POST | `/api/jobs/:jobId/reverse-engineer` | Trigger reverse engineering |
| GET | `/api/jobs/:jobId/status` | Get job status |
| GET | `/api/jobs/:jobId/reverse-artifacts` | List RE artifacts |
| GET | `/api/jobs/:jobId/reverse-artifacts/download` | Download RE artifacts ZIP |
| POST | `/api/jobs/:jobId/generate` | Generate target microservice |
| GET | `/api/jobs/:jobId/generated/download` | Download generated code ZIP |

---

## Supported Input Formats

### IBM API Connect
- OpenAPI 3.x YAML/JSON
- Swagger 2.0 YAML/JSON
- API Connect extended `x-ibm-configuration` sections

### IBM DataPower
- Export ZIP containing:
  - Multi-Protocol Gateway (MPGW) XML configurations
  - Web Service Proxy (WSP) configurations
  - XSLT stylesheets (`.xsl`, `.xslt`)
  - GatewayScript files (`.js`, `.gws`)
  - Crypto/certificate references
  - Service variables

### IBM IIB / ACE
- Project ZIP containing:
  - Message Flow files (`.msgflow`)
  - ESQL modules (`.esql`)
  - XML Schema definitions (`.xsd`)
  - WSDL service definitions (`.wsdl`)
  - Graphical mapping (`.map`)
  - Properties files

---

## Generated Reverse Engineering Artifacts

| # | Artifact | Format |
|---|---------|--------|
| 1 | Executive Summary | Markdown |
| 2 | Interface Inventory | Markdown |
| 3 | Endpoint Catalog | Markdown |
| 4 | Source-to-Target Mapping Specification | Markdown |
| 5 | Request/Response Schema Specification | Markdown |
| 6 | Transformation Mapping Document | Markdown |
| 7 | Routing and Backend Endpoint Document | Markdown |
| 8 | Security Policy Analysis | Markdown |
| 9 | Error Handling and Fault Mapping | Markdown |
| 10 | Non-Functional Requirements | Markdown |
| 11 | Complexity Assessment Report | Markdown |
| 12 | Migration Recommendation Report | Markdown |
| 13 | Test Scenario Inventory | Markdown |
| 14 | Target OpenAPI Specification | JSON |
| + | Full Reverse Engineering Output | JSON |

---

## Generated Code Contents

| Target | Generated Files |
|--------|----------------|
| **Java Spring Boot** | pom.xml, Application.java, controllers, services, mappers, WebClient clients, security config, exception handlers, JUnit 5 tests, application.yml |
| **Node.js TypeScript** | package.json, tsconfig.json, routes, controllers, services, mappers, middleware, Jest tests |
| **Python FastAPI** | main.py, requirements.txt, routers, services, mappers, Pydantic models, Pytest tests |
| **All targets** | Dockerfile (non-root), docker-compose.yml, k8s/deployment.yaml, k8s/service.yaml, README.md, Postman collection, CI pipeline YAML |

---

## Security Features

- File type and size validation (max 50 MB, allowed extensions only)
- Path traversal prevention during ZIP extraction
- Credential masking in extracted artifacts
- Non-root Dockerfile users
- Audit log for all events (upload, RE, generate, download)
- Helmet.js HTTP security headers
- Rate limiting (200 req/15 min)
- SQLite-based job tracking with isolation

---

## Running Tests

```bash
cd backend
npm test
```

Tests cover:
- Job CRUD API (`tests/jobs.test.js`)
- APIC parser (`tests/parsers.test.js`)
- Security utilities (`tests/security.test.js`)

---

## Project Structure

```
ai-modernizer/
├── frontend/                   # React + TypeScript UI
│   ├── src/
│   │   ├── pages/              # 10 UI screens
│   │   ├── components/common/  # Reusable components
│   │   ├── services/api.ts     # API client
│   │   └── store/appStore.ts   # Zustand state
│   ├── Dockerfile
│   └── nginx.conf
│
├── backend/                    # Node.js API
│   ├── src/
│   │   ├── server.js           # Express app entry
│   │   ├── routes/jobs.js      # API routes
│   │   ├── controllers/        # Request handlers
│   │   ├── parsers/            # APIC / DataPower / IIB-ACE parsers
│   │   ├── llm/                # LLM client + prompts + schema validator
│   │   ├── artifacts/          # 14-artifact builder
│   │   ├── jobs/               # Job orchestrator
│   │   ├── middleware/         # Auth, audit, error, validation
│   │   ├── config/             # SQLite database
│   │   └── utils/              # Logger, security utils
│   ├── tests/                  # Jest test suite
│   └── Dockerfile
│
├── sample-inputs/              # Sample IBM artifacts for testing
│   ├── apic/customer-api.yaml
│   ├── datapower/
│   └── iib-ace/
│
├── sample-outputs/             # Expected output examples
│   ├── reverse-engineering/
│   ├── generated-java/
│   ├── generated-nodejs/
│   └── generated-python/
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Out of Scope (MVP)

- Automated cloud deployment
- Runtime traffic capture
- Multi-application portfolio dashboard
- Enterprise SSO integration
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
