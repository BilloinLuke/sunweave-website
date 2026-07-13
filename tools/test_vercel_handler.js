// Local simulation of the Vercel serverless function entry point.
// Vercel calls: module.exports = async (req, res) => { ... }
// Here we mimic req/res and assert the handler returns a valid Gemini-shaped reply.
const fs = require('fs');
const path = require('path');

// Load .env the same way server.js does (Vercel uses real env vars instead).
function loadEnv(fp) {
  if (!fs.existsSync(fp)) return;
  fs.readFileSync(fp, 'utf8').split('\n').forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const i = t.indexOf('=');
    if (i === -1) return;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  });
}
loadEnv(path.join(__dirname, '..', '.env'));

const handler = require('../api/chat.js');

const req = {
  method: 'POST',
  body: {
    systemInstruction: { parts: [{ text: 'You are the SUNWEAVE sales assistant. Answer briefly.' }] },
    contents: [{ role: 'user', parts: [{ text: 'What is your MOQ? Reply in ONE short sentence.' }] }]
  }
};

const res = {
  _status: 0,
  _json: null,
  setHeader() {},
  status(s) { this._status = s; return this; },
  json(j) { this._json = j; return this; }
};

handler(req, res).then(() => {
  console.log('handler status :', res._status);
  const ok = res._json && res._json.candidates && res._json.candidates[0];
  if (ok) {
    console.log('handler reply  :', res._json.candidates[0].content.parts[0].text);
    console.log('VERCEL HANDLER: PASS');
  } else {
    console.error('handler json   :', JSON.stringify(res._json));
    console.error('VERCEL HANDLER: FAIL (no candidates)');
    process.exit(1);
  }
}).catch((e) => {
  console.error('HANDLER THREW  :', e.message);
  process.exit(1);
});
