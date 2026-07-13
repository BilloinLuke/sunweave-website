// Vercel Serverless Function — proxy to the configured LLM provider
// (Gemini or DeepSeek). Endpoint: POST /api/chat.
// Keeps API keys on the server, never exposes them to the browser.

const handleChat = require('./providers');

function setCors(res, allowedOrigin) {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  setCors(res, allowedOrigin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const result = await handleChat(req.body || {}, req);
  res.status(result.status).json(result.json);
};
