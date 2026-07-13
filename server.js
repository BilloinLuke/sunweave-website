// Local development server: serves static files + proxies the chat endpoint
// to the configured LLM provider (Gemini or DeepSeek). API keys stay
// server-side and are never sent to the browser.
// Usage: node server.js   then open http://localhost:8123

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PORT = process.env.PORT || 8123;

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}
loadEnv(path.join(ROOT, '.env'));

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const handleChat = require('./api/providers');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJSON(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN === '*' ? '*' : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self' https://generativelanguage.googleapis.com;",
    ...headers
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN === '*' ? '*' : ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    });
    res.end();
    return;
  }

  // API proxy
  if (pathname === '/api/chat') {
    if (req.method !== 'POST') {
      sendJSON(res, 405, { error: 'Method not allowed' });
      return;
    }
    if (isRateLimited(ip)) {
      sendJSON(res, 429, { error: 'Too many requests. Please try again later.' });
      return;
    }
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      sendJSON(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    const result = await handleChat(body, req);
    if (result.status >= 400) {
      console.error('[chat error]', result.status, result.json && result.json.error ? result.json.error : result.json);
    }
    sendJSON(res, result.status, result.json);
    return;
  }

  // Static files
  let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(ROOT))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  const provider = (process.env.CHAT_PROVIDER || 'gemini').toLowerCase();
  const modelName = provider === 'deepseek'
    ? (process.env.DEEPSEEK_MODEL || 'deepseek-chat')
    : (process.env.GEMINI_MODEL || 'gemini-2.0-flash');
  console.log(`SUNWEAVE dev server running at http://localhost:${PORT}`);
  console.log(`Chat provider: ${provider} (model: ${modelName})`);
  console.log(`Knowledge base enabled: ${process.env.KB_ENABLED === 'true'}`);
  console.log(`DeepSeek key: ${process.env.DEEPSEEK_API_KEY ? 'configured' : 'not set'}`);
  console.log(`Gemini key:   ${process.env.GEMINI_API_KEY ? 'configured' : 'not set'}`);
});
