# Market Pulse — NIFTY 50 news desk

A responsive news dashboard for the current NIFTY 50 companies. It pairs recent company headlines from five Indian financial publishers with a positive, neutral, or negative tone label and an NSE market snapshot. Headlines link to their publisher; quote values include the source and freshness context.

## Run locally

Requires Node.js 20 or later.

```powershell
npm install
npm run dev
```

Open [http://localhost:4173](http://localhost:4173). Copy `.env.example` to `.env` to configure optional AI sentiment and cache intervals. The MCP market endpoint does not require an API key.

## Market data and NIFTY 50 universe

The backend uses the official NSE CM Market Streamable HTTP MCP endpoint (`https://mcp.nseindia.in/cmmkt/mcp`). At request time, the MCP client discovers the live index market-data tool and requests the NIFTY 50 snapshot. This provides current index and constituent quote fields where the upstream tool returns them. NSE describes the live snapshot as usually 1–3 minutes behind real time. The app labels the data as a snapshot and displays a fallback state if NSE MCP is unreachable; it does not substitute another quote provider.

A bundled 50-company symbol list keeps news matching and the constituent browser scoped to NIFTY 50 when the MCP endpoint is unavailable. Check the current index constituents against NSE before relying on the fallback list for current coverage.

News search results are fetched from Google News RSS, scoped to Moneycontrol, Economic Times, Mint, Business Standard, and Financial Express. They are matched to NIFTY 50 companies, deduplicated, limited to recent coverage, and linked to the article page. RSS results can be delayed, throttled, or unavailable.

NSE states that MCP data is for informational and educational purposes and is not intended for commercial deployment, investment advice, or real-time trading. Review the [NSE MCP terms and disclaimer](https://www.nseindia.com/nse-mcp) before publishing or using the data. The dashboard's sentiment labels are headline summaries, not forecasts or trading advice.

## Headline sentiment

Set `OPENAI_API_KEY` in the server environment to enable company-specific tone analysis through OpenAI's Responses API. The key stays server-side. Without it, the site uses a small phrase-based headline signal and labels that basis honestly. Set `OPENAI_MODEL` to a model available to your API account.

## Deploy to Vercel

The repository includes Vercel Node functions at `api/feed.mjs` and `api/health.mjs`, with the static site in `public/`.

1. Import the `market-pulse` GitHub repository into Vercel.
2. Keep the Root Directory at `./`.
3. Leave the framework preset as Other (or let Vercel detect the project); the static output directory is configured as `public` in `vercel.json`.
4. Add `OPENAI_API_KEY` and optionally `OPENAI_MODEL`, `NSE_MCP_URL`, `NEWS_REFRESH_SECONDS`, and `QUOTE_REFRESH_SECONDS` under Project Settings → Environment Variables. The NSE MCP URL defaults to the official live endpoint and needs no key.
5. Deploy. Vercel will rebuild on future pushes to the connected branch.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4173` | Local Node server port |
| `NSE_MCP_URL` | `https://mcp.nseindia.in/cmmkt/mcp` | Official live CM Market MCP endpoint |
| `NEWS_REFRESH_SECONDS` | `90` | Headline cache duration |
| `QUOTE_REFRESH_SECONDS` | `60` | NSE snapshot cache duration |
| `OPENAI_API_KEY` | unset | Enables LLM tone analysis |
| `OPENAI_MODEL` | `gpt-5.4-mini` | OpenAI Responses API model |
