# South Bay Planning AI

This package contains the planning dashboard plus a server-side AI assistant for Mountain View, Sunnyvale, and Cupertino.

## What is already wired

- `public/index.html` — dashboard + dedicated **Ask a Question** page.
- Left pane — conversational answer.
- Right pane — only official resources relevant to the answer.
- `/api/ask` — OpenAI Responses API endpoint.
- Dashboard project records are sent as structured context automatically.
- `data/sources.js` — consolidated official planning, development, GIS, housing, permit, transportation, CIP, CEQA, hearing, and project links.
- Resource selection is constrained to known source IDs, so the model cannot invent source URLs.
- Optional OpenAI File Search/vector store support.
- Optional live web search switch.

## 1. Install Node.js

Use Node 20+.

## 2. Install dependencies

```bash
npm install
```

## 3. Add your OpenAI key

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Then edit `.env`:

```text
OPENAI_API_KEY=your_real_key_here
OPENAI_MODEL=gpt-5
```

Never put the API key in `public/index.html`.

## 4. Run

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Open the **Ask a Question** tab and ask a civic-planning question.

## 5. Optional: add a large document knowledge base

Put official source files into `knowledge/`, for example:

- Housing Elements
- General Plans
- Specific/Precise Plans
- development status reports
- CEQA/EIR documents
- transportation plans
- Vision Zero / roadway safety plans
- Capital Improvement Program documents
- meeting packets or staff reports

Then:

```bash
npm run vector:create
```

The script prints:

```text
OPENAI_VECTOR_STORE_ID=vs_...
```

Paste that into `.env` and restart the server. File Search is then enabled automatically.

## 6. Optional live web search

Set:

```text
ENABLE_WEB_SEARCH=true
```

The system instructions tell the model to prefer official government/public-agency sources. Keep this off if you want the assistant limited to your dashboard data, source registry, and uploaded files.

## API response shape

`POST /api/ask` returns:

```json
{
  "answer": "Plain-English answer...",
  "resources": [
    {
      "id": "sv-development-reports",
      "title": "Development Reports",
      "url": "https://...",
      "note": "Development activity reports...",
      "category": "Development"
    }
  ]
}
```

The existing Ask page already renders `answer` on the left and `resources` on the right.

## Security

- API credentials stay on the server in `.env`.
- `.env` is gitignored.
- The browser never receives the OpenAI key.
- The assistant can only expose resource URLs that are already in the server's approved source registry.

## Deploy on Render

1. Push this repository to GitHub. Do not commit `.env`.
2. In Render, create a new Blueprint or Web Service from the repository.
3. If using the included `render.yaml`, Render will use `npm install` and `npm start` automatically.
4. Add `OPENAI_API_KEY` as a private environment variable in Render.
5. Deploy. The same server serves the website and `/api/ask`, so no frontend API URL change is required.

Default production model: `gpt-5-mini`, low reasoning effort, maximum 600 output tokens.
