// Local dedup state: remembers which items have already been shown, so repeated
// runs only surface NEW content. Mirrors follow-builders' state-feed.json, but
// runs client-side (this skill has no central feed).
//
// File: ~/.shizheng/state.json
//   { "version": 1, "seen": { "<sourceId>": { "<key>": <firstSeenTs>, ... } } }

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const DIR = join(homedir(), '.shizheng');
const STATE_PATH = join(DIR, 'state.json');
const TTL_MS = 14 * 24 * 60 * 60 * 1000; // forget entries older than 14 days

export async function loadState() {
  try {
    const s = JSON.parse(await readFile(STATE_PATH, 'utf-8'));
    if (!s.seen) s.seen = {};
    return s;
  } catch {
    return { version: 1, seen: {} };
  }
}

export async function saveState(state) {
  // Prune expired entries so the file stays bounded.
  const cutoff = Date.now() - TTL_MS;
  for (const bucket of Object.values(state.seen || {})) {
    for (const [k, ts] of Object.entries(bucket)) {
      if (ts < cutoff) delete bucket[k];
    }
  }
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
  } catch {
    // Non-fatal: if we can't persist state, dedup just won't carry over.
  }
}

export async function resetState() {
  await saveState({ version: 1, seen: {} });
}

// Returns the seen-bucket for a source, creating it if absent.
function bucketFor(state, sourceId) {
  if (!state.seen) state.seen = {};
  if (!state.seen[sourceId]) state.seen[sourceId] = {};
  return state.seen[sourceId];
}

// Filter a source's items down to the unseen ones and mark them seen.
//
// keyOf(item) must return a stable string id for the item. For sources where the
// whole payload is one atomic unit (e.g. a daily broadcast), pass a single key
// via `atomicKey` instead — the whole item list is kept only if that key is new.
//
// Mutates `source` in place: sets source.items to the new ones and adds
// source.dedup = { newCount, skippedCount, allSeen }.
export function dedupSource(source, state, { keyOf, atomicKey } = {}) {
  if (source.status !== 'ok') return source;
  const bucket = bucketFor(state, source.id);
  const now = Date.now();
  const total = source.items.length;

  if (atomicKey) {
    const seen = Object.prototype.hasOwnProperty.call(bucket, atomicKey);
    if (seen) {
      source.dedup = { newCount: 0, skippedCount: total, allSeen: true };
      source.items = [];
    } else {
      bucket[atomicKey] = now;
      source.dedup = { newCount: total, skippedCount: 0, allSeen: false };
    }
    return source;
  }

  const fresh = [];
  for (const item of source.items) {
    const k = keyOf(item);
    if (k && Object.prototype.hasOwnProperty.call(bucket, k)) continue; // already shown
    if (k) bucket[k] = now;
    fresh.push(item);
  }
  fresh.forEach((it, i) => { it.index = i + 1; }); // renumber after filtering
  source.dedup = { newCount: fresh.length, skippedCount: total - fresh.length, allSeen: fresh.length === 0 && total > 0 };
  source.items = fresh;
  return source;
}
