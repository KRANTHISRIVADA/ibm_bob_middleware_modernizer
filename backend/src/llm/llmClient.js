'use strict';
/**
 * LLM Client — supports multiple providers including free tiers:
 *
 *  Provider       | Set LLM_PROVIDER=  | Free tier
 *  ───────────────┼────────────────────┼─────────────────────────────────────
 *  Google Gemini  | gemini             | 1500 req/day, no credit card needed
 *  Groq           | groq               | ~14,400 req/day on free plan
 *  Ollama (local) | ollama             | Unlimited — runs 100% on your machine
 *  OpenAI         | openai             | Paid (has free trial credits)
 *  IBM watsonx    | watsonx            | Lite plan free tier
 */
const axios = require('axios');

// ─── Router ──────────────────────────────────────────────────────────────────

async function invokeLLM(systemPrompt, userPrompt) {
  const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
  switch (provider) {
    case 'gemini':  return invokeGemini(systemPrompt, userPrompt);
    case 'groq':    return invokeGroq(systemPrompt, userPrompt);
    case 'ollama':  return invokeOllama(systemPrompt, userPrompt);
    case 'openai':  return invokeOpenAI(systemPrompt, userPrompt);
    case 'watsonx': return invokeWatsonX(systemPrompt, userPrompt);
    default: throw new Error(`Unknown LLM_PROVIDER "${provider}". Valid: gemini | groq | ollama | openai | watsonx`);
  }
}

// ─── Shared helper: extract the first JSON object from any text ───────────────

function extractJSON(text) {
  // Try direct parse first (provider returned clean JSON)
  try { return JSON.parse(text.trim()); } catch (_) {}

  // Find the first { ... } block — handles markdown code fences and preamble text
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch (_) {}
  }

  // Greedy match of outermost braces
  const raw = text.match(/\{[\s\S]*\}/);
  if (raw) {
    try { return JSON.parse(raw[0]); } catch (_) {}
  }

  throw new Error('LLM did not return valid JSON. Response snippet: ' + text.slice(0, 300));
}

// ─── Google Gemini ────────────────────────────────────────────────────────────
// Endpoint : POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
// Auth     : x-goog-api-key header
// Docs     : https://ai.google.dev/api/generate-content

async function invokeGemini(systemPrompt, userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in backend/.env');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // Request body — exact format as specified:
  // { "contents": [{ "parts": [{ "text": "..." }] }] }
  const body = {
    contents: [
      {
        parts: [
          {
            text: `${systemPrompt}\n\n${userPrompt}\n\nYou MUST respond with a single valid JSON object only. No markdown, no explanation, just the JSON.`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature:      0.1,
      maxOutputTokens:  8192,
    },
  };

  const res = await axios.post(url, body, {
    headers: {
      'Content-Type':   'application/json',
      'x-goog-api-key': apiKey,             // auth via header, not query param
    },
    timeout: 120000,
  });

  const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response. Check your API key and quota.');
  return extractJSON(text);
}

// ─── Groq (FREE — fast Llama & Mixtral, generous daily quota) ────────────────
// Sign up: https://console.groq.com  → API Keys

async function invokeGroq(systemPrompt, userPrompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    throw new Error('GROQ_API_KEY not set. Get a free key at https://console.groq.com');
  }

  // Best free models on Groq (as of 2024-2025):
  //   llama-3.3-70b-versatile  ← best quality, recommended
  //   llama-3.1-8b-instant     ← fastest
  //   mixtral-8x7b-32768       ← large context window
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    temperature: 0.1,
    max_tokens: 8192,
    response_format: { type: 'json_object' },  // Groq supports OpenAI-compatible JSON mode
  }, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 120000,
  });

  return extractJSON(res.data.choices[0].message.content);
}

// ─── Ollama (LOCAL — completely free, runs on your machine) ──────────────────
// Install: https://ollama.com/download  then run: ollama pull llama3.2

