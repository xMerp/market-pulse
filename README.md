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

The backend connects to NSE's official CM Market Streamable HTTP MCP endpoint (`https://mcp.nseindia.in/cmmkt/mcp`), discovers its quote tools, and fetches the NIFTY 50 index plus the 50 constituent quotes. NSE's MCP page describes the live data as delayed by a few minutes; the page shows its freshness status and quote errors. A bundled 50-company list keeps news matching scoped to NIFTY 50 when MCP is temporarily unavailable.

News searches use Google News RSS, scoped to Moneycontrol, Economic Times, Mint, Business Standard, and Financial Express. Results are matched to NIFTY 50 companies, deduplicated, limited to recent coverage, and linked to the article page. RSS results can be delayed or throttled.

NSE states that MCP data is for informational and educational purposes and is not intended for commercial deployment, investment advice, or real-time trading. Review the [NSE MCP terms and disclaimer](https://www.nseindia.com/nse-mcp) before publishing or using the data. Sentiment labels are headline summaries, not forecasts or trade recommendations.

## Gemini sentiment

Set `GEMINI_API_KEY` in the server environment to enable company-specific headline sentiment through the Gemini API. The secret stays server-side. The default model is `gemini-3.8-flash`; set `GEMINI_MODEL` to another model available to your Google AI project. Create/manage a key in [Google AI Studio](https://aistudio.google.com/apikey). Without a Gemini key, the site uses a small phrase-based headline signal and labels that basis honestly.

## Deploy to Vercel

The repository includes Vercel Node functions at `api/feed.mjs` and `api/health.mjs`, with the static site in `public/`.

1. Import the `market-pulse` GitHub repository into Vercel.
2. Keep Root Directory at `./` and the framework preset as Other. `vercel.json` sets the static output directory to `public`.
3. Under Project Settings → Environment Variables, add `GEMINI_API_KEY`. Optionally set `GEMINI_MODEL`, `NSE_MCP_URL`, `NEWS_REFRESH_SECONDS`, and `QUOTE_REFRESH_SECONDS`.
4. Redeploy after saving environment variables. Git pushes to the connected branch trigger future builds.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4173` | Local Node server port |
| `NSE_MCP_URL` | `https://mcp.nseindia.in/cmmkt/mcp` | Official NSE live CM Market MCP endpoint |
| `NEWS_REFRESH_SECONDS` | `90` | Headline cache duration |
| `QUOTE_REFRESH_SECONDS` | `60` | Quote cache duration |
| `GEMINI_API_KEY` | unset | Enables Gemini LLM sentiment |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini API model |
