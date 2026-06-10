// Source: CCTV "Xinwen Lianbo" (19:00 news) full transcript.
// Archive: cn.govopendata.com (public, no API key). One day per page.

import { stripHtml, firstMatch } from './_html.mjs';

const BASE = 'https://cn.govopendata.com/xinwenlianbo';

function parsePage(html, date) {
  const title = stripHtml(firstMatch(/<h1[^>]*>([\s\S]*?)<\/h1>/, html));

  const items = [];
  const articleRe = /<article[^>]*>([\s\S]*?)<\/article>/g;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    const a = m[1];
    const itemTitle = stripHtml(firstMatch(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/, a));

    let bodyHtml = firstMatch(/class="content-body"[^>]*>([\s\S]*?)<\/div>/, a);
    if (!bodyHtml) bodyHtml = firstMatch(/class="article-content"[^>]*>([\s\S]*?)<\/div>/, a);
    const body = stripHtml(bodyHtml);

    if (!body || body.length < 10) continue; // skip header / date container blocks
    if (!itemTitle) continue;

    items.push({ index: items.length + 1, title: itemTitle, body });
  }
  return items.length > 0 ? { title, items } : null;
}

function ymd(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}${mo}${da}`;
}

async function fetchDay(date) {
  const url = `${BASE}/${date}/`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) return null;
    const parsed = parsePage(await res.text(), date);
    return parsed ? { date, url, ...parsed } : null;
  } catch {
    return null;
  }
}

// A complete broadcast has ~12-18 items. The archive posts today's edition
// incrementally right after it airs (~19:00), so "today" may briefly hold only
// a few items. Below this count we treat today as not-yet-complete and prefer
// yesterday's full edition.
const MIN_COMPLETE = 6;

function ok(hit) {
  return { id: 'xinwenlianbo', name: '新闻联播', status: 'ok', date: hit.date, dayTitle: hit.title, url: hit.url, items: hit.items };
}

// Fetch one day. If `dateArg` (yyyymmdd) is given, fetch exactly that day.
// Otherwise: prefer today once it's fully posted, else fall back to whichever of
// today / yesterday has more items (so a partial just-aired edition never wins
// over yesterday's complete one).
export async function fetchXinwenlianbo(dateArg) {
  if (dateArg && /^\d{8}$/.test(dateArg)) {
    const hit = await fetchDay(dateArg);
    return hit ? ok(hit) : { id: 'xinwenlianbo', name: '新闻联播', status: 'notfound', date: dateArg, url: `${BASE}/${dateArg}/`, items: [] };
  }

  const now = new Date();
  const todayStr = ymd(now);
  const yestStr = ymd(new Date(now.getTime() - 86400000));

  const today = await fetchDay(todayStr);
  if (today && today.items.length >= MIN_COMPLETE) return ok(today);

  // Today missing or looks incomplete — compare with yesterday, take the fuller.
  const yest = await fetchDay(yestStr);
  const best = [today, yest]
    .filter(Boolean)
    .sort((a, b) => b.items.length - a.items.length)[0];
  if (best) return ok(best);

  return { id: 'xinwenlianbo', name: '新闻联播', status: 'notfound', date: yestStr, url: `${BASE}/${yestStr}/`, items: [] };
}
