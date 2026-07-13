#!/usr/bin/env node
/**
 * indexnow-ping.mjs — notify IndexNow-participating search engines (Bing, Yandex,
 * Seznam, Naver, etc.) about URLs that CHANGED since the last successful ping.
 *
 * Delta behaviour (default): fetches the live sitemap, compares each URL's <lastmod>
 * against a local state file, and submits only new/changed URLs. If nothing changed,
 * NO network call is made to the IndexNow endpoint. This matches the IndexNow spec,
 * which asks publishers to submit changed URLs rather than re-submitting everything.
 *
 * Zero dependencies — Node 18+ (global fetch).
 *
 * Usage:
 *   INDEXNOW_KEY=<key> node scripts/indexnow-ping.mjs                 # delta vs .indexnow-state.json
 *   INDEXNOW_KEY=<key> node scripts/indexnow-ping.mjs --all           # force full sitemap submit
 *   INDEXNOW_KEY=<key> node scripts/indexnow-ping.mjs --urls /pricing # explicit URLs (no diffing)
 *   ... --state /opt/parametric-memory-web/.indexnow-state.json       # custom state path
 *
 * Key protocol (https://www.indexnow.org/documentation):
 *   - key file must be served at https://<host>/<key>.txt containing exactly the key
 *   - POST https://api.indexnow.org/indexnow with { host, key, keyLocation, urlList }
 *   - 200/202 = accepted; 400 bad request; 403 key mismatch; 422 URL/host mismatch; 429 throttled
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const DEFAULTS = {
  host: 'parametric-memory.dev',
  sitemapUrl: 'https://parametric-memory.dev/sitemap.xml',
  endpoint: 'https://api.indexnow.org/indexnow',
  statePath: '.indexnow-state.json',
  maxUrlsPerRequest: 10000,
};

/** Extract [{ url, lastmod }] entries from sitemap XML. Deduped, document order. */
export function extractSitemapEntries(xml) {
  if (typeof xml !== 'string') return [];
  const out = [];
  const seen = new Set();
  const blockRe = /<url>([\s\S]*?)<\/url>/g;
  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[1];
    const loc = /<loc>\s*([^<\s][^<]*?)\s*<\/loc>/.exec(block);
    if (!loc) continue;
    const url = loc[1].trim();
    if (seen.has(url)) continue;
    seen.add(url);
    const lastmod = /<lastmod>\s*([^<\s][^<]*?)\s*<\/lastmod>/.exec(block);
    out.push({ url, lastmod: lastmod ? lastmod[1].trim() : null });
  }
  return out;
}

/** Back-compat helper: just the URLs. */
export function extractSitemapUrls(xml) {
  return extractSitemapEntries(xml).map((e) => e.url);
}

/**
 * Diff sitemap entries against previous state ({ url: lastmod }).
 * Returns { changed: [urls], nextState } where:
 *  - a URL is "changed" if it's new, or its lastmod differs from the stored one
 *  - URLs no longer in the sitemap are dropped from nextState (no ping for removals)
 */
export function computeDelta(entries, state = {}) {
  const changed = [];
  const nextState = {};
  for (const { url, lastmod } of entries) {
    nextState[url] = lastmod;
    const known = Object.prototype.hasOwnProperty.call(state, url);
    if (!known || state[url] !== lastmod) changed.push(url);
  }
  return { changed, nextState };
}