async function invokeOllama(systemPrompt, userPrompt) {
  const baseUrl  = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model    = process.env.OLLAMA_MODEL    || 'llama3.2';

  let res;
  try {
    res = await axios.post(`${baseUrl}/api/chat`, {
      model,
      stream: false,
      format: 'json',   // Ollama JSON mode — forces valid JSON output
      options: { temperature: 0.1, num_predict: 8192 },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 300000,   // local models can be slower — 5 min timeout
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      throw new Error(
        `Ollama is not running at ${baseUrl}.\n` +
        '  1. Install from https://ollama.com/download\n' +
        `  2. Run: ollama pull ${model}\n` +
        '  3. Ollama starts automatically on install (check system tray)'
      );
    }
    throw err;
  }

  const text = res.data.message?.content;
  if (!text) throw new Error('Ollama returned empty response');
  return extractJSON(text);
}

// ─── OpenAI (Paid, has free trial credits) ───────────────────────────────────

async function invokeOpenAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new Error('OPENAI_API_KEY not set. See https://platform.openai.com/api-keys');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const res = await axios.post('https://api.openai.com/v1/chat/completions', {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    temperature: 0.1,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
  }, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 120000,
  });

  return extractJSON(res.data.choices[0].message.content);
}

// ─── IBM watsonx.ai (Lite plan free tier) ────────────────────────────────────

async function invokeWatsonX(systemPrompt, userPrompt) {
  const apiKey    = process.env.IBM_WATSONX_API_KEY;
  const projectId = process.env.IBM_WATSONX_PROJECT_ID;
  const baseUrl   = process.env.IBM_WATSONX_URL || 'https://us-south.ml.cloud.ibm.com';
  if (!apiKey || !projectId) {
    throw new Error('IBM_WATSONX_API_KEY and IBM_WATSONX_PROJECT_ID must both be set');
  }

  // Exchange IBM API key for IAM bearer token
  const tokenRes = await axios.post(
    'https://iam.cloud.ibm.com/identity/token',
    new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: apiKey,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const token  = tokenRes.data.access_token;
  const model  = process.env.IBM_WATSONX_MODEL || 'ibm/granite-13b-chat-v2';
  const prompt = `${systemPrompt}\n\n${userPrompt}\n\nRespond with valid JSON only.`;

  const resp = await axios.post(
    `${baseUrl}/ml/v1/text/generation?version=2023-05-29`,
    {
      model_id:   model,
      project_id: projectId,
      input:      prompt,
      parameters: { decoding_method: 'greedy', max_new_tokens: 4096, temperature: 0.1 },
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 120000,
    }
  );

  return extractJSON(resp.data.results[0].generated_text);
}

// ─── LLM Configuration Health Check ─────────────────────────────────────────

function checkLLMConfig() {
  const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
  const result = { provider, configured: false, message: '' };

  switch (provider) {
    case 'gemini':
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
        result.message = 'GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/app/apikey';
      } else {
        result.configured = true;
        result.message = `Gemini configured (model: ${process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest'})`;
      }
      break;
    case 'groq':
      if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
        result.message = 'GROQ_API_KEY is not set. Get a free key at https://console.groq.com';
      } else {
        result.configured = true;
        result.message = `Groq configured (model: ${process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'})`;
      }
      break;
    case 'ollama':
      result.configured = true;
      result.message = `Ollama configured (url: ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}, model: ${process.env.OLLAMA_MODEL || 'llama3.2'}). Ensure Ollama is running.`;
      break;
    case 'openai':
      if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
        result.message = 'OPENAI_API_KEY is not set. See https://platform.openai.com/api-keys';
      } else {
        result.configured = true;
        result.message = `OpenAI configured (model: ${process.env.OPENAI_MODEL || 'gpt-4o'})`;
      }
      break;
    case 'watsonx':
      if (!process.env.IBM_WATSONX_API_KEY || !process.env.IBM_WATSONX_PROJECT_ID) {
        result.message = 'IBM_WATSONX_API_KEY and IBM_WATSONX_PROJECT_ID must both be set';
      } else {
        result.configured = true;
        result.message = `IBM watsonx configured (model: ${process.env.IBM_WATSONX_MODEL || 'ibm/granite-13b-chat-v2'})`;
      }
      break;
    default:
      result.message = `Unknown LLM_PROVIDER "${provider}". Valid: gemini | groq | ollama | openai | watsonx`;
  }

  return result;
}

module.exports = { invokeLLM, checkLLMConfig };
