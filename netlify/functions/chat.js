// Netlify Function — proxy to Google Gemini API
// Endpoint: POST /.netlify/functions/chat
// Keeps GEMINI_API_KEY on the server, never exposes it to the browser.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

exports.handler = async (event, context) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfiguration: missing GEMINI_API_KEY' }) };
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { contents, systemInstruction, generationConfig } = body;
  if (!Array.isArray(contents) || contents.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad request: contents array required' }) };
  }

  const payload = { contents };
  if (systemInstruction) payload.systemInstruction = systemInstruction;
  if (generationConfig) payload.generationConfig = generationConfig;

  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const message = data?.error?.message || `Gemini API returned ${upstream.status}`;
      return { statusCode: upstream.status, headers, body: JSON.stringify({ error: message, upstream: data }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to reach Gemini API', details: err.message }) };
  }
};
