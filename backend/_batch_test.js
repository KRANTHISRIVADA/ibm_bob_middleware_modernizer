require('dotenv').config();
const { invokeLLM } = require('./src/llm/llmClient');
const prompts = require('./src/llm/prompts');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function invokeLLMWithRetry(system, user, options) {
  try { return await invokeLLM(system, user, options); }
  catch (err) {
    if (err.response?.status === 429) {
      const wait = (parseInt(err.response?.headers?.['retry-after'] || '15') + 2) * 1000;
      console.log(`  Rate limited, waiting ${wait/1000}s...`);
      await sleep(wait);
      return await invokeLLM(system, user, options);
    }
    throw err;
  }
}

const reContext = {
  structured: {
    sourcePlatform: 'APIC', complexity: 'INTERMEDIATE',
    apiTitle: 'Customer Account API', apiVersion: '1.2.0',
    executiveSummary: 'Customer CRUD API with OAuth2.',
    interfaceInventory: [{ name: 'CustomerAPI', type: 'REST', description: 'CRUD' }],
    endpointCatalog: [
      { method: 'GET',    path: '/customers',              operationId: 'listCustomers',  summary: 'List customers',  security: ['OAuth2'], backendUrl: 'http://backend/customers' },
      { method: 'POST',   path: '/customers',              operationId: 'createCustomer', summary: 'Create customer', security: ['OAuth2'], backendUrl: 'http://backend/customers' },
      { method: 'GET',    path: '/customers/{customerId}', operationId: 'getCustomer',    summary: 'Get customer',    security: ['OAuth2'], backendUrl: 'http://backend/customers/{customerId}' },
      { method: 'DELETE', path: '/customers/{customerId}', operationId: 'deleteCustomer', summary: 'Delete customer', security: ['OAuth2'], backendUrl: 'http://backend/customers/{customerId}' },
    ],
    requestResponseSchemas: [{ endpoint: '/customers', requestSchema: { type:'object', properties:{ name:{type:'string'} } }, responseSchema: { type:'array', items:{ type:'object', properties:{ id:{type:'string'}, name:{type:'string'} } } } }],
    sourceMappings: [{ sourceField: 'customerId', targetField: 'id', transformation: 'direct' }],
    transformationMapping: [{ step: 'auth', type: 'OAuth2', logic: 'validate bearer token' }],
    routingDocument: [{ rule: 'route', condition: 'all', backendUrl: 'http://backend/customers' }],
    securityAnalysis: { policies: ['OAuth2'], oauthFlows: ['client_credentials'], apiKeys: [], mtls: false, jwt: false, notes: 'OAuth2' },
    errorHandling: [{ errorCode: '401', handling: 'return 401', response: 'Unauthorized' }, { errorCode: '404', handling: 'return 404', response: 'Not Found' }],
    nonFunctionalRequirements: { timeout: '30s', retry: '3', rateLimit: '100/min', logging: 'INFO', throttling: '50/s' },
    complexityAssessment: { score: 'INTERMEDIATE', rationale: 'OAuth2, 4 endpoints', factors: [] },
    migrationRecommendation: { recommendedStack: 'JAVA_SPRING_BOOT', rationale: 'Good fit', risks: [], estimatedEffort: '6w' },
    testScenarios: [{ id: 'TS-1', description: 'List customers returns 200', input: 'GET /customers', expectedOutput: '[]', type: 'INTEGRATION' }],
    gaps: [], risks: [], recommendations: [],
    services: [], messageFlows: [], esqlModules: [], xsltTransformations: [], gatewayScripts: [],
  },
  artifacts: {},
};

async function run() {
  const batches = prompts.buildSpringBootPrompt(reContext, 'INTERMEDIATE');
  console.log(`Batches: ${batches.map(b => b.batch).join(', ')}\n`);

  const allFiles = [];
  for (let i = 0; i < batches.length; i++) {
    if (i > 0) { console.log('  Waiting 3s between batches...'); await sleep(3000); }
    const batch = batches[i];
    console.log(`Batch ${batch.batch} (~${Math.round(batch.user.length/4)} tokens)...`);
    try {
      const r = await invokeLLMWithRetry(batch.system, batch.user, { jsonMode: false });
      if (r.files) { console.log(`  ✅ ${r.files.length} files`); r.files.forEach(f => console.log(`     ${f.path}`)); allFiles.push(...r.files); }
      else console.log('  ❌ no files array');
    } catch(e) { console.log(`  ❌ ${e.message}`); }
  }

  console.log(`\n=== Total: ${allFiles.length} files ===`);
  ['Controller','model/','Mapper','Client','Service','pom.xml','Application.java','Dockerfile','k8s/','Test.java'].forEach(k => {
    console.log(`  ${k.padEnd(18)}: ${allFiles.some(f => f.path.includes(k)) ? '✅' : '❌'}`);
  });
}

run().catch(console.error);