/** Load state file; missing or unreadable file → empty state (full first-run ping). */
export function loadState(path = DEFAULTS.statePath) {
  try {
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveState(state, path = DEFAULTS.statePath) {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Build a validated IndexNow payload.
 * - Rejects URLs not belonging to `host` (IndexNow returns 422 for those).
 * - Dedupes and caps at maxUrlsPerRequest.
 * Returns { payload, skipped } where skipped lists rejected URLs.
 */
export function buildPayload({ host, key, urls, maxUrlsPerRequest = DEFAULTS.maxUrlsPerRequest }) {
  if (!host) throw new Error('host is required');
  if (!key || !/^[a-f0-9]{8,128}$/i.test(key)) {
    throw new Error('key is required and must be 8-128 hex characters');
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('urls must be a non-empty array');
  }

  const accepted = [];
  const skipped = [];
  const seen = new Set();

  for (const raw of urls) {
    let candidate = raw;
    // Allow site-relative paths like "/pricing"
    if (typeof candidate === 'string' && candidate.startsWith('/')) {
      candidate = `https://${host}${candidate}`;
    }
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      skipped.push(raw);
      continue;
    }
    const hostMatches = parsed.hostname === host || parsed.hostname === `www.${host}`;
    if (parsed.protocol !== 'https:' || !hostMatches) {
      skipped.push(raw);
      continue;
    }
    if (!seen.has(parsed.href)) {
      seen.add(parsed.href);
      accepted.push(parsed.href);
    }
  }

  if (accepted.length === 0) {
    throw new Error(`no valid URLs for host ${host} (${skipped.length} skipped)`);
  }

  return {
    payload: {
      host,
      key,
      keyLocation: `https://${host}/${key}.txt`,
      urlList: accepted.slice(0, maxUrlsPerRequest),
    },
    skipped,
  };
}

/** Map an IndexNow HTTP status to a human-readable outcome. */
export function describeStatus(status) {
  switch (status) {
    case 200: return { ok: true, message: 'OK — URLs received' };
    case 202: return { ok: true, message: 'Accepted — key validation pending' };
    case 400: return { ok: false, message: 'Bad request — invalid payload format' };
    case 403: return { ok: false, message: 'Forbidden — key not found at keyLocation (check public/<key>.txt is deployed)' };
    case 422: return { ok: false, message: 'Unprocessable — URLs do not belong to host or key mismatch' };
    case 429: return { ok: false, message: 'Too many requests — throttled, retry later' };
    default: return { ok: false, message: `Unexpected status ${status}` };
  }
}

/** POST the payload to the IndexNow endpoint. fetchImpl injectable for tests. */
export async function submitToIndexNow(payload, { endpoint = DEFAULTS.endpoint, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const outcome = describeStatus(res.status);
  return { status: res.status, ...outcome, submitted: payload.urlList.length };
}

/** Fetch the live sitemap and return its entries. fetchImpl injectable for tests. */
export async function fetchSitemapEntries(sitemapUrl = DEFAULTS.sitemapUrl, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(sitemapUrl);
  if (!res.ok) throw new Error(`sitemap fetch failed: ${res.status} ${sitemapUrl}`);
  return extractSitemapEntries(await res.text());
}

export function parseArgs(argv) {
  const args = { urls: [], all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--key') args.key = argv[++i];
    else if (a === '--sitemap') args.sitemap = argv[++i];
    else if (a === '--host') args.host = argv[++i];
    else if (a === '--endpoint') args.endpoint = argv[++i];
    else if (a === '--state') args.state = argv[++i];
    else if (a === '--all') args.all = true;
    else if (a === '--urls') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args.urls.push(argv[++i]);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const host = args.host ?? DEFAULTS.host;
  const key = args.key ?? process.env.INDEXNOW_KEY;
  const statePath = args.state ?? DEFAULTS.statePath;
  if (!key) {
    console.error('ERROR: provide INDEXNOW_KEY env var or --key');
    process.exit(2);
  }

  let urls;
  let nextState = null;

  if (args.urls.length > 0) {
    urls = args.urls; // explicit URLs: caller knows what changed, no diffing
  } else {
    const entries = await fetchSitemapEntries(args.sitemap ?? DEFAULTS.sitemapUrl);
    if (args.all) {
      urls = entries.map((e) => e.url);
      nextState = computeDelta(entries, {}).nextState;
    } else {
      const delta = computeDelta(entries, loadState(statePath));
      if (delta.changed.length === 0) {
        console.log('IndexNow: no changed URLs since last ping — nothing submitted, no request made.');
        return;
      }
      urls = delta.changed;
      nextState = delta.nextState;
    }
  }

  const { payload, skipped } = buildPayload({ host, key, urls });
  if (skipped.length > 0) console.warn(`WARN: skipped ${skipped.length} non-${host} URLs`);

  const result = await submitToIndexNow(payload, { endpoint: args.endpoint ?? DEFAULTS.endpoint });
  const line = `IndexNow: ${result.submitted} URLs → ${result.status} ${result.message}`;
  if (result.ok) {
    console.log(line);
    if (nextState) saveState(nextState, statePath); // only persist on success
  } else {
    console.error(line);
    process.exit(1);
  }
}

// Run only when executed directly (not when imported by tests or picked up by `node --test`).
const isDirectRun =
  process.argv[1] &&
  !process.env.NODE_TEST_CONTEXT &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirectRun) {
  main().catch((err) => {
    console.error(`IndexNow ping failed: ${err.message}`);
    process.exit(1);
  });
}
