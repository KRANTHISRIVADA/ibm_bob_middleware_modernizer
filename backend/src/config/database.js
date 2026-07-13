'use strict';
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/modernizer.db');
let db;

async function init() {
  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Load existing DB from disk if present
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      name TEXT,
      sourcePlatform TEXT,
      complexity TEXT,
      description TEXT,
      status TEXT,
      uploadedFile TEXT,
      targetStack TEXT,
      error TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobId TEXT,
      event TEXT,
      detail TEXT,
      ip TEXT,
      timestamp TEXT
    );
  `);
  persist();
}

function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function saveJob(job) {
  db.run(`
    INSERT INTO jobs (id, name, sourcePlatform, complexity, description, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [job.id, job.name, job.sourcePlatform, job.complexity, job.description, job.status, job.createdAt, job.updatedAt]
  );
  persist();
}

function getJob(id) {
  const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function listJobs() {
  const rows = [];
  const stmt = db.prepare('SELECT * FROM jobs ORDER BY createdAt DESC');
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function updateJob(id, fields) {
  const keys = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(fields), id];
  db.run(`UPDATE jobs SET ${keys} WHERE id = ?`, values);
  persist();
}

function saveAuditLog({ jobId, event, detail, ip }) {
  db.run(
    `INSERT INTO audit_logs (jobId, event, detail, ip, timestamp) VALUES (?, ?, ?, ?, ?)`,
    [jobId || null, event, detail || '', ip || '', new Date().toISOString()]
  );
  persist();
}

function getAuditLogs(jobId) {
  const rows = [];
  const stmt = db.prepare('SELECT * FROM audit_logs WHERE jobId = ? ORDER BY timestamp DESC');
  stmt.bind([jobId]);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

module.exports = { init, saveJob, getJob, listJobs, updateJob, saveAuditLog, getAuditLogs };
