// Per-user preferences, so each person tunes the brief to their own taste.
// File: ~/.shizheng/config.json   (lives in the user's home, not in the skill dir)
//
// Fields:
//   detail    "full" | "brief"     每条给完整正文 还是 只给摘要        (default brief)
//   scope     "all"  | "politics"  列全部条目 还是 只挑时政/分组简报    (default politics)
//   cctvLimit number                央视要闻抓取条数上限                 (default 20)
//   dedup     boolean               是否默认去重(只给新增)              (default true)

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const DIR = join(homedir(), '.shizheng');
const CONFIG_PATH = join(DIR, 'config.json');

// Gentle defaults that suit a first-time/any user: a concise politics digest.
// Each user overrides these to taste (e.g. detail=full, scope=all).
export const DEFAULTS = { detail: 'brief', scope: 'all', cctvLimit: 20, dedup: true };

const ALLOWED = {
  detail: ['full', 'brief'],
  scope: ['all', 'politics'],
};

export async function loadConfig() {
  try {
    const fileCfg = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    return { ...DEFAULTS, ...fileCfg };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveConfig(cfg) {
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch {
    // non-fatal
  }
}

// Apply "key=value" pairs (validated) and persist. Returns the merged config.
export async function setConfig(pairs) {
  const cfg = await loadConfig();
  for (const p of pairs) {
    const idx = p.indexOf('=');
    if (idx < 0) continue;
    const key = p.slice(0, idx).trim();
    let val = p.slice(idx + 1).trim();
    if (key === 'cctvLimit') { const n = parseInt(val, 10); if (n > 0) cfg.cctvLimit = n; continue; }
    if (key === 'dedup') { cfg.dedup = (val === 'true' || val === '1'); continue; }
    if (ALLOWED[key]) { if (ALLOWED[key].includes(val)) cfg[key] = val; continue; }
  }
  await saveConfig(cfg);
  return cfg;
}

export { CONFIG_PATH };
