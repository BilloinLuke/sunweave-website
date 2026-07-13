// Mocked test for api/providers.js — no network needed.
// Verifies: provider switch, KB injection (against the LATEST user question),
// Gemini<->OpenAI conversion, image dropping on DeepSeek, and error paths.

const captured = { deepseek: null, gemini: null };

global.fetch = async (u, opts) => {
  const url = String(u);
  if (url.includes('deepseek.com')) {
    captured.deepseek = { url, auth: opts.headers.Authorization, body: JSON.parse(opts.body) };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'DS: MOQ is 500 pcs.' }, finish_reason: 'stop' }] })
    };
  }
  if (url.includes('generativelanguage')) {
    captured.gemini = { url, body: JSON.parse(opts.body) };
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { role: 'model', parts: [{ text: 'Gemini: MOQ is 500 pcs.' }] } }] })
    };
  }
  if (url.includes('spreadsheets') || url.includes('csv')) {
    return {
      ok: true,
      text: async () => 'Topic,Keywords,Answer\nMOQ,moq minimum order quantity,Our MOQ is 500 pcs.\n'
    };
  }
  return { ok: false, status: 502, json: async () => ({ error: 'unknown' }) };
};

const handleChat = require('../api/providers');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok  -', msg);
}

// Last user turn asks about MOQ (so KB retrieval matches); image attached there.
const baseBody = {
  systemInstruction: { parts: [{ text: 'You are a helpful sales assistant.' }] },
  contents: [
    { role: 'user', parts: [{ text: 'I need beach towels.' }] },
    { role: 'model', parts: [{ text: 'Sure, let me help.' }] },
    { role: 'user', parts: [{ text: 'What is your MOQ?' }, { inline_data: { mime_type: 'image/png', data: 'BASE64IMAGEDATA' } }] }
  ],
  generationConfig: { temperature: 0.7, maxOutputTokens: 700 }
};

(async () => {
  // ---- Test 1: DeepSeek + KB ----
  process.env.CHAT_PROVIDER = 'deepseek';
  process.env.DEEPSEEK_API_KEY = 'test-ds-key';
  process.env.DEEPSEEK_MODEL = 'deepseek-chat';
  process.env.KB_ENABLED = 'true';
  process.env.KB_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/xxx/pub?output=csv';
  delete process.env.GEMINI_API_KEY;

  let r = await handleChat(baseBody);
  assert(r.status === 200, 'T1 deepseek returns 200');
  assert(r.json.candidates[0].content.parts[0].text === 'DS: MOQ is 500 pcs.', 'T1 reply wrapped into Gemini shape');
  assert(captured.deepseek && captured.deepseek.auth === 'Bearer test-ds-key', 'T1 DeepSeek auth header correct');
  assert(captured.deepseek.body.model === 'deepseek-chat', 'T1 DeepSeek model passed');
  assert(captured.deepseek.body.temperature === 0.7 && captured.deepseek.body.max_tokens === 700, 'T1 generationConfig mapped');
  const msgs = captured.deepseek.body.messages;
  assert(msgs[0].role === 'system' && msgs[0].content.includes('helpful sales assistant'), 'T1 system prompt present');
  assert(msgs[0].content.includes('KNOWLEDGE BASE') && msgs[0].content.includes('MOQ is 500 pcs'), 'T1 KB injected into system');
  assert(msgs.length === 4, 'T1 messages = system + 3 conversation turns');
  assert(!JSON.stringify(msgs).includes('BASE64IMAGEDATA'), 'T1 image data dropped on DeepSeek');
  assert(msgs[1].role === 'user' && msgs[1].content === 'I need beach towels.', 'T1 first user text extracted');
  assert(msgs[2].role === 'assistant' && msgs[2].content === 'Sure, let me help.', 'T1 model turn mapped to assistant');
  assert(msgs[3].role === 'user' && msgs[3].content === 'What is your MOQ?', 'T1 last user text extracted');

  // ---- Test 2: Gemini default + KB ----
  process.env.CHAT_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'test-gem-key';
  delete process.env.DEEPSEEK_API_KEY;
  r = await handleChat(baseBody);
  assert(r.status === 200, 'T2 gemini returns 200');
  assert(r.json.candidates[0].content.parts[0].text === 'Gemini: MOQ is 500 pcs.', 'T2 gemini native reply passes through');
  assert(captured.gemini.body.systemInstruction.parts[0].text.includes('KNOWLEDGE BASE'), 'T2 KB injected for gemini too');
  assert(captured.gemini.body.contents[2].parts.length === 2, 'T2 image kept in gemini contents (vision)');

  // ---- Test 3: DeepSeek missing key ----
  process.env.CHAT_PROVIDER = 'deepseek';
  process.env.DEEPSEEK_API_KEY = '';
  r = await handleChat(baseBody);
  assert(r.status === 500 && /DEEPSEEK_API_KEY/.test(r.json.error), 'T3 missing DeepSeek key -> 500 with clear error');

  // ---- Test 4: bad request ----
  r = await handleChat({});
  assert(r.status === 400 && /contents array required/.test(r.json.error), 'T4 empty body -> 400');

  console.log('\nDone. exitCode =', process.exitCode || 0);
})();
