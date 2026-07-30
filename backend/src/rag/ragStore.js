'use strict';
/**
 * RAG Store — BM25 full-text index over the IBM middleware knowledge base.
 *
 * Uses wink-bm25-text-search (pure JS, no model download, works offline).
 * The index is built once at startup and held in memory.
 *
 * Document shape (from knowledge/*.js files):
 *   { id, platform, phase, tags[], title, content }
 */
const BM25 = require('wink-bm25-text-search');
const logger = require('../utils/logger');

// ─── Load all knowledge documents ────────────────────────────────────────────

const allDocs = [
  ...require('./knowledge/datapower-patterns'),
  ...require('./knowledge/iib-ace-patterns'),
  ...require('./knowledge/apic-patterns'),
  ...require('./knowledge/springboot-recipes'),
];

// ─── Simple tokenizer (no external NLP model needed) ─────────────────────────

/**
 * Tokenises a string into lowercase alphanum tokens, strips stopwords.
 * wink-bm25-text-search expects prep tasks to return array of string tokens.
 */
const STOPWORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should',
  'may','might','shall','can','need','dare','ought','used',
  'i','you','he','she','it','we','they','me','him','her','us','them',
  'my','your','his','its','our','their','this','that','these','those',
  'and','or','but','if','of','in','to','for','on','with','at','by','from',
  'as','into','through','during','before','after','above','below',
  'up','down','out','off','over','under','then','than','so','yet','both',
  'not','no','nor','also','just','very','too','more','most','each','any',
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-./]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

// ─── Build BM25 index ─────────────────────────────────────────────────────────

let engine = null;
let indexedCount = 0;

/**
 * Builds or rebuilds the BM25 index over all knowledge documents.
 * Called once at server startup (lazy, on first retrieve call).
 */
function buildIndex() {
  engine = BM25();

  // defineConfig must include fldWeights AND come before definePrepTasks and addDoc
  // Field weights: tags (curated keywords) > title > content
  engine.defineConfig({
    fldWeights: { tags: 3, title: 2, content: 1 },
    bm25Params: { k1: 1.5, b: 0.75 },
  });

  // Prep tasks: single custom tokenizer function
  engine.definePrepTasks([
    text => typeof text === 'string' ? tokenize(text) : text,
  ]);

  // Add each knowledge document
  for (let i = 0; i < allDocs.length; i++) {
    const doc = allDocs[i];
    const tagsText = (doc.tags || []).join(' ');
    engine.addDoc({
      title:   doc.title   || '',
      tags:    tagsText,
      content: doc.content || '',
    }, i);  // docId = index into allDocs array
  }

  engine.consolidate();
  indexedCount = allDocs.length;
  logger.info(`RAG: BM25 index built with ${indexedCount} documents`);
}

/**
 * Returns the underlying list of all knowledge documents (for status/admin).
 */
function getAllDocs() {
  return allDocs;
}

/**
 * Returns index statistics.
 */
function getStats() {
  return {
    totalDocs: allDocs.length,
    indexed: indexedCount,
    platforms: [...new Set(allDocs.map(d => d.platform))],
    phases: [...new Set(allDocs.map(d => d.phase))],
  };
}

/**
 * Ensures the index is built (lazy init).
 */
function ensureIndex() {
  if (!engine) buildIndex();
}

/**
 * Search the BM25 index.
 *
 * @param {string} query          - free-text query
 * @param {object} [options]
 * @param {string} [options.platform] - filter to 'DATAPOWER'|'IIB_ACE'|'APIC'|'ALL'; null = no filter
 * @param {string} [options.phase]    - filter to 're'|'gen'|'both'; null = no filter
 * @param {number} [options.topK=5]   - max number of results
 * @returns {{ id, platform, phase, title, content, score }[]}
 */
function search(query, options = {}) {
  ensureIndex();

  const { platform, phase, topK = 5 } = options;

  if (!query || !query.trim()) return [];

  // engine.search(query) returns [[docId_string, score], ...] sorted by score desc
  // No second argument — use the default return format
  const rawResults = engine.search(query);

  const results = [];
  for (const [docIdStr, score] of rawResults) {
    const docIdx = parseInt(docIdStr, 10);
    const doc = allDocs[docIdx];
    if (!doc) continue;

    // Platform filter: document must match requested platform OR be tagged ALL
    if (platform && doc.platform !== 'ALL' && doc.platform !== platform) continue;

    // Phase filter: document must match phase or be tagged 'both'
    if (phase && doc.phase !== 'both' && doc.phase !== phase) continue;

    results.push({ ...doc, score });
    if (results.length >= topK) break;
  }

  return results;
}

module.exports = { search, buildIndex, ensureIndex, getAllDocs, getStats };
