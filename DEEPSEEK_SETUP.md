# Using DeepSeek for the buyer chat

Your site's buyer chat is powered by **DeepSeek by default** (set in `.env` as
`CHAT_PROVIDER=deepseek`). It can also run on Google Gemini if you switch the
provider back. Both use the **same cloud knowledge base** (your Google Sheet
RAG) — only the model that answers changes.

## Why DeepSeek?
- Usually **cheaper** than Gemini for the same kind of Q&A.
- OpenAI-compatible API, so the swap is a config change, not a code change.
- The knowledge base (Google Sheet) keeps working exactly as before.

## ⚠️ One important limitation
DeepSeek `deepseek-chat` / `deepseek-reasoner` are **text-only**. They **cannot
see images or PDFs**. So:
- If you switch to DeepSeek, the **image / file upload** in the chat still
  works on the UI, but the model will only read the typed text. If a buyer
  attaches a photo, the assistant is told to politely ask them to describe it
  in words.
- If you need the assistant to actually *look at* photos / spec sheets, keep
  **Gemini** (it supports vision and can read PDFs via inline data).

You can keep **both** keys in `.env` at the same time. DeepSeek is the active
default; Gemini is only used if you set `CHAT_PROVIDER=gemini` (e.g. for vision
on a page where reading images / PDFs matters).

## Steps

1. Open `.env` in the project root.
2. The provider is already `deepseek` — just paste your key (and tweak the model
   if you like):
   ```env
   CHAT_PROVIDER=deepseek                # already set
   DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx   # from https://platform.deepseek.com
   DEEPSEEK_MODEL=deepseek-chat          # or deepseek-reasoner
   ```
   (`GEMINI_API_KEY` can stay in the file — it's simply unused while DeepSeek is
   the active provider.)
3. Restart the dev server:
   - Local: stop `node server.js` (Ctrl+C) and run it again.
   - Vercel: set `CHAT_PROVIDER`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` in the
     dashboard, then **Redeploy**.

## Verify
Open the site, open the chat, and ask: **"What is your MOQ?"**
- It should answer using your Google Sheet knowledge base (same as before).
- Server startup log now prints `Chat provider: deepseek (model: deepseek-chat)`.

## How it works (no frontend changes)
`api/providers.js` reads `CHAT_PROVIDER`, builds the same KB-injected system
text, then:
- **gemini** → forwards the request natively to Gemini.
- **deepseek** → converts the Gemini-shaped `contents` into OpenAI `messages`,
  calls `/chat/completions`, and wraps the reply back into Gemini's response
  shape so the browser code is untouched.

To switch back, just set `CHAT_PROVIDER=gemini` and restart.
