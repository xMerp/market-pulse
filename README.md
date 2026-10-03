# Market Pulse — Indian F&O news desk

A small Node.js website for current news about NSE equity F&O companies, headline sentiment, and a quote snapshot beside every story.

## Run locally

Requires Node.js 20 or later. There are no npm package dependencies.

```powershell
npm start
```

Open [http://localhost:4173](http://localhost:4173). The server reads optional settings from `.env` in the project root; use `.env.example` as a starting point.

## Live data

- The server tries NSE's live **Securities in F&O** snapshot first. If its snapshot endpoint is unavailable, the company universe refreshes from NSE's current [`fo_mktlots.csv` market-lot file](https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv), documented on NSE's [Individual Securities F&O page](https://www.nseindia.com/static/products-services/equity-derivatives-individual-securities).
- Quotes come from the NSE snapshot when available. Otherwise, the server requests Yahoo Finance chart snapshots for companies in the current headlines. Those quotes can be delayed or unavailable; the UI labels the source beside the value.
- Headlines are pulled from Google News RSS searches scoped to Moneycontrol, Economic Times, Mint, Business Standard, and Financial Express. Stories are matched against the F&O universe, deduplicated, limited to recent coverage, and link to the original publisher.
- Feed and quote polling are cached briefly to avoid hammering upstream sources. Use **Refresh feed** to bypass the feed cache.

Third-party feed and quote endpoints can throttle requests or change their response formats. For guaranteed exchange real-time data in a production deployment, replace the default quote adapter with a licensed NSE data vendor API.

## LLM sentiment

Set `OPENAI_API_KEY` in `.env` to enable company-specific headline analysis through the OpenAI Responses API. The default model is `gpt-5.4-mini`; set `OPENAI_MODEL` to use another model available to your API account. The key is read only by the local server and is never sent to the browser. Headline results are cached in memory by story ID.

Without a key, the site uses a small headline phrase matcher and labels each result **Headline signal**. It does not describe that fallback as an LLM analysis. Sentiment summarizes the headline's tone; it is not a price forecast or investment recommendation.

## Settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4173` | Local web server port |
| `NEWS_REFRESH_SECONDS` | `90` | Headline cache duration |
| `QUOTE_REFRESH_SECONDS` | `60` | NSE quote snapshot cache duration |
| `OPENAI_API_KEY` | unset | Enables LLM sentiment |
| `OPENAI_MODEL` | `gpt-5.4-mini` | OpenAI Responses API model |

