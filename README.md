# Market Pulse — NIFTY 50 news desk

A responsive news dashboard for current NIFTY 50 companies. It pairs recent headlines from five Indian financial publishers with positive, neutral, or negative sentiment and an NSE market snapshot. Headlines link to their publishers; quote values show the source and freshness context.

## Run locally

Requires Node.js 20 or later.

```powershell
npm install
npm run dev
```

Open [http://localhost:4173](http://localhost:4173). Copy `.env.example` to `.env` to configure Gemini sentiment and cache intervals. The NSE MCP endpoint requires no account key or separate connector setup.

## Market data and NIFTY 50 universe

The backend races NSE's official CM Market Streamable HTTP MCP endpoint (`https://mcp.nseindia.in/cmmkt/mcp`) against the bulk snapshot used by NSE's own live-equity page. It accepts the first source that returns the index and at least 45 usable constituent quotes, and aborts the slower request. This keeps the page responsive during MCP timeouts while retaining MCP as a live source when it responds. A bundled 50-company list keeps news matching scoped to NIFTY 50 if both NSE sources are unavailable.

News searches use Google News RSS, scoped to Moneycontrol, Economic Times, Mint, Business Standard, and Financial Express. Results are matched to NIFTY 50 companies, deduplicated, limited to recent coverage, and linked to the article page. RSS results can be delayed or throttled.

NSE states that MCP data is for informational and educational purposes and is not intended for commercial deployment, investment advice, or real-time trading. Review the [NSE MCP terms and disclaimer](https://www.nseindia.com/nse-mcp) before publishing or using the data. Sentiment labels are headline summaries, not forecasts or trade recommendations.

## Gemini sentiment

Set `GEMINI_API_KEY` in the server environment to enable company-specific headline sentiment through the Gemini API. The secret stays server-side. The default model is `gemini-3.8-flash`; set `GEMINI_MODEL` to another model available to your Google AI project. Create/manage a key in [Google AI Studio](https://aistudio.google.com/apikey). Without a Gemini key, the site uses a small phrase-based headline signal and labels that basis honestly.

## Deploy to Vercel

The repository includes Vercel Node functions at `api/feed.mjs`, `api/health.mjs`, and `api/snapshots.mjs`, with the static site in `public/`.

1. Import the `market-pulse` GitHub repository into Vercel.
2. Keep Root Directory at `./` and the framework preset as Other. `vercel.json` sets the static output directory to `public`.
3. Under Project Settings → Environment Variables, add `GEMINI_API_KEY`. Optionally set `GEMINI_MODEL`, `NSE_MCP_URL`, `NEWS_REFRESH_SECONDS`, and `QUOTE_REFRESH_SECONDS`.
4. In the Vercel project Storage tab, create a **private Blob store** and connect it to this project. Vercel supplies `BLOB_READ_WRITE_TOKEN` to the selected environments. The site still renders without it, but daily cloud snapshots are disabled until the store is connected.
5. Redeploy after saving environment variables. Git pushes to the connected branch trigger future builds.

## News and price analysis

The server computes a daily mood score from matched headlines published on the current India Standard Time date. The score is `(positive − negative) / total × 100`; it is withheld below 10 headlines. Stock divergence uses `DIVERGENCE_NEGATIVE_MOVE_PCT` and `DIVERGENCE_POSITIVE_MOVE_PCT` in `lib/insights.mjs` (defaults `-1.5` and `+1.5`). NSE source timestamps determine the market date shown, including on weekends and holidays.

The sector map in `lib/insights.mjs` assigns all 50 bundled NIFTY 50 constituents to display sectors. Sector price averages use quotes available in the current NSE response, while each tile reports quote coverage and mapped stock count. Missing quote data hides quote-dependent sections.

Daily snapshots are written once per India calendar date and periodically refreshed while the server process is warm. They include the mood and per-stock net sentiment, headline count, and NSE percentage change. Local development stores them under the ignored `data/daily-snapshots/` directory. Vercel uses a private Blob store. Read the saved records with `GET /api/snapshots`, optionally passing `from=YYYY-MM-DD` and `to=YYYY-MM-DD`; this endpoint returns stored aggregate data for backtesting and does not expose the Blob token. `SNAPSHOT_WRITE_INTERVAL_SECONDS` controls the minimum write spacing within a warm server process.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4173` | Local Node server port |
| `NSE_MCP_URL` | `https://mcp.nseindia.in/cmmkt/mcp` | Official NSE live CM Market MCP endpoint |
| `NEWS_REFRESH_SECONDS` | `90` | Headline cache duration |
| `QUOTE_REFRESH_SECONDS` | `60` | Quote cache duration |
| `GEMINI_API_KEY` | unset | Enables Gemini LLM sentiment |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini API model |
| `BLOB_READ_WRITE_TOKEN` | unset locally | Private Vercel Blob access for durable cloud snapshots; supplied by a connected Blob store |
| `SNAPSHOT_WRITE_INTERVAL_SECONDS` | `300` | Minimum spacing between daily snapshot updates in a warm process |
