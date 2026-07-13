'use strict';
const path = require('path');
const fs = require('fs');
const apicParser = require('../src/parsers/apicParser');

describe('APIC Parser', () => {
  const testFile = path.join(__dirname, 'test-apic.yaml');

  beforeAll(() => {
    fs.writeFileSync(testFile, `
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0.0"
  description: A test API
servers:
  - url: https://api.example.com
paths:
  /customers:
    get:
      operationId: listCustomers
      summary: List all customers
      security:
        - ApiKeyAuth: []
      responses:
        "200":
          description: OK
  /customers/{id}:
    get:
      operationId: getCustomer
      summary: Get a customer
      responses:
        "200":
          description: OK
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
`);
  });

  afterAll(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  });

  test('parses API title and version', () => {
    const result = apicParser.parse(testFile);
    expect(result.apiTitle).toBe('Test API');
    expect(result.apiVersion).toBe('1.0.0');
  });

  test('parses endpoints', () => {
    const result = apicParser.parse(testFile);
    expect(result.endpoints.length).toBe(2);
    expect(result.endpoints[0].method).toBe('GET');
    expect(result.endpoints[0].path).toBe('/customers');
  });

  test('parses security schemes', () => {
    const result = apicParser.parse(testFile);
    expect(result.securityPolicies.length).toBeGreaterThan(0);
    expect(result.securityPolicies[0].name).toBe('ApiKeyAuth');
  });

  test('returns APIC source platform', () => {
    const result = apicParser.parse(testFile);
    expect(result.sourcePlatform).toBe('APIC');
  });
});
