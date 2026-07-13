'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');

const key   = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Exact request format as specified
const body = {
  contents: [
    {
      parts: [
        {
          text: 'Reply with exactly this JSON and nothing else: {"status":"ok","message":"Gemini working"}',
        },
      ],
    },
  ],
  generationConfig: { temperature: 0.1, maxOutputTokens: 64 },
};

(async () => {
  try {
    const res = await axios.post(url, body, {
      headers: {
        'Content-Type':   'application/json',
        'x-goog-api-key': key,
      },
      timeout: 30000,
    });

    const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('✓ HTTP status  :', res.status);
    console.log('✓ Model        :', res.data.modelVersion || model);
    console.log('✓ Raw response :', text?.trim());
    console.log('\nGemini API connection SUCCESSFUL ✓');
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    const status = err.response?.status || 'N/A';
    console.error(`✗ HTTP ${status}: ${msg}`);
    process.exit(1);
  }
})();
