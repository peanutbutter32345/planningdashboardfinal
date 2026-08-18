# South Bay Planning AI

This package contains the civic dashboard plus a server-side AI assistant for Mountain View, Sunnyvale, and Cupertino.

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

## Email briefings

Every send is a **standing briefing, not a change alert**. A quiet week still produces a full
email — the point is to keep readers aware of housing, transportation, development, and the boards
that decide them, whether or not anything moved. Anything that *has* changed since the reader's
last email is marked **Updated** and sorts to the top of its section.

Each briefing is ordered the same way:

1. **What you're following** — every starred project, board, and article; changed ones first.
2. **In {your city}** — Housing · Transportation · Other development · In the news ·
   Who decides and when they meet · Ways to get involved.
3. **Around the rest of the South Bay** — projects that moved, plus recent regional news.
4. **Official {your city} links** — the city's own planning, permit, and GIS pages.

Every project title links to `?project=<id>` on the dashboard, which switches to that city, filters
to that record, and highlights it. Board titles link to the city's own board page, and articles
link to the source.

Nothing here is model-generated. Status text is quoted verbatim from the data files, and the one
summary sentence is assembled from integer counts — a model in that position could hallucinate a
project's status, and people may act on this.

Rendering lives in `digest.js` as pure functions: no database, no network. Preview every variant
without sending anything:

```bash
npm run digest:preview
```

That writes `preview-welcome.html` (first send), `preview-update.html` (things changed), and
`preview-quiet.html` (nothing changed). Set `PREVIEW_CITY` to try a different home city, e.g.
`PREVIEW_CITY=cupertino npm run digest:preview`.

### Required environment variables

```text
DATABASE_URL=postgres://...
RESEND_API_KEY=re_...
RESEND_FROM=South Bay Planning <updates@your-verified-domain.com>
CRON_SECRET=<a long random string>
SITE_URL=https://your-site.com
```

`RESEND_FROM` matters: the default `onboarding@resend.dev` only delivers to the email address on
your own Resend account, so real subscribers will silently receive nothing until you verify a
domain in Resend and set this.

### Scheduling with cron-job.org

Render's own cron jobs are a paid service type, so on the free plan use an external scheduler.

- **URL** — `https://your-site.com/api/cron/send-digests?secret=YOUR_CRON_SECRET`
- **Method** — GET or POST; both work. (Passing the secret as the `x-cron-secret` header instead of
  a query parameter keeps it out of the scheduler's logs, if your scheduler supports headers.)
- **Schedule** — once a day. Run it daily no matter what frequencies your users pick: the endpoint
  checks everyone on each run and only emails whoever is actually due.

A successful run returns JSON like `{"ok":true,"checked":4,"due":2,"sent":1,"skipped":1,"failed":0}`.
`skipped` means the user was due but nothing had changed, so no email was sent and their clock was
left alone — the next run still compares against their last real email.

A `401` means the secret is missing or wrong. A `503` means `DATABASE_URL` isn't set.

Free Render web services spin down when idle and take a few seconds to wake, so allow a generous
timeout in the scheduler, or hit `/api/health` on a separate schedule to keep the service warm.

## Deploy on Render

1. Push this repository to GitHub. Do not commit `.env`.
2. In Render, create a new Blueprint or Web Service from the repository.
3. If using the included `render.yaml`, Render will use `npm install` and `npm start` automatically.
4. Add `OPENAI_API_KEY` as a private environment variable in Render.
5. Deploy. The same server serves the website and `/api/ask`, so no frontend API URL change is required.

Default production model: `gpt-5-mini`, low reasoning effort, maximum 600 output tokens.
