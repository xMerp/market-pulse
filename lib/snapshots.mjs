import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, list, put } from '@vercel/blob';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_DIR = path.join(ROOT, 'data', 'daily-snapshots');
const BLOB_PREFIX = 'market-pulse/daily-snapshots/';
const configuredWriteInterval = Number(process.env.SNAPSHOT_WRITE_INTERVAL_SECONDS || 300);
const WRITE_INTERVAL_MS = Math.max(60, Number.isFinite(configuredWriteInterval) ? configuredWriteInterval : 300) * 1000;
const lastWrite = new Map();

function snapshotPath(date) { return `${BLOB_PREFIX}${date}.json`; }
function isDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || ''); }
function storageMode() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'vercel-blob';
  return process.env.VERCEL ? 'unconfigured' : 'local-file';
}
function dateInPath(pathname) {
  const match = pathname.match(/(?:^|\/)(\d{4}-\d{2}-\d{2})\.json$/);
  return match?.[1] || '';
}

async function readBlob(pathname) {
  const result = await get(pathname, { access:'private', token:process.env.BLOB_READ_WRITE_TOKEN });
  if (!result) return null;
  const body = await new Response(result.stream).text();
  return JSON.parse(body);
}

export async function saveDailySnapshot(snapshot) {
  if (!snapshot || !isDate(snapshot.date)) return { saved:false, storage:storageMode(), reason:'invalid-date' };
  const mode = storageMode();
  if (mode === 'unconfigured') return { saved:false, storage:mode, reason:'missing-blob-token' };
  const now = Date.now();
  if (now - (lastWrite.get(snapshot.date) || 0) < WRITE_INTERVAL_MS) return { saved:true, storage:mode, throttled:true };
  const body = JSON.stringify(snapshot);
  if (mode === 'vercel-blob') {
    await put(snapshotPath(snapshot.date), body, {
      access:'private',
      token:process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix:false,
      allowOverwrite:true,
      contentType:'application/json; charset=utf-8',
    });
  } else {
    await mkdir(LOCAL_DIR, { recursive:true });
    await writeFile(path.join(LOCAL_DIR, `${snapshot.date}.json`), body, 'utf8');
  }
  lastWrite.set(snapshot.date, now);
  return { saved:true, storage:mode, throttled:false };
}

export async function readDailySnapshots({ from = '', to = '' } = {}) {
  const mode = storageMode();
  if (mode === 'unconfigured') return { storage:mode, snapshots:[] };
  const inRange = (date) => isDate(date) && (!from || date >= from) && (!to || date <= to);
  const snapshots = [];
  if (mode === 'vercel-blob') {
    let cursor;
    let hasMore = true;
    while (hasMore) {
      const page = await list({ prefix:BLOB_PREFIX, limit:1000, cursor, token:process.env.BLOB_READ_WRITE_TOKEN });
      for (const blob of page.blobs || []) {
        const date = dateInPath(blob.pathname);
        if (inRange(date)) {
          const snapshot = await readBlob(blob.pathname);
          if (snapshot) snapshots.push(snapshot);
        }
      }
      cursor = page.cursor || undefined;
      hasMore = Boolean(page.hasMore && cursor);
    }
  } else {
    let names = [];
    try { names = await readdir(LOCAL_DIR); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const name of names.filter((value) => /^\d{4}-\d{2}-\d{2}\.json$/.test(value))) {
      const date = name.slice(0, 10);
      if (!inRange(date)) continue;
      try { snapshots.push(JSON.parse(await readFile(path.join(LOCAL_DIR, name), 'utf8'))); }
      catch (error) { console.warn(`[snapshots] Skipped ${name}: ${error.message}`); }
    }
  }
  snapshots.sort((a, b) => a.date.localeCompare(b.date));
  return { storage:mode, snapshots };
}
