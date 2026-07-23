// Shared chat provider for the SUNWEAVE site.
//
// Supports two LLM backends behind one /api/chat endpoint:
//   - gemini   : Google Gemini (vision-capable, native request format)
//   - deepseek : DeepSeek Chat (OpenAI-compatible, text-only, usually cheaper)
//
// Both feed off the same cloud knowledge base (Google Sheet published as CSV,
// retrieved + scored in api/kb.js). The knowledge-base context is injected the
// same way for either provider.
//
// The DeepSeek path converts the incoming Gemini-shaped `contents` into OpenAI
// `messages`, calls DeepSeek, then wraps the reply back into Gemini's response
// shape so the front-end never needs to know which provider is active.
//
// Used by:
//   server.js   (local Node dev server) -> require('./api/providers')
//   api/chat.js (Vercel serverless)     -> require('./providers')

const net = require('./net');
const chatlog = require('./chatlog');
const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

// ---------------------------------------------------------------------------
// Knowledge base: build the system text (front-end systemInstruction + KB RAG)
// ---------------------------------------------------------------------------
async function buildSysText(body) {
  // --- Persona Definition: SUNWEAVE Senior Export Manager ---
  let sysText = "You are the Senior Export Sales Manager at SUNWEAVE (Jiangsu Huiyi Supply Chain Co., Ltd.).\n" +
    "Your goal is to represent the brand professionally and proactively assist B2B buyers.\n\n" +
    "Core Guidelines:\n" +
    "1. Speak from the company's perspective using 'We' or 'SUNWEAVE'. Never refer to yourself as an AI or assistant.\n" +
    "2. Tone: Professional, helpful, reliable, and high-energy (Dopamine brand vibe).\n" +
    "3. Knowledge Base Usage: Use the provided data below to give precise specifications, MOQs, and lead times. If the data is not in the KB, use your general expertise in the beach towel industry but keep it aligned with our premium positioning.\n" +
    "4. Proactive Conversion: Always try to end your response by inviting the buyer to take the next step: ask for a sample, request a catalog, or book a factory visit tour.\n" +
    "5. Language: Always respond in the language the buyer uses.\n";

  if (body.systemInstruction && body.systemInstruction.parts && body.systemInstruction.parts[0] && body.systemInstruction.parts[0].text) {
    // Preserve any specific context passed from front-end if needed, though persona above is dominant
    sysText += "\nAdditional Context: " + body.systemInstruction.parts[0].text;
  }
  if (process.env.KB_ENABLED === 'true' && process.env.KB_CSV_URL) {
    const contents = Array.isArray(body.contents) ? body.contents : [];
    const lastUser = contents.filter((c) => c.role === 'user').pop();
    const q = lastUser && lastUser.parts
      ? lastUser.parts.map((p) => p.text || '').join(' ').trim()
      : '';
    if (q) {
      try {
        const kb = require('./kb');
        const ctx = await kb(q, {
          url: process.env.KB_CSV_URL,
          ttl: parseInt(process.env.KB_TTL || '300', 10),
          topK: parseInt(process.env.KB_TOP_K || '3', 10)
        });
        if (ctx) {
          sysText += '\n\n--- COMPANY KNOWLEDGE BASE (use these to answer when relevant) ---\n' + ctx;
        }
      } catch (e) { /* degrade gracefully: skip KB rather than break chat */ }
    }
  }
  return sysText;
}

// ---------------------------------------------------------------------------
// Gemini -> OpenAI message conversion (text only; images are dropped)
// ---------------------------------------------------------------------------
function hasImages(contents) {
  return (contents || []).some(
    (c) => Array.isArray(c.parts) && c.parts.some((p) => p && p.inline_data)
  );
}

function geminiToMessages(contents) {
  const messages = [];
  for (const c of (contents || [])) {
    const role = c.role === 'model' ? 'assistant' : (c.role === 'user' ? 'user' : c.role);
    const parts = Array.isArray(c.parts) ? c.parts : [];
    const texts = parts.map((p) => (p && p.text) || '').filter(Boolean);
    if (texts.length) messages.push({ role, content: texts.join('\n') });
  }
  return messages;
}

// Wrap a DeepSeek chat-completion reply back into Gemini's response shape.
function deepseekToGemini(choices) {
  const choice = (choices && choices[0]) || {};
  const text = (choice.message && choice.message.content) || '';
  return {
    candidates: [{
      content: { role: 'model', parts: [{ text }] },
      finishReason: (choice.finish_reason || 'STOP').toUpperCase(),
      index: 0
    }]
  };
}

