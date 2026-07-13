# SUNWEAVE Beach Towel Landing Page

Single-page export landing site with a full-screen video hero and a full-page Gemini-powered chat section that supports text + image (multimodal) input.

## Project structure

```
.
├── index.html              # Landing page (single file, inline CSS/JS)
├── assets/
│   └── bg.mp4              # Hero background video
├── api/
│   └── chat.js             # Vercel serverless proxy to Gemini
├── netlify/functions/
│   └── chat.js             # Netlify function proxy to Gemini
├── server.js               # Local dev server with proxy
├── .env                    # Local secrets (gitignored)
├── .env.example            # Template for environment variables
└── .gitignore
```

## Security — API key never reaches the browser

The chat calls `/api/chat` first. The proxy running on the server holds the Gemini API key and forwards the request to Google. This means visitors cannot view or steal the key from the browser console.

A fallback key can be set directly in the local `server.js` environment or in a test browser for **local testing only**.

## Local development

1. The `.env` file already exists in this project. If you clone elsewhere, copy `.env.example` to `.env` and fill in:

```bash
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_MODEL=gemini-2.0-flash
```

2. Start the local dev server:

```bash
/Users/Luke/.workbuddy/binaries/node/versions/22.22.2/bin node server.js
```

3. Open http://localhost:8123

## Deploy to Vercel

1. Push the project to GitHub.
2. Import the repo in Vercel.
3. In **Settings → Environment Variables**, add:
   - `GEMINI_API_KEY` = your key
   - `GEMINI_MODEL` = `gemini-2.0-flash` (optional)
   - `ALLOWED_ORIGIN` = your domain (optional, e.g. `https://www.sunweave.example.com`)
4. Vercel will automatically route `/api/chat` to `api/chat.js`.

## Deploy to Netlify

1. Push the project to GitHub.
2. Import the repo in Netlify.
3. In **Site settings → Environment variables**, add:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL`
   - `ALLOWED_ORIGIN` (optional)
4. Netlify will automatically route `/.netlify/functions/chat` to `netlify/functions/chat.js`.

**Important:** Update the frontend `callGemini` fetch URL in `index.html` from `/api/chat` to `/.netlify/functions/chat` if you use Netlify.

## Customization checklist

Replace these placeholders before going live:

- Brand name `SUNWEAVE` → your real brand
- `Jiangsu Huiyi Supply Chain Co., Ltd.` → your company name
- `export@sunweave.example.com` → sales email (also in `index.html` and `.env` if needed)
- `https://www.sunweave.example.com/` → canonical URL (SEO/OG tags)
- Hero video `assets/bg.mp4` → replace with your final compressed video (recommended <8 MB)

## Notes

- Video is 21 MB. For production, compress it to webm + mp4 to improve first-load speed.
- The chat preserves conversation history and supports image uploads via Gemini's `inline_data` multimodal API.
- For a public site, do **not** rely on the browser-stored fallback key; always use the backend proxy.
