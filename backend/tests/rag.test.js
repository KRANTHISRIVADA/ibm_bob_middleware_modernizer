'use strict';
/**
 * Tests for the RAG subsystem:
 * - ragStore: index build, search with filters
 * - ragRetriever: query building and formatted context output
 * - API routes: /api/rag/status, /api/rag/index, /api/rag/search
 */
process.env.DB_PATH = require('path').join(__dirname, 'rag-test.db');
process.env.NODE_ENV = 'test';

const request = require('supertest');
const { app } = require('../src/server');
const db = require('../src/config/database');
const ragStore = require('../src/rag/ragStore');
const { retrieveForRE, retrieveForGen, buildREQuery, buildGenQuery } = require('../src/rag/ragRetriever');
const { buildAPICPrompt, buildDataPowerPrompt, buildIIBACEPrompt, buildSpringBootPrompt } = require('../src/llm/prompts');
const fs = require('fs');

beforeAll(async () => {
  await db.init();
  ragStore.buildIndex();
});

afterAll(() => {
  const p = process.env.DB_PATH;
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

// ─── ragStore tests ───────────────────────────────────────────────────────────

describe('ragStore', () => {
  test('getStats returns expected totals', () => {
    const stats = ragStore.getStats();
    expect(stats.totalDocs).toBeGreaterThanOrEqual(20);
    expect(stats.indexed).toBe(stats.totalDocs);
    expect(stats.platforms).toContain('DATAPOWER');
    expect(stats.platforms).toContain('IIB_ACE');
    expect(stats.platforms).toContain('APIC');
    expect(stats.platforms).toContain('ALL');
  });

  test('search returns relevant DataPower XSLT docs', () => {
    const results = ragStore.search('XSLT transformation DataPower MPGW', {
      platform: 'DATAPOWER', phase: 're', topK: 3,
    });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map(r => r.id);
    expect(ids).toContain('dp-xslt-migration');
    results.forEach(r => {
      expect(r.score).toBeGreaterThan(0);
      expect(r.content).toBeDefined();
    });
  });

  test('search returns relevant IIB ESQL docs', () => {
    const results = ragStore.search('ESQL compute module message flow IIB', {
      platform: 'IIB_ACE', topK: 3,
    });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map(r => r.id);
    expect(ids.some(id => id.startsWith('iib-'))).toBe(true);
  });

  test('search returns Spring Boot gen docs', () => {
    const results = ragStore.search('Spring Boot SecurityConfig JWT pom.xml', {
      phase: 'gen', topK: 4,
    });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map(r => r.id);
    expect(ids.some(id => id.startsWith('sb-') || id.startsWith('apic-') || id.startsWith('dp-'))).toBe(true);
  });

  test('search platform filter excludes wrong platform', () => {
    const results = ragStore.search('XSLT ESQL message flow transform', {
      platform: 'APIC', topK: 10,
    });
    // No IIB-only or DataPower-only docs should appear
    results.forEach(r => {
      expect(['APIC', 'ALL'].includes(r.platform)).toBe(true);
    });
  });

  test('search empty query returns empty array', () => {
    expect(ragStore.search('')).toEqual([]);
    expect(ragStore.search('   ')).toEqual([]);
  });

  test('search for incomplete artifacts returns missing/gap doc', () => {
    const results = ragStore.search('missing incomplete no ESQL gap inference', {
      platform: 'IIB_ACE', topK: 3,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('iib-missing-artifacts');
  });
});

// ─── ragRetriever tests ───────────────────────────────────────────────────────

describe('ragRetriever - buildREQuery', () => {
  test('DataPower with XSLT and no backends includes missing-config signals', () => {
    const parsedData = {
      services: [{ type: 'MPGW', name: 'TestSvc', backendUrl: null }],
      xsltFiles: [{ file: 'transform.xsl', content: 'xsl:template' }],
      gatewayScriptFiles: [],
      cryptoReferences: [],
      backendUrls: [],  // empty → triggers "missing" signal
      matchingRules: [],
      processingPolicies: [],
      variables: [],
    };
    const query = buildREQuery(parsedData, 'DATAPOWER');
    expect(query).toContain('MPGW');
    expect(query).toContain('XSLT');
    expect(query).toContain('missing');
  });

  test('IIB with MQ nodes includes MQ signals', () => {
    const parsedData = {
      messageFlows: [{ file: 'test.msgflow', nodes: [{ type: 'ComIbmMQInputNode', name: 'MQIn' }] }],
      esqlModules: [{ file: 'compute.esql', content: 'CREATE COMPUTE MODULE' }],
      schemas: [],
      wsdlServices: [],
      mappings: [],
      properties: {},
      endpoints: ['http://backend:9090'],
    };
    const query = buildREQuery(parsedData, 'IIB_ACE');
    expect(query).toContain('MQ');
    expect(query).toContain('ESQL');
  });

  test('APIC with OAuth security includes OAuth signals', () => {
    const parsedData = {
      endpoints: [{ path: '/test', method: 'GET' }],
      securityPolicies: [{ name: 'oauth', type: 'oauth2' }],
      backendUrls: ['http://backend'],
      rawSpec: { 'x-ibm-configuration': { assembly: { execute: [] } } },
    };
    const query = buildREQuery(parsedData, 'APIC');
    expect(query).toContain('OAuth2');
    expect(query).toContain('x-ibm-configuration');
  });
});

describe('ragRetriever - retrieveForRE', () => {
  test('returns non-empty formatted string for DataPower', () => {
    const parsedData = {
      services: [{ type: 'MPGW', name: 'Svc1', backendUrl: 'http://backend' }],
      xsltFiles: [{ file: 'a.xsl', content: 'xsl:transform' }],
      gatewayScriptFiles: [], cryptoReferences: [],
      backendUrls: ['http://backend'], matchingRules: [], processingPolicies: [], variables: [],
    };
    const ctx = retrieveForRE(parsedData, 'DATAPOWER');
    expect(typeof ctx).toBe('string');
    expect(ctx.length).toBeGreaterThan(100);
    expect(ctx).toContain('RETRIEVED IBM MIDDLEWARE DOMAIN KNOWLEDGE');
  });

  test('returns non-empty formatted string for IIB_ACE', () => {
    const parsedData = {
      messageFlows: [{ file: 'f.msgflow', nodes: [] }],
      esqlModules: [{ file: 'e.esql', content: 'CREATE COMPUTE MODULE Foo', modules: [] }],
      schemas: [], wsdlServices: [], mappings: [], properties: {}, endpoints: [],
    };
    const ctx = retrieveForRE(parsedData, 'IIB_ACE');
    expect(ctx).toContain('RETRIEVED IBM MIDDLEWARE DOMAIN KNOWLEDGE');
  });

  test('returns empty string gracefully on bad input', () => {
    const ctx = retrieveForRE(null, 'DATAPOWER');
    // Should not throw; returns string (possibly empty or partial)
    expect(typeof ctx).toBe('string');
  });
});

describe('ragRetriever - retrieveForGen', () => {
  const reContext = {
    structured: {
      sourcePlatform: 'APIC', complexity: 'INTERMEDIATE',
      apiTitle: 'TestAPI', apiVersion: '1.0',
      executiveSummary: 'Test API',
      endpointCatalog: [{ method: 'GET', path: '/test', operationId: 'getTest' }],
      requestResponseSchemas: [], sourceMappings: [], transformationMapping: [],
      routingDocument: [], securityAnalysis: { policies: ['OAuth2'] }, errorHandling: [],
      nonFunctionalRequirements: {}, testScenarios: [],
      services: [], messageFlows: [], esqlModules: [], xsltTransformations: [], gatewayScripts: [],
    },
    artifacts: {},
  };

  test('returns gen context for JAVA_SPRING_BOOT', () => {
    const ctx = retrieveForGen(reContext, 'JAVA_SPRING_BOOT');
    expect(ctx).toContain('RETRIEVED CODE GENERATION PATTERNS');
    expect(ctx.length).toBeGreaterThan(200);
  });

  test('gen context contains Spring Boot patterns', () => {
    const ctx = retrieveForGen(reContext, 'JAVA_SPRING_BOOT');
    // Should include at least one Spring Boot recipe
    expect(ctx).toMatch(/Spring Boot|pom\.xml|SecurityConfig|WebClient/);
  });
});

// ─── Prompt injection tests ───────────────────────────────────────────────────

describe('prompts RAG injection', () => {
  const sampleParsed = {
    sourcePlatform: 'APIC', apiTitle: 'Test', apiVersion: '1.0',
    endpoints: [], securityPolicies: [], backendUrls: [], schemas: {}, rawSpec: {},
  };
  const ragCtx = '=== RETRIEVED IBM MIDDLEWARE DOMAIN KNOWLEDGE ===\n--- Test Doc ---\nSome content\n=== END ===';

  test('buildAPICPrompt injects ragContext into user prompt', () => {
    const p = buildAPICPrompt(sampleParsed, 'SIMPLE', ragCtx);
    expect(p.user).toContain('RETRIEVED IBM MIDDLEWARE DOMAIN KNOWLEDGE');
    expect(p.user).toContain('COMPLEXITY: SIMPLE');
  });

  test('buildAPICPrompt with no ragContext has no RAG section', () => {
    const p = buildAPICPrompt(sampleParsed, 'SIMPLE');
    expect(p.user).not.toContain('RETRIEVED IBM MIDDLEWARE DOMAIN KNOWLEDGE');
  });

  test('buildDataPowerPrompt injects ragContext', () => {
    const p = buildDataPowerPrompt({ services: [], xsltFiles: [], gatewayScriptFiles: [], cryptoReferences: [], backendUrls: [], matchingRules: [], processingPolicies: [], variables: [] }, 'INTERMEDIATE', ragCtx);
    expect(p.user).toContain('RETRIEVED IBM MIDDLEWARE DOMAIN KNOWLEDGE');
  });

  test('buildSpringBootPrompt injects ragContext into all 3 batches', () => {
    const reCtx = {
      structured: {
        sourcePlatform: 'APIC', apiTitle: 'Test', apiVersion: '1.0', complexity: 'SIMPLE',
        executiveSummary: 'test', endpointCatalog: [], requestResponseSchemas: [],
        sourceMappings: [], transformationMapping: [], routingDocument: [],
        securityAnalysis: {}, errorHandling: [], nonFunctionalRequirements: {}, testScenarios: [],
        services: [], messageFlows: [], esqlModules: [], xsltTransformations: [], gatewayScripts: [],
      },
      artifacts: {},
    };
    const batches = buildSpringBootPrompt(reCtx, 'SIMPLE', ragCtx);
    expect(batches).toHaveLength(3);
    batches.forEach(b => {
      expect(b.user).toContain('RETRIEVED IBM MIDDLEWARE DOMAIN KNOWLEDGE');
    });
  });
});

// ─── API route tests ──────────────────────────────────────────────────────────

describe('RAG API routes', () => {
  test('GET /api/rag/status returns index stats', async () => {
    const res = await request(app).get('/api/rag/status');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.totalDocs).toBeGreaterThan(0);
    expect(Array.isArray(res.body.documents)).toBe(true);
    expect(res.body.documents[0]).toHaveProperty('id');
    expect(res.body.documents[0]).toHaveProperty('title');
  });

  test('POST /api/rag/index rebuilds index', async () => {
    const res = await request(app).post('/api/rag/index');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('rebuilt');
    expect(res.body.totalDocs).toBeGreaterThan(0);
  });

  test('POST /api/rag/search returns relevant results', async () => {
    const res = await request(app)
      .post('/api/rag/search')
      .send({ query: 'XSLT DataPower transformation MPGW', platform: 'DATAPOWER', topK: 3 });
    expect(res.statusCode).toBe(200);
    expect(res.body.query).toBe('XSLT DataPower transformation MPGW');
    expect(res.body.count).toBeGreaterThan(0);
    const ids = res.body.results.map(r => r.id);
    expect(ids).toContain('dp-xslt-migration');
  });

  test('POST /api/rag/search without query returns 400', async () => {
    const res = await request(app).post('/api/rag/search').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('query is required');
  });

  test('POST /api/rag/search with IIB query returns IIB docs', async () => {
    const res = await request(app)
      .post('/api/rag/search')
      .send({ query: 'ESQL compute IIB ACE flow', platform: 'IIB_ACE', topK: 3 });
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    res.body.results.forEach(r => {
      expect(['IIB_ACE', 'ALL']).toContain(r.platform);
    });
  });
});
