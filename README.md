# Market Pulse — NIFTY 50 news desk

A responsive news dashboard for current NIFTY 50 companies. It pairs recent headlines from five Indian financial publishers with positive, neutral, or negative sentiment and a market snapshot. Headlines link to their publishers; quote values show the source and freshness context.

## Run locally

Requires Node.js 20 or later.

```powershell
npm install
npm run dev
```

Open [http://localhost:4173](http://localhost:4173). Copy `.env.example` to `.env` to configure Gemini sentiment, the Groww quote token, and cache intervals. If Groww is not configured, the app attempts the NSE sources as a best-effort fallback.

## Market data and NIFTY 50 universe

When `GROWW_ACCESS_TOKEN` is set, the backend uses Groww's Get Quote endpoint for the 50 NIFTY 50 stocks and the NIFTY 50 index. Each quote includes the last price and day percentage change. Groww documents a limit of 10 live-data requests per second and 300 per minute; the backend requests up to nine quotes at a time with a pause between batches, and successful feed responses are edge-cached for 60 seconds. A full refresh therefore makes 51 Groww requests. If Groww is not configured or its request fails, the backend falls back to NSE's public CM Market MCP endpoint and the bulk snapshot used by NSE's live-equity page. A bundled 50-company list keeps news matching scoped to NIFTY 50 when quotes are unavailable.

Generate a Groww API access token from Groww → Profile → Settings → Trading APIs → Generate API keys → Access Token. Groww states that access tokens expire daily at 6:00 AM, so replace the token in Vercel after generating a new one and redeploy if the environment value changes. Store it as `GROWW_ACCESS_TOKEN` in Vercel Project Settings → Environment Variables for Production (and Preview/Development if needed). Keep it server-side: do not add a `NEXT_PUBLIC_` prefix, put the token in browser code, or commit a populated `.env` file. Review the market-data provider's terms before publicly redistributing quotes.

Groww documentation: [Live Data API](https://groww.in/trade-api/docs/curl/live-data) and [authentication and token generation](https://groww.in/trade-api/docs/curl).

News searches use Google News RSS, scoped to Moneycontrol, Economic Times, Mint, Business Standard, and Financial Express. Results are matched to NIFTY 50 companies, deduplicated, limited to recent coverage, and linked to the article page. RSS results can be delayed or throttled.

NSE describes its MCP as informational and educational, not intended for commercial deployment, investment advice, or real-time trading. Review the [NSE MCP terms and disclaimer](https://www.nseindia.com/nse-mcp) before relying on that fallback. Sentiment labels are headline summaries, not forecasts or trade recommendations.

## Gemini sentiment

Set `GEMINI_API_KEY` in the server environment to enable company-specific headline sentiment through the Gemini API. The secret stays server-side. The default model is `gemini-3.8-flash`; set `GEMINI_MODEL` to another model available to your Google AI project. Create/manage a key in [Google AI Studio](https://aistudio.google.com/apikey). Without a Gemini key, the site uses a small phrase-based headline signal and labels that basis honestly.

## Deploy to Vercel

The repository includes Vercel Node functions at `api/feed.mjs`, `api/health.mjs`, and `api/snapshots.mjs`, with the static site in `public/`.

1. Import the `market-pulse` GitHub repository into Vercel.
2. Keep Root Directory at `./` and the framework preset as Other. `vercel.json` sets the static output directory to `public`.
3. Under Project Settings → Environment Variables, add `GROWW_ACCESS_TOKEN` with your Groww access token and select Production. Add it to Preview/Development only if you want quotes there too. Groww tokens expire daily at 6:00 AM, so refresh the Vercel value regularly. Optionally set `GEMINI_API_KEY`, `GEMINI_MODEL`, `NSE_MCP_URL`, `NEWS_REFRESH_SECONDS`, and `QUOTE_REFRESH_SECONDS`.
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
| `GROWW_ACCESS_TOKEN` | unset | Server-side Groww access token; enables primary NIFTY 50 quotes |
| `NSE_MCP_URL` | `https://mcp.nseindia.in/cmmkt/mcp` | Optional fallback NSE live CM Market MCP endpoint |
| `NEWS_REFRESH_SECONDS` | `90` | Headline cache duration |
| `QUOTE_REFRESH_SECONDS` | `60` | Quote cache duration |
| `GEMINI_API_KEY` | unset | Enables Gemini LLM sentiment |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini API model |
| `BLOB_READ_WRITE_TOKEN` | unset locally | Private Vercel Blob access for durable cloud snapshots; supplied by a connected Blob store |
| `SNAPSHOT_WRITE_INTERVAL_SECONDS` | `300` | Minimum spacing between daily snapshot updates in a warm process |
