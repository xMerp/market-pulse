import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const NSE_MCP_URL = process.env.NSE_MCP_URL || 'https://mcp.nseindia.in/cmmkt/mcp';

function fetchWithTimeout(input, init = {}) {
  const timeout = AbortSignal.timeout(14_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

function mcpValue(result) {
  if (result?.isError) throw new Error(result.content?.map((part) => part.text || '').join(' ') || 'NSE MCP tool failed');
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  const text = (result?.content || []).filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim();
  if (!text) return result;
  try { return JSON.parse(text); } catch { return { text }; }
}

function enumValues(property = {}) {
  if (Array.isArray(property.enum)) return property.enum;
  for (const option of property.anyOf || property.oneOf || []) {
    if (Array.isArray(option.enum)) return option.enum;
  }
  return [];
}

function chooseIndexOption(options, key) {
  const values = options.map((value) => String(value));
  const nifty = values.find((value) => /nifty[\s_-]*50/i.test(value));
  if (nifty) return nifty;
  if (/variation|view|mode|type/i.test(key)) {
    return values.find((value) => /index|constituent|market/i.test(value));
  }
  if (/symbol|ticker|underlying/i.test(key)) {
    return values.find((value) => /^NIFTY$/i.test(value)) || values.find((value) => /nifty/i.test(value));
  }
  return undefined;
}

function indexArguments(tool) {
  const schema = tool.inputSchema || {};
  const properties = schema.properties || {};
  const required = new Set(schema.required || []);
  const args = {};

  for (const [key, property] of Object.entries(properties)) {
    if (!/(index|variation|benchmark|underlying|symbol|ticker|view|mode)/i.test(key)) continue;
    const allowed = enumValues(property);
    const choice = chooseIndexOption(allowed, key);
    if (choice !== undefined) args[key] = choice;
    else if (allowed.length === 0 && /index|variation|benchmark|underlying|symbol|ticker/i.test(key)) args[key] = /symbol|ticker|underlying/i.test(key) ? 'NIFTY' : 'NIFTY 50';
  }

  for (const key of required) {
    if (Object.hasOwn(args, key)) continue;
    const property = properties[key] || {};
    const allowed = enumValues(property);
    const choice = chooseIndexOption(allowed, key);
    if (choice !== undefined) args[key] = choice;
    else if (/index|variation|benchmark|underlying|symbol|ticker/i.test(key)) args[key] = /symbol|ticker|underlying/i.test(key) ? 'NIFTY' : 'NIFTY 50';
    else if (/limit|count|top|number|size/i.test(key) && property.type === 'integer') args[key] = 100;
    else if (property.default !== undefined) args[key] = property.default;
    else throw new Error(`NSE MCP live-index tool needs an unsupported field: ${key}`);
  }
  return args;
}

function stockArguments(tool, symbol) {
  const properties = tool.inputSchema?.properties || {};
  const required = new Set(tool.inputSchema?.required || []);
  const args = {};
  for (const key of Object.keys(properties)) {
    if (/^(symbol|ticker|tradingsymbol)$/i.test(key)) args[key] = symbol;
  }
  for (const key of required) {
    if (Object.hasOwn(args, key)) continue;
    const property = properties[key] || {};
    if (property.default !== undefined) args[key] = property.default;
    else throw new Error(`NSE MCP stock-quote tool needs an unsupported field: ${key}`);
  }
  return args;
}

async function withLiveClient(work) {
  const client = new Client({ name: 'market-pulse-nifty50', version: '2.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(NSE_MCP_URL), {
    fetch: fetchWithTimeout,
    redirectPolicy: 'follow',
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 250, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1.2 },
  });
  try {
    await client.connect(transport);
    const catalog = await client.listTools();
    return await work(client, catalog.tools || []);
  } finally {
    // NSE's public MCP endpoint may not implement optional session deletion.
    try { await client.close(); } catch { /* the data request itself remains authoritative */ }
  }
}

export async function getNseNiftySnapshot(symbols = []) {
  return withLiveClient(async (client, tools) => {
    const stockTool = tools.find((tool) => tool.name === 'cm_get_stock_quote')
      || tools.find((tool) => /individual.*stock.*quote|live quote.*stock/i.test(`${tool.name} ${tool.description || ''}`));
    const indexTool = tools.find((tool) => tool.name === 'cm_get_index_quote')
      || tools.find((tool) => /live.*index.*quote|index.*quote/i.test(`${tool.name} ${tool.description || ''}`));
    if (!stockTool) throw new Error('NSE MCP did not advertise its live stock-quote tool');
    if (!indexTool) throw new Error('NSE MCP did not advertise its live index-quote tool');

    const quoteRows = [];
    const quoteErrors = [];
    const symbolsToFetch = [...new Set(symbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean))];
    const concurrency = 10;
    for (let offset = 0; offset < symbolsToFetch.length; offset += concurrency) {
      const batch = symbolsToFetch.slice(offset, offset + concurrency);
      const results = await Promise.allSettled(batch.map(async (symbol) => {
        const result = await client.callTool({ name: stockTool.name, arguments: stockArguments(stockTool, symbol) });
        const value = mcpValue(result);
        return value.stock || value.quote || value;
      }));
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') quoteRows.push(result.value);
        else quoteErrors.push({ symbol:batch[index], message:result.reason?.message || 'Quote unavailable' });
      });
    }

    const indexResult = await client.callTool({ name:indexTool.name, arguments:indexArguments(indexTool) });
    const marketData = { stocks:quoteRows, index:mcpValue(indexResult) };

    let freshness = null;
    const freshnessTool = tools.find((tool) => tool.name === 'cm_get_data_status');
    if (freshnessTool) {
      try { freshness = mcpValue(await client.callTool({ name: freshnessTool.name, arguments: {} })); } catch { /* optional status metadata */ }
    }
    return {
      marketData,
      freshness,
      tool:`${stockTool.name} + ${indexTool.name}`,
      quoteCount:quoteRows.length,
      quoteErrors,
      fetchedAt:new Date().toISOString(),
    };
  });
}