// ---------------------------------------------------------------------------
// Provider: DeepSeek (OpenAI-compatible)
// ---------------------------------------------------------------------------
async function callDeepseek(body, sysText) {
  let systemContent = sysText || '';
  if (hasImages(body.contents) && systemContent) {
    systemContent += '\n\nNote: the user may attach an image, but the current model cannot read images. ' +
      'If they did, politely ask them to describe the image in text.';
  }

  const messages = [];
  if (systemContent) messages.push({ role: 'system', content: systemContent });
  messages.push(...geminiToMessages(body.contents));

  const apiBody = {
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages,
    stream: false
  };
  const gc = body.generationConfig;
  if (gc && typeof gc === 'object') {
    if (gc.temperature != null) apiBody.temperature = gc.temperature;
    if (gc.maxOutputTokens != null) apiBody.max_tokens = gc.maxOutputTokens;
    if (gc.topP != null) apiBody.top_p = gc.topP;
  }

  const upstream = await net.smartFetch(DEEPSEEK_BASE + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.DEEPSEEK_API_KEY
    },
    body: JSON.stringify(apiBody)
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = (data && data.error && data.error.message) || ('DeepSeek API returned ' + upstream.status);
    return { status: upstream.status, json: { error: message, upstream: data } };
  }
  return { status: 200, json: deepseekToGemini(data.choices) };
}

// ---------------------------------------------------------------------------
// Provider: Gemini (native)
// ---------------------------------------------------------------------------
async function callGemini(body, sysText) {
  const payload = { contents: body.contents };
  if (sysText) payload.systemInstruction = { parts: [{ text: sysText }] };
  else if (body.systemInstruction) payload.systemInstruction = body.systemInstruction;
  if (body.generationConfig) payload.generationConfig = body.generationConfig;

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;

  const upstream = await net.smartFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = (data && data.error && data.error.message) || ('Gemini API returned ' + upstream.status);
    return { status: upstream.status, json: { error: message, upstream: data } };
  }
  return { status: 200, json: data };
}

// ---------------------------------------------------------------------------
// Helpers: pull readable text out of a Gemini-shaped request / response.
// ---------------------------------------------------------------------------
function lastUserText(contents) {
  const user = (contents || []).filter((c) => c.role === 'user').pop();
  if (!user) return '';
  const parts = Array.isArray(user.parts) ? user.parts : [];
  const text = parts.map((p) => (p && p.text) || '').join(' ').trim();
  if (text) return text;
  if (hasImages([user])) return '[image attachment]';
  return '';
}

function assistantText(result) {
  try {
    const c = result && result.json && result.json.candidates && result.json.candidates[0];
    const p = c && c.content && c.content.parts && c.content.parts[0];
    return p && p.text ? p.text : '';
  } catch (_) {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Main entry point — validate, build KB context, dispatch to provider, then
// best-effort persist the turn to the per-IP Gitee log.
// Returns { status, json }. `req` is optional (used only to derive the IP).
// ---------------------------------------------------------------------------
module.exports = async function handleChat(body, req) {
  if (!body || !Array.isArray(body.contents) || body.contents.length === 0) {
    return { status: 400, json: { error: 'Bad request: contents array required' } };
  }

  const provider = (process.env.CHAT_PROVIDER || 'gemini').toLowerCase();
  const sysText = await buildSysText(body);
  const ip = chatlog.getIp(req);
  const userText = lastUserText(body.contents);

  let result;
  try {
    if (provider === 'deepseek') {
      if (!process.env.DEEPSEEK_API_KEY) {
        return { status: 500, json: { error: 'Server misconfiguration: missing DEEPSEEK_API_KEY' } };
      }
      result = await callDeepseek(body, sysText);
    } else {
      if (!process.env.GEMINI_API_KEY) {
        return { status: 500, json: { error: 'Server misconfiguration: missing GEMINI_API_KEY' } };
      }
      result = await callGemini(body, sysText);
    }
  } catch (e) {
    result = { status: 500, json: { error: 'provider error: ' + (e && e.message ? e.message : e) } };
  }

  // Best-effort, time-boxed persistence. Never breaks the chat response.
  if (chatlog.enabled()) {
    const ok = !!(result && result.status === 200);
    const aText = ok ? assistantText(result) : '';
    await chatlog.logTurn({ ip, userText, assistantText: aText, ok });
  }
  return result;
};
