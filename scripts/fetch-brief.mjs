#!/usr/bin/env node
// ============================================================================
// 时政简报 (Current-affairs brief) — multi-source aggregator
// ============================================================================
// Fetches several authoritative Chinese current-affairs sources in parallel and
// prints a single JSON blob to stdout. Cross-platform, ZERO dependencies
// (built-in fetch in Node 18+). No API keys.
//
// Sources:
//   - xinwenlianbo : CCTV "Xinwen Lianbo" full transcript (deep, evening roundup)
//   - cctv-china   : CCTV.com domestic news roll (timely daytime headlines + briefs)
//
// Behaviour is driven by per-user prefs in ~/.shizheng/config.json
// (detail full|brief, scope all|politics, cctvLimit, dedup) — see config.mjs.
// CLI flags below override the saved config for a single run.
//
// Usage:
//   node fetch-brief.mjs                      # use saved prefs
//   node fetch-brief.mjs --date 20260609      # pin the Xinwen Lianbo day
//   node fetch-brief.mjs --source xinwenlianbo    # only one source
//   node fetch-brief.mjs --limit 30           # cap cctv-china headline count
//   node fetch-brief.mjs --full | --brief     # force full bodies / brief-only this run
//   node fetch-brief.mjs --all                # ignore dedup, show everything
//   node fetch-brief.mjs --reset              # clear dedup state, then exit
//   node fetch-brief.mjs --show-config        # print saved prefs, then exit
//   node fetch-brief.mjs --config-set detail=full scope=all   # save prefs, then exit
//
// Output: { generatedAt, deduped, config, sources: [ <source object>, ... ] }
//   config: the resolved prefs (so the presenter knows detail/scope)
//   Each source: { id, name, status, items, dedup?:{newCount,skippedCount,allSeen} }
//   status: ok | notfound | error
// ============================================================================

import { fetchXinwenlianbo } from './sources/xinwenlianbo.mjs';
import { fetchCctvChina, enrichBodies } from './sources/cctv-china.mjs';
import { loadState, saveState, resetState, dedupSource } from './state.mjs';
import { loadConfig, setConfig } from './config.mjs';

function parseArgs(argv) {
  const args = {
    date: null, source: null, limit: null,
    all: false, reset: false, brief: false, full: false,
    showConfig: false, configSet: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date') args.date = argv[++i];
    else if (a === '--source') args.source = argv[++i];
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10) || null;
    else if (a === '--all' || a === '--no-dedup') args.all = true;
    else if (a === '--brief') args.brief = true;
    else if (a === '--full') args.full = true;
    else if (a === '--reset') args.reset = true;
    else if (a === '--show-config') args.showConfig = true;
    else if (a === '--config-set') { args.configSet = argv.slice(i + 1).filter((x) => x.includes('=')); break; }
    else if (/^\d{8}$/.test(a)) args.date = a; // bare yyyymmdd => Xinwen Lianbo date
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // --- config / state management shortcuts ---
  if (args.reset) {
    await resetState();
    process.stdout.write(JSON.stringify({ status: 'ok', message: 'dedup state cleared' }) + '\n');
    return;
  }
  if (args.configSet) {
    const cfg = await setConfig(args.configSet);
    process.stdout.write(JSON.stringify({ status: 'ok', message: 'config saved', config: cfg }, null, 2) + '\n');
    return;
  }
  if (args.showConfig) {
    process.stdout.write(JSON.stringify({ status: 'ok', config: await loadConfig() }, null, 2) + '\n');
    return;
  }

  // --- resolve effective settings: saved config, then CLI overrides ---
  const cfg = await loadConfig();
  const detail = args.full ? 'full' : args.brief ? 'brief' : cfg.detail;
  const dedup = args.all ? false : cfg.dedup;
  const limit = args.limit || cfg.cctvLimit;
  const resolved = { detail, scope: cfg.scope, cctvLimit: limit, dedup };

  // Build the task list, honoring --source if given.
  const tasks = [];
  if (!args.source || args.source === 'xinwenlianbo') {
    tasks.push(fetchXinwenlianbo(args.date));
  }
  if (!args.source || args.source === 'cctv-china') {
    tasks.push(fetchCctvChina(limit));
  }

  const sources = await Promise.all(tasks);

  // Dedup against local state unless disabled. 新闻联播 is atomic per day (key =
  // date); 央视要闻 is per-article (key = id).
  if (dedup) {
    const state = await loadState();
    for (const s of sources) {
      if (s.id === 'xinwenlianbo') dedupSource(s, state, { atomicKey: s.date });
      else if (s.id === 'cctv-china') dedupSource(s, state, { keyOf: (it) => it.id });
    }
    await saveState(state);
  }

  // Enrich cctv-china with full article bodies when detail=full — only for the
  // items we'll actually return (i.e. after dedup). 新闻联播 is already full text.
  if (detail === 'full') {
    const cctv = sources.find((s) => s.id === 'cctv-china' && s.status === 'ok');
    if (cctv && cctv.items.length > 0) await enrichBodies(cctv.items);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    deduped: dedup,
    config: resolved,
    sources,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ status: 'error', message: String((err && err.message) || err) }) + '\n');
  process.exit(1);
});
