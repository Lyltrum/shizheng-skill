// Source: CCTV.com domestic news roll ("国内要闻"), a live JSONP feed.
// Timely headlines + briefs throughout the day; covers current affairs,
// government/policy, diplomacy, economy, society. No API key.

import { stripHtml } from './_html.mjs';

const FEED = 'https://news.cctv.com/2019/07/gaiban/cmsdatainterface/page/china_1.jsonp';

// Fetch the latest domestic headlines. `limit` caps how many items are returned.
export async function fetchCctvChina(limit = 20) {
  const url = `${FEED}?cb=cb`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) return { id: 'cctv-china', name: '央视国内要闻', status: 'error', url: FEED, items: [] };

    let text = await res.text();
    text = text.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, ''); // unwrap JSONP: cb({...})
    const data = JSON.parse(text);
    const list = (data && data.data && data.data.list) || [];

    const items = list.slice(0, limit).map((it, i) => ({
      index: i + 1,
      id: it.id || it.url || '',           // stable per-article id, used for dedup
      title: stripHtml(it.title || ''),
      brief: stripHtml(it.brief || ''),
      url: it.url || '',
      time: it.focus_date || '',
    })).filter((it) => it.title);

    if (items.length === 0) return { id: 'cctv-china', name: '央视国内要闻', status: 'notfound', url: FEED, items: [] };
    return { id: 'cctv-china', name: '央视国内要闻', status: 'ok', url: FEED, items };
  } catch {
    return { id: 'cctv-china', name: '央视国内要闻', status: 'error', url: FEED, items: [] };
  }
}

// Boilerplate lines to drop from an article body (copyright/editor/footer).
const BOILER = /(ICP备|版权所有|未经授权|扫一扫|扫码|二维码|责任编辑|责编|本文来源|关注央视|^来源\s*[:：])/;

// Fetch one CCTV article page and extract its full body text.
// Returns the body string, or '' for pages with no real text (photo/video pages).
export async function fetchArticleBody(url) {
  if (!url || !/^https?:\/\//.test(url)) return '';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return '';
    const html = Buffer.from(await res.arrayBuffer()).toString('utf-8'); // CCTV article pages are UTF-8
    const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => stripHtml(m[1]))
      .filter((t) => /[一-龥]/.test(t) && t.length >= 8 && !BOILER.test(t));
    const body = paras.join('\n');
    return body.length >= 40 ? body : ''; // too short => no real article (photo/video page)
  } catch {
    return '';
  }
}

// Enrich items in place with full article bodies (item.body). Items whose page
// has no extractable text keep only their brief. Runs with bounded concurrency.
export async function enrichBodies(items, concurrency = 8) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const it = items[cursor++];
      const body = await fetchArticleBody(it.url);
      if (body) it.body = body;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return items;
}
