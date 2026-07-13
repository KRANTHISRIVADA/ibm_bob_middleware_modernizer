'use strict';
const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Point DB to a temp location before requiring app
process.env.DB_PATH = path.join(__dirname, 'test.db');
process.env.NODE_ENV = 'test';

const { app, start } = require('../src/server');
const db = require('../src/config/database');

beforeAll(async () => {
  await db.init();
});

afterAll(() => {
  const dbPath = process.env.DB_PATH;
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('Job API', () => {
  let jobId;

  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('POST /api/jobs creates a job', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ name: 'Test Job', sourcePlatform: 'APIC', complexity: 'SIMPLE', description: 'Test' });
    expect(res.statusCode).toBe(201);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.status).toBe('CREATED');
    jobId = res.body.jobId;
  });

  test('POST /api/jobs - invalid platform returns 400', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ name: 'Bad Job', sourcePlatform: 'UNKNOWN', complexity: 'SIMPLE' });
    expect(res.statusCode).toBe(400);
  });

  test('GET /api/jobs returns list', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.jobs)).toBe(true);
  });

  test('GET /api/jobs/:jobId returns job', async () => {
    const res = await request(app).get(`/api/jobs/${jobId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(jobId);
  });

  test('GET /api/jobs/:jobId/status returns status', async () => {
    const res = await request(app).get(`/api/jobs/${jobId}/status`);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('CREATED');
  });

  test('GET /api/jobs/nonexistent returns 404', async () => {
    const res = await request(app).get('/api/jobs/nonexistent-id');
    expect(res.statusCode).toBe(404);
  });

  test('POST /api/jobs/:jobId/upload with file', async () => {
    const tmpFile = path.join(__dirname, 'test-api.yaml');
    fs.writeFileSync(tmpFile, 'openapi: "3.0.0"\ninfo:\n  title: Test\n  version: "1.0"\npaths: {}');
    const res = await request(app)
      .post(`/api/jobs/${jobId}/upload`)
      .attach('file', tmpFile);
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('UPLOADED');
  });

  test('POST /api/jobs/:jobId/reverse-engineer triggers RE', async () => {
    const res = await request(app).post(`/api/jobs/${jobId}/reverse-engineer`);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('RE_IN_PROGRESS');
  });
});
